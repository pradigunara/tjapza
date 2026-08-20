import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ModelManager } from './ModelManager';
import { CARD_3D } from '../domain/constants';
import type { GameContextForLLM } from './types';

describe('ModelManager (Monte Carlo Search Engine)', () => {
  let manager: ModelManager;

  beforeEach(() => {
    manager = new ModelManager();
  });

  afterEach(() => {
    manager.terminate();
  });

  it('starts in unloaded state and transitions immediately to ready upon initialization', async () => {
    expect(manager.getStatus()).toBe('unloaded');
    expect(manager.isReady()).toBe(false);

    let progressEvents: number[] = [];
    manager.onProgress((p) => {
      progressEvents.push(p.progress);
    });

    let statusEvents: string[] = [];
    manager.onStatusChange((s) => {
      statusEvents.push(s);
    });

    await manager.init();

    expect(manager.getStatus()).toBe('ready');
    expect(manager.isReady()).toBe(true);
    expect(statusEvents).toContain('ready');
    expect(progressEvents).toContain(100);
  });

  it('generates high-performance MCTS decision when ready', async () => {
    await manager.init();

    const context: GameContextForLLM = {
      handCards: [CARD_3D, 4, 8, 12, 16],
      opponentCounts: [13, 13, 13],
      isOpeningMove: true,
      isFreshTrick: true,
    };

    const decision = await manager.generateDecision(context, { rolloutsPerMove: 10 });
    expect(decision.action).toBe('play');
    expect(decision.cards.includes(CARD_3D)).toBe(true);
    expect(decision.source).toBe('llm');
    expect(typeof decision.latencyMs).toBe('number');
  });

  it('falls back safely when not ready', async () => {
    const context: GameContextForLLM = {
      handCards: [CARD_3D, 4, 8],
      opponentCounts: [13, 13, 13],
      isOpeningMove: true,
      isFreshTrick: true,
    };

    const decision = await manager.generateDecision(context);
    expect(decision.action).toBe('play');
    expect(decision.source).toBe('fallback');
  });
});
