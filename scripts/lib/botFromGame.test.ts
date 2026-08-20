import { describe, expect, test } from 'bun:test';
import { CARD_3D } from '../../web/src/domain';
import { decideBotMoveFromGame } from './botFromGame';

describe('decideBotMoveFromGame', () => {
  test('treats empty last_combo.cards as a fresh lead, not an opening pile', () => {
    const hand = [4, 8, 12]; // no 3♦, so this must not be treated as the game opener
    const decision = decideBotMoveFromGame(
      { last_combo: { cards: [] }, counts: [10, 10, 10, 10] },
      hand,
      0
    );
    expect(decision.action).toBe('play');
    expect(decision.cards.length).toBeGreaterThan(0);
  });

  test('opening deal with empty pile requires 3♦', () => {
    const decision = decideBotMoveFromGame(
      { last_combo: null, counts: [13, 13, 13, 13] },
      [CARD_3D, 4, 8],
      0
    );
    expect(decision.action).toBe('play');
    expect(decision.cards.some((c) => c.code === CARD_3D)).toBe(true);
  });
});
