import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from './entities/activity.entity';

// Feature module that groups everything related to user activity tracking
@Module({
  // Register the Activity entity's repository so it can be injected
  // into providers in this module (e.g. via @InjectRepository)
  imports: [TypeOrmModule.forFeature([Activity])],
  // Classes Nest instantiates and makes available for dependency injection here
  providers: [ActivityService],
  // HTTP route handlers belonging to this module
  controllers: [ActivityController],
  // Make ActivityService available to other modules that import ActivityModule,
  // so they can call logActivity() without re-declaring the provider
  exports: [ActivityService],
})
export class ActivityModule {}