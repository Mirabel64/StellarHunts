import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';
import { seedCore } from '../src/database/seeds/core.seed';

async function main(): Promise<void> {
  const dataSource = await AppDataSource.initialize();
  try {
    const summary = await seedCore(dataSource);
    process.stdout.write(
      [
        'Core seed complete.',
        `  users inserted:       ${summary.usersInserted}`,
        `  puzzles inserted:     ${summary.puzzlesInserted}`,
        `  completions inserted: ${summary.completionsInserted}`,
        `  rewards inserted:     ${summary.rewardsInserted}`,
        `  claims inserted:      ${summary.claimsInserted}`,
        `  demo username:        ${summary.demoUsername}`,
        '',
      ].join('\n'),
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  process.stderr.write(
    `Seeding failed: ${(error as Error)?.message ?? String(error)}\n`,
  );
  process.exitCode = 1;
});
