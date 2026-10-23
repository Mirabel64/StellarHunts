import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from '../auth/entities/user.entity';
import { ChallengeCompletion } from '../game-mechanic/entities/challenge-completion.entity';
import { Inventory } from '../user-inventory/entities/inventory';
import { PuzzleCompletion } from '../puzzle-dependency/entities/puzzle-completion.entity';
import { UserRank } from '../user-ranking/entities/user-ranking.entity';
import { CacheService } from '../cache/cache.service';
import { LinkWalletDto } from './dto/link-wallet.dto';

describe('UserService', () => {
  let service: UserService;
  let usersRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  const userRanksRepo = { findOne: jest.fn() };
  const inventoryRepo = { find: jest.fn() };
  const puzzleCompletionsRepo = { count: jest.fn() };
  const challengeCompletionsRepo = { count: jest.fn() };
  const cache = {
    getOrSet: jest.fn((_key, _ttl, loader) => loader()),
  };

  const WALLET = '0xabc1234567890abc1234567890abc1234567890';

  beforeEach(async () => {
    usersRepo = {
      create: jest.fn((data) => ({ id: 'user-1', ...data })),
      save: jest.fn(async (data) => data),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: usersRepo,
        },
        { provide: getRepositoryToken(UserRank), useValue: userRanksRepo },
        { provide: getRepositoryToken(Inventory), useValue: inventoryRepo },
        {
          provide: getRepositoryToken(PuzzleCompletion),
          useValue: puzzleCompletionsRepo,
        },
        {
          provide: getRepositoryToken(ChallengeCompletion),
          useValue: challengeCompletionsRepo,
        },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProfile', () => {
    it('returns the safe user profile with cached score, badge, and completion aggregates', async () => {
      const user = {
        id: 'user-1',
        name: 'Player',
        username: 'player',
        bio: 'Puzzle solver',
        avatarUrl: 'https://example.com/avatar.png',
        walletAddress: 'GABC',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      };
      usersRepo.findOne.mockResolvedValue(user);
      userRanksRepo.findOne.mockResolvedValue({
        score: 1250,
        achievements: 10,
        activityPoints: 250,
        rank: 3,
      });
      puzzleCompletionsRepo.count.mockResolvedValue(4);
      challengeCompletionsRepo.count.mockResolvedValue(2);
      inventoryRepo.find.mockResolvedValue([
        {
          assetId: 'badge-1',
          acquiredAt: new Date('2025-02-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.getProfile('user-1');

      expect(cache.getOrSet).toHaveBeenCalledWith(
        'users:profile:user-1',
        60,
        expect.any(Function),
      );
      expect(result).toEqual({
        user,
        stats: {
          score: 1250,
          achievements: 10,
          activityPoints: 250,
          rank: 3,
          completions: { puzzles: 4, challenges: 2, total: 6 },
          badges: {
            count: 1,
            items: [
              {
                id: 'badge-1',
                acquiredAt: new Date('2025-02-01T00:00:00.000Z'),
              },
            ],
          },
        },
      });
      expect(usersRepo.findOne.mock.calls[0][0].select.password).toBeUndefined();
    });

    it('returns zero stats for a user without ranking or earned assets', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'user-1' });
      userRanksRepo.findOne.mockResolvedValue(null);
      puzzleCompletionsRepo.count.mockResolvedValue(0);
      challengeCompletionsRepo.count.mockResolvedValue(0);
      inventoryRepo.find.mockResolvedValue([]);

      const result = await service.getProfile('user-1');

      expect(result.stats).toEqual({
        score: 0,
        achievements: 0,
        activityPoints: 0,
        rank: 0,
        completions: { puzzles: 0, challenges: 0, total: 0 },
        badges: { count: 0, items: [] },
      });
    });

    it('does not cache or return a profile for a missing user', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.getProfile('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(userRanksRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('linkWallet', () => {
    it('links the wallet when it is not linked to any other account', async () => {
      const user = { id: 'user-1', walletAddress: null } as User;
      usersRepo.findOne.mockResolvedValueOnce(user); // getUserById
      usersRepo.findOne.mockResolvedValueOnce(undefined); // no existing wallet

      const result = await service.linkWallet('user-1', {
        walletAddress: WALLET,
      } as LinkWalletDto);

      expect(result.walletAddress).toBe(WALLET);
      expect(usersRepo.save).toHaveBeenCalled();
    });

    it('throws ConflictException when the wallet is linked to another account', async () => {
      const user = { id: 'user-1', walletAddress: null } as User;
      const other = { id: 'user-2', walletAddress: WALLET } as User;
      usersRepo.findOne.mockResolvedValueOnce(user); // getUserById
      usersRepo.findOne.mockResolvedValueOnce(other); // wallet on other account

      await expect(
        service.linkWallet('user-1', { walletAddress: WALLET } as LinkWalletDto),
      ).rejects.toThrow(ConflictException);
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('allows re-linking the same wallet to the same account', async () => {
      const user = { id: 'user-1', walletAddress: WALLET } as User;
      usersRepo.findOne.mockResolvedValueOnce(user); // getUserById
      usersRepo.findOne.mockResolvedValueOnce(user); // existing wallet is the same account

      const result = await service.linkWallet('user-1', {
        walletAddress: WALLET,
      } as LinkWalletDto);

      expect(result.walletAddress).toBe(WALLET);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      usersRepo.findOne.mockResolvedValueOnce(undefined);

      await expect(
        service.linkWallet('missing', {
          walletAddress: WALLET,
        } as LinkWalletDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('unlinkWallet', () => {
    it('clears the wallet address', async () => {
      const user = { id: 'user-1', walletAddress: WALLET } as User;
      usersRepo.findOne.mockResolvedValueOnce(user); // getUserById

      const result = await service.unlinkWallet('user-1');

      expect(result.walletAddress).toBeNull();
      expect(usersRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      usersRepo.findOne.mockResolvedValueOnce(undefined);

      await expect(service.unlinkWallet('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
