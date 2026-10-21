import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { Admin } from '../../src/admin/admin.entity';
import { AdminRole } from '../../src/admin/admin-role.enum';
import { User } from '../../src/auth/entities/user.entity';
import { Puzzle } from '../../src/puzzle/puzzle.entity';
import { PuzzleCompletion } from '../../src/puzzle-dependency/entities/puzzle-completion.entity';
import { Reward, RewardType } from '../../src/reward/entities/reward.entity';
import { RewardClaim } from '../../src/reward/entities/reward-claim.entity';
import { Category } from '../../src/puzzle-category/entities/category.entity';
import { CategoryPuzzle } from '../../src/puzzle-category/entities/puzzle.entity';
import { Content } from '../../src/content/content.entity';
import { Progress } from '../../src/progress/entities/progress.entity';

/**
 * Stable identifiers so a test can reference a fixture without carrying the
 * value around, while still being valid UUIDs for the uuid columns.
 */
export const TEST_IDS = {
  admin: '11111111-1111-4111-8111-111111111111',
  user: '22222222-2222-4222-8222-222222222222',
  activePuzzle: '33333333-3333-4333-8333-333333333333',
  inactivePuzzle: '44444444-4444-4444-8444-444444444444',
  reward: '55555555-5555-4555-8555-555555555555',
  category: '66666666-6666-4666-8666-666666666666',
  categoryPuzzle: '77777777-7777-4777-8777-777777777777',
  content: '88888888-8888-4888-8888-888888888888',
} as const;

export const TEST_CREDENTIALS = {
  adminEmail: 'integration-admin@stellarshunts.test',
  adminPassword: 'integration-admin-password',
  username: 'integration_player',
  userEmail: 'integration-player@stellarshunts.test',
  userPassword: 'integration-player-password',
  activePuzzleSolution: 'orbit',
} as const;

export interface SeededFixtures {
  adminId: string;
  userId: string;
  activePuzzleId: string;
  inactivePuzzleId: string;
  rewardId: string;
  categoryId: string;
  categoryPuzzleId: string;
  contentId: string;
}

/**
 * Empties every table TypeORM knows about so each suite starts from a known
 * state. `CASCADE` handles foreign keys and
 * `RESTART IDENTITY` keeps serial columns deterministic.
 */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  const tables = dataSource.entityMetadatas.map(
    (metadata) => `"${metadata.tableName}"`,
  );
  if (tables.length === 0) return;
  await dataSource.query(
    `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
  );
}

/**
 * Inserts the records the integration suite needs: an admin, a player, active
 * and inactive puzzles, a reward with one unconsumed challenge, a category,
 * content, completion history, and progress.
 */
export async function seedDatabase(
  dataSource: DataSource,
): Promise<SeededFixtures> {
  const admins = dataSource.getRepository(Admin);
  const users = dataSource.getRepository(User);
  const puzzles = dataSource.getRepository(Puzzle);
  const completions = dataSource.getRepository(PuzzleCompletion);
  const rewards = dataSource.getRepository(Reward);
  const categories = dataSource.getRepository(Category);
  const categoryPuzzles = dataSource.getRepository(CategoryPuzzle);
  const contents = dataSource.getRepository(Content);
  const progress = dataSource.getRepository(Progress);

  await admins.save(
    admins.create({
      id: TEST_IDS.admin,
      email: TEST_CREDENTIALS.adminEmail,
      password: await bcrypt.hash(TEST_CREDENTIALS.adminPassword, 10),
      role: AdminRole.ADMIN,
    }),
  );

  await users.save(
    users.create({
      id: TEST_IDS.user,
      name: 'Integration Player',
      username: TEST_CREDENTIALS.username,
      email: TEST_CREDENTIALS.userEmail,
      password: TEST_CREDENTIALS.userPassword,
      isActive: true,
    }),
  );

  await puzzles.save([
    puzzles.create({
      id: TEST_IDS.activePuzzle,
      title: 'Integration Active Puzzle',
      description: 'An active puzzle for integration coverage.',
      difficulty: 'easy',
      hint: 'The answer is a celestial path.',
      solution: TEST_CREDENTIALS.activePuzzleSolution,
      isActive: true,
    }),
    puzzles.create({
      id: TEST_IDS.inactivePuzzle,
      title: 'Integration Inactive Puzzle',
      description: 'An unpublished puzzle for integration coverage.',
      difficulty: 'hard',
      solution: 'unpublished',
      isActive: false,
    }),
  ]);

  await completions.save(
    completions.create({
      userId: TEST_IDS.user,
      puzzleId: TEST_IDS.activePuzzle,
    }),
  );

  await rewards.save(
    rewards.create({
      id: TEST_IDS.reward,
      name: 'Integration Badge',
      description: 'Awarded for the integration puzzle.',
      type: RewardType.BADGE,
      metadata: { tier: 'test' },
      challengeId: 'integration-challenge',
      isActive: true,
      maxClaims: 10,
      currentClaims: 0,
    }),
  );

  await categories.save(
    categories.create({
      id: TEST_IDS.category,
      name: 'Integration Category',
      description: 'Seeded for integration tests.',
      slug: 'integration-category',
      icon: '🧩',
      color: '#112233',
      isActive: true,
      sortOrder: 1,
    }),
  );

  await categoryPuzzles.save(
    categoryPuzzles.create({
      id: TEST_IDS.categoryPuzzle,
      title: 'Integration Category Puzzle',
      description: 'Categorised puzzle fixture.',
      difficulty: 'BEGINNER',
      points: 10,
      isActive: true,
      estimatedTime: 5,
    }),
  );

  await contents.save(
    contents.create({
      id: TEST_IDS.content,
      title: 'Integration Article',
      body: 'Seeded content for the integration suite.',
      topic: 'integration',
      isActive: true,
    }),
  );

  await progress.save(
    progress.create({
      userId: TEST_IDS.user,
      completedPuzzles: 1,
      totalPuzzles: 2,
    }),
  );

  return {
    adminId: TEST_IDS.admin,
    userId: TEST_IDS.user,
    activePuzzleId: TEST_IDS.activePuzzle,
    inactivePuzzleId: TEST_IDS.inactivePuzzle,
    rewardId: TEST_IDS.reward,
    categoryId: TEST_IDS.category,
    categoryPuzzleId: TEST_IDS.categoryPuzzle,
    contentId: TEST_IDS.content,
  };
}

/** Creates and connects a DataSource for the configured test database. */
export function createTestDataSource(
  overrides: Partial<ConstructorParameters<typeof DataSource>[0]> = {},
): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'stellarshunts',
    entities: [
      Admin,
      User,
      Puzzle,
      PuzzleCompletion,
      Reward,
      RewardClaim,
      Category,
      CategoryPuzzle,
      Content,
      Progress,
    ],
    synchronize: true,
    ...overrides,
  } as any);
}
