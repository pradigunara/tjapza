import { describe, test, expect, mock, afterEach, beforeEach, vi } from 'bun:test';
import type { GameRecord } from '../net/pb';

// Mock the network boundary before the module under test is evaluated:
// GameHeartbeat resolves sendTick at import time, so a static import would
// hoist past the mock (module-loading boundary — the sanctioned exception).
const tickVirtualTimes: number[] = [];
let mockHandCards: number[] = [0, 4, 8];
const playMoveCalls: Array<{ gameId: string; seatIndex: number; action: string; cards: number[] }> = [];
const sendTickCalls: Array<{ gameId: string; seatIndex: number }> = [];

mock.module('../net/pb', () => ({
  sendTick: mock(async (gameId: string, seatIndex: number) => {
    tickVirtualTimes.push(Date.now());
    sendTickCalls.push({ gameId, seatIndex });
    return {};
  }),
  fetchPlayerHand: mock(async (gameId: string, seatIndex: number) => {
    return mockHandCards;
  }),
  playMove: mock(async (gameId: string, seatIndex: number, action: string, cards: number[]) => {
    playMoveCalls.push({ gameId, seatIndex, action, cards });
    return {};
  }),
}));
// Bun lacks a `window` global; GameHeartbeat schedules through it.
const browserScope = globalThis as unknown as { window: unknown };
browserScope.window = globalThis;

const { GameHeartbeat, FAST_FORWARD_TICK_DELAY_MS } = await import('./GameHeartbeat');
const { modelManager } = await import('../ai/ModelManager');

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

/** Active game with human at seat 0 and bot turn at seat 1 */
function activeBotTurnGame(): GameRecord {
  return {
    id: 'game-ai-1',
    collectionId: 'moves',
    collectionName: 'moves',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    status: 'playing',
    room_code: 'XYZ789',
    is_public: false,
    seats: [
      { user_id: 'u1', name: 'Human Host', is_bot: false, connected: true },
      { user_id: null, name: 'Bot 1', is_bot: true, connected: true },
      { user_id: null, name: 'Bot 2', is_bot: true, connected: true },
      { user_id: null, name: 'Bot 3', is_bot: true, connected: true },
    ],
    counts: [13, 13, 13, 13],
    turn_index: 1,
    leader_index: 1,
    turn_started_at: new Date().toISOString(),
    winner_ranks: [],
    pass_count: 0,
    passed_seats: [],
    last_combo: null,
  };
}

function makeHeartbeat(game: GameRecord, localSeat = 0, getDomainGame?: () => any): GameHeartbeat {
  return new GameHeartbeat(game.id, () => game, () => localSeat, getDomainGame);
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
    playMoveCalls.length = 0;
    sendTickCalls.length = 0;
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

describe('GameHeartbeat AI host dispatching', () => {
  let hb: GameHeartbeat | null = null;

  beforeEach(() => {
    playMoveCalls.length = 0;
    sendTickCalls.length = 0;
  });

  afterEach(() => {
    hb?.stop();
    hb = null;
    vi.useRealTimers();
    playMoveCalls.length = 0;
    sendTickCalls.length = 0;
  });

  test('attempts host AI move when modelManager is ready and isPrimary is true', async () => {
    vi.useFakeTimers();
    const game = activeBotTurnGame();
    mockHandCards = [0, 4, 8]; // 3♦, 4♦, 5♦

    // Spy on modelManager.isReady and generateDecision
    const origIsReady = modelManager.isReady;
    const origGenerateDecision = modelManager.generateDecision;
    (modelManager as any).isReady = () => true;
    (modelManager as any).generateDecision = mock(async () => ({
      action: 'play',
      cards: [0],
      source: 'llm',
    }));

    try {
      hb = makeHeartbeat(game, 0, () => ({
        trick: { isFresh: true, lastCombo: undefined },
        isOpeningMove: true,
      }));

      hb.triggerImmediate(100);
      vi.advanceTimersByTime(200);
      await Promise.resolve(); // flush async microtasks

      expect(playMoveCalls.length).toBe(1);
      expect(playMoveCalls[0]).toEqual({
        gameId: 'game-ai-1',
        seatIndex: 1,
        action: 'play',
        cards: [0],
      });
      expect(sendTickCalls.length).toBe(0);
    } finally {
      (modelManager as any).isReady = origIsReady;
      (modelManager as any).generateDecision = origGenerateDecision;
    }
  });

  test('falls back to sendTick if modelManager is not ready', async () => {
    vi.useFakeTimers();
    const game = activeBotTurnGame();

    const origIsReady = modelManager.isReady;
    (modelManager as any).isReady = () => false;

    try {
      hb = makeHeartbeat(game, 0);
      hb.triggerImmediate(100);
      vi.advanceTimersByTime(200);
      await Promise.resolve();

      expect(playMoveCalls.length).toBe(0);
      expect(sendTickCalls.length).toBe(1);
      expect(sendTickCalls[0]).toEqual({
        gameId: 'game-ai-1',
        seatIndex: 1,
      });
    } finally {
      (modelManager as any).isReady = origIsReady;
    }
  });

  test('falls back to sendTick if AI generation fails or throws', async () => {
    vi.useFakeTimers();
    const game = activeBotTurnGame();
    mockHandCards = [0, 4, 8];

    const origIsReady = modelManager.isReady;
    const origGenerateDecision = modelManager.generateDecision;
    (modelManager as any).isReady = () => true;
    (modelManager as any).generateDecision = mock(async () => {
      throw new Error('Inference timeout or GPU failure');
    });

    try {
      hb = makeHeartbeat(game, 0);
      hb.triggerImmediate(100);
      vi.advanceTimersByTime(200);
      await Promise.resolve();

      expect(playMoveCalls.length).toBe(0);
      expect(sendTickCalls.length).toBe(1);
      expect(sendTickCalls[0]).toEqual({
        gameId: 'game-ai-1',
        seatIndex: 1,
      });
    } finally {
      (modelManager as any).isReady = origIsReady;
      (modelManager as any).generateDecision = origGenerateDecision;
    }
  });
});
