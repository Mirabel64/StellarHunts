import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * A server-side wallet session.
 *
 * The access token issued to a wallet-only user carries the session's `jti`.
 * Keeping the session in the database (in addition to the JWT's own `exp`)
 * makes logout immediate: a token whose session is revoked or whose
 * `expiresAt` has passed is rejected even if its signature and embedded
 * expiry are still valid.
 */
@Entity('wallet_sessions')
@Index(['walletAddress', 'expiresAt'])
export class WalletSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 64 })
  jti: string;

  @Column({ length: 64 })
  @Index()
  walletAddress: string;

  /** Set when the wallet is linked to a StellarHunts account. */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  userId: string | null;

  @Column({ type: 'timestamp' })
  @Index()
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
