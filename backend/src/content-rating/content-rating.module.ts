import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentRating } from './entities/content-rating.entity';
import { ContentRatingService } from './content-rating.service';
import { ContentRatingController } from './content-rating.controller';

// Feature module that groups everything related to content ratings
@Module({
  // Register the ContentRating entity's repository so it can be injected
  // into providers in this module (e.g. via @InjectRepository)
  imports: [TypeOrmModule.forFeature([ContentRating])],
  // HTTP route handlers belonging to this module (/ratings endpoints)
  controllers: [ContentRatingController],
  // Classes Nest instantiates and makes available for dependency injection here
  providers: [ContentRatingService],
})
export class ContentRatingModule {}
