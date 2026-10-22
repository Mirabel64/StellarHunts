import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import appConfig from 'config/app.config';
import databaseConfig from 'config/database.config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

// Core feature modules (each registers its own entities via TypeOrmModule.forFeature)
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { UserModule } from './user/user.module';
import { UserInventoryModule } from './user-inventory/user-inventory.module';
import { BadgeModule } from './badge/badge.module';
import { WalletModule } from './wallet/wallet.module';
import { PuzzleModule } from './puzzle/puzzle.module';
import { PuzzleSubmissionModule } from './puzzle-submission/puzzle-submission.module';
import { ContentModule } from './content/content.module';
import { UserReportCardModule } from './user-report-card/user-report-card.module';
import { PuzzleDependencyModule } from './puzzle-dependency/puzzle-dependency.module';
import { TimeTrialModule } from './time-trial/time-trial.module';
import { ActivityModule } from './activity/activity.module';
import { InAppNotificationsModule } from './in-app-notifications/in-app-notifications.module';
import { ReportsModule } from './reports/reports.module';
import { PuzzleTranslationModule } from './puzzle-translation/puzzle-translation.module';
import { PuzzleCategoryModule } from './puzzle-category/puzzle-category.module';
import { RewardsModule } from './rewards/rewards.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RewardShopModule } from './reward-shop/reward-shop.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { UserRankingModule } from './user-ranking/user-ranking.module';
import { ProgressModule } from './progress/progress.module';
import { ContentRatingModule } from './content-rating/content-rating.module';
import { UserActivityLogModule } from './user-activity-log/user-activity-log.module';

import { ChallengeModule } from './gameMechanics/challenge.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [appConfig, databaseConfig],
      cache: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.user'),
        password: configService.get('database.password'),
        database: configService.get('database.name'),
        entities: [
          // Canonical entity classes for each unique table.
          // Duplicate table-name collisions (users / badges / puzzles) are resolved
          // by picking one canonical entity per table and renaming the other copies
          // to dedicated tables (see the entity files for `user_inventory_users`,
          // `user_inventory_badges`, and `gm_users`).
          require('./auth/entities/user.entity').User,
          require('./time-trial/time-trial.entity').TimeTrial,
          require('./puzzle/puzzle.entity').Puzzle,
          require('./puzzle-category/entities/category.entity').Category,
        ],
        synchronize: configService.get('database.synchronize'),
        autoLoadEntities: true,
      }),
    }),
    AuthModule,
    AdminModule,
    UserModule,
    UserInventoryModule,
    BadgeModule,
    WalletModule,
    PuzzleModule,
    PuzzleSubmissionModule,
    ContentModule,
    UserReportCardModule,
    PuzzleDependencyModule,
    TimeTrialModule,
    ActivityModule,
    InAppNotificationsModule,
    ReportsModule,
    PuzzleTranslationModule,
    PuzzleCategoryModule,
    RewardsModule,
    AnalyticsModule,
    RewardShopModule,
    ApiKeyModule,
    UserRankingModule,
    ProgressModule,
    ContentRatingModule,
    UserActivityLogModule,
    ChallengeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
