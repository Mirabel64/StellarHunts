import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CheckSolutionDto {
  @ApiProperty({
    description: 'ID of the puzzle being solved',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  puzzleId: string;

  @ApiProperty({
    description: 'Answer submitted by the player',
    example: 'stellar',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  answer: string;

  @ApiPropertyOptional({
    description:
      'Player ID used to rate limit and correlate attempts. Defaults to the authenticated user when available.',
    example: 'player-42',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  playerId?: string;
}
