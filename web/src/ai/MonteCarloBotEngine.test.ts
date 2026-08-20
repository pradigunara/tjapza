import { describe, expect, test } from 'bun:test';
import { Card, CardCombo, Hand, Trick, CARD_3D } from '../domain';
import { MonteCarloBotEngine } from './MonteCarloBotEngine';

describe('MonteCarloBotEngine', () => {
  test('returns opening move containing 3♦ on opening', () => {
    const hand = new Hand([CARD_3D, 4, 8, 12, 16, 20, 24]);
    const trick = Trick.createFresh(0);
    const decision = MonteCarloBotEngine.decideMove({
      hand,
      trick,
      isOpeningMove: true,
      options: { rolloutsPerMove: 5 },
    });

    expect(decision.action).toBe('play');
    expect(decision.cards.some((c) => c.code === CARD_3D)).toBe(true);
  });

  test('plays direct instant win move when 1 combo remaining', () => {
    // Hand has a single Pair of 9s [24, 25] (9♦, 9♣)
    const hand = new Hand([24, 25]);
    const trick = Trick.createFresh(0);
    const decision = MonteCarloBotEngine.decideMove({
      hand,
      trick,
      isOpeningMove: false,
      options: { rolloutsPerMove: 5 },
    });

    expect(decision.action).toBe('play');
    expect(decision.cards.length).toBe(2);
  });

  test('returns pass when no legal beating combo exists', () => {
    const hand = new Hand([0, 4, 8]); // 3♦, 4♦, 5♦
    const activeCombo = CardCombo.evaluate([Card.fromCode(51)])!; // 2♠ (unbeatable single)
    const trick = new Trick({ lastCombo: activeCombo, leaderSeatIndex: 0 });

    const decision = MonteCarloBotEngine.decideMove({
      hand,
      trick,
      isOpeningMove: false,
      options: { rolloutsPerMove: 5 },
    });

    expect(decision.action).toBe('pass');
    expect(decision.cards).toEqual([]);
  });
});
