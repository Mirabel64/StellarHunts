import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventIndexerService } from './event-indexer.service';
import { EventIndexerController } from './event-indexer.controller';
import { IndexedEvent } from './entities/indexed-event.entity';

/**
 * EventIndexerModule
 *
 * Self-contained module responsible for:
 *  - Polling Soroban RPC for new contract events on a configurable interval
 *  - Persisting decoded events into the `indexed_events` table with schema versioning
 *  - Supporting backfill/resync over arbitrary ledger ranges
 *  - Exposing a health-check endpoint at GET /api/v1/event-indexer/health
 *
 * Import this module into AppModule to activate the indexer.
 * Required env vars: SOROBAN_RPC_URL, STELLAR_HUNTS_CONTRACT_ID,
 *   STELLAR_HUNTS_NFT_CONTRACT_ID, STELLAR_MODE.
 * Optional: EVENT_INDEXER_POLL_INTERVAL_MS (default 6000).
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([IndexedEvent]),
  ],
  controllers: [EventIndexerController],
  providers: [EventIndexerService],
  exports: [EventIndexerService],
})
export class EventIndexerModule {}