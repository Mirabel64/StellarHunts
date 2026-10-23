import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRankingService } from './user-ranking.service';
import { UserRank } from './entities/user-ranking.entity';

describe('UserRankingService', () => {
  let service: UserRankingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRankingService,
        {
          provide: getRepositoryToken(UserRank),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<UserRankingService>(UserRankingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
