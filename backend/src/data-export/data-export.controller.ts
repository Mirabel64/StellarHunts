import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '../auth/entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimit } from '../rate-limiter/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limiter/rate-limit.guard';
import { DataExportService, UserDataExport } from './data-export.service';

@ApiTags('Privacy')
@Controller('users/me')
export class DataExportController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Get('export')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ ttl: 3600, limit: 5 })
  @Header('Cache-Control', 'no-store, private')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiBearerAuth()
  @ApiProduces('application/json')
  @ApiOperation({
    summary: 'Export all personal data for the signed-in user',
    description:
      'Returns a JSON document containing the account record plus every row tied to the account (progress, completions, badges, settings, referrals, activity, and so on). Credentials and token values are redacted. The response is sent as a downloadable attachment and must never be cached.',
  })
  @ApiResponse({ status: 200, description: 'Data export generated' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 429, description: 'Export rate limit exceeded' })
  async export(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserDataExport> {
    const data = await this.dataExportService.exportForUser(user.id);
    const filename = `stellarshunts-data-export-${user.id}-${data.generatedAt.slice(
      0,
      10,
    )}.json`;

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );

    return data;
  }
}
