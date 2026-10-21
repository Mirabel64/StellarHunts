/**
 * Emits `docs/openapi.json` from the real NestJS application.
 *
 * The app is created but never initialized or listened on, so no database
 * connection is opened — only the route/controller graph is scanned, which is
 * all Swagger needs. Auth requirements that are enforced with `@UseGuards`
 * (invisible to the Swagger scanner) are layered on as `x-auth` extensions.
 *
 * Run via `npm --prefix backend run openapi:emit`. See issue #555.
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildOpenApiDocument } from '../src/swagger';
import { annotateAuthFromGuards, type ModuleLike } from '../src/openapi/annotate-auth';
import type { OpenApiDocumentLike } from '../src/openapi/render-markdown';

const OUTPUT_PATH = resolve(__dirname, '../../docs/openapi.json');

/**
 * Fills in the configuration the app validates at startup so the document can
 * be generated in CI without a populated `.env` or a reachable database.
 */
function applyGenerationDefaults(): void {
  process.env.NODE_ENV ??= 'test';
  process.env.JWT_SECRET ??= 'openapi-generation-secret';
  process.env.DATABASE_HOST ??= 'localhost';
  process.env.DATABASE_PORT ??= '5432';
  process.env.DATABASE_USER ??= 'openapi';
  process.env.DATABASE_PASSWORD ??= 'openapi';
  process.env.DATABASE_NAME ??= 'openapi';
  process.env.STELLAR_MODE ??= 'mock';
}

async function main(): Promise<void> {
  // The environment must be populated *before* `AppModule` is imported:
  // `ConfigModule.forRoot()` validates the environment when the module
  // decorator is evaluated, which happens during the import, not when the
  // application is created. A static import here reads the environment too
  // early and fails validation in CI, where none of these variables are set.
  applyGenerationDefaults();
  const { AppModule } = await import('../src/app.module');

  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    const configService = app.get(ConfigService);
    const document = buildOpenApiDocument(app, configService);

    const container = (app as unknown as { container?: { getModules(): Map<unknown, unknown> } })
      .container;
    const modules = container ? [...container.getModules().values()] : [];
    annotateAuthFromGuards(
      modules as Iterable<ModuleLike>,
      document as unknown as OpenApiDocumentLike,
    );

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    process.stdout.write(`Wrote ${OUTPUT_PATH}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(
    `Failed to generate the OpenAPI document: ${(error as Error)?.message ?? error}\n`,
  );
  process.exitCode = 1;
});
