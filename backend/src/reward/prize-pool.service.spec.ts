import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrizePoolService } from './prize-pool.service';
import { PrizePool } from './entities/prize-pool.entity';
import { PrizePoolPayout, PrizePoolPayoutAction } from './entities/prize-pool-payout.entity';

/** Minimal entity builder helpers */
function makePrizePool(overrides: Partial<PrizePool> = {}): PrizePool {
  return {
    id: 'pool-uuid-1',
    season: 'test-season',
    displayName: null,
    balance: '0.0000000',
    totalFunded: '0.0000000',
    totalDistributed: '0.0000000',
    distributionRules: null,
    isDistributed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    payouts: [],
    ...overrides,
  } as PrizePool;
}

function makePayout(overrides: Partial<PrizePoolPayout> = {}): PrizePoolPayout {
  return {
    id: 'payout-uuid-1',
    prizePoolId: 'pool-uuid-1',
    action: PrizePoolPayoutAction.FUND,
    recipientAddress: null,
    place: null,
    amount: '100.0000000',
    txHash: null,
    meta: null,
    createdAt: new Date(),
    prizePool: {} as PrizePool,
    ...overrides,
  } as PrizePoolPayout;
}

describe('PrizePoolService', () => {
  let service: PrizePoolService;

  // Repository mocks
  const mockPoolRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };
  const mockPayoutRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  // Track manager repo mocks used inside transactions
  const txPoolRepo = { ...mockPoolRepo };
  const txPayoutRepo = { ...mockPayoutRepo };

  /** Simulates DataSource.transaction() by invoking the callback synchronously */
  const mockDataSource = {
    transaction: jest.fn().mockImplementation(async (cb: any) => {
      const manager = {
        getRepository: (entity: any) => {
          if (entity === PrizePool) return txPoolRepo;
          if (entity === PrizePoolPayout) return txPayoutRepo;
          throw new Error(`Unexpected entity: ${entity}`);
        },
      };
      return cb(manager);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default happy-path mock chain for create/save
    txPoolRepo.create = jest.fn().mockImplementation((v) => v);
    txPoolRepo.save = jest.fn().mockImplementation(async (v) => ({ ...makePrizePool(), ...v }));
    txPoolRepo.findOne = jest.fn().mockResolvedValue(null);

    txPayoutRepo.create = jest.fn().mockImplementation((v) => v);
    txPayoutRepo.save = jest.fn().mockImplementation(async (v) => ({ ...makePayout(), ...v }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrizePoolService,
        { provide: getRepositoryToken(PrizePool), useValue: mockPoolRepo },
        { provide: getRepositoryToken(PrizePoolPayout), useValue: mockPayoutRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<PrizePoolService>(PrizePoolService);
  });

  // ── fundPool ───────────────────────────────────────────────────────────────

  describe('fundPool', () => {
    it('creates a new pool when season does not exist', async () => {
      txPoolRepo.findOne.mockResolvedValue(null);

      const result = await service.fundPool('100', 'new-season');
      expect(txPoolRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ season: 'new-season' }),
      );
      expect(txPayoutRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ action: PrizePoolPayoutAction.FUND }),
      );
      expect(result).toBeDefined();
    });

    it('accumulates balance for an existing pool', async () => {
      const existing = makePrizePool({ balance: '50.0000000', totalFunded: '50.0000000' });
      txPoolRepo.findOne.mockResolvedValue(existing);
      txPoolRepo.save.mockImplementation(async (v) => v);

      await service.fundPool('50', 'existing-season');
      expect(txPoolRepo.save).toHaveBeenCalled();
    });

    it('throws BadRequestException for zero amount', async () => {
      await expect(service.fundPool('0', 'any-season')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for negative amount', async () => {
      await expect(service.fundPool('-10', 'any-season')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when pool is already distributed', async () => {
      txPoolRepo.findOne.mockResolvedValue(makePrizePool({ isDistributed: true }));
      await expect(service.fundPool('100', 'done-season')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('records fund meta when provided', async () => {
      txPoolRepo.findOne.mockResolvedValue(null);
      await service.fundPool('200', 'meta-season', { txHash: 'abc123', source: 'treasury' });
      expect(txPayoutRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          txHash: 'abc123',
          meta: expect.objectContaining({ source: 'treasury' }),
        }),
      );
    });
  });

  // ── distributePool ─────────────────────────────────────────────────────────

  describe('distributePool', () => {
    const topFinishers = [
      { address: 'GAAA', place: 1 },
      { address: 'GBBB', place: 2 },
      { address: 'GCCC', place: 3 },
    ];

    it('distributes pool to top finishers with default 50/30/20 split', async () => {
      const pool = makePrizePool({ balance: '1000.0000000', totalFunded: '1000.0000000' });
      txPoolRepo.findOne.mockResolvedValue(pool);
      txPoolRepo.save.mockImplementation(async (v) => v);
      txPayoutRepo.save.mockImplementation(async (v) => v);

      const result = await service.distributePool('test-season', topFinishers);
      expect(result.payouts).toHaveLength(3);
      // 50% of 1000 = 500
      expect(parseFloat(result.payouts[0].amount)).toBeCloseTo(500, 3);
      // 30% = 300
      expect(parseFloat(result.payouts[1].amount)).toBeCloseTo(300, 3);
      // 20% = 200
      expect(parseFloat(result.payouts[2].amount)).toBeCloseTo(200, 3);
    });

    it('throws NotFoundException when pool does not exist', async () => {
      txPoolRepo.findOne.mockResolvedValue(null);
      await expect(
        service.distributePool('missing-season', topFinishers),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when pool is already distributed', async () => {
      txPoolRepo.findOne.mockResolvedValue(makePrizePool({ isDistributed: true }));
      await expect(
        service.distributePool('done-season', topFinishers),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when pool has zero balance', async () => {
      txPoolRepo.findOne.mockResolvedValue(makePrizePool({ balance: '0.0000000' }));
      await expect(
        service.distributePool('empty-season', topFinishers),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when topFinishers is empty', async () => {
      await expect(
        service.distributePool('test-season', []),
      ).rejects.toThrow(BadRequestException);
    });

    it('locks the pool after distribution', async () => {
      const pool = makePrizePool({ balance: '300.0000000', totalFunded: '300.0000000' });
      txPoolRepo.findOne.mockResolvedValue(pool);
      let savedPool: any;
      txPoolRepo.save.mockImplementation(async (v) => {
        savedPool = v;
        return v;
      });
      txPayoutRepo.save.mockImplementation(async (v) => v);

      await service.distributePool('test-season', [{ address: 'GAAA', place: 1 }]);
      expect(savedPool.isDistributed).toBe(true);
    });

    it('respects custom distributionRules', async () => {
      const pool = makePrizePool({
        balance: '1000.0000000',
        totalFunded: '1000.0000000',
        distributionRules: { places: [0.6, 0.4] },
      });
      txPoolRepo.findOne.mockResolvedValue(pool);
      txPoolRepo.save.mockImplementation(async (v) => v);
      txPayoutRepo.save.mockImplementation(async (v) => v);

      const result = await service.distributePool('custom-season', [
        { address: 'GAAA', place: 1 },
        { address: 'GBBB', place: 2 },
      ]);
      expect(parseFloat(result.payouts[0].amount)).toBeCloseTo(600, 3);
      expect(parseFloat(result.payouts[1].amount)).toBeCloseTo(400, 3);
    });
  });

  // ── getPoolStatus ──────────────────────────────────────────────────────────

  describe('getPoolStatus', () => {
    it('returns pool status with payouts', async () => {
      const pool = makePrizePool({
        payouts: [makePayout()],
      });
      mockPoolRepo.findOne.mockResolvedValue(pool);

      const status = await service.getPoolStatus('test-season');
      expect(status.season).toBe('test-season');
      expect(status.payouts).toHaveLength(1);
    });

    it('throws NotFoundException when pool does not exist', async () => {
      mockPoolRepo.findOne.mockResolvedValue(null);
      await expect(service.getPoolStatus('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── listPools ──────────────────────────────────────────────────────────────

  describe('listPools', () => {
    it('returns all pools ordered by createdAt DESC', async () => {
      const pools = [makePrizePool({ season: 's1' }), makePrizePool({ season: 's2' })];
      mockPoolRepo.find.mockResolvedValue(pools);

      const result = await service.listPools();
      expect(result).toHaveLength(2);
      expect(mockPoolRepo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
    });
  });
});