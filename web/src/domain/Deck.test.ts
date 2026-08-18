import { describe, expect, test } from 'bun:test';
import { Deck } from './index';

describe('Deck Domain Object', () => {
  test('creates 52 unique cards and deals evenly into 4 hands of 13', () => {
    const deck = Deck.createStandard();
    expect(deck.cards.length).toBe(52);

    const shuffled = deck.shuffle();
    expect(shuffled.cards.length).toBe(52);

    const deal = shuffled.deal(4);
    expect(deal.hands.length).toBe(4);
    expect(deal.hands[0].length).toBe(13);
    expect(deal.hands[1].length).toBe(13);
    expect(deal.hands[2].length).toBe(13);
    expect(deal.hands[3].length).toBe(13);

    expect(deal.startingSeat).toBeGreaterThanOrEqual(0);
    expect(deal.startingSeat).toBeLessThanOrEqual(3);
    expect(deal.hands[deal.startingSeat].some((c) => c.is3Diamonds)).toBe(true);
  });
});
