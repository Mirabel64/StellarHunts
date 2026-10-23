import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

export class CreateWalletAuthTables1735000000000
  implements MigrationInterface
{
  name = 'CreateWalletAuthTables1735000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'wallet_challenges',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'nonce', type: 'varchar', length: '64', isUnique: true },
          { name: 'walletAddress', type: 'varchar', length: '64' },
          { name: 'domain', type: 'varchar', length: '255' },
          { name: 'message', type: 'text' },
          { name: 'expiresAt', type: 'timestamp' },
          { name: 'consumedAt', type: 'timestamp', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('wallet_challenges', [
      new TableIndex({
        name: 'IDX_wallet_challenges_wallet_created',
        columnNames: ['walletAddress', 'createdAt'],
      }),
      new TableIndex({
        name: 'IDX_wallet_challenges_expires_at',
        columnNames: ['expiresAt'],
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'wallet_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'jti', type: 'varchar', length: '64', isUnique: true },
          { name: 'walletAddress', type: 'varchar', length: '64' },
          { name: 'userId', type: 'uuid', isNullable: true },
          { name: 'expiresAt', type: 'timestamp' },
          { name: 'revokedAt', type: 'timestamp', isNullable: true },
          { name: 'lastSeenAt', type: 'timestamp', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('wallet_sessions', [
      new TableIndex({
        name: 'IDX_wallet_sessions_wallet_expires',
        columnNames: ['walletAddress', 'expiresAt'],
      }),
      new TableIndex({
        name: 'IDX_wallet_sessions_expires_at',
        columnNames: ['expiresAt'],
      }),
      new TableIndex({
        name: 'IDX_wallet_sessions_user_id',
        columnNames: ['userId'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('wallet_sessions', true);
    await queryRunner.dropTable('wallet_challenges', true);
  }
}
