import { ApiProperty } from '@nestjs/swagger';

export class CreateUserRankingDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  score: number;

  @ApiProperty()
  achievements: number;

  @ApiProperty()
  activityPoints: number;

  @ApiProperty()
  rank: number;
}
export type UserRankDto = CreateUserRankingDto
