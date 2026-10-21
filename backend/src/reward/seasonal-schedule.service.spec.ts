import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SeasonalScheduleService, SeasonEntry } from './seasonal-schedule.service';

/** Helper to build a minimal ConfigService mock */
function buildModule(seasonJson?: string): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      SeasonalScheduleService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            if (key === 'SEASONAL_SCHEDULE_JSON') return seasonJson;
            return undefined;
          },
        },
      },
    ],
  }).compile();
}

const FIXED_SCHEDULE: SeasonEntry[] = [
  {
    name: 'Season A',
    startAt: '2024-01-01T00:00:00Z',
    endAt: '2024-07-01T00:00:00Z',
    multiplier: 2.0,
    announcement: 'Double rewards!',
  },
  {
    name: 'Season B',
    startAt: '2024-07-01T00:00:00Z',
    endAt: '2025-01-01T00:00:00Z',
    multiplier: 1.5,
    announcement: '1.5x rewards',
  },
  {
    name: 'Season C',
    startAt: '2025-01-01T00:00:00Z',
    endAt: null,
    multiplier: 0.5,
    announcement: 'Halving in effect',
  },
];

describe('SeasonalScheduleService', () => {
  describe('with default schedule (no env var)', () => {
    let service: SeasonalScheduleService;

    beforeEach(async () => {
      const module = await buildModule(undefined);
      service = module.get<SeasonalScheduleService>(SeasonalScheduleService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should return a multiplier of 1.0 when no season matches', () => {
      // Provide a date well before the default schedule starts
      const before = new Date('2000-01-01T00:00:00Z');
      expect(service.getCurrentMultiplier(before)).toBe(1.0);
    });

    it('getFullSchedule should return an array', () => {
      const schedule = service.getFullSchedule();
      expect(Array.isArray(schedule)).toBe(true);
      expect(schedule.length).toBeGreaterThan(0);
    });
  });

  describe('with fixed schedule via env var', () => {
    let service: SeasonalScheduleService;
    const json = JSON.stringify(FIXED_SCHEDULE);

    beforeEach(async () => {
      const module = await buildModule(json);
      service = module.get<SeasonalScheduleService>(SeasonalScheduleService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('getCurrentMultiplier returns 2.0 during Season A', () => {
      const during = new Date('2024-03-15T12:00:00Z');
      expect(service.getCurrentMultiplier(during)).toBe(2.0);
    });

    it('getCurrentMultiplier returns 1.5 during Season B', () => {
      const during = new Date('2024-09-01T00:00:00Z');
      expect(service.getCurrentMultiplier(during)).toBe(1.5);
    });

    it('getCurrentMultiplier returns 0.5 during Season C (open-ended)', () => {
      const during = new Date('2026-06-01T00:00:00Z');
      expect(service.getCurrentMultiplier(during)).toBe(0.5);
    });

    it('getCurrentMultiplier returns 1.0 when no season is active', () => {
      const before = new Date('2023-01-01T00:00:00Z');
      expect(service.getCurrentMultiplier(before)).toBe(1.0);
    });

    it('getNextHalvingDate returns the start of Season B when in Season A (multiplier drops)', () => {
      const duringA = new Date('2024-03-01T00:00:00Z');
      const halvingDate = service.getNextHalvingDate(duringA);
      expect(halvingDate).not.toBeNull();
      // Season B has lower multiplier (1.5) than Season A (2.0)
      expect(halvingDate!.toISOString()).toBe('2024-07-01T00:00:00.000Z');
    });

    it('getNextHalvingDate returns the start of Season C when in Season B', () => {
      const duringB = new Date('2024-09-01T00:00:00Z');
      const halvingDate = service.getNextHalvingDate(duringB);
      expect(halvingDate).not.toBeNull();
      expect(halvingDate!.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });

    it('getNextHalvingDate returns null when in the last season (Season C)', () => {
      const duringC = new Date('2026-01-01T00:00:00Z');
      expect(service.getNextHalvingDate(duringC)).toBeNull();
    });

    it('getActiveSeasonInfo returns correct season name during Season A', () => {
      const during = new Date('2024-04-01T00:00:00Z');
      const info = service.getActiveSeasonInfo(during);
      expect(info.season?.name).toBe('Season A');
      expect(info.multiplier).toBe(2.0);
      expect(info.announcement).toBe('Double rewards!');
      expect(info.nextHalvingDate).not.toBeNull();
      expect(info.nextHalvingMultiplier).toBe(1.5);
    });

    it('getActiveSeasonInfo returns null season when no season active', () => {
      const before = new Date('2020-01-01T00:00:00Z');
      const info = service.getActiveSeasonInfo(before);
      expect(info.season).toBeNull();
      expect(info.multiplier).toBe(1.0);
      expect(info.nextHalvingDate).toBeNull();
    });
  });

  describe('with invalid JSON in env var', () => {
    it('falls back to default schedule without throwing', async () => {
      const module = await buildModule('not-valid-json');
      const service = module.get<SeasonalScheduleService>(SeasonalScheduleService);
      expect(service).toBeDefined();
      // Default schedule should load; multiplier should be a number
      const m = service.getCurrentMultiplier(new Date());
      expect(typeof m).toBe('number');
    });
  });

  describe('with empty array JSON in env var', () => {
    it('falls back to default schedule', async () => {
      const module = await buildModule('[]');
      const service = module.get<SeasonalScheduleService>(SeasonalScheduleService);
      expect(service).toBeDefined();
      const schedule = service.getFullSchedule();
      expect(schedule.length).toBeGreaterThan(0);
    });
  });

  describe('schedule ordering', () => {
    it('getFullSchedule entries are sorted ascending by startAt', async () => {
      // Provide reversed order in JSON — service should sort it
      const reversed = [...FIXED_SCHEDULE].reverse();
      const module = await buildModule(JSON.stringify(reversed));
      const service = module.get<SeasonalScheduleService>(SeasonalScheduleService);
      const schedule = service.getFullSchedule();
      for (let i = 1; i < schedule.length; i++) {
        const prev = new Date(schedule[i - 1].startAt).getTime();
        const curr = new Date(schedule[i].startAt).getTime();
        expect(prev).toBeLessThanOrEqual(curr);
      }
    });
  });
});