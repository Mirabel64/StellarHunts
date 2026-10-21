import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import { type Feedback, TargetType } from '../entities/feedback.entity';
import type {
  CreateFeedbackDto,
  FeedbackResponse,
  FeedbackStats,
  FeedbackFilters,
  UpdateFeedbackDto,
} from '../interfaces/feedback.interface';

// Service containing the business logic for user feedback:
// submitting, listing, aggregating stats, and admin moderation
@Injectable()
export class FeedbackService {
  // Logger scoped to this class name, so log lines are easy to filter
  private readonly logger = new Logger(FeedbackService.name);

  // The repository is assigned manually in the constructor body rather than
  // via a parameter property. Note there is no @InjectRepository(Feedback)
  // decorator, so Nest can't resolve this dependency on its own
  constructor(feedbackRepository: Repository<Feedback>) {
    this.feedbackRepository = feedbackRepository;
  }

  // TypeORM repository for the Feedback entity
  private feedbackRepository: Repository<Feedback>;

  /**
   * Create new feedback entry
   */
  async createFeedback(
    feedbackData: CreateFeedbackDto,
    // Authenticated user's id, if any
    userId?: string,
    // Client IP, stored in metadata for non-anonymous submissions only
    ipAddress?: string,
  ): Promise<FeedbackResponse> {
    this.logger.log(
      `Creating feedback: ${feedbackData.targetType} - Rating: ${feedbackData.rating}`,
    );

    // Validate rating
    // Enforce the 1-5 scale (interfaces have no runtime validation, so it's checked here)
    if (feedbackData.rating < 1 || feedbackData.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Validate target type
    // Reject values that aren't members of the TargetType enum
    if (!Object.values(TargetType).includes(feedbackData.targetType)) {
      throw new BadRequestException('Invalid target type');
    }

    // Create feedback entity
    // Builds the entity instance (not yet persisted)
    const feedback = this.feedbackRepository.create({
      rating: feedbackData.rating,
      // Trim whitespace; store null instead of an empty string
      comment: feedbackData.comment?.trim() || null,
      targetType: feedbackData.targetType,
      targetId: feedbackData.targetId || null,
      // Anonymous feedback is deliberately not linked to a user
      userId: feedbackData.isAnonymous ? null : userId,
      isAnonymous: feedbackData.isAnonymous || false,
      metadata: {
        // Client-supplied context (user agent, device, app version, etc.)
        ...feedbackData.metadata,
        // Drop the IP for anonymous feedback to preserve anonymity
        ipAddress: feedbackData.isAnonymous ? null : ipAddress,
        // Server-side timestamp of submission
        submittedAt: new Date().toISOString(),
      },
    });

    // Persist and get back the saved record with generated id/timestamps
    const savedFeedback = await this.feedbackRepository.save(feedback);

    this.logger.log(`Feedback created successfully: ${savedFeedback.id}`);

    return this.mapToResponse(savedFeedback);
  }

  /**
   * Get all feedback (admin only)
   */
  // Returns a filtered, paginated list (newest first) with pagination metadata
  async getAllFeedback(
    filters?: FeedbackFilters,
    page = 1,
    limit = 50,
  ): Promise<{
    feedback: FeedbackResponse[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    this.logger.log(
      `Fetching feedback with filters: ${JSON.stringify(filters)}`,
    );

    const queryBuilder = this.feedbackRepository.createQueryBuilder('feedback');

    // Apply filters
    // Each filter is optional; only the ones provided narrow the query.
    // Named parameters keep the values safely bound (no SQL injection)
    if (filters?.targetType) {
      queryBuilder.andWhere('feedback.targetType = :targetType', {
        targetType: filters.targetType,
      });
    }

    // Note: a truthy check, which is fine since valid ratings start at 1
    if (filters?.rating) {
      queryBuilder.andWhere('feedback.rating = :rating', {
        rating: filters.rating,
      });
    }

    // Boolean filters compare against undefined so that `false` still applies
    if (filters?.isAnonymous !== undefined) {
      queryBuilder.andWhere('feedback.isAnonymous = :isAnonymous', {
        isAnonymous: filters.isAnonymous,
      });
    }

    if (filters?.isResolved !== undefined) {
      queryBuilder.andWhere('feedback.isResolved = :isResolved', {
        isResolved: filters.isResolved,
      });
    }

    if (filters?.userId) {
      queryBuilder.andWhere('feedback.userId = :userId', {
        userId: filters.userId,
      });
    }

    if (filters?.targetId) {
      queryBuilder.andWhere('feedback.targetId = :targetId', {
        targetId: filters.targetId,
      });
    }

    // Date range bounds (inclusive) on creation time
    if (filters?.startDate) {
      queryBuilder.andWhere('feedback.createdAt >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters?.endDate) {
      queryBuilder.andWhere('feedback.createdAt <= :endDate', {
        endDate: filters.endDate,
      });
    }

    // Get total count
    // Counted with the filters applied but before pagination
    const total = await queryBuilder.getCount();

    // Apply pagination and ordering
    // Newest first; skip/take implement page-based pagination
    const feedback = await queryBuilder
      .orderBy('feedback.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Round up so a partially filled last page is still counted
    const totalPages = Math.ceil(total / limit);

    return {
      feedback: feedback.map((f) => this.mapToResponse(f)),
      total,
      page,
      totalPages,
    };
  }

  /**
   * Get feedback statistics
   */
  // Aggregates overall stats for a dashboard
  async getFeedbackStats(): Promise<FeedbackStats> {
    this.logger.log('Calculating feedback statistics');

    // Run all the independent queries in parallel for speed
    const [
      totalFeedback,
      averageRatingResult,
      ratingDistribution,
      feedbackByType,
      anonymousFeedback,
      resolvedFeedback,
      recentFeedback,
    ] = await Promise.all([
      // Total feedback count
      this.feedbackRepository.count(),

      // Average rating
      // Raw query, since AVG() isn't an entity column
      this.feedbackRepository
        .createQueryBuilder('feedback')
        .select('AVG(feedback.rating)', 'average')
        .getRawOne(),

      // Rating distribution
      // One row per rating value with its count
      this.feedbackRepository
        .createQueryBuilder('feedback')
        .select('feedback.rating', 'rating')
        .addSelect('COUNT(*)', 'count')
        .groupBy('feedback.rating')
        .getRawMany(),

      // Feedback by type
      // One row per target type with its count
      this.feedbackRepository
        .createQueryBuilder('feedback')
        .select('feedback.targetType', 'targetType')
        .addSelect('COUNT(*)', 'count')
        .groupBy('feedback.targetType')
        .getRawMany(),

      // Anonymous feedback count
      this.feedbackRepository.count({ where: { isAnonymous: true } }),

      // Resolved feedback count
      this.feedbackRepository.count({ where: { isResolved: true } }),

      // Recent feedback (last 7 days)
      // Bug: `createdAt: <Date>` matches rows created at exactly that instant,
      // not "within the last 7 days". It should use MoreThanOrEqual(...)
      this.feedbackRepository.count({
        where: {
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    // Process rating distribution
    // Start every bucket at 0 so ratings with no feedback still appear.
    // Raw counts come back as strings, hence the parseInt
    const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingDistribution.forEach((item) => {
      ratingDist[item.rating] = Number.parseInt(item.count);
    });

    // Process feedback by type
    // Same idea: pre-fill every TargetType with 0
    const typeDistribution = {
      [TargetType.PUZZLE]: 0,
      [TargetType.APP]: 0,
      [TargetType.EDUCATION]: 0,
    };
    feedbackByType.forEach((item) => {
      typeDistribution[item.targetType] = Number.parseInt(item.count);
    });

    return {
      totalFeedback,
      // AVG() returns a string (or null when there are no rows), so default to '0'
      averageRating: Number.parseFloat(averageRatingResult?.average || '0'),
      ratingDistribution: ratingDist,
      feedbackByType: typeDistribution,
      anonymousFeedback,
      resolvedFeedback,
      recentFeedback,
    };
  }

  /**
   * Update feedback (admin only)
   */
  // Lets an admin mark feedback resolved and/or attach notes
  async updateFeedback(
    id: string,
    updateData: UpdateFeedbackDto,
  ): Promise<FeedbackResponse> {
    this.logger.log(`Updating feedback: ${id}`);

    const feedback = await this.feedbackRepository.findOne({ where: { id } });

    // 404 if there's no feedback with this id
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    // Update fields
    // Only overwrite fields that were actually provided (partial update)
    if (updateData.isResolved !== undefined) {
      feedback.isResolved = updateData.isResolved;
    }

    if (updateData.adminNotes !== undefined) {
      // Trim; an empty string clears the notes (stored as null)
      feedback.adminNotes = updateData.adminNotes?.trim() || null;
    }

    const updatedFeedback = await this.feedbackRepository.save(feedback);

    this.logger.log(`Feedback updated successfully: ${id}`);

    return this.mapToResponse(updatedFeedback);
  }

  /**
   * Delete feedback (admin only)
   */
  async deleteFeedback(id: string): Promise<void> {
    this.logger.log(`Deleting feedback: ${id}`);

    const result = await this.feedbackRepository.delete(id);

    // `affected` is 0 when no row matched the id
    if (result.affected === 0) {
      throw new NotFoundException('Feedback not found');
    }

    this.logger.log(`Feedback deleted successfully: ${id}`);
  }

  /**
   * Get feedback by target
   */
  // Returns all feedback for a target type (optionally one specific target)
  // along with computed stats for that set
  async getFeedbackByTarget(
    targetType: TargetType,
    targetId?: string,
  ): Promise<{
    feedback: FeedbackResponse[];
    stats: {
      averageRating: number;
      totalCount: number;
      ratingDistribution: { [key: number]: number };
    };
  }> {
    this.logger.log(
      `Getting feedback for ${targetType}${targetId ? ` - ${targetId}` : ''}`,
    );

    const queryBuilder = this.feedbackRepository
      .createQueryBuilder('feedback')
      .where('feedback.targetType = :targetType', { targetType });

    // Narrow to a single target (e.g. one puzzle) when an id is given
    if (targetId) {
      queryBuilder.andWhere('feedback.targetId = :targetId', { targetId });
    }

    // Loads every matching row (no pagination), newest first
    const feedback = await queryBuilder
      .orderBy('feedback.createdAt', 'DESC')
      .getMany();

    // Calculate stats
    // Computed in memory from the loaded rows; this could get heavy for
    // targets with a lot of feedback (an aggregate query would scale better)
    const totalCount = feedback.length;
    // Guard against division by zero when there is no feedback
    const averageRating =
      totalCount > 0
        ? feedback.reduce((sum, f) => sum + f.rating, 0) / totalCount
        : 0;

    // Count how many entries fall in each rating bucket
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    feedback.forEach((f) => {
      ratingDistribution[f.rating]++;
    });

    return {
      feedback: feedback.map((f) => this.mapToResponse(f)),
      stats: {
        // Round to 2 decimal places
        averageRating: Number.parseFloat(averageRating.toFixed(2)),
        totalCount,
        ratingDistribution,
      },
    };
  }

  /**
   * Map entity to response DTO
   */
  // Converts a database entity into the public response shape
  private mapToResponse(feedback: Feedback): FeedbackResponse {
    return {
      id: feedback.id,
      rating: feedback.rating,
      comment: feedback.comment,
      targetType: feedback.targetType,
      targetId: feedback.targetId,
      isAnonymous: feedback.isAnonymous,
      // Hide the user id for anonymous feedback, even if one is stored
      userId: feedback.isAnonymous ? undefined : feedback.userId,
      metadata: feedback.metadata,
      isResolved: feedback.isResolved,
      adminNotes: feedback.adminNotes,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
    };
  }
}
