import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FeedbackController } from './controllers/feedback.controller';
import { FeedbackService } from './services/feedback.service';
import { AdminGuard } from './guards/admin.guard';
import { Feedback } from './entities/feedback.entity';

// Feature module that groups everything related to user feedback
@Module({
  imports: [
    // Gives this module access to configuration values (env vars, etc.)
    ConfigModule,
    // Register the Feedback entity's repository so it can be injected
    // into providers in this module (e.g. via @InjectRepository)
    TypeOrmModule.forFeature([Feedback]),
  ],
  // HTTP route handlers belonging to this module
  controllers: [FeedbackController],
  // Classes Nest instantiates and makes available for dependency injection here.
  // AdminGuard is listed so it can be resolved when used with @UseGuards
  providers: [FeedbackService, AdminGuard],
  // Make FeedbackService available to other modules that import FeedbackModule
  exports: [FeedbackService],
})
export class FeedbackModule {}
