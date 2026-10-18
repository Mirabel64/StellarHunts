import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * A login challenge issued by the server.
 *
 * Challenges are persisted rather than reconstructed from the client's
 * message so that verification only accepts a message the server itself
 * produced (with a server-generated nonce, domain, and expiry). The nonce is
 * unique and `consumedAt` is the single-use marker used for replay
 * protection.
 */
@Entity('wallet_challenges')
@Index(['walletAddress', 'createdAt'])
export class WalletChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 64 })
  nonce: string;

  @Column({ length: 64 })
  @Index()
  walletAddress: string;

  @Column({ length: 255 })
  domain: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'timestamp' })
  @Index()
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
