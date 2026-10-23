import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { WalletSession } from './entities/wallet-session.entity';
import { parseDurationToSeconds } from '../common/utils/duration';

/** Marker that distinguishes wallet tokens from account access tokens. */
export const WALLET_TOKEN_TYPE = 'wallet-session';

const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60;

export interface WalletTokenPayload {
  /** Wallet address. */
  sub: string;
  /** Session id (`wallet_sessions.id`). */
  sid: string;
  /** Session id (`wallet_sessions.jti`). */
  jti: string;
  type: typeof WALLET_TOKEN_TYPE;
  /** Linked account id, when the wallet belongs to an account. */
  uid?: string;
  iat?: number;
  exp?: number;
}

export interface IssuedWalletSession {
  session: WalletSession;
  accessToken: string;
  expiresIn: number;
}

export interface WalletSessionContext {
  session: WalletSession;
  walletAddress: string;
  userId: string | null;
}

/**
 * Owns wallet-only session tokens.
 *
 * These tokens are deliberately separate from account access tokens: they are
 * signed with the same secret (so the same guard infrastructure can verify
 * them) but carry `type: 'wallet-session'`, which `JwtStrategy` rejects. They
 * are accepted only by `WalletSessionGuard`, so a wallet-only session cannot
 * reach account endpoints that assume a full user record.
 */
@Injectable()
export class WalletAuthService {
  private readonly logger = new Logger(WalletAuthService.name);

  constructor(
    @InjectRepository(WalletSession)
    private readonly sessionRepository: Repository<WalletSession>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** Configured lifetime of a wallet-only session, in seconds. */
  getSessionTtlSeconds(): number {
    return parseDurationToSeconds(
      this.configService.get<string>('WALLET_SESSION_EXPIRES_IN'),
      DEFAULT_SESSION_TTL_SECONDS,
    );
  }

  async issueSession(
    walletAddress: string,
    userId?: string | null,
  ): Promise<IssuedWalletSession> {
    const expiresIn = this.getSessionTtlSeconds();
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const jti = randomUUID();

    const session = await this.sessionRepository.save(
      this.sessionRepository.create({
        jti,
        walletAddress,
        userId: userId ?? null,
        expiresAt,
        revokedAt: null,
        lastSeenAt: null,
      }),
    );

    const payload: WalletTokenPayload = {
      sub: walletAddress,
      sid: session.id,
      jti,
      type: WALLET_TOKEN_TYPE,
      ...(userId ? { uid: userId } : {}),
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn });

    return { session, accessToken, expiresIn };
  }

  /**
   * Verifies a wallet session token and its server-side session record.
   *
   * Both checks are required: the signature/expiry prove the token was issued
   * by this service, and the record proves it has not been logged out. A
   * missing record is treated exactly like a revoked one — tokens are never
   * accepted on the strength of their signature alone.
   */
  async validateSession(rawToken: string): Promise<WalletSessionContext> {
    let payload: WalletTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<WalletTokenPayload>(rawToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired wallet session');
    }

    if (
      payload.type !== WALLET_TOKEN_TYPE ||
      !payload.jti ||
      !payload.sub
    ) {
      throw new UnauthorizedException('Invalid wallet session');
    }

    const session = await this.sessionRepository.findOne({
      where: { jti: payload.jti },
    });

    if (!session) {
      throw new UnauthorizedException('Wallet session not found');
    }
    if (session.revokedAt) {
      throw new UnauthorizedException('Wallet session has been revoked');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Wallet session has expired');
    }
    if (session.walletAddress !== payload.sub) {
      throw new UnauthorizedException('Wallet session does not match the token');
    }

    await this.sessionRepository.update(session.id, { lastSeenAt: new Date() });

    return {
      session,
      walletAddress: session.walletAddress,
      userId: session.userId ?? null,
    };
  }

  /** Revokes a session. Idempotent: revoking twice is not an error. */
  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepository.update(
      { id: sessionId, revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  /** Revokes every active session for a wallet (used when an account is linked). */
  async revokeWalletSessions(walletAddress: string): Promise<void> {
    await this.sessionRepository.update(
      { walletAddress, revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  /**
   * Deletes sessions that expired more than `olderThanDays` ago. Logging is
   * best-effort: a failed cleanup must not break authentication.
   */
  async pruneExpiredSessions(olderThanDays = 7): Promise<number> {
    const cutoff = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    );
    try {
      const result = await this.sessionRepository
        .createQueryBuilder()
        .delete()
        .where('"expiresAt" < :cutoff', { cutoff })
        .execute();
      return result.affected ?? 0;
    } catch (error) {
      this.logger.warn(
        `wallet_session_prune_failed error=${
          error instanceof Error ? error.name : typeof error
        }`,
      );
      return 0;
    }
  }
}
