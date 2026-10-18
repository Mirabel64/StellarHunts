import { NotFoundException } from '@nestjs/common';
import { DataExportService } from './data-export.service';
import { User } from '../auth/entities/user.entity';

class ProgressRecord {
  id: string;
  userId: string;
  score: number;
  createdAt: Date;
}

class TokenHistoryRecord {
  id: string;
  userId: string;
  tokenHash: string;
  metadata: Record<string, unknown>;
}

class WalletSessionRecord {
  id: string;
  userId: string;
  walletAddress: string;
  jti: string;
}

class WalletRecord {
  id: string;
  address: string;
}

class AdminRecord {
  id: string;
  email: string;
}

const column = (propertyName: string) => ({ propertyName });

const buildDataSource = (
  options: {
    user?: Partial<User> | null;
    rows?: Record<string, Record<string, unknown>[]>;
  } = {},
) => {
  const user = options.user === undefined ? { id: 'user-1' } : options.user;
  const rows = options.rows ?? {};

  const metadataFor = (tableName: string, target: unknown, properties: string[]) => ({
    tableName,
    target,
    columns: properties.map(column),
  });

  const metadatas = [
    metadataFor('users', User, ['id', 'name', 'password', 'walletAddress']),
    metadataFor('progress', ProgressRecord, [
      'id',
      'userId',
      'score',
      'createdAt',
    ]),
    metadataFor('token_history', TokenHistoryRecord, [
      'id',
      'userId',
      'tokenHash',
      'metadata',
    ]),
    metadataFor('wallet_sessions', WalletSessionRecord, [
      'id',
      'userId',
      'walletAddress',
      'jti',
    ]),
    metadataFor('wallet', WalletRecord, ['id', 'address']),
    metadataFor('admins', AdminRecord, ['id', 'email']),
    metadataFor('puzzles', class Puzzle {}, ['id', 'title']),
  ];

  const repositories = new Map<unknown, unknown>();
  const findCalls: Array<{ table: string; options: unknown }> = [];

  for (const metadata of metadatas) {
    repositories.set(metadata.target, {
      find: jest.fn(async (findOptions: any) => {
        findCalls.push({ table: metadata.tableName, options: findOptions });
        return rows[metadata.tableName] ?? [];
      }),
      findOne: jest.fn(async () =>
        metadata.tableName === 'users' ? user : null,
      ),
    });
  }

  return {
    dataSource: {
      entityMetadatas: metadatas,
      getRepository: (target: unknown) => {
        const repository = repositories.get(target);
        if (!repository) throw new Error(`No repository for ${String(target)}`);
        return repository;
      },
    },
    findCalls,
  };
};

describe('DataExportService', () => {
  it('includes the account and every table that stores its rows', async () => {
    const { dataSource } = buildDataSource({
      user: {
        id: 'user-1',
        name: 'Ada',
        password: 'hashed',
        walletAddress: 'GABC',
      } as User,
      rows: {
        progress: [{ id: 'p1', userId: 'user-1', score: 10 }],
        wallet: [{ id: 'w1', address: 'GABC' }],
      },
    });

    const result = await new DataExportService(dataSource as any).exportForUser(
      'user-1',
    );

    expect(result.schemaVersion).toBe('1.0');
    expect(result.user).toMatchObject({ id: 'user-1', name: 'Ada' });
    expect(result.user).not.toHaveProperty('password');
    expect(result.records.progress).toEqual([
      { id: 'p1', userId: 'user-1', score: 10 },
    ]);
    expect(result.records.wallet).toEqual([{ id: 'w1', address: 'GABC' }]);
    expect(result.records).not.toHaveProperty('puzzles');
    expect(result.records).not.toHaveProperty('admins');
  });

  it('drops credential columns instead of exporting hashes', async () => {
    const { dataSource } = buildDataSource({
      rows: {
        token_history: [
          {
            id: 't1',
            userId: 'user-1',
            tokenHash: 'deadbeef',
            metadata: {
              ipAddress: '127.0.0.1',
              refreshToken: 'secret-value',
              jti: 'abc',
            },
          },
        ],
      },
    });

    const result = await new DataExportService(dataSource as any).exportForUser(
      'user-1',
    );

    const tokenRow = result.records.token_history[0];
    expect(tokenRow).not.toHaveProperty('tokenHash');
    expect(tokenRow.metadata).toEqual({
      ipAddress: '127.0.0.1',
      refreshToken: '[redacted]',
      jti: '[redacted]',
    });
  });

  it('also finds wallet-scoped rows that predate account linking', async () => {
    const { dataSource, findCalls } = buildDataSource({
      user: { id: 'user-1', walletAddress: 'GABC' } as User,
    });

    await new DataExportService(dataSource as any).exportForUser('user-1');

    const sessionQuery = findCalls.find(
      (call) => call.table === 'wallet_sessions',
    );
    expect(sessionQuery?.options).toMatchObject({
      where: [{ userId: 'user-1' }, { walletAddress: 'GABC' }],
    });
  });

  it('does not export a wallet column for a user without a linked wallet', async () => {
    const { dataSource, findCalls } = buildDataSource({
      user: { id: 'user-1', walletAddress: null } as User,
    });

    await new DataExportService(dataSource as any).exportForUser('user-1');

    expect(findCalls.some((call) => call.table === 'wallet')).toBe(false);
  });

  it('rejects an unknown user', async () => {
    const { dataSource } = buildDataSource({ user: null });

    await expect(
      new DataExportService(dataSource as any).exportForUser('missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
