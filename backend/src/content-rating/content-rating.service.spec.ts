import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentRatingService } from './content-rating.service';
import { ContentRating } from './entities/content-rating.entity';

describe('ContentRatingService', () => {
  let service: ContentRatingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentRatingService,
        {
          provide: getRepositoryToken(ContentRating),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<ContentRatingService>(ContentRatingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
