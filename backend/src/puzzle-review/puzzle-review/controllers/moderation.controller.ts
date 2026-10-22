import { Controller } from '@nestjs/common';
import { ModerationService } from '../services/moderation.service';

@Controller('reviews/:reviewId/moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}
}
