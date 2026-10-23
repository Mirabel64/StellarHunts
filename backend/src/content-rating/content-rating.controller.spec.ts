import { Test, TestingModule } from '@nestjs/testing';
import { ContentRatingController } from './content-rating.controller';
import { ContentRatingService } from './content-rating.service';

describe('ContentRatingController', () => {
  let controller: ContentRatingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentRatingController],
      providers: [{ provide: ContentRatingService, useValue: {} }],
    }).compile();

    controller = module.get<ContentRatingController>(ContentRatingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
