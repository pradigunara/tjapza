import { describe, expect, test } from 'bun:test';
import { shouldPurgeHand, type HandGameResolution } from './HandPurgePolicy';

describe('shouldPurgeHand (ephemeral cleanup safety contract)', () => {
  test('NEVER purges hands of an actively playing game', () => {
    expect(shouldPurgeHand({ resolved: true, status: 'playing' })).toBe(false);
  });

  test('keeps hands when the game lookup failed transiently', () => {
    const unresolved: HandGameResolution = { resolved: false };
    expect(shouldPurgeHand(unresolved)).toBe(false);
  });

  test('purges hands of finished games', () => {
    expect(shouldPurgeHand({ resolved: true, status: 'finished' })).toBe(true);
  });

  test('purges hands of abandoned waiting games', () => {
    expect(shouldPurgeHand({ resolved: true, status: 'waiting' })).toBe(true);
  });

  test('purges orphaned hands whose game record is confirmed absent', () => {
    expect(shouldPurgeHand({ resolved: true, status: null })).toBe(true);
  });

  test('keeps hands for unknown statuses (allowlist fails safe)', () => {
    // Deletion is allowlisted to waiting/finished only; a future or corrupt
    // status (e.g. 'paused') must never cause an active-game hand purge.
    expect(shouldPurgeHand({ resolved: true, status: 'paused' })).toBe(false);
    expect(shouldPurgeHand({ resolved: true, status: '' })).toBe(false);
  });
});
