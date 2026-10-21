import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { User } from '../../auth/entities/user.entity';
import { Puzzle } from '../../puzzle/puzzle.entity';
import { PuzzleCompletion } from '../../puzzle-dependency/entities/puzzle-completion.entity';
import { Reward, RewardType } from '../../reward/entities/reward.entity';
import { RewardClaim } from '../../reward/entities/reward-claim.entity';

/**
 * Deterministic identifiers keep the seed idempotent: re-running it never
 * duplicates rows, and the demo account/puzzle IDs are stable for frontend
 * and API examples.
 */
export const SEED_USER_ID = 'a0000000-0000-4000-8000-000000000001';
export const SEED_PUZZLE_IDS = {
  easy: 'b0000000-0000-4000-8000-000000000001',
  medium: 'b0000000-0000-4000-8000-000000000002',
  hard: 'b0000000-0000-4000-8000-000000000003',
} as const;
export const SEED_REWARD_IDS = {
  badge: 'c0000000-0000-4000-8000-000000000001',
  points: 'c0000000-0000-4000-8000-000000000002',
} as const;

export interface CoreSeedSummary {
  usersInserted: number;
  puzzlesInserted: number;
  completionsInserted: number;
  rewardsInserted: number;
  claimsInserted: number;
  demoUsername: string;
}

function demoPassword(): string {
  return process.env.SEED_DEMO_PASSWORD || 'DemoPassw0rd!';
}

/**
 * Inserts the core demo dataset used by local development and documentation.
 *
 * The seed is additive and idempotent: each row is inserted only when its
 * deterministic id is absent, so an existing database is never truncated or
 * overwritten. Run it after `npm run db:migrate`.
 */
export async function seedCore(
  dataSource: DataSource,
): Promise<CoreSeedSummary> {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.SEED_ALLOW_PRODUCTION !== 'true'
  ) {
    throw new Error(
      'Refusing to seed production. Set SEED_ALLOW_PRODUCTION=true to override.',
    );
  }

  const summary: CoreSeedSummary = {
    usersInserted: 0,
    puzzlesInserted: 0,
    completionsInserted: 0,
    rewardsInserted: 0,
    claimsInserted: 0,
    demoUsername: 'demo_player',
  };

  await dataSource.transaction(async (manager) => {
    const users = manager.getRepository(User);
    const puzzles = manager.getRepository(Puzzle);
    const completions = manager.getRepository(PuzzleCompletion);
    const rewards = manager.getRepository(Reward);
    const claims = manager.getRepository(RewardClaim);

    if (!(await users.findOne({ where: { id: SEED_USER_ID } }))) {
      await users.save(
        users.create({
          id: SEED_USER_ID,
          name: 'Demo Player',
          username: summary.demoUsername,
          email: 'demo@stellarshunts.local',
          password: await bcrypt.hash(demoPassword(), 12),
          isActive: true,
          bio: 'Seeded demo account for local development.',
        }),
      );
      summary.usersInserted += 1;
    }

    const puzzleSeeds = [
      {
        id: SEED_PUZZLE_IDS.easy,
        title: 'First Light',
        description:
          'Decode the Stellar account prefix that identifies a public key.',
        difficulty: 'easy',
        hint: 'Public keys start with the same letter as "generate".',
        solution: 'G',
      },
      {
        id: SEED_PUZZLE_IDS.medium,
        title: 'Sequence of Seven',
        description:
          'Continue the sequence: 2, 4, 8, 16, 32, 64, ?. Submit the next value.',
        difficulty: 'medium',
        hint: 'Each term is twice the previous one.',
        solution: '128',
      },
      {
        id: SEED_PUZZLE_IDS.hard,
        title: 'Hash Hunter',
        description:
          'Find the SHA-256 digest length in bits for a Soroban answer hash.',
        difficulty: 'hard',
        hint: 'The contract stores BytesN<32>.',
        solution: '256',
      },
    ];

    for (const puzzle of puzzleSeeds) {
      if (!(await puzzles.findOne({ where: { id: puzzle.id } }))) {
        await puzzles.save(puzzles.create({ ...puzzle, isActive: true }));
        summary.puzzlesInserted += 1;
      }
    }

    const rewardSeeds = [
      {
        id: SEED_REWARD_IDS.badge,
        name: 'First Light Badge',
        description: 'Awarded for completing the First Light puzzle.',
        type: RewardType.BADGE,
        metadata: { tier: 'bronze', image: '/badges/first-light.png' },
        challengeId: SEED_PUZZLE_IDS.easy,
        isActive: true,
        maxClaims: null,
        currentClaims: 0,
      },
      {
        id: SEED_REWARD_IDS.points,
        name: 'Sequence Solver Points',
        description: '100 points for solving Sequence of Seven.',
        type: RewardType.POINTS,
        metadata: { amount: 100 },
        challengeId: SEED_PUZZLE_IDS.medium,
        isActive: true,
        maxClaims: 1000,
        currentClaims: 0,
      },
    ];

    for (const reward of rewardSeeds) {
      if (!(await rewards.findOne({ where: { id: reward.id } }))) {
        await rewards.save(rewards.create(reward));
        summary.rewardsInserted += 1;
      }
    }

    const completionSeeds = [
      { userId: SEED_USER_ID, puzzleId: SEED_PUZZLE_IDS.easy },
      { userId: SEED_USER_ID, puzzleId: SEED_PUZZLE_IDS.medium },
    ];

    for (const completion of completionSeeds) {
      const existing = await completions.findOne({
        where: { userId: completion.userId, puzzleId: completion.puzzleId },
      });
      if (!existing) {
        await completions.save(completions.create(completion));
        summary.completionsInserted += 1;
      }
    }

    // A single claimed reward demonstrates the user -> claim -> reward join
    // without tripping the (userId, rewardId) uniqueness constraint.
    const existingClaim = await claims.findOne({
      where: { userId: SEED_USER_ID, rewardId: SEED_REWARD_IDS.badge },
    });
    if (!existingClaim) {
      await claims.save(
        claims.create({
          claimKey: `seed-${randomUUID()}`,
          userId: SEED_USER_ID,
          rewardId: SEED_REWARD_IDS.badge,
          challengeId: SEED_PUZZLE_IDS.easy,
          status: 'claimed',
        }),
      );
      summary.claimsInserted += 1;
    }
  });

  return summary;
}
