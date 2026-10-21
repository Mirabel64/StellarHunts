import { WalletController } from './wallet.controller';
import type { WalletSessionContext } from './wallet-auth.service';
import type { User } from '../auth/entities/user.entity';

// The controller's dependencies pull in ESM-only Nest feature packages. This
// unit test only exercises the controller's own wiring, so those package
// boundaries are stubbed.
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_3AM: '0 3 * * *' },
}));
jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));
jest.mock('../auth/services/auth.service', () => ({
  AuthService: class AuthService {},
}));

describe('WalletController', () => {
  const WALLET = 'GDN752Q6GWGMEEDZOL7DACRHE2QMCD55MILMLRPMZDCN2AOKB6WUOH2G';
  const DTO = {
    walletAddress: WALLET,
    nonce: 'a'.repeat(64),
    signature: 'c2lnbmF0dXJl',
  };

  const walletService = {
    createChallenge: jest.fn(),
    verifySignature: jest.fn(),
    findUserByWallet: jest.fn(),
    issueWalletSession: jest.fn(),
    linkWalletToAccount: jest.fn(),
  };
  const walletAuthService = {
    revokeSession: jest.fn(),
  };
  const authService = {
    issueSessionForUser: jest.fn(),
  };

  let controller: WalletController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WalletController(
      walletService as any,
      walletAuthService as any,
      authService as any,
    );
  });

  it('creates a challenge through the service', async () => {
    const challenge = {
      nonce: 'a'.repeat(64),
      message: 'message',
      expiresAt: new Date(),
      domain: 'stellar-hunts.app',
    };
    walletService.createChallenge.mockResolvedValue(challenge);

    await expect(
      controller.createChallenge({ walletAddress: WALLET, ttlSeconds: 120 }),
    ).resolves.toEqual(challenge);
    expect(walletService.createChallenge).toHaveBeenCalledWith(WALLET, 120);
  });

  it('verifies a signature and returns a wallet-only session', async () => {
    walletService.verifySignature.mockResolvedValue({});
    walletService.findUserByWallet.mockResolvedValue(null);
    walletService.issueWalletSession.mockResolvedValue({
      accessToken: 'wallet-token',
      expiresIn: 3600,
      session: {},
    });

    const result = await controller.verify(DTO);

    expect(walletService.verifySignature).toHaveBeenCalledWith(
      WALLET,
      DTO.nonce,
      DTO.signature,
    );
    expect(result).toMatchObject({
      linked: false,
      walletAddress: WALLET,
      accessToken: 'wallet-token',
      tokenType: 'WalletSession',
      expiresIn: 3600,
      user: null,
    });
  });

  it('returns account tokens when the wallet is linked to an account', async () => {
    const user = { id: 'user-1', name: 'Ada' } as User;
    walletService.verifySignature.mockResolvedValue({});
    walletService.findUserByWallet.mockResolvedValue(user);
    authService.issueSessionForUser.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenType: 'Bearer',
      expiresIn: 900,
      refreshExpiresIn: 2592000,
      user: {
        id: 'user-1',
        name: 'Ada',
        email: 'a@example.com',
        createdAt: new Date(),
      },
    });

    const result = await controller.verify(DTO);

    expect(result.linked).toBe(true);
    expect(result.tokenType).toBe('Bearer');
    expect(result.accessToken).toBe('access');
    expect(result.refreshToken).toBe('refresh');
    expect(result.user?.id).toBe('user-1');
  });

  it('reports the linked account for an active wallet session', async () => {
    walletService.findUserByWallet.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      username: 'ada',
    });
    const context: WalletSessionContext = {
      session: {
        id: 'session-id',
        jti: 'jti',
        walletAddress: WALLET,
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        lastSeenAt: null,
        createdAt: new Date(),
      },
      walletAddress: WALLET,
      userId: 'user-1',
    };

    const result = await controller.getSession(context);

    expect(result.linked).toBe(true);
    expect(result.user).toEqual({ id: 'user-1', name: 'Ada', username: 'ada' });
    expect(result.expiresAt).toBe(context.session.expiresAt);
  });

  it('revokes the current session on logout', async () => {
    const context = {
      session: { id: 'session-id' },
      walletAddress: WALLET,
      userId: null,
    } as unknown as WalletSessionContext;

    await expect(controller.logout(context)).resolves.toEqual({
      revoked: true,
    });
    expect(walletAuthService.revokeSession).toHaveBeenCalledWith('session-id');
  });

  it('links a wallet after proof of ownership', async () => {
    walletService.linkWalletToAccount.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      username: 'ada',
      walletAddress: WALLET,
    });

    const result = await controller.linkWallet({ id: 'user-1' } as User, DTO);

    expect(walletService.linkWalletToAccount).toHaveBeenCalledWith(
      'user-1',
      WALLET,
      DTO.nonce,
      DTO.signature,
    );
    expect(result.walletAddress).toBe(WALLET);
  });
});
