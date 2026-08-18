import { describe, expect, test } from 'bun:test';
import {
  Card,
  CARD_3D,
  RANK_3,
  RANK_10,
  RANK_2,
  SUIT_DIAMONDS,
  SUIT_HEARTS,
  SUIT_SPADES,
} from './index';

describe('Card Value Object', () => {
  test('instantiates from code and exposes rank, suit, name, and color', () => {
    const c3D = new Card(CARD_3D);
    expect(c3D.code).toBe(0);
    expect(c3D.rank).toBe(RANK_3);
    expect(c3D.suit).toBe(SUIT_DIAMONDS);
    expect(c3D.name).toBe('3♦');
    expect(c3D.isRed).toBe(true);
    expect(c3D.is3Diamonds).toBe(true);

    const c2S = new Card(51);
    expect(c2S.code).toBe(51);
    expect(c2S.rank).toBe(RANK_2);
    expect(c2S.suit).toBe(SUIT_SPADES);
    expect(c2S.name).toBe('2♠');
    expect(c2S.isRed).toBe(false);
    expect(c2S.is3Diamonds).toBe(false);
  });

  test('parses from string representations correctly', () => {
    expect(Card.fromString('3♦').code).toBe(0);
    expect(Card.fromString('3D').code).toBe(0);
    expect(Card.fromString('10♥').code).toBe(Card.fromRankSuit(RANK_10, SUIT_HEARTS).code);
    expect(Card.fromString('10H').name).toBe('10♥');
    expect(Card.fromString('2♠').code).toBe(51);
  });

  test('sorts cards in ascending Big Two power', () => {
    const cards = ['2♠', '3♦', 'A♥', '10♣', '4♦'].map(Card.fromString);
    const sorted = Card.sort(cards).map((c) => c.name);
    expect(sorted).toEqual(['3♦', '4♦', '10♣', 'A♥', '2♠']);
  });
});
