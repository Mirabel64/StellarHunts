import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { ContentRatingService } from './content-rating.service';
import { ContentRating } from './entities/content-rating.entity';

// Unit tests for ContentRatingService.
// The TypeORM repository is mocked, so no real database is involved
describe('ContentRatingService', () => {
  let service: ContentRatingService;
  // Hand-rolled mock of the Repository<ContentRating> (typed as any for convenience)
  let repoMock: any;

  // Runs before every test so each one starts with a fresh service and fresh mocks
  beforeEach(async () => {
    repoMock = {
      // create() just echoes its input back, like building an entity from a plain object
      create: jest.fn().mockImplementation((dto) => dto),
      // save() resolves with the entity plus a generated id, simulating a DB insert
      save: jest
        .fn()
        .mockImplementation((r) => Promise.resolve({ id: 'r-1', ...r })),
      // Mock of the query builder chain used for the stats aggregation.
      // mockReturnThis() lets calls chain (select().addSelect().where()...)
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        // Postgres returns aggregate values as strings, so the service
        // is expected to convert them to numbers
        getRawOne: jest.fn().mockResolvedValue({ avg: '4.5', count: '10' }),
      }),
    };

    // Build an isolated Nest testing module, replacing the real repository
    // with the mock via its injection token
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentRatingService,
        { provide: getRepositoryToken(ContentRating), useValue: repoMock },
      ],
    }).compile();

    // Retrieve the service instance that Nest created with the mock injected
    service = module.get<ContentRatingService>(ContentRatingService);
  });

  // Sanity check: the module wired up correctly and the service was instantiated
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rates content successfully', async () => {
    const res = await service.rateContent('u1', 'c1', 5);
    // The saved record (with the mocked id) should be returned with the rating intact
    expect(res.rating).toBe(5);
    // Confirms the rating was actually persisted
    expect(repoMock.save).toHaveBeenCalled();
  });

  it('throws ConflictException on duplicate rating', async () => {
    // 23505 is Postgres's unique_violation error code, which the unique
    // (user, content) constraint raises when a user rates the same content twice
    repoMock.save.mockRejectedValue({ code: '23505' });
    // The service should translate the DB error into a 409 Conflict
    await expect(service.rateContent('u1', 'c1', 5)).rejects.toThrow(
      ConflictException,
    );
  });

  it('gets content rating stats', async () => {
    const stats = await service.getContentRatingStats('c1');
    // The mocked raw strings '4.5' and '10' should come back as real numbers
    expect(stats.averageRating).toBe(4.5);
    expect(stats.totalRatings).toBe(10);
  });
});
