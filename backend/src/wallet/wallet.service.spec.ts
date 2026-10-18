import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync, sign as signEd25519 } from 'crypto';
import { WalletService } from './wallet.service';
import { encodeAccountAddress } from './stellar-account';

// The Nest feature packages are ESM-only in this dependency set. The service
// uses nothing more than decorators from them, so they are stubbed rather
// than booting a Nest application for a unit test.
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_3AM: '0 3 * * *' },
}));
jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));

describe('WalletService', () => {
  const createKeypair = () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const rawPublicKey = publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(-32);

    return {
      address: encodeAccountAddress(rawPublicKey),
      sign: (message: string) =>
        signEd25519(null, Buffer.from(message, 'utf8'), privateKey),
    };
  };

  const keypair = createKeypair();
  const WALLET = keypair.address;
  const OTHER_WALLET = createKeypair().address;
  const DOMAIN = 'stellar-hunts.app';

  let challengeRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let walletRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let userRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let service: WalletService;

  const sign = (message: string) =>
    Buffer.from(keypair.sign(message)).toString('base64');

  beforeEach(() => {
    challengeRepository = {
      create: jest.fn((data) => ({ id: 'challenge-id', ...data })),
      save: jest.fn(async (data) => data),
      findOne: jest.fn(),
      update: jest.fn(async () => ({ affected: 1 })),
      delete: jest.fn(async () => ({ affected: 0 })),
    };
    walletRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((data) => ({ id: 'wallet-id', ...data })),
      save: jest.fn(async (data) => data),
    };
    userRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (user) => user),
    };

    const config = {
      get: (key: string) =>
        ({
          WALLET_AUTH_DOMAIN: DOMAIN,
          WALLET_CHALLENGE_TTL_SECONDS: '300',
        })[key],
    };
    const walletAuth = { issueSession: jest.fn() };

    service = new WalletService(
      challengeRepository as any,
      walletRepository as any,
      userRepository as any,
      walletAuth as any,
      config as any,
    );
  });

  const createStoredChallenge = async () => {
    const created = await service.createChallenge(WALLET);
    const stored = {
      id: 'challenge-id',
      nonce: created.nonce,
      walletAddress: WALLET,
      domain: DOMAIN,
      message: created.message,
      expiresAt: created.expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    };
    challengeRepository.findOne.mockResolvedValue(stored);
    return { created, stored };
  };

  describe('createChallenge', () => {
    it('issues a single-use challenge bound to the wallet, domain and expiry', async () => {
      const challenge = await service.createChallenge(WALLET);

      expect(challenge.nonce).toMatch(/^[a-f0-9]{64}$/);
      expect(challenge.domain).toBe(DOMAIN);
      expect(challenge.message).toContain('stellar-hunts: authenticate');
      expect(challenge.message).toContain(`wallet=${WALLET}`);
      expect(challenge.message).toContain(`nonce=${challenge.nonce}`);
      expect(challenge.message).toContain(`domain=${DOMAIN}`);
      expect(challenge.message).toContain(
        `expires=${challenge.expiresAt.toISOString()}`,
      );
      expect(challenge.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(challengeRepository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects an address that is not a Stellar account key', async () => {
      await expect(
        service.createChallenge('0x1234567890abcdef'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(challengeRepository.save).not.toHaveBeenCalled();
    });

    it('caps the requested lifetime at 15 minutes', async () => {
      const challenge = await service.createChallenge(WALLET, 99999);
      const ttlSeconds = Math.round(
        (challenge.expiresAt.getTime() - Date.now()) / 1000,
      );

      expect(ttlSeconds).toBeLessThanOrEqual(900);
      expect(ttlSeconds).toBeGreaterThan(880);
    });
  });

  describe('verifySignature', () => {
    it('accepts a correctly signed challenge and consumes the nonce', async () => {
      const { created } = await createStoredChallenge();

      const verified = await service.verifySignature(
        WALLET,
        created.nonce,
        sign(created.message),
      );

      expect(verified.walletAddress).toBe(WALLET);
      expect(challengeRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'challenge-id' }),
        expect.objectContaining({ consumedAt: expect.any(Date) }),
      );
      expect(walletRepository.save).toHaveBeenCalled();
    });

    it('rejects an unknown nonce', async () => {
      challengeRepository.findOne.mockResolvedValue(null);

      await expect(
        service.verifySignature(WALLET, 'a'.repeat(64), sign('anything')),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a challenge issued for a different wallet', async () => {
      const { created } = await createStoredChallenge();

      await expect(
        service.verifySignature(OTHER_WALLET, created.nonce, sign(created.message)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired challenge', async () => {
      const { created, stored } = await createStoredChallenge();
      stored.expiresAt = new Date(Date.now() - 1000);

      await expect(
        service.verifySignature(WALLET, created.nonce, sign(created.message)),
      ).rejects.toThrow('expired');
    });

    it('rejects a replayed challenge', async () => {
      const { created, stored } = await createStoredChallenge();
      stored.consumedAt = new Date();

      await expect(
        service.verifySignature(WALLET, created.nonce, sign(created.message)),
      ).rejects.toThrow('already used');
    });

    it('rejects a signature made by a different key', async () => {
      const { created } = await createStoredChallenge();
      const other = createKeypair();
      const signature = Buffer.from(other.sign(created.message)).toString(
        'base64',
      );

      await expect(
        service.verifySignature(WALLET, created.nonce, signature),
      ).rejects.toThrow('Invalid wallet signature');
    });

    it('rejects a malformed signature before consuming the nonce', async () => {
      const { created } = await createStoredChallenge();

      await expect(
        service.verifySignature(WALLET, created.nonce, 'not-base64'),
      ).rejects.toThrow('Invalid wallet signature');
      expect(challengeRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a concurrent verification of the same nonce', async () => {
      const { created } = await createStoredChallenge();
      challengeRepository.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.verifySignature(WALLET, created.nonce, sign(created.message)),
      ).rejects.toThrow('already used');
    });
  });

  describe('linkWalletToAccount', () => {
    it('links a proven wallet to the account', async () => {
      const { created } = await createStoredChallenge();
      userRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'user-1', walletAddress: null });

      const linked = await service.linkWalletToAccount(
        'user-1',
        WALLET,
        created.nonce,
        sign(created.message),
      );

      expect(linked.walletAddress).toBe(WALLET);
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('refuses to steal a wallet already linked to another account', async () => {
      const { created } = await createStoredChallenge();
      userRepository.findOne.mockResolvedValueOnce({
        id: 'someone-else',
        walletAddress: WALLET,
      });

      await expect(
        service.linkWalletToAccount(
          'user-1',
          WALLET,
          created.nonce,
          sign(created.message),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
