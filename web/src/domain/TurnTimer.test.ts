import { describe, expect, test } from 'bun:test';
import { TurnTimer } from './index';

describe('TurnTimer Value Object', () => {
  test('calculates elapsed, remaining, progress, and status color', () => {
    const now = 1000000;
    const timer = new TurnTimer(now - 30000, 60000); // 30s elapsed of 60s

    expect(timer.getElapsedMs(now)).toBe(30000);
    expect(timer.getRemainingMs(now)).toBe(30000);
    expect(timer.getRemainingSecs(now)).toBe(30);
    expect(timer.getProgress(now)).toBeCloseTo(0.5);
    expect(timer.isExpired(now)).toBe(false);
    expect(timer.getStatusColor(now)).toBe('#d4af37');

    // 52s elapsed (8s left) -> Red
    const expiredTimer = new TurnTimer(now - 52000, 60000);
    expect(expiredTimer.getRemainingSecs(now)).toBe(8);
    expect(expiredTimer.getStatusColor(now)).toBe('#ef4444');
    expect(expiredTimer.isExpired(now)).toBe(false);

    // 65s elapsed -> Expired
    const timedOut = new TurnTimer(now - 65000, 60000);
    expect(timedOut.isExpired(now)).toBe(true);
    expect(timedOut.getRemainingMs(now)).toBe(0);
  });
});
