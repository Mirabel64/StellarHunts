import {
  Controller,
  Get,
  Query,
  Req,
  Body,
  Post,
} from '@nestjs/common';
import { ActivityService } from './activity.service';
import { FilterActivityDto } from './dto/filter-activity.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Activity } from './entities/activity.entity';
import { CreateActivityDto } from './dto/create-activity.dto';

// Groups these endpoints under "Activity History" in the Swagger UI
@ApiTags('Activity History')
// Documents that these endpoints expect a Bearer token (JWT) in Swagger
@ApiBearerAuth()
// All routes in this controller are prefixed with /activities
@Controller('activities')
export class ActivityController {
  // Nest injects ActivityService, which holds the business logic
  constructor(private readonly activityService: ActivityService) {}

  // GET /activities
  @Get()
  // Swagger: short description of what the endpoint does
  @ApiOperation({ summary: 'Get user activity history' })
  // Swagger: documents the successful response
  @ApiResponse({
    status: 200,
    description: 'User activity list retrieved successfully.',
  })
  async getMyActivities(
    // Query string params (type, from, to, page, limit) mapped into the DTO
    @Query() filter: FilterActivityDto,
    // Request object; req.user is expected to be set by an auth guard.
    // Typing it (e.g. a custom AuthenticatedRequest) would add type safety
    @Req() req,
  ): Promise<{
    data: Activity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Only fetch activities for the authenticated user, so users
    // can't read each other's history
    return this.activityService.getUserActivities(req.user.id, filter);
  }

  // POST /activities
  @Post()
  // Swagger: note this endpoint is intended for testing/admin use
  @ApiOperation({ summary: 'Log an activity (for testing/admin)' })
  // Swagger: documents the expected request body shape
  @ApiBody({ type: CreateActivityDto })
  // Swagger: documents the 201 response and its returned entity type
  @ApiResponse({
    status: 201,
    description: 'Activity successfully logged.',
    type: Activity,
  })
  async createActivity(
    // Validated request body containing the activity type and metadata
    @Body() dto: CreateActivityDto,
    // Authenticated request, used to attribute the activity to the current user
    @Req() req,
  ): Promise<Activity> {
    // Save the activity under the current user's id and return the stored record
    return this.activityService.logActivity(
      req.user.id,
      dto.type,
      dto.metadata,
    );
  }
}