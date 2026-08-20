import { TURN_TIMEOUT_MS } from './constants';

/**
 * Pure Value Object representing a Turn Timer.
 * Deterministic calculation with zero side effects.
 */
export class TurnTimer {
  public readonly startedAtMs: number;
  public readonly durationMs: number;

  constructor(startedAt: string | number | Date = Date.now(), durationMs: number = TURN_TIMEOUT_MS) {
    if (typeof startedAt === 'string') {
      const parsed = Date.parse(startedAt);
      this.startedAtMs = isNaN(parsed) ? Date.now() : parsed;
    } else if (startedAt instanceof Date) {
      this.startedAtMs = startedAt.getTime();
    } else {
      this.startedAtMs = startedAt;
    }
    this.durationMs = durationMs;
  }

  public getElapsedMs(nowMs: number = Date.now()): number {
    return Math.max(0, nowMs - this.startedAtMs);
  }

  public getRemainingMs(nowMs: number = Date.now()): number {
    return Math.max(0, this.durationMs - this.getElapsedMs(nowMs));
  }

  public getRemainingSecs(nowMs: number = Date.now()): number {
    return Math.ceil(this.getRemainingMs(nowMs) / 1000);
  }

  public getElapsedSecs(nowMs: number = Date.now()): number {
    return Math.floor(this.getElapsedMs(nowMs) / 1000);
  }

  public getProgress(nowMs: number = Date.now()): number {
    if (this.durationMs <= 0) return 1.0;
    return Math.min(1.0, Math.max(0.0, this.getElapsedMs(nowMs) / this.durationMs));
  }

  public isExpired(nowMs: number = Date.now()): boolean {
    return this.getRemainingMs(nowMs) <= 0;
  }

  public getStatusColor(nowMs: number = Date.now()): '#d4af37' | '#f59e0b' | '#ef4444' {
    const secs = this.getRemainingSecs(nowMs);
    if (secs <= 10) return '#ef4444';
    if (secs <= 25) return '#f59e0b';
    return '#d4af37';
  }

  public static createDefault(): TurnTimer {
    return new TurnTimer(Date.now(), TURN_TIMEOUT_MS);
  }
}
