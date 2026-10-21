import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * A single entry in the seasonal reward schedule.
 * Halvings / multipliers are expressed as an absolute multiplier
 * (e.g. 1.0 = baseline, 2.0 = double rewards, 0.5 = half rewards).
 */
export interface SeasonEntry {
  /** Human-readable season name, e.g. "Genesis Season" */
  name: string;
  /** ISO 8601 start datetime (inclusive) */
  startAt: string;
  /** ISO 8601 end datetime (exclusive). Null means this season never ends. */
  endAt: string | null;
  /**
   * Reward multiplier for this period.
   * 1.0 = normal, 2.0 = double, 0.5 = halving.
   */
  multiplier: number;
  /**
   * Optional announcement text shown in the UI banner.
   */
  announcement?: string;
}

export interface ActiveSeasonInfo {
  season: SeasonEntry | null;
  multiplier: number;
  nextHalvingDate: Date | null;
  nextHalvingMultiplier: number | null;
  announcement: string | null;
}

/**
 * Default schedule used when SEASONAL_SCHEDULE_JSON is not provided.
 * Covers the initial genesis season with a 2× launch bonus that halvings
 * every six months.
 */
const DEFAULT_SCHEDULE: SeasonEntry[] = [
  {
    name: 'Genesis Season',
    startAt: '2024-01-01T00:00:00Z',
    endAt: '2024-07-01T00:00:00Z',
    multiplier: 2.0,
    announcement:
      '🚀 Genesis Season is LIVE! Earn 2× rewards on all puzzles until July 2024.',
  },
  {
    name: 'Season 2',
    startAt: '2024-07-01T00:00:00Z',
    endAt: '2025-01-01T00:00:00Z',
    multiplier: 1.5,
    announcement:
      '⚡ Season 2 is here! Earn 1.5× rewards until January 2025.',
  },
  {
    name: 'Halving Era',
    startAt: '2025-01-01T00:00:00Z',
    endAt: '2025-07-01T00:00:00Z',
    multiplier: 1.0,
    announcement:
      '📉 First halving reached — standard 1× rewards apply.',
  },
  {
    name: 'Season 4',
    startAt: '2025-07-01T00:00:00Z',
    endAt: null,
    multiplier: 0.75,
    announcement:
      '🌙 Season 4 — reduced 0.75× reward rate in effect.',
  },
];

/**
 * SeasonalScheduleService
 *
 * Manages a config-driven seasonal reward schedule.  The schedule is an
 * ordered list of `SeasonEntry` objects read from the `SEASONAL_SCHEDULE_JSON`
 * env var (or falling back to the hard-coded default above).
 *
 * Key responsibilities:
 *  - `getCurrentMultiplier()` — returns the reward multiplier currently active
 *  - `getNextHalvingDate()`   — returns the Date of the next scheduled decrease
 *  - `getActiveSeasonInfo()`  — full snapshot for the UI banner
 */
@Injectable()
export class SeasonalScheduleService {
  private readonly logger = new Logger(SeasonalScheduleService.name);
  private readonly schedule: SeasonEntry[];

  constructor(private readonly configService: ConfigService) {
    this.schedule = this.loadSchedule();
    this.logger.log(
      `SeasonalScheduleService: loaded ${this.schedule.length} season entries`,
    );
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /**
   * Returns the reward multiplier currently in effect based on wall-clock time.
   * Defaults to 1.0 when no season matches the current date.
   */
  getCurrentMultiplier(now: Date = new Date()): number {
    const current = this.findCurrentSeason(now);
    return current?.multiplier ?? 1.0;
  }

  /**
   * Returns the Date of the next scheduled multiplier decrease (halving).
   * A "halving" is defined as any future season entry with a lower multiplier
   * than the current one. Returns null if no future decrease is scheduled.
   */
  getNextHalvingDate(now: Date = new Date()): Date | null {
    const currentMultiplier = this.getCurrentMultiplier(now);
    const futureSeason = this.schedule
      .filter((s) => {
        const start = new Date(s.startAt);
        return start > now && s.multiplier < currentMultiplier;
      })
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];

    return futureSeason ? new Date(futureSeason.startAt) : null;
  }

  /**
   * Full status snapshot consumed by the UI seasonal banner.
   */
  getActiveSeasonInfo(now: Date = new Date()): ActiveSeasonInfo {
    const season = this.findCurrentSeason(now);
    const multiplier = season?.multiplier ?? 1.0;
    const currentMultiplier = multiplier;

    const futureSeason = this.schedule
      .filter((s) => {
        const start = new Date(s.startAt);
        return start > now && s.multiplier < currentMultiplier;
      })
      .sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      )[0];

    return {
      season,
      multiplier,
      nextHalvingDate: futureSeason ? new Date(futureSeason.startAt) : null,
      nextHalvingMultiplier: futureSeason?.multiplier ?? null,
      announcement: season?.announcement ?? null,
    };
  }

  /**
   * Returns all schedule entries (read-only snapshot for admin views).
   */
  getFullSchedule(): Readonly<SeasonEntry[]> {
    return Object.freeze([...this.schedule]);
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private findCurrentSeason(now: Date): SeasonEntry | null {
    // Entries are sorted ascending; find the last entry whose startAt ≤ now
    // and whose endAt is either null or > now.
    const candidates = this.schedule.filter((s) => {
      const start = new Date(s.startAt);
      const end = s.endAt ? new Date(s.endAt) : null;
      return start <= now && (end === null || end > now);
    });

    if (candidates.length === 0) return null;
    // In case of overlapping entries (should not happen) take the most recent
    return candidates.sort(
      (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
    )[0];
  }

  private loadSchedule(): SeasonEntry[] {
    const raw = this.configService.get<string>('SEASONAL_SCHEDULE_JSON');
    if (!raw) {
      this.logger.debug(
        'SEASONAL_SCHEDULE_JSON not set; using default schedule',
      );
      return [...DEFAULT_SCHEDULE];
    }

    try {
      const parsed = JSON.parse(raw) as SeasonEntry[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Schedule must be a non-empty array');
      }
      return parsed.sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to parse SEASONAL_SCHEDULE_JSON: ${err.message}. Falling back to defaults.`,
      );
      return [...DEFAULT_SCHEDULE];
    }
  }
}