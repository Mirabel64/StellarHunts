import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { ChallengeCompletion } from '../game-mechanic/entities/challenge-completion.entity';
import { Inventory, AssetType } from '../user-inventory/entities/inventory';
import { PuzzleCompletion } from '../puzzle-dependency/entities/puzzle-completion.entity';
import { UserRank } from '../user-ranking/entities/user-ranking.entity';
import { CacheService } from '../cache/cache.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { LinkWalletDto } from './dto/link-wallet.dto';

export interface UserProfile {
  user: Pick<
    User,
    | 'id'
    | 'name'
    | 'username'
    | 'bio'
    | 'avatarUrl'
    | 'walletAddress'
    | 'createdAt'
  >;
  stats: {
    score: number;
    achievements: number;
    activityPoints: number;
    rank: number;
    completions: {
      puzzles: number;
      challenges: number;
      total: number;
    };
    badges: {
      count: number;
      items: { id: string; acquiredAt: Date }[];
    };
  };
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(UserRank)
    private readonly userRanksRepo: Repository<UserRank>,
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    @InjectRepository(PuzzleCompletion)
    private readonly puzzleCompletionsRepo: Repository<PuzzleCompletion>,
    @InjectRepository(ChallengeCompletion)
    private readonly challengeCompletionsRepo: Repository<ChallengeCompletion>,
    private readonly cache: CacheService,
  ) {}

  async createUser(dto: CreateUserDto): Promise<User> {
    if (await this.usersRepo.findOne({ where: { email: dto.email } })) {
      throw new ConflictException('Email already registered');
    }
    const user = this.usersRepo.create(dto);
    return this.usersRepo.save(user);
  }

  async updateProfile(id: string, dto: UpdateUserProfileDto): Promise<User> {
    const user = await this.getUserById(id);
    Object.assign(user, dto);
    return this.usersRepo.save(user);
  }

  async linkWallet(id: string, dto: LinkWalletDto): Promise<User> {
    const user = await this.getUserById(id);
    const existing = await this.usersRepo.findOne({
      where: { walletAddress: dto.walletAddress },
    });
    if (existing && existing.id !== id) {
      throw new ConflictException('Wallet already linked to another account');
    }
    user.walletAddress = dto.walletAddress;
    return this.usersRepo.save(user);
  }

  async unlinkWallet(id: string): Promise<User> {
    const user = await this.getUserById(id);
    user.walletAddress = null;
    return this.usersRepo.save(user);
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getProfile(id: string): Promise<UserProfile> {
    return this.cache.getOrSet(`users:profile:${id}`, 60, async () => {
      const user = await this.usersRepo.findOne({
        where: { id },
        select: {
          id: true,
          name: true,
          username: true,
          bio: true,
          avatarUrl: true,
          walletAddress: true,
          createdAt: true,
        },
      });
      if (!user) throw new NotFoundException('User not found');

      const [rank, puzzlesCompleted, challengesCompleted, badges] =
        await Promise.all([
          this.userRanksRepo.findOne({ where: { userId: id } }),
          this.puzzleCompletionsRepo.count({ where: { userId: id } }),
          this.challengeCompletionsRepo.count({ where: { userId: id } }),
          this.inventoryRepo.find({
            where: { userId: id, assetType: AssetType.BADGE },
            select: { assetId: true, acquiredAt: true },
            order: { acquiredAt: 'DESC' },
          }),
        ]);

      return {
        user,
        stats: {
          score: rank?.score ?? 0,
          achievements: rank?.achievements ?? 0,
          activityPoints: rank?.activityPoints ?? 0,
          rank: rank?.rank ?? 0,
          completions: {
            puzzles: puzzlesCompleted,
            challenges: challengesCompleted,
            total: puzzlesCompleted + challengesCompleted,
          },
          badges: {
            count: badges.length,
            items: badges.map(({ assetId, acquiredAt }) => ({
              id: assetId,
              acquiredAt,
            })),
          },
        },
      };
    });
  }

  async getUserByWallet(walletAddress: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { walletAddress } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
