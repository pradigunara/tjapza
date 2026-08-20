import { describe, test, expect, mock, afterEach, vi } from 'bun:test';
import type { GameRecord } from '../net/pb';

// Mock the network boundary before the module under test is evaluated:
// GameHeartbeat resolves sendTick at import time, so a static import would
// hoist past the mock (module-loading boundary — the sanctioned exception).
const tickVirtualTimes: number[] = [];
mock.module('../net/pb', () => ({
  sendTick: mock(async () => {
    tickVirtualTimes.push(Date.now());
    return {};
  }),
}));
// Bun lacks a `window` global; GameHeartbeat schedules through it.
const browserScope = globalThis as unknown as { window: unknown };
browserScope.window = globalThis;

const { GameHeartbeat, FAST_FORWARD_TICK_DELAY_MS } = await import('./GameHeartbeat');

/** Bot-only endgame: the single human (seat 0) is done; bots fight for 2nd-4th. */
function botOnlyGame(): GameRecord {
  return {
    id: 'game-1',
    collectionId: 'moves',
    collectionName: 'moves',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    status: 'playing',
    room_code: 'ABC123',
    is_public: false,
    seats: [
      { user_id: 'u1', name: 'Human', is_bot: false, connected: true },
      { user_id: null, name: 'Bot A', is_bot: true, connected: true },
      { user_id: null, name: 'Bot B', is_bot: true, connected: true },
      { user_id: null, name: 'Bot C', is_bot: true, connected: true },
    ],
    counts: [0, 5, 6, 7],
    turn_index: 1,
    leader_index: 1,
    turn_started_at: new Date().toISOString(),
    winner_ranks: [0],
    pass_count: 0,
    passed_seats: [],
    last_combo: null,
  };
}

function makeHeartbeat(game: GameRecord): GameHeartbeat {
  return new GameHeartbeat(game.id, () => game, () => 0);
}

/** Virtual time of the first sendTick issued after `start` (undefined if none). */
function firstTickAfter(start: number, baseline: number): number | undefined {
  for (let i = baseline; i < tickVirtualTimes.length; i++) {
    if (tickVirtualTimes[i]! >= start) return tickVirtualTimes[i]!;
  }
  return undefined;
}

describe('GameHeartbeat fast-forward pacing', () => {
  let hb: GameHeartbeat | null = null;

  afterEach(() => {
    hb?.stop();
    hb = null;
    vi.useRealTimers();
  });

  test('an SSE 900ms trigger cannot replace a pending fast-forward tick', async () => {
    vi.useFakeTimers();
    hb = makeHeartbeat(botOnlyGame());
    const baseline = tickVirtualTimes.length;
    const start = Date.now();

    // Fast-forward chain schedules the next bot tick at the fast cadence…
    hb.triggerImmediate(FAST_FORWARD_TICK_DELAY_MS);
    // …then the TableScene turn-change SSE poke arrives with the legacy delay.
    hb.triggerImmediate(900);

    vi.advanceTimersByTime(700); // still before the 900ms deadline
    const firstTick = firstTickAfter(start, baseline);
    expect(firstTick).toBeDefined(); // fired despite the 900ms override attempt
    expect(firstTick! - start).toBeLessThan(700);
  });

  test('triggerBotTurn pokes a fast-forward table at the fast cadence', async () => {
    vi.useFakeTimers();
    hb = makeHeartbeat(botOnlyGame());
    const baseline = tickVirtualTimes.length;
    const start = Date.now();

    hb.triggerBotTurn(); // replaces the old hardcoded triggerImmediate(900)

    vi.advanceTimersByTime(700);
    const firstTick = firstTickAfter(start, baseline);
    expect(firstTick).toBeDefined();
    expect(firstTick! - start).toBeLessThan(700);
  });

  test('a shorter trigger still tightens a longer pending deadline', async () => {
    vi.useFakeTimers();
    hb = makeHeartbeat(botOnlyGame());
    const baseline = tickVirtualTimes.length;
    const start = Date.now();

    hb.triggerImmediate(900);
    hb.triggerImmediate(100); // e.g. post-move poke must beat the SSE poke

    vi.advanceTimersByTime(700);
    const firstTick = firstTickAfter(start, baseline);
    expect(firstTick).toBeDefined();
    expect(firstTick! - start).toBeLessThan(700);
  });
});
