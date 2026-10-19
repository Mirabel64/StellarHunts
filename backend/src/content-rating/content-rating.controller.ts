import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ContentRatingService } from './content-rating.service';
import { CreateRatingDto } from './dto/create-rating.dto';

// All routes in this controller are prefixed with /ratings
@Controller('ratings')
export class ContentRatingController {
  // Nest injects ContentRatingService, which holds the rating business logic
  constructor(private readonly ratingService: ContentRatingService) {}

  // POST /ratings
  // Submits a rating for a piece of content
  @Post()
  async rateContent(
    // Request body validated against CreateRatingDto (userId, contentId, rating)
    @Body() dto: CreateRatingDto,
  ) {
    // Unpack the DTO into positional arguments and delegate to the service,
    // which is responsible for enforcing rules like one rating per user
    return this.ratingService.rateContent(
      dto.userId,
      dto.contentId,
      dto.rating,
    );
  }

  // GET /ratings/stats?contentId=<id>
  // Returns aggregate rating info (e.g. average and total count) for a piece of content
  @Get('/stats')
  async getStats(
    // contentId is read from the query string rather than the route path
    @Query('contentId') contentId: string,
  ) {
    return this.ratingService.getContentRatingStats(contentId);
  }
}
