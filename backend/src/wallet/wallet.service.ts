import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IsNull, LessThan, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { User } from '../auth/entities/user.entity';
import { WalletChallenge } from './entities/wallet-challenge.entity';
import { Wallet } from './entities/wallet.entity';
import { WalletAuthService } from './wallet-auth.service';
import {
  isValidAccountAddress,
  verifyAccountSignature,
} from './stellar-account';

export const DEFAULT_CHALLENGE_DOMAIN = 'stellar-hunts.app';
export const DEFAULT_CHALLENGE_TTL_SECONDS = 300;
export const MAX_CHALLENGE_TTL_SECONDS = 900;
export const MIN_CHALLENGE_TTL_SECONDS = 30;

export interface CreatedWalletChallenge {
  nonce: string;
  message: string;
  expiresAt: Date;
  domain: string;
}

/**
 * Wallet signature authentication.
 *
 * The flow is a standard challenge/response:
 *
 *   1. `POST /wallet/challenge` stores a server-generated nonce, message,
 *      domain and expiry.
 *   2. The wallet signs the exact UTF-8 message and posts the nonce and
 *      signature back.
 *   3. The server verifies the ed25519 signature against the account's
 *      public key, atomically marks the challenge consumed, and issues a
 *      session token.
 *
 * Because the challenge is reconstructed from the stored row (not from
 * client-supplied text), a caller cannot choose their own nonce, expiry or
 * domain, and a signature can only ever be used once.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(WalletChallenge)
    private readonly challengeRepository: Repository<WalletChallenge>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly walletAuthService: WalletAuthService,
    private readonly configService: ConfigService,
  ) {}

  /** Domain challenges are bound to. */
  get challengeDomain(): string {
    return (
      this.configService.get<string>('WALLET_AUTH_DOMAIN') ||
      DEFAULT_CHALLENGE_DOMAIN
    );
  }

  private get challengeTtlSeconds(): number {
    const configured = Number(
      this.configService.get<string>('WALLET_CHALLENGE_TTL_SECONDS') ??
        DEFAULT_CHALLENGE_TTL_SECONDS,
    );
    if (!Number.isFinite(configured)) return DEFAULT_CHALLENGE_TTL_SECONDS;
    return Math.min(
      MAX_CHALLENGE_TTL_SECONDS,
      Math.max(MIN_CHALLENGE_TTL_SECONDS, Math.floor(configured)),
    );
  }

  /**
   * Issues and persists a challenge for `walletAddress`.
   *
   * The address is validated through the Stellar SDK so that only a real
   * ed25519 account key can start a login. An invalid address is a 400, not
   * an authentication failure.
   */
  async createChallenge(
    walletAddress: string,
    ttlSeconds?: number,
  ): Promise<CreatedWalletChallenge> {
    if (!isValidAccountAddress(walletAddress)) {
      throw new BadRequestException(
        'walletAddress must be a Stellar account address (G...)',
      );
    }

    const ttl = Math.min(
      MAX_CHALLENGE_TTL_SECONDS,
      Math.max(
        MIN_CHALLENGE_TTL_SECONDS,
        Math.floor(ttlSeconds ?? this.challengeTtlSeconds),
      ),
    );
    const domain = this.challengeDomain;
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const message = [
      'stellar-hunts: authenticate',
      `wallet=${walletAddress}`,
      `nonce=${nonce}`,
      `domain=${domain}`,
      `expires=${expiresAt.toISOString()}`,
    ].join('\n');

    const challenge = await this.challengeRepository.save(
      this.challengeRepository.create({
        nonce,
        walletAddress,
        domain,
        message,
        expiresAt,
        consumedAt: null,
      }),
    );

    return {
      nonce: challenge.nonce,
      message: challenge.message,
      expiresAt: challenge.expiresAt,
      domain: challenge.domain,
    };
  }

  /**
   * Verifies a challenge response and consumes the nonce.
   *
   * Every failure path is a 401 with a deliberately non-specific message
   * except for `Challenge already used`, which is returned so clients can
   * tell a replay from a bad signature.
   */
  async verifySignature(
    walletAddress: string,
    nonce: string,
    signature: string,
  ): Promise<WalletChallenge> {
    const challenge = await this.challengeRepository.findOne({
      where: { nonce },
    });

    if (!challenge || challenge.walletAddress !== walletAddress) {
      throw new UnauthorizedException('Unknown wallet challenge');
    }
    if (challenge.consumedAt) {
      throw new UnauthorizedException('Challenge already used');
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Challenge has expired');
    }
    if (challenge.domain !== this.challengeDomain) {
      throw new UnauthorizedException('Challenge bound to an unexpected domain');
    }

    const validSignature = this.checkSignature(
      walletAddress,
      challenge.message,
      signature,
    );
    if (!validSignature) {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    // Single-use guarantee. The compare-and-set on `consumedAt` makes this
    // safe under concurrency: of two simultaneous requests carrying the same
    // nonce, exactly one updates a row and the other sees `affected === 0`.
    const consumed = await this.challengeRepository.update(
      { id: challenge.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

    if (!consumed.affected) {
      throw new UnauthorizedException('Challenge already used');
    }

    await this.recordWallet(walletAddress);
    return challenge;
  }

  /** Links a proven wallet address to an existing account. */
  async linkWalletToAccount(
    userId: string,
    walletAddress: string,
    nonce: string,
    signature: string,
  ): Promise<User> {
    await this.verifySignature(walletAddress, nonce, signature);

    const owner = await this.userRepository.findOne({
      where: { walletAddress },
    });
    if (owner && owner.id !== userId) {
      throw new ConflictException(
        'Wallet already linked to another account',
      );
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.walletAddress !== walletAddress) {
      user.walletAddress = walletAddress;
      await this.userRepository.save(user);
    }

    return user;
  }

  async findUserByWallet(walletAddress: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { walletAddress } });
  }

  /** Wallet-only session token for an address that is not linked to an account. */
  async issueWalletSession(walletAddress: string) {
    return this.walletAuthService.issueSession(walletAddress);
  }

  /**
   * Removes challenges that expired more than a day ago. A challenge is only
   * useful while it is unconsumed and unexpired, so keeping the full history
   * forever would grow the table without benefit.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneExpiredChallenges(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      const result = await this.challengeRepository.delete({
        expiresAt: LessThan(cutoff),
      });
      return result.affected ?? 0;
    } catch (error) {
      this.logger.warn(
        `wallet_challenge_prune_failed error=${
          error instanceof Error ? error.name : typeof error
        }`,
      );
      return 0;
    }
  }

  private async recordWallet(walletAddress: string): Promise<void> {
    // The registry is a convenience for lookups and auditing; a failure here
    // must not turn a successfully verified login into a 500.
    try {
      const existing = await this.walletRepository.findOne({
        where: { address: walletAddress },
      });
      if (!existing) {
        await this.walletRepository.save(
          this.walletRepository.create({ address: walletAddress }),
        );
      }
    } catch (error) {
      this.logger.warn(
        `wallet_registry_write_failed error=${
          error instanceof Error ? error.name : typeof error
        }`,
      );
    }
  }

  private checkSignature(
    walletAddress: string,
    message: string,
    signature: string,
  ): boolean {
    try {
      return verifyAccountSignature(
        walletAddress,
        Buffer.from(message, 'utf8'),
        Buffer.from(signature, 'base64'),
      );
    } catch {
      return false;
    }
  }
}
