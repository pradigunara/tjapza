import { describe, it, expect, beforeEach } from 'bun:test';
import { ModelManager } from './ModelManager';
import { CARD_3D, Trick } from '../domain';
import type { AdvancedBotContext } from './types';

describe('ModelManager (Monte Carlo Search Engine)', () => {
  let manager: ModelManager;

  beforeEach(() => {
    manager = new ModelManager();
  });

  it('starts unloaded and transitions immediately to ready upon initialization', () => {
    expect(manager.getStatus()).toBe('unloaded');
    expect(manager.isReady()).toBe(false);

    let statusEvents: string[] = [];
    manager.onStatusChange((s) => {
      statusEvents.push(s);
    });

    manager.init();

    expect(manager.getStatus()).toBe('ready');
    expect(statusEvents).toContain('ready');
  });

  it('generates MCTS decision when ready', async () => {
    manager.init();

    const context: AdvancedBotContext = {
      handCards: [CARD_3D, 4, 8, 12, 16],
      trick: Trick.createFresh(0),
      opponentCounts: [13, 13, 13],
      isOpeningMove: true,
    };

    const decision = await manager.generateDecision(context, { rolloutsPerMove: 10 });
    expect(decision.action).toBe('play');
    expect(decision.cards.includes(CARD_3D)).toBe(true);
    expect(decision.source).toBe('mcts');
    expect(typeof decision.latencyMs).toBe('number');
  });

  it('falls back safely when not ready', async () => {
    const context: AdvancedBotContext = {
      handCards: [CARD_3D, 4, 8],
      trick: Trick.createFresh(0),
      opponentCounts: [13, 13, 13],
      isOpeningMove: true,
    };

    const decision = await manager.generateDecision(context);
    expect(decision.action).toBe('play');
    expect(decision.source).toBe('fallback');
  });
});
