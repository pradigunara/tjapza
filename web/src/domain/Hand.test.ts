import { describe, expect, test } from 'bun:test';
import { Card, Hand } from './index';

describe('Hand Entity & Combo Finders', () => {
  test('finds all combo types from a sample hand', () => {
    const hand = new Hand([
      '3♦', '4♦', '5♦', '6♦', '7♦',
      '3♣', '3♥',
      '8♠', '8♥',
      'A♦', '2♦',
      'K♣', 'K♥',
    ].map(Card.fromString));

    expect(hand.size).toBe(13);
    expect(hand.findSingles().length).toBe(13);
    expect(hand.findPairs().length).toBeGreaterThan(0);
    expect(hand.findStraights().length).toBeGreaterThan(0);
    expect(hand.findFlushes().length).toBeGreaterThan(0);
    expect(hand.findStraightFlushes().length).toBe(3);
  });

  test('decomposes hand into minimal turns', () => {
    const hand = new Hand([
      '3♦', '4♦', '5♦', '6♦', '7♦', // Straight flush
      '8♠', '8♥',                   // Pair
      'A♦', 'A♣',                   // Pair
      '2♠', '2♥',                   // Pair
      'K♣', 'Q♦',                   // 2 singles
    ].map(Card.fromString));

    const partition = hand.decompose();
    expect(partition.length).toBe(6);
  });
});
