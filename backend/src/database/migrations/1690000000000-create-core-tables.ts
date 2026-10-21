import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema for the core StellarHunts domain: users, puzzles,
 * puzzle completions, rewards, and reward claims (issue #749).
 *
 * The timestamp is deliberately earlier than the existing feature
 * migrations (`1700000000000` onwards) because this is the schema those
 * migrations build on. It also installs the extensions the later
 * migrations rely on (`uuid-ossp` for `uuid_generate_v4()`).
 *
 * Column names match the TypeORM entity definitions exactly. The project
 * does not configure a naming strategy, so property names such as
 * `isActive` and `walletAddress` are the physical column names.
 */
export class CreateCoreTables1690000000000 implements MigrationInterface {
  name = 'CreateCoreTables1690000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `uuid_generate_v4()` is used by the content migration and
    // `gen_random_uuid()` by the achievement migration.
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // ── users ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(100) NOT NULL,
        "username" varchar(20) NOT NULL,
        "email" varchar(255) NOT NULL,
        "password" varchar NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "lastLoginAt" timestamp NULL,
        "walletAddress" varchar(255) NULL,
        "bio" text NULL,
        "avatarUrl" varchar(255) NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_USERS_USERNAME" UNIQUE ("username"),
        CONSTRAINT "UQ_USERS_EMAIL" UNIQUE ("email"),
        CONSTRAINT "UQ_USERS_LAST_LOGIN_AT" UNIQUE ("lastLoginAt")
      )
    `);

    // ── puzzles ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "puzzles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "difficulty" varchar(50) NOT NULL,
        "hint" varchar(255) NULL,
        "solution" text NOT NULL,
        "rewardId" varchar(255) NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_PUZZLES_ACTIVE_DIFFICULTY" ON "puzzles" ("isActive", "difficulty")',
    );

    // ── puzzle_completions ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "puzzle_completions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar(128) NOT NULL,
        "puzzle_id" varchar(255) NOT NULL,
        "completed_at" timestamp NOT NULL DEFAULT now(),
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_PUZZLE_COMPLETIONS_USER_PUZZLE" ON "puzzle_completions" ("user_id", "puzzle_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_PUZZLE_COMPLETIONS_USER_ID" ON "puzzle_completions" ("user_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_PUZZLE_COMPLETIONS_PUZZLE_ID" ON "puzzle_completions" ("puzzle_id")',
    );

    // ── reward ─────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "reward_type_enum" AS ENUM ('nft', 'token', 'badge', 'points')`,
    );
    await queryRunner.query(`
      CREATE TABLE "reward" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "type" "reward_type_enum" NOT NULL,
        "metadata" jsonb NULL,
        "challengeId" varchar(255) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "maxClaims" integer NULL,
        "currentClaims" integer NOT NULL DEFAULT 0,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_REWARD_CHALLENGE_ACTIVE" ON "reward" ("challengeId", "isActive")',
    );

    // ── reward_claims ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "reward_claims" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "claimKey" varchar(255) NULL,
        "userId" varchar(128) NOT NULL,
        "rewardId" uuid NOT NULL,
        "challengeId" varchar(255) NOT NULL,
        "claimDate" timestamp NOT NULL DEFAULT now(),
        "transactionHash" varchar(255) NULL,
        "status" varchar(50) NOT NULL DEFAULT 'claimed',
        CONSTRAINT "UQ_REWARD_CLAIMS_CLAIM_KEY" UNIQUE ("claimKey"),
        CONSTRAINT "FK_REWARD_CLAIMS_REWARD" FOREIGN KEY ("rewardId")
          REFERENCES "reward" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_REWARD_CLAIMS_USER_REWARD" ON "reward_claims" ("userId", "rewardId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_REWARD_CLAIMS_USER_ID" ON "reward_claims" ("userId")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "reward_claims"');
    await queryRunner.query('DROP TABLE IF EXISTS "reward"');
    await queryRunner.query('DROP TYPE IF EXISTS "reward_type_enum"');
    await queryRunner.query('DROP TABLE IF EXISTS "puzzle_completions"');
    await queryRunner.query('DROP TABLE IF EXISTS "puzzles"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
