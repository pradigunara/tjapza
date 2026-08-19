import { describe, expect, test } from 'bun:test';
import { Card, CardCombo } from './index';

describe('CardCombo Entity & Power Comparison', () => {
  describe('Singles & Pairs Power & Tiebreakers', () => {
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

      expect(p3Low.canBeat(p3High)).toBe(false);
      expect(p4Low.canBeat(p2High)).toBe(false);
    });
  });

  describe('Scenario D: 5-Card Combo Hierarchy & Tiebreakers', () => {
    test('compares 5-card combo tier hierarchy: Straight Flush > Quads > Full House > Flush > Straight', () => {
      const straight = CardCombo.evaluate(['J♦', 'Q♣', 'K♥', 'A♠', '2♦'].map(Card.fromString))!;
      const flush = CardCombo.evaluate(['3♦', '5♦', '8♦', '10♦', 'K♦'].map(Card.fromString))!;
      const fullHouse = CardCombo.evaluate(['3♦', '3♣', '3♥', '4♦', '4♣'].map(Card.fromString))!;
      const quads = CardCombo.evaluate(['2♦', '2♣', '2♥', '2♠', '3♦'].map(Card.fromString))!;
      const straightFlush = CardCombo.evaluate(['3♦', '4♦', '5♦', '6♦', '7♦'].map(Card.fromString))!;

      // Ascending dominance
      expect(flush.canBeat(straight)).toBe(true);
      expect(fullHouse.canBeat(flush)).toBe(true);
      expect(quads.canBeat(fullHouse)).toBe(true);
      expect(straightFlush.canBeat(quads)).toBe(true);

      // Inverse cannot beat
      expect(straight.canBeat(flush)).toBe(false);
      expect(flush.canBeat(fullHouse)).toBe(false);
      expect(fullHouse.canBeat(quads)).toBe(false);
      expect(quads.canBeat(straightFlush)).toBe(false);
    });

    test('evaluates all 11 straight patterns in ascending hierarchy', () => {
      const straightDefs = [
        { name: 'A-2-3-4-5', cards: ['A♦', '2♣', '3♥', '4♠', '5♦'] }, // order 0 (lowest)
        { name: '2-3-4-5-6', cards: ['2♦', '3♣', '4♥', '5♠', '6♦'] }, // order 1
        { name: '3-4-5-6-7', cards: ['3♦', '4♣', '5♥', '6♠', '7♦'] }, // order 2
        { name: '4-5-6-7-8', cards: ['4♦', '5♣', '6♥', '7♠', '8♦'] }, // order 3
        { name: '5-6-7-8-9', cards: ['5♦', '6♣', '7♥', '8♠', '9♦'] }, // order 4
        { name: '6-7-8-9-10', cards: ['6♦', '7♣', '8♥', '9♠', '10♦'] }, // order 5
        { name: '7-8-9-10-J', cards: ['7♦', '8♣', '9♥', '10♠', 'J♦'] }, // order 6
        { name: '8-9-10-J-Q', cards: ['8♦', '9♣', '10♥', 'J♠', 'Q♦'] }, // order 7
        { name: '9-10-J-Q-K', cards: ['9♦', '10♣', 'J♥', 'Q♠', 'K♦'] }, // order 8
        { name: '10-J-Q-K-A', cards: ['10♦', 'J♣', 'Q♥', 'K♠', 'A♦'] }, // order 9
        { name: 'J-Q-K-A-2', cards: ['J♦', 'Q♣', 'K♥', 'A♠', '2♦'] }, // order 10 (highest)
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

      // Straight Order 10 (J-Q-K-A-2) beats Order 9 (10-J-Q-K-A)
      expect(combos[10].canBeat(combos[9])).toBe(true);
      // Straight Order 10 beats Order 0 (A-2-3-4-5)
      expect(combos[10].canBeat(combos[0])).toBe(true);
      // Straight Order 1 beats Order 0
      expect(combos[1].canBeat(combos[0])).toBe(true);
    });

    test('Straight tiebreaker: identical straight pattern breaks tie by top card suit', () => {
      // Pattern 0: A-2-3-4-5 (top card is 5)
      const s0Diamonds = CardCombo.evaluate(['A♦', '2♦', '3♦', '4♦', '5♦'].map(Card.fromString))!; // flush if same suit, make it straight by mixing suits
      const s0_5D = CardCombo.evaluate(['A♣', '2♥', '3♠', '4♣', '5♦'].map(Card.fromString))!;
      const s0_5S = CardCombo.evaluate(['A♦', '2♣', '3♥', '4♦', '5♠'].map(Card.fromString))!;
      expect(s0_5S.canBeat(s0_5D)).toBe(true);
      expect(s0_5D.canBeat(s0_5S)).toBe(false);

      // Pattern 9: 10-J-Q-K-A (top card is A)
      const s9_AH = CardCombo.evaluate(['10♦', 'J♣', 'Q♦', 'K♣', 'A♥'].map(Card.fromString))!;
      const s9_AS = CardCombo.evaluate(['10♣', 'J♦', 'Q♥', 'K♦', 'A♠'].map(Card.fromString))!;
      expect(s9_AS.canBeat(s9_AH)).toBe(true);
      expect(s9_AH.canBeat(s9_AS)).toBe(false);

      // Pattern 10: J-Q-K-A-2 (top card is 2)
      const s10_2D = CardCombo.evaluate(['J♣', 'Q♥', 'K♠', 'A♣', '2♦'].map(Card.fromString))!;
      const s10_2S = CardCombo.evaluate(['J♦', 'Q♣', 'K♥', 'A♦', '2♠'].map(Card.fromString))!;
      expect(s10_2S.canBeat(s10_2D)).toBe(true);
      expect(s10_2D.canBeat(s10_2S)).toBe(false);

      // Higher pattern with lower suit (Order 10 with 2♦) beats Lower pattern with higher suit (Order 9 with A♠)
      expect(s10_2D.canBeat(s9_AS)).toBe(true);
    });

    test('Flush tiebreaker: rank-first descending comparison before suit', () => {
      // 1. Top rank difference: Ace-high flush beats King-high flush regardless of suit
      const flushAceDiamonds = CardCombo.evaluate(['3♦', '4♦', '6♦', '8♦', 'A♦'].map(Card.fromString))!;
      const flushKingSpades = CardCombo.evaluate(['4♠', '5♠', '7♠', '9♠', 'K♠'].map(Card.fromString))!;
      expect(flushAceDiamonds.canBeat(flushKingSpades)).toBe(true);
      expect(flushKingSpades.canBeat(flushAceDiamonds)).toBe(false);

      // 2. 2nd rank difference: Ace-King flush beats Ace-Queen flush
      const flushAK = CardCombo.evaluate(['3♦', '4♦', '6♦', 'K♦', 'A♦'].map(Card.fromString))!;
      const flushAQ = CardCombo.evaluate(['4♠', '5♠', '7♠', 'Q♠', 'A♠'].map(Card.fromString))!;
      expect(flushAK.canBeat(flushAQ)).toBe(true);
      expect(flushAQ.canBeat(flushAK)).toBe(false);

      // 3. 3rd rank difference: A-K-9 beats A-K-8
      const flushAK9 = CardCombo.evaluate(['3♦', '4♦', '9♦', 'K♦', 'A♦'].map(Card.fromString))!;
      const flushAK8 = CardCombo.evaluate(['3♠', '4♠', '8♠', 'K♠', 'A♠'].map(Card.fromString))!;
      expect(flushAK9.canBeat(flushAK8)).toBe(true);
      expect(flushAK8.canBeat(flushAK9)).toBe(false);

      // 4. 4th rank difference: A-K-9-7 beats A-K-9-6
      const flushAK97 = CardCombo.evaluate(['3♦', '7♦', '9♦', 'K♦', 'A♦'].map(Card.fromString))!;
      const flushAK96 = CardCombo.evaluate(['3♠', '6♠', '9♠', 'K♠', 'A♠'].map(Card.fromString))!;
      expect(flushAK97.canBeat(flushAK96)).toBe(true);
      expect(flushAK96.canBeat(flushAK97)).toBe(false);

      // 5. 5th rank difference: A-K-9-7-5 beats A-K-9-7-4
      const flushAK975 = CardCombo.evaluate(['5♦', '7♦', '9♦', 'K♦', 'A♦'].map(Card.fromString))!;
      const flushAK974 = CardCombo.evaluate(['4♠', '7♠', '9♠', 'K♠', 'A♠'].map(Card.fromString))!;
      expect(flushAK975.canBeat(flushAK974)).toBe(true);
      expect(flushAK974.canBeat(flushAK975)).toBe(false);

      // 6. Identical 5 ranks: suit tiebreak (Spades > Diamonds)
      const flushRanksD = CardCombo.evaluate(['3♦', '5♦', '7♦', '9♦', 'J♦'].map(Card.fromString))!;
      const flushRanksS = CardCombo.evaluate(['3♠', '5♠', '7♠', '9♠', 'J♠'].map(Card.fromString))!;
      expect(flushRanksS.canBeat(flushRanksD)).toBe(true);
      expect(flushRanksD.canBeat(flushRanksS)).toBe(false);
    });

    test('Full House tiebreaker: triple rank dominates over pair rank', () => {
      // 4s full of 3s vs 3s full of 2s
      const fh4sFullOf3s = CardCombo.evaluate(['4♦', '4♣', '4♥', '3♦', '3♣'].map(Card.fromString))!;
      const fh3sFullOf2s = CardCombo.evaluate(['3♠', '3♥', '3♦', '2♠', '2♥'].map(Card.fromString))!;
      expect(fh4sFullOf3s.canBeat(fh3sFullOf2s)).toBe(true);
      expect(fh3sFullOf2s.canBeat(fh4sFullOf3s)).toBe(false);

      // Triple 2s full of 3s beats Triple As full of Ks (2s are highest in Big Two)
      const fh2sFull = CardCombo.evaluate(['2♦', '2♣', '2♥', '3♦', '3♣'].map(Card.fromString))!;
      const fhAsFull = CardCombo.evaluate(['A♦', 'A♣', 'A♥', 'K♦', 'K♣'].map(Card.fromString))!;
      expect(fh2sFull.canBeat(fhAsFull)).toBe(true);
      expect(fhAsFull.canBeat(fh2sFull)).toBe(false);
    });

    test('Quads tiebreaker: 4-of-a-kind rank dominates', () => {
      const quads4s = CardCombo.evaluate(['4♦', '4♣', '4♥', '4♠', '3♦'].map(Card.fromString))!;
      const quads3s = CardCombo.evaluate(['3♦', '3♣', '3♥', '3♠', '2♠'].map(Card.fromString))!;
      expect(quads4s.canBeat(quads3s)).toBe(true);
      expect(quads3s.canBeat(quads4s)).toBe(false);

      const quads2s = CardCombo.evaluate(['2♦', '2♣', '2♥', '2♠', '3♦'].map(Card.fromString))!;
      const quadsAs = CardCombo.evaluate(['A♦', 'A♣', 'A♥', 'A♠', 'K♦'].map(Card.fromString))!;
      expect(quads2s.canBeat(quadsAs)).toBe(true);
      expect(quadsAs.canBeat(quads2s)).toBe(false);
    });

    test('Straight Flush tiebreaker: pattern order then suit', () => {
      // Order 10 straight flush (J-Q-K-A-2 of Spades) beats Order 9 straight flush (10-J-Q-K-A of Spades)
      const sfOrder10 = CardCombo.evaluate(['J♠', 'Q♠', 'K♠', 'A♠', '2♠'].map(Card.fromString))!;
      const sfOrder9 = CardCombo.evaluate(['10♠', 'J♠', 'Q♠', 'K♠', 'A♠'].map(Card.fromString))!;
      expect(sfOrder10.canBeat(sfOrder9)).toBe(true);
      expect(sfOrder9.canBeat(sfOrder10)).toBe(false);

      // Same pattern order (3-4-5-6-7): Spades beats Diamonds
      const sf34567Spades = CardCombo.evaluate(['3♠', '4♠', '5♠', '6♠', '7♠'].map(Card.fromString))!;
      const sf34567Diamonds = CardCombo.evaluate(['3♦', '4♦', '5♦', '6♦', '7♦'].map(Card.fromString))!;
      expect(sf34567Spades.canBeat(sf34567Diamonds)).toBe(true);
      expect(sf34567Diamonds.canBeat(sf34567Spades)).toBe(false);
    });
  });
});

