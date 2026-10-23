import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PuzzleDependencyService } from './puzzle-dependency.service';
import { PuzzleDependency } from './entities/puzzle-dependency.entity';
import { PuzzleCompletion } from './entities/puzzle-completion.entity';

describe('PuzzleDependencyService', () => {
  let service: PuzzleDependencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzleDependencyService,
        {
          provide: getRepositoryToken(PuzzleDependency),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(PuzzleCompletion),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<PuzzleDependencyService>(PuzzleDependencyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
