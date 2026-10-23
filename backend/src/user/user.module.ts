import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { ChallengeCompletion } from '../game-mechanic/entities/challenge-completion.entity';
import { Inventory } from '../user-inventory/entities/inventory';
import { PuzzleCompletion } from '../puzzle-dependency/entities/puzzle-completion.entity';
import { UserRank } from '../user-ranking/entities/user-ranking.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserRank,
      Inventory,
      PuzzleCompletion,
      ChallengeCompletion,
    ]),
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
