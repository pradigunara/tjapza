import { describe, expect, test } from 'bun:test';
import { Card, CardCombo } from './index';

describe('CardCombo Entity & Power Comparison', () => {
  test('evaluates singles and compares rank-primary, suit-secondary', () => {
    const c3D = CardCombo.evaluate([Card.fromString('3♦')])!;
    const c3C = CardCombo.evaluate([Card.fromString('3♣')])!;
    const c3H = CardCombo.evaluate([Card.fromString('3♥')])!;
    const c3S = CardCombo.evaluate([Card.fromString('3♠')])!;
    const c4D = CardCombo.evaluate([Card.fromString('4♦')])!;
    const c2S = CardCombo.evaluate([Card.fromString('2♠')])!;

    expect(c3C.canBeat(c3D)).toBe(true);
    expect(c3H.canBeat(c3C)).toBe(true);
    expect(c3S.canBeat(c3H)).toBe(true);
    expect(c4D.canBeat(c3S)).toBe(true);
    expect(c2S.canBeat(c4D)).toBe(true);

    expect(c3D.canBeat(c3S)).toBe(false);
    expect(c4D.canBeat(c2S)).toBe(false);
  });

  test('evaluates pairs and compares rank-primary, top suit secondary', () => {
    const p3Low = CardCombo.evaluate(['3♦', '3♣'].map(Card.fromString))!;
    const p3High = CardCombo.evaluate(['3♥', '3♠'].map(Card.fromString))!;
    const p4Low = CardCombo.evaluate(['4♦', '4♣'].map(Card.fromString))!;
    const p2High = CardCombo.evaluate(['2♥', '2♠'].map(Card.fromString))!;

    expect(p3High.canBeat(p3Low)).toBe(true);
    expect(p4Low.canBeat(p3High)).toBe(true);
    expect(p2High.canBeat(p4Low)).toBe(true);
  });

  test('evaluates all 11 straight patterns in ascending hierarchy', () => {
    const straightDefs = [
      { name: 'A-2-3-4-5', cards: ['A♦', '2♣', '3♥', '4♠', '5♦'] },
      { name: '2-3-4-5-6', cards: ['2♦', '3♣', '4♥', '5♠', '6♦'] },
      { name: '3-4-5-6-7', cards: ['3♦', '4♣', '5♥', '6♠', '7♦'] },
      { name: '4-5-6-7-8', cards: ['4♦', '5♣', '6♥', '7♠', '8♦'] },
      { name: '5-6-7-8-9', cards: ['5♦', '6♣', '7♥', '8♠', '9♦'] },
      { name: '6-7-8-9-10', cards: ['6♦', '7♣', '8♥', '9♠', '10♦'] },
      { name: '7-8-9-10-J', cards: ['7♦', '8♣', '9♥', '10♠', 'J♦'] },
      { name: '8-9-10-J-Q', cards: ['8♦', '9♣', '10♥', 'J♠', 'Q♦'] },
      { name: '9-10-J-Q-K', cards: ['9♦', '10♣', 'J♥', 'Q♠', 'K♦'] },
      { name: '10-J-Q-K-A', cards: ['10♦', 'J♣', 'Q♥', 'K♠', 'A♦'] },
      { name: 'J-Q-K-A-2', cards: ['J♦', 'Q♣', 'K♥', 'A♠', '2♦'] },
    ];

    const combos = straightDefs.map((def, idx) => {
      const c = CardCombo.evaluate(def.cards.map(Card.fromString))!;
      expect(c).not.toBeNull();
      expect(c.type).toBe('straight');
      expect(c.straightOrder).toBe(idx);
      return c;
    });

    for (let i = 0; i < combos.length - 1; i++) {
      expect(combos[i + 1].canBeat(combos[i])).toBe(true);
      expect(combos[i].canBeat(combos[i + 1])).toBe(false);
    }
  });

  test('compares 5-card combo tier hierarchy: Straight Flush > Quads > Full House > Flush > Straight', () => {
    const straight = CardCombo.evaluate(['J♦', 'Q♣', 'K♥', 'A♠', '2♦'].map(Card.fromString))!;
    const flush = CardCombo.evaluate(['3♦', '5♦', '8♦', '10♦', 'K♦'].map(Card.fromString))!;
    const fullHouse = CardCombo.evaluate(['3♦', '3♣', '3♥', '4♦', '4♣'].map(Card.fromString))!;
    const quads = CardCombo.evaluate(['2♦', '2♣', '2♥', '2♠', '3♦'].map(Card.fromString))!;
    const straightFlush = CardCombo.evaluate(['3♦', '4♦', '5♦', '6♦', '7♦'].map(Card.fromString))!;

    expect(flush.canBeat(straight)).toBe(true);
    expect(fullHouse.canBeat(flush)).toBe(true);
    expect(quads.canBeat(fullHouse)).toBe(true);
    expect(straightFlush.canBeat(quads)).toBe(true);
  });
});
