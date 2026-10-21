import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { IndexedEvent } from './entities/indexed-event.entity';
import { BackfillEventsDto, QueryIndexedEventsDto } from './dto/index-events.dto';

/**
 * Current schema version. Increment this whenever the decoded payload shape
 * changes, following the evolution rule in onchain/docs/event-schema.md:
 * never reorder positional fields; add new fields at the end only.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/** How many milliseconds between live-polling ticks */
const DEFAULT_POLL_INTERVAL_MS = 6_000;

/** Soroban RPC event categories that we care about */
const EVENT_TYPE = 'contract';

export interface SorobanEventRpcItem {
  type: string;
  ledger: string;
  ledgerClosedAt: string;
  contractId: string;
  id: string;
  pagingToken: string;
  inSuccessfulContractCall: boolean;
  topic: string[];
  value: { xdr: string };
  txHash?: string;
}

export interface IndexerHealthStatus {
  healthy: boolean;
  latestIndexedLedger: string | null;
  pendingBackfills: number;
  lastPollAt: string | null;
  schemaVersion: number;
  rpcUrl: string;
}

@Injectable()
export class EventIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventIndexerService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private latestIndexedLedger: string | null = null;
  private lastPollAt: Date | null = null;
  private pendingBackfills = 0;
  private isPolling = false;
  private destroyed = false;

  private readonly rpcUrl: string;
  private readonly contractIds: string[];
  private readonly pollIntervalMs: number;
  private readonly isMockMode: boolean;

  constructor(
    @InjectRepository(IndexedEvent)
    private readonly eventRepo: Repository<IndexedEvent>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ??
      'https://soroban-testnet.stellar.org';

    // Support indexing multiple contracts; comma-separated in config
    const raw = [
      this.configService.get<string>('STELLAR_HUNTS_CONTRACT_ID'),
      this.configService.get<string>('STELLAR_HUNTS_NFT_CONTRACT_ID'),
    ]
      .filter(Boolean)
      .join(',');
    this.contractIds = raw ? raw.split(',').map((s) => s.trim()) : [];

    this.pollIntervalMs =
      parseInt(
        this.configService.get<string>('EVENT_INDEXER_POLL_INTERVAL_MS') ??
          String(DEFAULT_POLL_INTERVAL_MS),
        10,
      ) || DEFAULT_POLL_INTERVAL_MS;

    this.isMockMode =
      (this.configService.get<string>('STELLAR_MODE') ?? 'live') === 'mock';
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    if (this.isMockMode) {
      this.logger.log('EventIndexer: running in mock mode — polling disabled');
      return;
    }
    if (this.contractIds.length === 0) {
      this.logger.warn(
        'EventIndexer: no contract IDs configured — polling disabled',
      );
      return;
    }

    // Restore the cursor from the last indexed event so we resume correctly
    await this.restoreCursor();
    this.schedulePoll();
    this.logger.log(
      `EventIndexer: polling started (interval ${this.pollIntervalMs}ms, contracts: ${this.contractIds.join(', ')})`,
    );
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /**
   * Health snapshot consumed by the health-check controller endpoint.
   */
  getHealthStatus(): IndexerHealthStatus {
    return {
      healthy: !this.isMockMode || this.contractIds.length > 0,
      latestIndexedLedger: this.latestIndexedLedger,
      pendingBackfills: this.pendingBackfills,
      lastPollAt: this.lastPollAt?.toISOString() ?? null,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      rpcUrl: this.rpcUrl,
    };
  }

  /**
   * Query indexed events with optional filters and pagination.
   */
  async queryEvents(dto: QueryIndexedEventsDto): Promise<{
    data: IndexedEvent[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.eventRepo.createQueryBuilder('event');

    if (dto.contractId) {
      qb.andWhere('event.contractId = :contractId', {
        contractId: dto.contractId,
      });
    }
    if (dto.topic) {
      qb.andWhere('event.topic = :topic', { topic: dto.topic });
    }
    if (dto.fromLedger) {
      qb.andWhere('CAST(event.ledgerSequence AS BIGINT) >= :fromLedger', {
        fromLedger: BigInt(dto.fromLedger),
      });
    }
    if (dto.toLedger) {
      qb.andWhere('CAST(event.ledgerSequence AS BIGINT) <= :toLedger', {
        toLedger: BigInt(dto.toLedger),
      });
    }

    qb.orderBy('event.ledgerSequence', 'ASC')
      .addOrderBy('event.indexedAt', 'ASC')
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  /**
   * Backfill events for a contract over a ledger range.
   * Idempotent by default (skips already-indexed events) unless `force` is set.
   */
  async backfill(dto: BackfillEventsDto): Promise<{ indexed: number; skipped: number }> {
    this.pendingBackfills++;
    try {
      return await this._runBackfill(dto);
    } finally {
      this.pendingBackfills = Math.max(0, this.pendingBackfills - 1);
    }
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private schedulePoll(): void {
    if (this.destroyed) return;
    this.pollTimer = setTimeout(async () => {
      await this.poll();
      this.schedulePoll();
    }, this.pollIntervalMs);
  }

  private async restoreCursor(): Promise<void> {
    try {
      const latest = await this.eventRepo.find({
        order: { ledgerSequence: 'DESC' },
        take: 1,
      });
      if (latest.length > 0) {
        this.latestIndexedLedger = latest[0].ledgerSequence;
        this.logger.log(
          `EventIndexer: cursor restored to ledger ${this.latestIndexedLedger}`,
        );
      }
    } catch (err: any) {
      this.logger.warn(`EventIndexer: could not restore cursor — ${err.message}`);
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling) {
      this.logger.debug('EventIndexer: previous poll still running, skipping tick');
      return;
    }
    this.isPolling = true;
    this.lastPollAt = new Date();

    try {
      for (const contractId of this.contractIds) {
        const cursor = this.latestIndexedLedger ?? '0';
        const events = await this.fetchEventsFromRpc(contractId, cursor, null, 200);
        if (events.length === 0) continue;

        const indexed = await this.persistEvents(events, false);
        if (indexed > 0) {
          const maxLedger = events.reduce((max, e) => {
            return BigInt(e.ledger) > BigInt(max) ? e.ledger : max;
          }, events[0].ledger);
          this.latestIndexedLedger = maxLedger;
          this.logger.log(
            `EventIndexer: indexed ${indexed} new events for contract ${contractId} up to ledger ${maxLedger}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`EventIndexer: poll error — ${err.message}`);
    } finally {
      this.isPolling = false;
    }
  }

  private async _runBackfill(
    dto: BackfillEventsDto,
  ): Promise<{ indexed: number; skipped: number }> {
    const pageSize = dto.pageSize ?? 100;
    let cursor = dto.fromLedger;
    let totalIndexed = 0;
    let totalSkipped = 0;

    this.logger.log(
      `EventIndexer: backfill started for contract ${dto.contractId} ledgers ${dto.fromLedger}→${dto.toLedger ?? 'latest'}`,
    );

    while (true) {
      const events = await this.fetchEventsFromRpc(
        dto.contractId,
        cursor,
        dto.toLedger ?? null,
        pageSize,
      );

      if (events.length === 0) break;

      if (dto.force) {
        // Delete existing rows for this range so we re-index fresh
        await this.eventRepo
          .createQueryBuilder()
          .delete()
          .where('contractId = :contractId', { contractId: dto.contractId })
          .andWhere('CAST(ledgerSequence AS BIGINT) >= :from', {
            from: BigInt(cursor),
          })
          .execute();
      }

      const indexed = await this.persistEvents(events, true);
      totalIndexed += indexed;
      totalSkipped += events.length - indexed;

      // Advance cursor past the last ledger seen in this page
      const lastLedger = events[events.length - 1].ledger;
      const nextLedger = (BigInt(lastLedger) + 1n).toString();

      if (dto.toLedger && BigInt(nextLedger) > BigInt(dto.toLedger)) break;
      if (events.length < pageSize) break;
      cursor = nextLedger;
    }

    this.logger.log(
      `EventIndexer: backfill complete — indexed ${totalIndexed}, skipped ${totalSkipped}`,
    );
    return { indexed: totalIndexed, skipped: totalSkipped };
  }

  /**
   * Calls the Soroban RPC `getEvents` method.
   * Returns an empty array when the RPC is unreachable or returns an error.
   */
  private async fetchEventsFromRpc(
    contractId: string,
    startLedger: string,
    endLedger: string | null,
    limit: number,
  ): Promise<SorobanEventRpcItem[]> {
    try {
      const body: Record<string, unknown> = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getEvents',
        params: {
          startLedger: String(startLedger),
          filters: [
            {
              type: EVENT_TYPE,
              contractIds: [contractId],
            },
          ],
          pagination: { limit },
        },
      };
      if (endLedger) {
        (body.params as any).endLedger = String(endLedger);
      }

      const resp = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        this.logger.warn(
          `EventIndexer: RPC HTTP ${resp.status} for contract ${contractId}`,
        );
        return [];
      }

      const json = (await resp.json()) as any;
      if (json.error) {
        this.logger.warn(
          `EventIndexer: RPC error ${json.error.code}: ${json.error.message}`,
        );
        return [];
      }

      return (json.result?.events ?? []) as SorobanEventRpcItem[];
    } catch (err: any) {
      this.logger.error(`EventIndexer: fetchEventsFromRpc error — ${err.message}`);
      return [];
    }
  }

  /**
   * Decodes and persists a batch of RPC events. Skips duplicates using
   * (contractId, ledgerSequence, topic, txHash) as a natural key.
   * Returns the count of rows actually written.
   */
  private async persistEvents(
    rpcEvents: SorobanEventRpcItem[],
    isBackfill: boolean,
  ): Promise<number> {
    if (rpcEvents.length === 0) return 0;

    let written = 0;
    for (const rpcEvent of rpcEvents) {
      const [primaryTopic, ...secondaryTopics] = rpcEvent.topic ?? [];

      // Attempt to decode the XDR value to a JSON payload.
      // We keep this best-effort so that an undecodable value does not
      // block indexing of subsequent events.
      let payload: Record<string, unknown> | null = null;
      try {
        payload = this.decodeEventValue(rpcEvent.value?.xdr);
      } catch {
        // leave null; raw XDR is still preserved
      }

      const entity = this.eventRepo.create({
        contractId: rpcEvent.contractId,
        topic: primaryTopic ?? 'unknown',
        topics: secondaryTopics.length > 0 ? secondaryTopics : null,
        payload,
        rawXdr: rpcEvent.value?.xdr ?? null,
        ledgerSequence: rpcEvent.ledger,
        txHash: rpcEvent.txHash ?? null,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        isBackfill,
      });

      // ON CONFLICT DO NOTHING — idempotent insert for re-runs
      try {
        await this.eventRepo
          .createQueryBuilder()
          .insert()
          .into(IndexedEvent)
          .values(entity)
          .orIgnore()
          .execute();
        written++;
      } catch (err: any) {
        // Unique constraint violation means already indexed; skip silently
        if (!err.message?.includes('duplicate') && !err.message?.includes('unique')) {
          this.logger.warn(
            `EventIndexer: failed to persist event ledger ${rpcEvent.ledger}: ${err.message}`,
          );
        }
      }
    }

    return written;
  }

  /**
   * Best-effort XDR→JSON decoder.
   * Attempts to use @stellar/stellar-sdk's xdr utilities when available.
   * Falls back to returning the raw XDR string as `{ raw: xdr }`.
   */
  private decodeEventValue(xdr: string | undefined): Record<string, unknown> | null {
    if (!xdr) return null;
    try {
      // Dynamic import avoids a hard dependency at module load time
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { xdr: stellarXdr } = require('@stellar/stellar-sdk');
      const scVal = stellarXdr.ScVal.fromXDR(xdr, 'base64');
      return { decoded: scVal.toXDR('base64'), raw: xdr };
    } catch {
      return { raw: xdr };
    }
  }
}