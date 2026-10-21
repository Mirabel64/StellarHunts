import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { PrizePoolPayout } from './prize-pool-payout.entity';

/**
 * Represents a seasonal prize pool.
 * One pool exists per season identifier.
 * Funds are accumulated via `PrizePoolService.fundPool()` and distributed via
 * `PrizePoolService.distributePool()`.
 */
@Entity('prize_pools')
@Index(['season'], { unique: true })
export class PrizePool {
  @ApiProperty({ description: 'Surrogate UUID primary key' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Season identifier, e.g. "2024-Q3" or "genesis-season".
   * Must be unique — only one prize pool per season.
   */
  @ApiProperty({ description: 'Season identifier (unique)' })
  @Column({ type: 'varchar', length: 128 })
  season: string;

  /**
   * Human-readable name shown in the UI.
   */
  @ApiProperty({ description: 'Display name for this season' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName: string | null;

  /**
   * Current balance in the prize pool (in token units / XLM stropes).
   * Stored as a string to avoid JavaScript floating-point precision loss.
   */
  @ApiProperty({ description: 'Current pool balance (token units as string)' })
  @Column({ type: 'numeric', precision: 28, scale: 7, default: '0' })
  balance: string;

  /**
   * Total amount funded over the pool's lifetime (not reduced by distributions).
   * Used for the audit trail and display.
   */
  @ApiProperty({ description: 'Total amount funded into this pool (lifetime)' })
  @Column({ type: 'numeric', precision: 28, scale: 7, default: '0' })
  totalFunded: string;

  /**
   * Total amount distributed from this pool (lifetime).
   */
  @ApiProperty({ description: 'Total amount distributed from this pool (lifetime)' })
  @Column({ type: 'numeric', precision: 28, scale: 7, default: '0' })
  totalDistributed: string;

  /**
   * Distribution rules stored as JSON.
   * Example: { "places": [0.50, 0.30, 0.20] } means top-3 get 50/30/20 %.
   */
  @ApiProperty({ description: 'Distribution rules (JSON)' })
  @Column({ type: 'jsonb', nullable: true })
  distributionRules: Record<string, unknown> | null;

  /**
   * Whether the pool has been distributed (locked against further changes).
   */
  @ApiProperty({ description: 'True when the pool has been fully distributed' })
  @Column({ type: 'boolean', default: false })
  isDistributed: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => PrizePoolPayout, (payout) => payout.prizePool, {
    cascade: true,
  })
  payouts: PrizePoolPayout[];
}