import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EventIndexerService } from './event-indexer.service';
import { BackfillEventsDto, QueryIndexedEventsDto } from './dto/index-events.dto';

/**
 * Event Indexer controller.
 *
 * Base path is determined by the global API prefix configured in app.config.ts.
 * All routes are under /api/v1/event-indexer when the default prefix is active.
 */
@ApiTags('event-indexer')
@Controller('event-indexer')
export class EventIndexerController {
  private readonly logger = new Logger(EventIndexerController.name);

  constructor(private readonly eventIndexerService: EventIndexerService) {}

  /**
   * GET /api/v1/event-indexer/health
   *
   * Returns the current health and operational status of the Soroban event
   * indexer. Reports the latest indexed ledger, pending backfills, last poll
   * timestamp, active schema version, and whether the service is healthy.
   */
  @Get('health')
  @ApiOperation({
    summary: 'Event indexer health check',
    description:
      'Returns operational status of the Soroban contract event indexer, ' +
      'including the latest indexed ledger, pending backfills, and schema version.',
  })
  @ApiResponse({
    status: 200,
    description: 'Indexer health status returned successfully',
    schema: {
      type: 'object',
      properties: {
        healthy: { type: 'boolean' },
        latestIndexedLedger: { type: 'string', nullable: true },
        pendingBackfills: { type: 'number' },
        lastPollAt: { type: 'string', nullable: true },
        schemaVersion: { type: 'number' },
        rpcUrl: { type: 'string' },
      },
    },
  })
  getHealth() {
    return this.eventIndexerService.getHealthStatus();
  }

  /**
   * GET /api/v1/event-indexer/events
   *
   * Query indexed contract events with optional filters.
   */
  @Get('events')
  @ApiOperation({
    summary: 'Query indexed contract events',
    description:
      'Returns a paginated list of indexed Soroban contract events. ' +
      'Supports filtering by contractId, topic, and ledger range.',
  })
  @ApiResponse({ status: 200, description: 'Paginated event list' })
  async queryEvents(@Query() dto: QueryIndexedEventsDto) {
    return this.eventIndexerService.queryEvents(dto);
  }

  /**
   * POST /api/v1/event-indexer/backfill
   *
   * Trigger a backfill of contract events over a specified ledger range.
   * The operation is idempotent unless `force` is set.
   */
  @Post('backfill')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger event backfill',
    description:
      'Initiates a backfill of Soroban contract events from `fromLedger` to ' +
      '`toLedger` (defaults to latest). Idempotent unless `force: true` is passed.',
  })
  @ApiResponse({
    status: 202,
    description: 'Backfill accepted and started',
    schema: {
      type: 'object',
      properties: {
        indexed: { type: 'number' },
        skipped: { type: 'number' },
      },
    },
  })
  async triggerBackfill(@Body() dto: BackfillEventsDto) {
    this.logger.log(
      `Backfill requested: contract=${dto.contractId} from=${dto.fromLedger} to=${dto.toLedger ?? 'latest'}`,
    );
    return this.eventIndexerService.backfill(dto);
  }
}