import { Test, TestingModule } from '@nestjs/testing';
import { ContentRatingController } from './content-rating.controller';
import { ContentRatingService } from './content-rating.service';

// Unit tests for ContentRatingController.
// The service is mocked, so these tests only verify that the controller
// passes the right arguments to the service and returns its result
describe('ContentRatingController', () => {
  let controller: ContentRatingController;
  // Hand-rolled mock of ContentRatingService (typed as any for convenience)
  let serviceMock: any;

  // Runs before every test so each one starts with a fresh controller and fresh mocks
  beforeEach(async () => {
    serviceMock = {
      // Pretend the service saved a rating and returned the stored record
      rateContent: jest.fn().mockResolvedValue({ id: 'r1', rating: 5 }),
      // Pretend the service computed aggregate stats for a piece of content
      getContentRatingStats: jest
        .fn()
        .mockResolvedValue({
          contentId: 'c1',
          averageRating: 4.5,
          totalRatings: 10,
        }),
    };

    // Build an isolated Nest testing module containing only the controller,
    // with the real service swapped out for the mock via useValue
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentRatingController],
      providers: [{ provide: ContentRatingService, useValue: serviceMock }],
    }).compile();

    // Retrieve the controller instance that Nest created with the mock injected
    controller = module.get<ContentRatingController>(ContentRatingController);
  });

  // Sanity check: the module wired up correctly and the controller was instantiated
  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('rates content', async () => {
    // `as any` skips building a fully typed DTO, since only these fields matter here
    const res = await controller.rateContent({
      userId: 'u1',
      contentId: 'c1',
      rating: 5,
    } as any);
    // The controller should return whatever the service returned
    expect(res.rating).toBe(5);
    // ...and should have unpacked the DTO into positional args (userId, contentId, rating)
    expect(serviceMock.rateContent).toHaveBeenCalledWith('u1', 'c1', 5);
  });

  it('gets stats', async () => {
    const res = await controller.getStats('c1');
    // The stats from the service should be passed straight through
    expect(res.averageRating).toBe(4.5);
    // The content id from the route param should be forwarded to the service
    expect(serviceMock.getContentRatingStats).toHaveBeenCalledWith('c1');
  });
});
