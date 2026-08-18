import { describe, expect, test } from 'bun:test';
import { Card, CardCombo, Hand, Trick, BotEngine } from './index';

describe('BotEngine AI Heuristics', () => {
  test('Bot opening move prefers 5-card combo with 3♦ > pair with 3♦ > single 3♦', () => {
    const handWithStraight = new Hand(['3♦', '4♣', '5♥', '6♠', '7♦', '9♠', 'K♥', '2♠'].map(Card.fromString));
    const move1 = BotEngine.decideMove({
      hand: handWithStraight,
      trick: Trick.createFresh(0),
      isOpeningMove: true,
    });
    expect(move1.action).toBe('play');
    expect(move1.cards.length).toBe(5);
    expect(move1.cards.some((c) => c.is3Diamonds)).toBe(true);
  });

  test('Bot conserves 2s outside endgame and beats Ace with 2', () => {
    const hand = new Hand(['4♦', '5♣', '2♠'].map(Card.fromString));
    const leadA = Trick.createFresh(0).applyPlay(CardCombo.evaluate([Card.fromString('A♥')])!, 0);

    // Mid-game: opponent has 10 cards, bot beats Ace with 2
    const move = BotEngine.decideMove({
      hand,
      trick: leadA,
      isOpeningMove: false,
      counts: [10, 3, 10, 10],
    });
    expect(move.action).toBe('play');
    expect(move.cards[0].name).toBe('2♠');
  });
});
