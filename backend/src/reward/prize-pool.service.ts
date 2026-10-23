import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PrizePool } from './entities/prize-pool.entity';
import {
  PrizePoolPayout,
  PrizePoolPayoutAction,
} from './entities/prize-pool-payout.entity';

export interface TopFinisher {
  /** Stellar public key of the winner */
  address: string;
  /** Finishing position (1 = first) */
  place: number;
  /** Optional on-chain transaction hash already settled by the caller */
  txHash?: string;
}

export interface DistributionResult {
  season: string;
  totalDistributed: string;
  payouts: {
    place: number;
    address: string;
    amount: string;
    txHash: string | null;
  }[];
}

export interface PoolStatus {
  season: string;
  displayName: string | null;
  balance: string;
  totalFunded: string;
  totalDistributed: string;
  isDistributed: boolean;
  distributionRules: Record<string, unknown> | null;
  payouts: PrizePoolPayout[];
}

/**
 * Default distribution rule: top-3 split 50 / 30 / 20 percent.
 * Expressed as fractions of the total pool balance.
 */
const DEFAULT_DISTRIBUTION_SHARES = [0.5, 0.3, 0.2];

@Injectable()
export class PrizePoolService {
  private readonly logger = new Logger(PrizePoolService.name);

  constructor(
    @InjectRepository(PrizePool)
    private readonly poolRepo: Repository<PrizePool>,
    @InjectRepository(PrizePoolPayout)
    private readonly payoutRepo: Repository<PrizePoolPayout>,
    private readonly dataSource: DataSource,
  ) {}

  // ── public API ─────────────────────────────────────────────────────────────

  /**
   * Add funds to a seasonal prize pool.
   * Creates the pool if it doesn't already exist.
   * Logs a FUND audit-trail record for every call.
   *
   * @param amount  Amount to add (positive numeric string, e.g. "100.0")
   * @param season  Season identifier, e.g. "2024-Q3"
   * @param meta    Optional metadata (source address, tx hash, notes)
   */
  async fundPool(
    amount: string,
    season: string,
    meta?: Record<string, unknown>,
  ): Promise<PrizePool> {
    const numericAmount = this.parsePositiveAmount(amount);

    return this.dataSource.transaction(async (manager) => {
      const pools = manager.getRepository(PrizePool);
      const payouts = manager.getRepository(PrizePoolPayout);

      // Upsert the pool row
      let pool = await pools.findOne({ where: { season } });
      if (!pool) {
        pool = pools.create({
          season,
          balance: '0',
          totalFunded: '0',
          totalDistributed: '0',
          isDistributed: false,
        });
      }

      if (pool.isDistributed) {
        throw new BadRequestException(
          `Season "${season}" prize pool has already been distributed and is locked.`,
        );
      }

      // Accumulate balance and total funded using BigInt arithmetic to
      // avoid floating-point drift on large amounts.
      const prevBalance = BigInt(Math.round(parseFloat(pool.balance) * 1e7));
      const prevFunded = BigInt(Math.round(parseFloat(pool.totalFunded) * 1e7));
      const addAmount = BigInt(Math.round(numericAmount * 1e7));

      pool.balance = ((prevBalance + addAmount) / BigInt(1e7)).toString() +
        '.' +
        this.pad7(((prevBalance + addAmount) % BigInt(1e7)).toString());
      pool.totalFunded = ((prevFunded + addAmount) / BigInt(1e7)).toString() +
        '.' +
        this.pad7(((prevFunded + addAmount) % BigInt(1e7)).toString());

      const savedPool = await pools.save(pool);

      // Append audit-trail record
      const payout = payouts.create({
        prizePoolId: savedPool.id,
        action: PrizePoolPayoutAction.FUND,
        recipientAddress: null,
        place: null,
        amount: numericAmount.toFixed(7),
        txHash: (meta?.txHash as string) ?? null,
        meta: meta ?? null,
      });
      await payouts.save(payout);

      this.logger.log(
        `PrizePool FUND: season="${season}" amount=${numericAmount.toFixed(7)} new_balance=${savedPool.balance}`,
      );

      return savedPool;
    });
  }

  /**
   * Distribute the prize pool for a season to the top N finishers.
   * The pool is locked (`isDistributed = true`) after distribution.
   * Logs a DISTRIBUTE audit-trail record per winner.
   *
   * Distribution amounts are calculated from `distributionRules.places`
   * (array of fractions summing to ≤1.0), or the default 50/30/20 split.
   *
   * @param season       Season identifier
   * @param topFinishers Ordered array of winners with their Stellar addresses
   */
  async distributePool(
    season: string,
    topFinishers: TopFinisher[],
  ): Promise<DistributionResult> {
    if (!topFinishers || topFinishers.length === 0) {
      throw new BadRequestException('topFinishers must not be empty');
    }

    return this.dataSource.transaction(async (manager) => {
      const pools = manager.getRepository(PrizePool);
      const payouts = manager.getRepository(PrizePoolPayout);

      const pool = await pools.findOne({ where: { season } });
      if (!pool) {
        throw new NotFoundException(`No prize pool found for season "${season}"`);
      }
      if (pool.isDistributed) {
        throw new ConflictException(
          `Season "${season}" prize pool has already been distributed.`,
        );
      }

      const totalBalance = parseFloat(pool.balance);
      if (totalBalance <= 0) {
        throw new BadRequestException(
          `Season "${season}" prize pool has zero balance.`,
        );
      }

      // Determine per-place share fractions
      const shares: number[] = this.resolveShares(
        pool.distributionRules,
        topFinishers.length,
      );

      const distributionPayouts: DistributionResult['payouts'] = [];
      let totalDistributed = 0;

      for (let i = 0; i < topFinishers.length; i++) {
        const finisher = topFinishers[i];
        const share = shares[i] ?? 0;
        if (share <= 0) continue;

        const amount = totalBalance * share;
        totalDistributed += amount;

        const payoutRecord = payouts.create({
          prizePoolId: pool.id,
          action: PrizePoolPayoutAction.DISTRIBUTE,
          recipientAddress: finisher.address,
          place: finisher.place,
          amount: amount.toFixed(7),
          txHash: finisher.txHash ?? null,
          meta: { season, share, totalBalance: totalBalance.toFixed(7) },
        });
        await payouts.save(payoutRecord);

        distributionPayouts.push({
          place: finisher.place,
          address: finisher.address,
          amount: amount.toFixed(7),
          txHash: finisher.txHash ?? null,
        });
      }

      // Lock the pool and update accounting
      const prevDistributed = parseFloat(pool.totalDistributed);
      pool.totalDistributed = (prevDistributed + totalDistributed).toFixed(7);
      pool.balance = Math.max(0, totalBalance - totalDistributed).toFixed(7);
      pool.isDistributed = true;
      await pools.save(pool);

      this.logger.log(
        `PrizePool DISTRIBUTE: season="${season}" total_distributed=${totalDistributed.toFixed(7)} winners=${topFinishers.length}`,
      );

      return {
        season,
        totalDistributed: totalDistributed.toFixed(7),
        payouts: distributionPayouts,
      };
    });
  }

  /**
   * Returns the current status of a prize pool including its balance,
   * distribution rules, and full payout audit trail.
   */
  async getPoolStatus(season: string): Promise<PoolStatus> {
    const pool = await this.poolRepo.findOne({
      where: { season },
      relations: ['payouts'],
    });
    if (!pool) {
      throw new NotFoundException(`No prize pool found for season "${season}"`);
    }

    return {
      season: pool.season,
      displayName: pool.displayName,
      balance: pool.balance,
      totalFunded: pool.totalFunded,
      totalDistributed: pool.totalDistributed,
      isDistributed: pool.isDistributed,
      distributionRules: pool.distributionRules,
      payouts: pool.payouts ?? [],
    };
  }

  /**
   * Set custom distribution rules for a season's prize pool.
   * Must be called before `distributePool`.
   *
   * @param season Season identifier
   * @param rules  Distribution rules, e.g. `{ places: [0.5, 0.3, 0.2] }`
   */
  async setDistributionRules(
    season: string,
    rules: Record<string, unknown>,
  ): Promise<PrizePool> {
    const pool = await this.poolRepo.findOne({ where: { season } });
    if (!pool) {
      throw new NotFoundException(`No prize pool found for season "${season}"`);
    }
    if (pool.isDistributed) {
      throw new BadRequestException(
        `Season "${season}" pool is already distributed; rules cannot be changed.`,
      );
    }
    pool.distributionRules = rules;
    return this.poolRepo.save(pool);
  }

  /**
   * List all prize pools (useful for admin dashboards).
   */
  async listPools(): Promise<PrizePool[]> {
    return this.poolRepo.find({ order: { createdAt: 'DESC' } });
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private parsePositiveAmount(amount: string): number {
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      throw new BadRequestException(
        `Invalid amount "${amount}": must be a positive number.`,
      );
    }
    return num;
  }

  /**
   * Resolve per-place distribution shares from the pool's distributionRules
   * or fall back to the default split.
   */
  private resolveShares(
    rules: Record<string, unknown> | null,
    winnerCount: number,
  ): number[] {
    const raw = (rules?.places as number[] | undefined) ?? DEFAULT_DISTRIBUTION_SHARES;
    // Trim to the actual number of winners
    return raw.slice(0, winnerCount);
  }

  /** Left-pads a string to 7 digits (for fractional part of fixed-7 strings) */
  private pad7(s: string): string {
    return s.padStart(7, '0').slice(-7);
  }
}