/**
 * Sample Soroban Event Indexer Handler for StellarHunts
 * 
 * Demonstrates consuming and validating structured event payloads emitted by
 * `stellar-hunts` and `stellar-hunts-nft` smart contracts against the documented schema.
 */

export enum Levels {
  Easy = 0,
  Medium = 1,
  Hard = 2,
  Expert = 3,
}

export interface RawSorobanEvent {
  contractId: string;
  topic: string[];
  payload: any[];
  ledger: number;
  timestamp: number;
}

export interface ParsedEvent {
  contractId: string;
  topic: string;
  data: Record<string, any>;
  ledger: number;
  timestamp: number;
}

/**
 * Event Schema Definitions matching onchain/docs/event-schema.md
 */
export const EVENT_SCHEMAS: Record<string, { arity: number; fields: string[] }> = {
  // stellar-hunts events
  game_initialized: { arity: 2, fields: ['admin', 'schemaVersion'] },
  admin_transfer_proposed: { arity: 2, fields: ['currentAdmin', 'newAdmin'] },
  admin_transfer_accepted: { arity: 2, fields: ['previousAdmin', 'newAdmin'] },
  upgrader_updated: { arity: 1, fields: ['upgrader'] },
  contract_upgraded: { arity: 2, fields: ['upgrader', 'newWasmHash'] },
  question_added: { arity: 2, fields: ['questionId', 'level'] },
  question_updated: { arity: 2, fields: ['questionId', 'level'] },
  question_per_level_updated: { arity: 1, fields: ['amount'] },
  question_retired: { arity: 1, fields: ['questionId'] },
  nft_contract_updated: { arity: 2, fields: ['oldAddress', 'newAddress'] },
  answer_submitted: { arity: 4, fields: ['caller', 'questionId', 'level', 'isCorrect'] },
  hint_requested: { arity: 3, fields: ['caller', 'questionId', 'level'] },
  level_completed: { arity: 3, fields: ['caller', 'completedLevel', 'nextLevel'] },
  contract_paused: { arity: 1, fields: ['admin'] },
  contract_unpaused: { arity: 1, fields: ['admin'] },
  schema_migrated: { arity: 2, fields: ['fromVersion', 'toVersion'] },
  player_initialized: { arity: 2, fields: ['player', 'initialLevel'] },
  event_created: { arity: 4, fields: ['eventId', 'startTime', 'endTime', 'multiplierBps'] },
  badge_staked: { arity: 3, fields: ['player', 'eventId', 'level'] },
  badge_unstaked: { arity: 3, fields: ['player', 'eventId', 'level'] },
  stake_slashed: { arity: 3, fields: ['player', 'eventId', 'level'] },

  // stellar-hunts-nft events
  nft_initialized: { arity: 2, fields: ['admin', 'gameContract'] },
  nft_contract_paused: { arity: 1, fields: ['admin'] },
  nft_contract_unpaused: { arity: 1, fields: ['admin'] },
  minter_role_granted: { arity: 1, fields: ['account'] },
  minter_role_revoked: { arity: 1, fields: ['account'] },
};

/**
 * Validates and decodes raw Soroban contract event into a strongly-typed ParsedEvent.
 */
export function handleContractEvent(event: RawSorobanEvent): ParsedEvent {
  if (!event.topic || event.topic.length === 0) {
    throw new Error('Event missing topic identifier');
  }

  const topic = event.topic[0];
  const payload = event.payload ?? [];

  // Special case: level_badge_minted discriminator between game and NFT contracts
  if (topic === 'level_badge_minted') {
    if (payload.length === 2) {
      // Emitted by stellar-hunts: (player, level)
      return {
        contractId: event.contractId,
        topic,
        data: {
          player: payload[0],
          level: payload[1],
        },
        ledger: event.ledger,
        timestamp: event.timestamp,
      };
    } else if (payload.length === 4) {
      // Emitted by stellar-hunts-nft: (recipient, level, minter, admin)
      return {
        contractId: event.contractId,
        topic,
        data: {
          recipient: payload[0],
          level: payload[1],
          minter: payload[2],
          admin: payload[3],
        },
        ledger: event.ledger,
        timestamp: event.timestamp,
      };
    } else {
      throw new Error(
        `Invalid arity for level_badge_minted: expected 2 or 4, received ${payload.length}`,
      );
    }
  }

  const schema = EVENT_SCHEMAS[topic];
  if (!schema) {
    throw new Error(`Unrecognized event topic: ${topic}`);
  }

  if (payload.length !== schema.arity) {
    throw new Error(
      `Schema mismatch for ${topic}: expected arity ${schema.arity}, received ${payload.length}`,
    );
  }

  const data: Record<string, any> = {};
  for (let i = 0; i < schema.fields.length; i++) {
    data[schema.fields[i]] = payload[i];
  }

  return {
    contractId: event.contractId,
    topic,
    data,
    ledger: event.ledger,
    timestamp: event.timestamp,
  };
}

// Self-validation test suite
export function runValidationSuite(): { passed: boolean; message: string } {
  const sampleEvents: RawSorobanEvent[] = [
    {
      contractId: 'C_STELLAR_HUNTS',
      topic: ['game_initialized'],
      payload: ['GADMINXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 1],
      ledger: 100,
      timestamp: 1700000000,
    },
    {
      contractId: 'C_STELLAR_HUNTS',
      topic: ['contract_upgraded'],
      payload: [
        'GADMINXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ],
      ledger: 101,
      timestamp: 1700000050,
    },
    {
      contractId: 'C_STELLAR_HUNTS',
      topic: ['answer_submitted'],
      payload: [
        'GPLAYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        105,
        Levels.Medium,
        true,
      ],
      ledger: 102,
      timestamp: 1700000100,
    },
    {
      contractId: 'C_STELLAR_HUNTS',
      topic: ['badge_staked'],
      payload: [
        'GPLAYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        1,
        Levels.Hard,
      ],
      ledger: 103,
      timestamp: 1700000150,
    },
    {
      contractId: 'C_STELLAR_HUNTS_NFT',
      topic: ['level_badge_minted'],
      payload: [
        'GPLAYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        Levels.Easy,
        'C_STELLAR_HUNTS',
        'GADMINXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      ],
      ledger: 104,
      timestamp: 1700000200,
    },
  ];

  for (const event of sampleEvents) {
    const parsed = handleContractEvent(event);
    if (!parsed || parsed.topic !== event.topic[0]) {
      return { passed: false, message: `Failed to validate event: ${event.topic[0]}` };
    }
  }

  return { passed: true, message: 'All schema validations passed successfully.' };
}
