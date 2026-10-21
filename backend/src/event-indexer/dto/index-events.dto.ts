import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumberString,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO for triggering a backfill of Soroban contract events.
 * Consumers POST this to /api/v1/event-indexer/backfill.
 */
export class BackfillEventsDto {
  @ApiProperty({
    description: 'Stellar contract ID to backfill events for',
    example: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  })
  @IsString()
  contractId: string;

  @ApiProperty({
    description: 'Ledger sequence to start backfill from (inclusive)',
    example: '1000000',
  })
  @IsNumberString()
  fromLedger: string;

  @ApiPropertyOptional({
    description:
      'Ledger sequence to stop backfill at (inclusive). Defaults to latest ledger.',
    example: '1001000',
  })
  @IsOptional()
  @IsNumberString()
  toLedger?: string;

  @ApiPropertyOptional({
    description:
      'Maximum number of events to index per RPC page (1-200). Defaults to 100.',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Transform(({ value }) => parseInt(value, 10))
  pageSize?: number;

  @ApiPropertyOptional({
    description:
      'When true, re-index events that already exist (overwrite). Defaults to false.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  force?: boolean;
}

/**
 * DTO for querying indexed events with optional filters.
 */
export class QueryIndexedEventsDto {
  @ApiPropertyOptional({ description: 'Filter by contract ID' })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({ description: 'Filter by topic symbol (e.g. "level_badge_minted")' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({ description: 'Filter by minimum ledger sequence' })
  @IsOptional()
  @IsNumberString()
  fromLedger?: string;

  @ApiPropertyOptional({ description: 'Filter by maximum ledger sequence' })
  @IsOptional()
  @IsNumberString()
  toLedger?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based). Defaults to 1.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number;

  @ApiPropertyOptional({ description: 'Page size (1-100). Defaults to 20.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;
}