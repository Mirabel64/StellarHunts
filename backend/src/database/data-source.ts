import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';

import { User } from '../auth/entities/user.entity';
import { Puzzle } from '../puzzle/puzzle.entity';
import { PuzzleCompletion } from '../puzzle-dependency/entities/puzzle-completion.entity';
import { Reward } from '../reward/entities/reward.entity';
import { RewardClaim } from '../reward/entities/reward-claim.entity';

config();

/**
 * TypeORM CLI DataSource used by `npm run db:migrate` and the seed script.
 *
 * Only the core entities covered by the baseline migration are listed.
 * The application connection (`src/app.module.ts`) still auto-loads every
 * entity registered through `TypeOrmModule.forFeature`; this DataSource is
 * intentionally narrow so schema tooling does not depend on the full
 * application module graph.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10) || 5432,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [User, Puzzle, PuzzleCompletion, Reward, RewardClaim],
  migrations: [join(__dirname, '..', '**', 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
});
