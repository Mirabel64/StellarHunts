import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ClaimRewardDto {
  @ApiProperty({
    description: 'User ID requesting the reward claim',
    example: 'user-123',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Challenge ID for which the reward is being claimed',
    example: 'challenge-easy-001',
  })
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @ApiPropertyOptional({
    description: 'Event ID triggering the reward claim (used to derive dedupeKey per user, event)',
    example: 'evt_1234567890',
  })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({
    description: 'Transaction hash associated with the claim',
    example: '0xabc123...',
  })
  @IsOptional()
  @IsString()
  transactionHash?: string;

  @ApiPropertyOptional({
    description: 'Deduplication key per (user, event) for idempotent transaction retries. Auto-derived as `${userId}:${eventId}` when eventId is provided.',
    example: 'user-123:evt_1234567890',
  })
  @IsOptional()
  @IsString()
  dedupeKey?: string;
}
