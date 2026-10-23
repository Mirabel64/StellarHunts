import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AchievementService } from './achievements.service';
import { Achievement } from './entities/achievement.entity';
import { PlayerAchievement } from './entities/player-achievements.entity';

describe('AchievementService', () => {
  let service: AchievementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementService,
        {
          provide: getRepositoryToken(Achievement),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(PlayerAchievement),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<AchievementService>(AchievementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
