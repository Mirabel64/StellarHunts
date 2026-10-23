/**
 * Central TypeORM entity registry.
 *
 * `TypeOrmModule.forRootAsync` previously registered only a handful of
 * entities, so most feature repositories could not resolve metadata
 * (see issue #791). This file enumerates every entity in the codebase so all
 * repositories work regardless of which feature modules are loaded.
 *
 * Conventions (see app.module.ts):
 * - Exactly one canonical entity class per unique table. Historical duplicate
 *   classes that target the same table (`src/migration/entities/puzzle.entity`,
 *   `src/progress/entities/progress.entity`, the second `users` entity in
 *   `src/user/entities/user.entity`) are intentionally NOT listed here; they
 *   are dead copies kept for module-local imports.
 * - Entities that share a class name across feature areas (User, Badge,
 *   PuzzleSubmission) are imported with an alias.
 */
import { Achievement } from '../achievements/entities/achievement.entity';
import { PlayerAchievement } from '../achievements/entities/player-achievements.entity';
import { Activity } from '../activity/entities/activity.entity';
import { Admin } from '../admin/admin.entity';
import { Analytics } from '../analytics/entities/analytics.entity';
import { AuditLog } from '../audit-log/entities/audit-log.entity';
import { User } from '../auth/entities/user.entity';
import { Badge } from '../badge/entities/badge.entity';
import { UserBadge } from '../badge/entities/user-badge.entity';
import { ContentRating } from '../content-rating/entities/content-rating.entity';
import { Content } from '../content/content.entity';
import { DailyRewardLog } from '../daily-reward/entities/daily-reward-log.entity';
import { Feedback } from '../feedback/entities/feedback.entity';
import { ChallengeCompletion } from '../gameMechanics/entities/challenge-completion.entity';
import { Challenge } from '../gameMechanics/entities/challenge.entity';
import { HintUsage } from '../gameMechanics/entities/hint-usage.entity';
import { PuzzleSubmission as GameMechanicsPuzzleSubmission } from '../gameMechanics/entities/puzzle-submission.entity';
import { User as GameMechanicsUser } from '../gameMechanics/entities/user.entity';
import { GeoStats } from '../geostats/entities/geostat.entity';
import { Hint } from '../hint/hint.entity';
import { InAppNotification } from '../in-app-notifications/entities/in-app-notification.entity';
import { MaintenanceConfig } from '../maintenance-mode/entities/maintenance-config.entity';
import { MilestoneTemplate } from '../milestone/entities/milestone-template.entity';
import { UserMilestone } from '../milestone/entities/user-milestone.entity';
import { UserProgress } from '../milestone/entities/user-progress.entity';
import { Match } from '../multiplayer-queue/entities/match.entity';
import { Queue } from '../multiplayer-queue/entities/queue.entity';
import { Progress } from '../progress/progress.entity';
import { PromoCode } from '../promo-code/entities/promo-code.entities';
import { PromoCodeRedemption } from '../promo-code/entities/promo-code-redemption.entity';
import { PuzzleAccessLog } from '../puzzle-access-log/entities/puzzle-access-log.entity';
import { Category } from '../puzzle-category/entities/category.entity';
import { CategoryPuzzle } from '../puzzle-category/entities/puzzle.entity';
import { PuzzleCompletion } from '../puzzle-dependency/entities/puzzle-completion.entity';
import { PuzzleDependency } from '../puzzle-dependency/entities/puzzle-dependency.entity';
import { DraftPuzzle } from '../puzzle-draft/entities/draft-puzzle.entity';
import { ForkedPuzzle } from '../puzzle-fork/entities/forked-puzzle.entity';
import { PuzzleReview } from '../puzzle-review/puzzle-review/entities/puzzle-review.entity';
import { ReviewModeration } from '../puzzle-review/puzzle-review/entities/review-moderation.entity';
import { PuzzleSubmission } from '../puzzle-submission/puzzle-submission.entity';
import { PuzzleTestCase } from '../puzzle-test-case/entities/puzzle-test-case.entity';
import { ValidationResult } from '../puzzle-test-case/entities/validation-result.entity';
import { PuzzleTranslation } from '../puzzle-translation/entities/puzzle-translation.entity';
import { PuzzleVersion } from '../puzzle-versioning/entities/puzzle-version.entity';
import { Puzzle } from '../puzzle/puzzle.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { QuizOption } from '../quiz/entities/quiz-option.entity';
import { QuizQuestion } from '../quiz/entities/quiz-question.entity';
import { ReferralBonus } from '../referral/entities/referral-bonus.entity';
import { ReferralCode } from '../referral/entities/referral-code.entity';
import { ReferralInvite } from '../referral/entities/referral-invite.entity';
import { Report } from '../reports/entities/report.entity';
import { Reward } from '../rewards/entities/reward.entity';
import { RewardClaim } from '../rewards/entities/reward-claim.entity';
import { Session } from '../session/session.entity';
import { Streak } from '../streak/entities/streak.entity';
import { StreakActivity } from '../streak/entities/streak-activity.entity';
import { TimeTrial } from '../time-trial/time-trial.entity';
import { ActivityLog } from '../user-activity-log/entities/activity-log.entity';
import { Badge as UserInventoryBadge } from '../user-inventory/entities/badge';
import { Inventory } from '../user-inventory/entities/inventory';
import { NFT } from '../user-inventory/entities/nft';
import { User as UserInventoryUser } from '../user-inventory/entities/user';
import { UserRank } from '../user-ranking/entities/user-ranking.entity';
import { Reaction } from '../user-reaction/entities/reaction.entity';
import { ReportCard } from '../user-report-card/entities/user-report-card.entity';
import { UserSettings } from '../user-settings/entities/user-settings.entity';
import { TokenHistory } from '../user-token-history/entities/token-history.entity';
import { Wallet } from '../wallet/entities/wallet.entity';

/**
 * Every entity class registered on the root `TypeOrmModule`.
 *
 * `autoLoadEntities` additionally appends anything registered through
 * `TypeOrmModule.forFeature(...)` by imported feature modules, so a feature
 * module's repository always resolves — whether or not the module's entity was
 * already part of this list.
 */
export const entities = [
  // Achievements
  Achievement,
  PlayerAchievement,
  // Activity & audit
  Activity,
  ActivityLog,
  AuditLog,
  // Admin
  Admin,
  // Analytics & geo stats
  Analytics,
  GeoStats,
  // Users (canonical `users` table; see module-local duplicates above)
  User,
  GameMechanicsUser, // gm_users
  UserInventoryUser, // user_inventory_users
  // Wallet & sessions
  Wallet,
  Session,
  UserSettings,
  // Multiplayer
  Queue,
  Match,
  // Puzzles & categories
  Puzzle,
  Category,
  CategoryPuzzle,
  PuzzleDependency,
  PuzzleCompletion,
  PuzzleAccessLog,
  DraftPuzzle,
  ForkedPuzzle,
  PuzzleVersion,
  PuzzleTranslation,
  PuzzleReview,
  ReviewModeration,
  PuzzleTestCase,
  ValidationResult,
  // Submissions
  PuzzleSubmission,
  GameMechanicsPuzzleSubmission, // puzzle_submissions (game mechanics)
  // Content
  Content,
  ContentRating,
  // Gamification
  Challenge,
  ChallengeCompletion,
  HintUsage,
  Hint,
  MilestoneTemplate,
  UserMilestone,
  UserProgress,
  Progress,
  Streak,
  StreakActivity,
  DailyRewardLog,
  TimeTrial,
  // Badges, NFTs & inventory
  Badge,
  UserBadge,
  UserInventoryBadge, // user_inventory_badges
  NFT,
  Inventory,
  // Rewards
  Reward,
  RewardClaim,
  PromoCode,
  PromoCodeRedemption,
  TokenHistory,
  ReportCard,
  // Quizzes
  Quiz,
  QuizOption,
  QuizQuestion,
  // Referrals
  ReferralCode,
  ReferralInvite,
  ReferralBonus,
  // Social & notifications
  InAppNotification,
  Reaction,
  Feedback,
  Report,
  // Ranking
  UserRank,
  // Infrastructure
  MaintenanceConfig,
] as const;
