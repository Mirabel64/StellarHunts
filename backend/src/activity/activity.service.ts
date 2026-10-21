import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Activity, ActivityType } from './entities/activity.entity';
import { Repository } from 'typeorm';
import { FilterActivityDto } from './dto/filter-activity.dto';

// Service responsible for reading and recording user activity events
@Injectable()
export class ActivityService {
  constructor(
    // Inject the TypeORM repository for the Activity entity
    @InjectRepository(Activity)
    private activityRepo: Repository<Activity>,
  ) {}

  // Returns a paginated, optionally filtered list of a user's activities
  async getUserActivities(userId: string, filter: FilterActivityDto) {
    // Start the query scoped to the given user; the named parameter
    // (:userId) is bound safely, which prevents SQL injection
    const query = this.activityRepo
      .createQueryBuilder('activity')
      .where('activity.userId = :userId', { userId });

    // Optional filter: only include activities of a specific type
    if (filter.type) {
      query.andWhere('activity.type = :type', { type: filter.type });
    }

    // Optional filter: lower bound of the date range (inclusive)
    if (filter.from) {
      query.andWhere('activity.createdAt >= :from', { from: filter.from });
    }

    // Optional filter: upper bound of the date range (inclusive)
    if (filter.to) {
      query.andWhere('activity.createdAt <= :to', { to: filter.to });
    }

    // Pagination defaults: 10 items per page, starting at page 1
    const limit = filter.limit || 10;
    const page = filter.page || 1;
    // Number of rows to skip to reach the requested page
    const offset = (page - 1) * limit;

    // Newest activities first; fetch the page of results and the
    // total row count (ignoring pagination) in a single call
    const [data, total] = await query
      .orderBy('activity.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // Return the results along with pagination metadata for the client
    return {
      data,
      total,
      page,
      limit,
      // Round up so a partially filled last page is still counted
      totalPages: Math.ceil(total / limit),
    };
  }

  // Records a new activity event for a user
  async logActivity(
    userId: string,
    type: ActivityType,
    // Optional free-form details about the event (defaults to empty)
    metadata: Record<string, any> = {},
  ) {
    // Build the entity instance; referencing the user by id only
    // avoids having to load the full User entity first
    const activity = this.activityRepo.create({
      user: { id: userId },
      type: type as ActivityType, // cast is redundant since `type` is already ActivityType
      metadata,
    });
    // Persist it and return the saved record (including generated id/timestamps)
    return this.activityRepo.save(activity);
  }
}