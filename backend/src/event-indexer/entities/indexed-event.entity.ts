import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Represents a single Soroban contract event that has been indexed into the
 * database. Each row is immutable once written; re-indexing creates new rows
 * rather than updating existing ones (append-only).
 */
@Entity('indexed_events')
@Index(['contractId', 'ledgerSequence'])
@Index(['topic', 'indexedAt'])
@Index(['schemaVersion', 'contractId'])
export class IndexedEvent {
  @ApiProperty({ description: 'Internal surrogate key' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Soroban contract address that emitted the event */
  @ApiProperty({ description: 'Stellar contract ID (C...) that emitted the event' })
  @Column({ type: 'varchar', length: 128 })
  contractId: string;

  /** The first Symbol topic of the event (e.g. "level_badge_minted") */
  @ApiProperty({ description: 'Primary topic symbol of the event' })
  @Column({ type: 'varchar', length: 128 })
  topic: string;

  /**
   * Additional topics beyond the first (positional order preserved).
   * Stored as a JSON array of hex/string representations.
   */
  @ApiProperty({ description: 'Secondary topics (JSON array)' })
  @Column({ type: 'jsonb', nullable: true })
  topics: string[] | null;

  /** Full decoded event payload; positional fields keyed by index */
  @ApiProperty({ description: 'Decoded event payload (JSON)' })
  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  /** Raw XDR value from the RPC response for archival/re-decode */
  @ApiProperty({ description: 'Raw XDR value string for archival' })
  @Column({ type: 'text', nullable: true })
  rawXdr: string | null;

  /** Ledger sequence at which this event was emitted */
  @ApiProperty({ description: 'Stellar ledger sequence number' })
  @Column({ type: 'bigint' })
  ledgerSequence: string;

  /** Transaction hash that produced this event */
  @ApiProperty({ description: 'Transaction hash' })
  @Column({ type: 'varchar', length: 128, nullable: true })
  txHash: string | null;

  /**
   * Schema version tag. When the payload shape changes the indexer bumps
   * this number and downstream consumers can filter/migrate by version.
   * Follows the evolution rule from onchain/docs/event-schema.md:
   * never reorder fields; increment version for any additive or breaking change.
   */
  @ApiProperty({ description: 'Payload schema version' })
  @Column({ type: 'smallint', default: 1 })
  schemaVersion: number;

  /** Whether this row was produced by a backfill run vs live polling */
  @ApiProperty({ description: 'True if row was created by a backfill job' })
  @Column({ type: 'boolean', default: false })
  isBackfill: boolean;

  @ApiProperty({ description: 'When this event was indexed into the database' })
  @CreateDateColumn()
  indexedAt: Date;
}