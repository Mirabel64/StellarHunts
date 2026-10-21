import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Achievement } from './entities/achievement.entity';
import { PlayerAchievement } from './entities/player-achievement.entity';
import { AchievementController } from './achievement.controller';
import { AchievementService } from './achievement.service';
import { InAppNotificationsModule } from '../in-app-notifications/in-app-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Achievement, PlayerAchievement]),
    InAppNotificationsModule,
  ],
  providers: [AchievementService],
  controllers: [AchievementController],
  exports: [AchievementService], // Export service for potential use by other modules
})
export class AchievementModule {}
