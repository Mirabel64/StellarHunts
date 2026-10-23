import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { PrizePool } from './prize-pool.entity';

/**
 * Immutable audit-trail record for every fund or distribute action on a
 * `PrizePool`. Each row is append-only; no updates or deletes are permitted
 * by the application layer.
 */
export enum PrizePoolPayoutAction {
  FUND = 'fund',
  DISTRIBUTE = 'distribute',
}

@Entity('prize_pool_payouts')
@Index(['prizePoolId', 'createdAt'])
@Index(['recipientAddress'])
export class PrizePoolPayout {
  @ApiProperty({ description: 'Surrogate UUID primary key' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Foreign key to the owning PrizePool' })
  @Column({ type: 'uuid' })
  prizePoolId: string;

  /**
   * The action that produced this record: either a funding event or a
   * distribution to a specific recipient.
   */
  @ApiProperty({
    description: 'Action type',
    enum: PrizePoolPayoutAction,
  })
  @Column({ type: 'enum', enum: PrizePoolPayoutAction })
  action: PrizePoolPayoutAction;

  /**
   * Stellar address of the recipient for DISTRIBUTE actions.
   * Null for FUND actions.
   */
  @ApiProperty({
    description: 'Recipient Stellar address (for DISTRIBUTE actions)',
    nullable: true,
  })
  @Column({ type: 'varchar', length: 128, nullable: true })
  recipientAddress: string | null;

  /**
   * Finishing position (1-indexed) for DISTRIBUTE actions.
   */
  @ApiProperty({
    description: 'Finishing position (1 = first place) for DISTRIBUTE actions',
    nullable: true,
  })
  @Column({ type: 'int', nullable: true })
  place: number | null;

  /**
   * Amount transferred in this action (token units as string).
   */
  @ApiProperty({ description: 'Amount transferred (token units as string)' })
  @Column({ type: 'numeric', precision: 28, scale: 7 })
  amount: string;

  /**
   * Stellar transaction hash if this action was settled on-chain.
   * Null for actions that remain off-chain (e.g. ledger credit only).
   */
  @ApiProperty({ description: 'On-chain transaction hash', nullable: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  txHash: string | null;

  /**
   * Arbitrary metadata (e.g. season, memo, operator notes).
   */
  @ApiProperty({ description: 'Additional metadata (JSON)', nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @ApiProperty({ description: 'When this record was created (immutable)' })
  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => PrizePool, (pool) => pool.payouts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'prizePoolId' })
  prizePool: PrizePool;
}