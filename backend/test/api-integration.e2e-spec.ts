import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AdminAuthModule } from '../src/admin/admin-auth.module';
import { AdminRole } from '../src/admin/admin-role.enum';
import { DOCS_ROUTE_EXCLUSIONS, buildApiPrefix } from '../src/api-prefix';
import { buildSwaggerConfig } from '../src/swagger';
import {
  resetDatabase,
  seedDatabase,
  SeededFixtures,
} from './fixtures/test-database.fixture';

/**
 * Backend API integration suite — issue #756.
 *
 * 1. **Route coverage**: the full route graph is read from the application's
 *    own Swagger document, then every documented operation is called once.
 *    That guarantees the suite covers every public (and admin) endpoint that
 *    the application actually mounts, without a hand-maintained list that can
 *    drift.
 * 2. **Fixture-backed flows**: with the test database seeded, the core public
 *    flows are exercised end to end (puzzle discovery, submission grading,
 *    publication, rewards/claims, content, categories).
 *
 * Requires a reachable PostgreSQL with `DATABASE_SYNC=true` and the `DATABASE_*`
 * variables set (CI provides both; see .github/workflows/build.yml).
 */
describe('API integration suite (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let fixtures: SeededFixtures;
  let adminToken: string;
  let http: ReturnType<typeof request>;
  let operations: LiveOperation[] = [];

  const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';
  const WRITE_METHODS = ['post', 'put', 'patch', 'delete'];
  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

  /** Replaces `{id}`-style path parameters with a syntactically valid value. */
  const resolvePath = (path: string) =>
    path.replace(/\{[^}]+\}/g, PLACEHOLDER_ID);

  interface LiveOperation {
    method: string;
    path: string;
  }

  const liveOperations = (): LiveOperation[] => {
    const document = SwaggerModule.createDocument(
      app,
      buildSwaggerConfig(app.get(ConfigService)),
    );
    const operations: LiveOperation[] = [];
    for (const [path, handlers] of Object.entries(document.paths ?? {})) {
      for (const method of Object.keys(handlers)) {
        if (HTTP_METHODS.includes(method)) {
          operations.push({ method, path });
        }
      }
    }
    return operations;
  };

  const frameworkNotFound = (body: unknown): boolean => {
    const message = Array.isArray((body as any)?.message)
      ? (body as any).message.join(' ')
      : String((body as any)?.message ?? '');
    return /^Cannot (GET|POST|PUT|PATCH|DELETE)/.test(message);
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(buildApiPrefix('v1'), {
      exclude: DOCS_ROUTE_EXCLUSIONS,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    http = request(app.getHttpServer());
    operations = liveOperations();

    await resetDatabase(dataSource);
    fixtures = await seedDatabase(dataSource);

    adminToken = app
      .select(AdminAuthModule)
      .get(JwtService)
      .sign({ sub: fixtures.adminId, role: AdminRole.ADMIN });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('route coverage (every mounted endpoint responds and is mounted)', () => {
    it('discovers operations from the live application', () => {
      expect(operations.length).toBeGreaterThan(50);
      expect(operations).toEqual(
        expect.arrayContaining([
          { method: 'get', path: '/puzzles/active' },
          { method: 'post', path: '/puzzle-submission' },
          { method: 'get', path: '/health/live' },
        ]),
      );
    });

    it('serves every mounted endpoint', async () => {
      const unmounted: string[] = [];

      for (const { method, path } of operations) {
        const target = `/api/v1${resolvePath(path)}`;
        const pending = (http as any)[method](target);
        const response = WRITE_METHODS.includes(method)
          ? await pending.send({})
          : await pending;

        // A framework "Cannot <METHOD>" 404 is the one response that proves
        // the operation is not mounted. Anything else (a validation error, an
        // auth rejection, or a handler-level 404) means the route exists.
        if (response.status === 404 && frameworkNotFound(response.body)) {
          unmounted.push(`${method.toUpperCase()} ${path}`);
        }
      }

      expect(unmounted).toEqual([]);
    });
  });

  describe('fixture-backed public flows', () => {
    beforeEach(async () => {
      await resetDatabase(dataSource);
      fixtures = await seedDatabase(dataSource);
    });

    it('serves the liveness probe', async () => {
      await http.get('/api/v1/health/live').expect(200);
    });

    it('lists only active puzzles and hides solutions', async () => {
      const response = await http.get('/api/v1/puzzles/active').expect(200);

      const ids = response.body.map((puzzle: any) => puzzle.id);
      expect(ids).toContain(fixtures.activePuzzleId);
      expect(ids).not.toContain(fixtures.inactivePuzzleId);
      for (const puzzle of response.body) {
        expect(puzzle.solution).toBeUndefined();
        expect(puzzle.hint).toBeUndefined();
      }
    });

    it('creates a puzzle as an admin, grades submissions, and publishes it', async () => {
      const created = await http
        .post('/api/v1/admin/puzzles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Integration Published Puzzle',
          description: 'Created by the integration suite.',
          difficulty: 'easy',
          hint: 'Integration hint',
          solution: 'integration-answer',
          isActive: false,
        })
        .expect(201);

      const puzzleId = created.body.id;
      expect(created.body.isActive).toBe(false);

      const hidden = await http
        .get('/api/v1/puzzles/active?difficulty=easy')
        .expect(200);
      expect(hidden.body.some((p: any) => p.id === puzzleId)).toBe(false);

      const playerId = `integration-player-${Date.now()}`;
      const correct = await http
        .post('/api/v1/puzzle-submission')
        .send({ playerId, puzzleId, answer: 'INTEGRATION-ANSWER' })
        .expect(201);
      expect(correct.body).toMatchObject({ isCorrect: true, attempts: 1 });

      const wrong = await http
        .post('/api/v1/puzzle-submission')
        .send({ playerId, puzzleId, answer: 'nope' })
        .expect(201);
      expect(wrong.body).toMatchObject({ isCorrect: false, attempts: 2 });

      await http
        .patch(`/api/v1/admin/puzzles/${puzzleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true })
        .expect(200);

      const published = await http
        .get('/api/v1/puzzles/active?difficulty=easy')
        .expect(200);
      const found = published.body.find((p: any) => p.id === puzzleId);
      expect(found).toBeDefined();
      expect(found.solution).toBeUndefined();
      expect(found.hint).toBeUndefined();
    });

    it('rejects an anonymous admin write', async () => {
      await http
        .post('/api/v1/admin/puzzles')
        .send({ title: 'nope' })
        .expect(401);
    });

    it('creates a reward, lists it, and prevents duplicate claims', async () => {
      const reward = await http
        .post('/api/v1/reward')
        .send({
          name: 'Integration Reward',
          description: 'Created by the integration suite.',
          type: 'points',
          challengeId: 'integration-claim',
          metadata: { amount: 5 },
          isActive: true,
          maxClaims: 5,
        })
        .expect(201);

      const listed = await http.get('/api/v1/reward').expect(200);
      expect(listed.body.some((r: any) => r.id === reward.body.id)).toBe(true);

      await http
        .post('/api/v1/reward/claim')
        .send({ userId: fixtures.userId, challengeId: 'integration-claim' })
        .expect(201);

      await http
        .post('/api/v1/reward/claim')
        .send({ userId: fixtures.userId, challengeId: 'integration-claim' })
        .expect(409);
    });

    it('serves seeded content and categories', async () => {
      const content = await http.get('/api/v1/content').expect(200);
      expect(content.body.some((c: any) => c.id === fixtures.contentId)).toBe(
        true,
      );

      const categories = await http
        .get('/api/v1/puzzle-categories/categories')
        .expect(200);
      expect(
        categories.body.some((c: any) => c.id === fixtures.categoryId),
      ).toBe(true);
    });
  });
});
