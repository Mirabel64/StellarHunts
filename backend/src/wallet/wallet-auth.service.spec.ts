import { UnauthorizedException } from '@nestjs/common';
import {
  WALLET_TOKEN_TYPE,
  WalletAuthService,
} from './wallet-auth.service';

// Dependency stubs: these packages are ESM-only in this dependency set and
// the service only needs their decorator/type surface for a unit test.
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));

describe('WalletAuthService', () => {
  const WALLET = 'GDN752Q6GWGMEEDZOL7DACRHE2QMCD55MILMLRPMZDCN2AOKB6WUOH2G';

  let sessionRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let jwtService: {
    sign: jest.Mock;
    verifyAsync: jest.Mock;
  };
  let service: WalletAuthService;

  beforeEach(() => {
    sessionRepository = {
      create: jest.fn((data) => ({ id: 'session-id', ...data })),
      save: jest.fn(async (data) => data),
      findOne: jest.fn(),
      update: jest.fn(async () => ({ affected: 1 })),
      createQueryBuilder: jest.fn(() => ({
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => ({ affected: 3 })),
      })),
    };
    jwtService = {
      sign: jest.fn(() => 'signed-wallet-token'),
      verifyAsync: jest.fn(),
    };

    const config = {
      get: (key: string) =>
        key === 'WALLET_SESSION_EXPIRES_IN' ? '24h' : undefined,
    };

    service = new WalletAuthService(
      sessionRepository as any,
      jwtService as any,
      config as any,
    );
  });

  it('issues a session token with a server-side record and expiry', async () => {
    const issued = await service.issueSession(WALLET);

    expect(issued.accessToken).toBe('signed-wallet-token');
    expect(issued.expiresIn).toBe(24 * 60 * 60);
    expect(issued.session.walletAddress).toBe(WALLET);
    expect(issued.session.revokedAt).toBeNull();
    expect(issued.session.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const [payload, options] = jwtService.sign.mock.calls[0];
    expect(payload).toMatchObject({
      sub: WALLET,
      sid: 'session-id',
      type: WALLET_TOKEN_TYPE,
    });
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(options).toEqual({ expiresIn: 24 * 60 * 60 });
  });

  it('accepts a token whose session is active', async () => {
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-id',
      jti: 'jti-1',
      walletAddress: WALLET,
      userId: null,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      lastSeenAt: null,
    });
    jwtService.verifyAsync.mockResolvedValue({
      sub: WALLET,
      sid: 'session-id',
      jti: 'jti-1',
      type: WALLET_TOKEN_TYPE,
    });

    const context = await service.validateSession('token');

    expect(context.walletAddress).toBe(WALLET);
    expect(sessionRepository.update).toHaveBeenCalledWith('session-id', {
      lastSeenAt: expect.any(Date),
    });
  });

  it('rejects a token for a missing session', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: WALLET,
      sid: 'session-id',
      jti: 'jti-1',
      type: WALLET_TOKEN_TYPE,
    });
    sessionRepository.findOne.mockResolvedValue(null);

    await expect(service.validateSession('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a revoked session', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: WALLET,
      sid: 'session-id',
      jti: 'jti-1',
      type: WALLET_TOKEN_TYPE,
    });
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-id',
      walletAddress: WALLET,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });

    await expect(service.validateSession('token')).rejects.toThrow('revoked');
  });

  it('rejects an expired session even when the token verifies', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: WALLET,
      sid: 'session-id',
      jti: 'jti-1',
      type: WALLET_TOKEN_TYPE,
    });
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-id',
      walletAddress: WALLET,
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    });

    await expect(service.validateSession('token')).rejects.toThrow('expired');
  });

  it('rejects an account access token presented as a wallet session', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      jti: 'jti-1',
      type: 'access',
    });

    await expect(service.validateSession('token')).rejects.toThrow(
      'Invalid wallet session',
    );
  });

  it('rejects a token whose wallet does not match its session', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: WALLET,
      sid: 'session-id',
      jti: 'jti-1',
      type: WALLET_TOKEN_TYPE,
    });
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-id',
      walletAddress: 'GACKTN5DAZGWXRWSNW7OMTYPRVTPB3SB65G42DOXWZOX5L6NG4SQXZLE',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });

    await expect(service.validateSession('token')).rejects.toThrow(
      'does not match',
    );
  });

  it('revokes only sessions that are still active', async () => {
    await service.revokeSession('session-id');

    expect(sessionRepository.update).toHaveBeenCalledWith(
      { id: 'session-id', revokedAt: null },
      { revokedAt: expect.any(Date) },
    );
  });

  it('prunes expired sessions', async () => {
    await expect(service.pruneExpiredSessions()).resolves.toBe(3);
  });
});
