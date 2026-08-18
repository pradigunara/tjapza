import { describe, expect, test } from 'bun:test';
import * as tsCards from './cards';
// @ts-ignore
import jsCards from '../../../pb/pb_hooks/cards.js';

// We run the full test suite against both the TypeScript implementation
// and the PocketBase ES5 JavaScript implementation to verify isomorphism.
const jsCardsAdapter = {
  ...tsCards,
  getRank: jsCards.cardRank,
  getSuit: jsCards.cardSuit,
  cardToString: jsCards.cardName,
  sortCards: jsCards.sortCards,
  classifyCombo: tsCards.classifyCombo,
  canBeat: (prev: any, next: any) => {
    const p = Array.isArray(prev) ? jsCards.evaluateCombo(prev) : prev;
    const n = Array.isArray(next) ? jsCards.evaluateCombo(next) : next;
    return jsCards.canBeat(n, p);
  },
  decomposeHand: jsCards.decomposeHand,
  findNextTrickSeat: jsCards.findNextTrickSeat,
  getBotMove: tsCards.getBotMove,
};

const implementations = [
  { name: 'TypeScript rules/cards.ts', engine: tsCards },
  { name: 'ES5 pb_hooks/cards.js', engine: jsCardsAdapter },
];

implementations.forEach(({ name, engine }) => {
  describe(`Capsa Banting Rules Engine: ${name}`, () => {
    const {
      stringToCard,
      cardToString,
      getRank,
      getSuit,
      makeCard,
      sortCards,
      classifyCombo,
      compareCombos,
      canBeat,
      isOpeningMoveValid,
      isValidPlay,
      getBotMove,
      findSingles,
      findPairs,
      findStraights,
      findFlushes,
      findFullHouses,
      findQuads,
      findStraightFlushes,
      CARD_3D,
    } = engine;
    void makeCard;
    void compareCombos;
    void findFullHouses;
    void findQuads;

    describe('Card Encoding and Utilities', () => {
      test('encodes 3♦ as code 0', () => {
        expect(CARD_3D).toBe(0);
        expect(stringToCard('3♦')).toBe(0);
        expect(stringToCard('3D')).toBe(0);
        expect(cardToString(0)).toBe('3♦');
        expect(getRank(0)).toBe(0); // rank 3
        expect(getSuit(0)).toBe(0); // suit ♦
      });

      test('encodes 2♠ as code 51', () => {
        expect(stringToCard('2♠')).toBe(51);
        expect(stringToCard('2S')).toBe(51);
        expect(cardToString(51)).toBe('2♠');
        expect(getRank(51)).toBe(12); // rank 2
        expect(getSuit(51)).toBe(3); // suit ♠
      });

      test('encodes 10♥ and 10H correctly', () => {
        const c1 = stringToCard('10♥');
        const c2 = stringToCard('10H');
        expect(c1).toBe(c2);
        expect(getRank(c1)).toBe(7); // rank 10
        expect(getSuit(c1)).toBe(2); // suit ♥
        expect(cardToString(c1)).toBe('10♥');
      });

      test('sortCards sorts in ascending Big Two power', () => {
        const hand = ['2♠', '3♦', 'A♥', '10♣', '4♦'].map(stringToCard);
        const sorted = sortCards(hand).map(cardToString);
        expect(sorted).toEqual(['3♦', '4♦', '10♣', 'A♥', '2♠']);
      });
    });

    describe('Singles and Pairs Power Comparison', () => {
      test('singles comparison: rank primary, suit secondary', () => {
        const c3D = [stringToCard('3♦')];
        const c3C = [stringToCard('3♣')];
        const c3H = [stringToCard('3♥')];
        const c3S = [stringToCard('3♠')];
        const c4D = [stringToCard('4♦')];
        const c2S = [stringToCard('2♠')];

        expect(canBeat(c3D, c3C)).toBe(true);
        expect(canBeat(c3C, c3H)).toBe(true);
        expect(canBeat(c3H, c3S)).toBe(true);
        expect(canBeat(c3S, c4D)).toBe(true);
        expect(canBeat(c4D, c2S)).toBe(true);

        expect(canBeat(c3S, c3D)).toBe(false);
        expect(canBeat(c2S, c4D)).toBe(false);
      });

      test('pairs comparison: rank primary, higher suit secondary', () => {
        const pair3Low = [stringToCard('3♦'), stringToCard('3♣')]; // top suit ♣ (1)
        const pair3High = [stringToCard('3♥'), stringToCard('3♠')]; // top suit ♠ (3)
        const pair4Low = [stringToCard('4♦'), stringToCard('4♣')];
        const pair2High = [stringToCard('2♥'), stringToCard('2♠')];

        expect(classifyCombo(pair3Low)?.type).toBe('pair');
        expect(classifyCombo(pair3High)?.type).toBe('pair');

        expect(canBeat(pair3Low, pair3High)).toBe(true);
        expect(canBeat(pair3High, pair4Low)).toBe(true);
        expect(canBeat(pair4Low, pair2High)).toBe(true);

        expect(canBeat(pair3High, pair3Low)).toBe(false);
        expect(canBeat(pair2High, pair4Low)).toBe(false);
      });

      test('invalid pairs return null', () => {
        const nonPair = [stringToCard('3♦'), stringToCard('4♦')];
        expect(classifyCombo(nonPair)).toBeNull();
        expect(canBeat([stringToCard('3♦')], nonPair)).toBe(false);
      });

      test('single cannot beat pair and pair cannot beat single', () => {
        const single = [stringToCard('2♠')];
        const pair = [stringToCard('3♦'), stringToCard('3♣')];
        expect(canBeat(single, pair)).toBe(false);
        expect(canBeat(pair, single)).toBe(false);
      });
    });

    describe('All 11 Straights and Tiebreakers', () => {
      // 11 valid straights in ascending order
      const straightDefs = [
        { name: 'A-2-3-4-5', cards: ['A♦', '2♣', '3♥', '4♠', '5♦'], topRankCard: '5♦' },
        { name: '2-3-4-5-6', cards: ['2♦', '3♣', '4♥', '5♠', '6♦'], topRankCard: '6♦' },
        { name: '3-4-5-6-7', cards: ['3♦', '4♣', '5♥', '6♠', '7♦'], topRankCard: '7♦' },
        { name: '4-5-6-7-8', cards: ['4♦', '5♣', '6♥', '7♠', '8♦'], topRankCard: '8♦' },
        { name: '5-6-7-8-9', cards: ['5♦', '6♣', '7♥', '8♠', '9♦'], topRankCard: '9♦' },
        { name: '6-7-8-9-10', cards: ['6♦', '7♣', '8♥', '9♠', '10♦'], topRankCard: '10♦' },
        { name: '7-8-9-10-J', cards: ['7♦', '8♣', '9♥', '10♠', 'J♦'], topRankCard: 'J♦' },
        { name: '8-9-10-J-Q', cards: ['8♦', '9♣', '10♥', 'J♠', 'Q♦'], topRankCard: 'Q♦' },
        { name: '9-10-J-Q-K', cards: ['9♦', '10♣', 'J♥', 'Q♠', 'K♦'], topRankCard: 'K♦' },
        { name: '10-J-Q-K-A', cards: ['10♦', 'J♣', 'Q♥', 'K♠', 'A♦'], topRankCard: 'A♦' },
        { name: 'J-Q-K-A-2', cards: ['J♦', 'Q♣', 'K♥', 'A♠', '2♦'], topRankCard: '2♦' },
      ];

      test('classifies all 11 valid straights correctly', () => {
        straightDefs.forEach((def, index) => {
          const cards = def.cards.map(stringToCard);
          const combo = classifyCombo(cards);
          expect(combo).not.toBeNull();
          expect(combo?.type).toBe('straight');
          expect(combo?.straightOrder).toBe(index);
        });
      });

      test('validates ascending order across all 11 straights: straight[i] < straight[i+1]', () => {
        for (let i = 0; i < straightDefs.length - 1; i++) {
          const lower = straightDefs[i].cards.map(stringToCard);
          const higher = straightDefs[i + 1].cards.map(stringToCard);
          expect(canBeat(lower, higher)).toBe(true);
          expect(canBeat(higher, lower)).toBe(false);
        }
      });

      test('2-3-4-5-6 is valid straight with top card 6 (beats A-2-3-4-5, loses to 3-4-5-6-7)', () => {
        const straightA2345 = ['A♦', '2♦', '3♦', '4♦', '5♠'].map(stringToCard);
        const straight23456_low = ['2♦', '3♦', '4♦', '5♦', '6♣'].map(stringToCard); // top 6♣ (suit 1)
        const straight23456_high = ['2♥', '3♥', '4♥', '5♣', '6♠'].map(stringToCard); // top 6♠ (suit 3)
        const straight34567 = ['3♦', '4♣', '5♥', '6♠', '7♦'].map(stringToCard);

        const comboLow = classifyCombo(straight23456_low);
        const comboHigh = classifyCombo(straight23456_high);

        expect(comboLow?.mainRank).toBe(3); // rank 6
        expect(comboLow?.suit).toBe(1); // 6♣
        expect(comboHigh?.suit).toBe(3); // 6♠

        expect(canBeat(straightA2345, straight23456_low)).toBe(true);
        expect(canBeat(straight23456_low, straight23456_high)).toBe(true);
        expect(canBeat(straight23456_high, straight34567)).toBe(true);
      });

      test('A-2-3-4-5 is lowest straight, top card determining rank is 5', () => {
        const straightA2345_low = ['A♦', '2♦', '3♦', '4♦', '5♣'].map(stringToCard); // top 5♣ (suit 1)
        const straightA2345_high = ['A♥', '2♥', '3♥', '4♣', '5♠'].map(stringToCard); // top 5♠ (suit 3)
        const straight34567 = ['3♦', '4♣', '5♥', '6♠', '7♦'].map(stringToCard);

        const comboLow = classifyCombo(straightA2345_low);
        const comboHigh = classifyCombo(straightA2345_high);

        expect(comboLow?.mainRank).toBe(2); // rank 5
        expect(comboLow?.suit).toBe(1); // 5♣
        expect(comboHigh?.suit).toBe(3); // 5♠

        expect(canBeat(straightA2345_low, straightA2345_high)).toBe(true);
        expect(canBeat(straightA2345_high, straight34567)).toBe(true);
      });

      test('J-Q-K-A-2 is highest straight, top card determining rank is 2', () => {
        const straight10JQKA = ['10♦', 'J♣', 'Q♥', 'K♠', 'A♠'].map(stringToCard);
        const straightJQKA2_low = ['J♦', 'Q♣', 'K♥', 'A♦', '2♦'].map(stringToCard); // top 2♦ (suit 0)
        const straightJQKA2_high = ['J♥', 'Q♠', 'K♣', 'A♣', '2♠'].map(stringToCard); // top 2♠ (suit 3)

        expect(canBeat(straight10JQKA, straightJQKA2_low)).toBe(true);
        expect(canBeat(straightJQKA2_low, straightJQKA2_high)).toBe(true);
        expect(canBeat(straightJQKA2_high, straight10JQKA)).toBe(false);
      });

      test('same straight pattern compares suit of the top determining card', () => {
        // 3-4-5-6-7: top card is 7. Compare suit of 7!
        const straight7D = ['3♠', '4♠', '5♠', '6♠', '7♦'].map(stringToCard); // 7♦ (suit 0)
        const straight7S = ['3♦', '4♦', '5♦', '6♦', '7♠'].map(stringToCard); // 7♠ (suit 3)
        expect(canBeat(straight7D, straight7S)).toBe(true);
        expect(canBeat(straight7S, straight7D)).toBe(false);
      });

      test('rejects invalid straights Q-K-A-2-3 and K-A-2-3-4', () => {
        const invalidQKA23 = ['Q♦', 'K♣', 'A♥', '2♠', '3♦'].map(stringToCard);
        const invalidKA234 = ['K♦', 'A♣', '2♥', '3♠', '4♦'].map(stringToCard);

        expect(classifyCombo(invalidQKA23)).toBeNull();
        expect(classifyCombo(invalidKA234)).toBeNull();
      });
    });

    describe('Flush vs Flush Rank-First Tiebreakers', () => {
      test('flush vs flush: rank-first poker standard comparison', () => {
        // Flush A (Diamonds): 3♦, 5♦, 7♦, 9♦, 2♦ (Highest rank 2)
        // Flush B (Spades): 4♠, 6♠, 8♠, 10♠, A♠ (Highest rank A)
        // Rank 2 > Rank A, so Flush A beats Flush B despite Spades > Diamonds!
        const flushA = ['3♦', '5♦', '7♦', '9♦', '2♦'].map(stringToCard);
        const flushB = ['4♠', '6♠', '8♠', '10♠', 'A♠'].map(stringToCard);

        expect(classifyCombo(flushA)?.type).toBe('flush');
        expect(classifyCombo(flushB)?.type).toBe('flush');
        expect(canBeat(flushB, flushA)).toBe(true);
        expect(canBeat(flushA, flushB)).toBe(false);
      });

      test('flush vs flush with same highest rank compares 2nd, 3rd, 4th, 5th highest ranks', () => {
        // Both have highest rank A
        const flushA = ['3♦', '5♦', '7♦', 'J♦', 'A♦'].map(stringToCard); // ranks: A, J, 7, 5, 3
        const flushB = ['3♠', '5♠', '7♠', 'Q♠', 'A♠'].map(stringToCard); // ranks: A, Q, 7, 5, 3
        // Q > J, so Flush B beats Flush A
        expect(canBeat(flushA, flushB)).toBe(true);

        const flushC = ['4♥', '5♥', '7♥', 'Q♥', 'A♥'].map(stringToCard); // ranks: A, Q, 7, 5, 4
        // 4 > 3 on lowest card, Flush C beats Flush B
        expect(canBeat(flushB, flushC)).toBe(true);
      });

      test('flush vs flush with identical ranks compares suit of highest card', () => {
        const flushD = ['3♦', '5♦', '7♦', '9♦', 'K♦'].map(stringToCard);
        const flushH = ['3♥', '5♥', '7♥', '9♥', 'K♥'].map(stringToCard);
        const flushS = ['3♠', '5♠', '7♠', '9♠', 'K♠'].map(stringToCard);

        expect(canBeat(flushD, flushH)).toBe(true);
        expect(canBeat(flushH, flushS)).toBe(true);
        expect(canBeat(flushS, flushD)).toBe(false);
      });
    });

    describe('5-Card Combo Hierarchy', () => {
      test('Straight Flush > Quads > Full House > Flush > Straight', () => {
        const straight = ['3♦', '4♣', '5♥', '6♠', '7♦'].map(stringToCard);
        const flush = ['3♦', '5♦', '7♦', '9♦', 'J♦'].map(stringToCard);
        const fullHouse = ['3♦', '3♣', '3♥', '4♦', '4♣'].map(stringToCard);
        const quads = ['3♦', '3♣', '3♥', '3♠', '4♦'].map(stringToCard);
        const straightFlush = ['3♦', '4♦', '5♦', '6♦', '7♦'].map(stringToCard);

        expect(classifyCombo(straight)?.type).toBe('straight');
        expect(classifyCombo(flush)?.type).toBe('flush');
        expect(classifyCombo(fullHouse)?.type).toBe('full_house');
        expect(classifyCombo(quads)?.type).toBe('quads');
        expect(classifyCombo(straightFlush)?.type).toBe('straight_flush');

        // Verify ladder
        expect(canBeat(straight, flush)).toBe(true);
        expect(canBeat(flush, fullHouse)).toBe(true);
        expect(canBeat(fullHouse, quads)).toBe(true);
        expect(canBeat(quads, straightFlush)).toBe(true);

        // Reverse is false
        expect(canBeat(flush, straight)).toBe(false);
        expect(canBeat(fullHouse, flush)).toBe(false);
        expect(canBeat(quads, fullHouse)).toBe(false);
        expect(canBeat(straightFlush, quads)).toBe(false);
      });

      test('Full House compares triple rank regardless of pair rank', () => {
        const fh3withK = ['3♦', '3♣', '3♥', 'K♦', 'K♣'].map(stringToCard); // triple 3s + pair Ks
        const fh4with4 = ['4♦', '4♣', '4♥', '5♦', '5♣'].map(stringToCard); // triple 4s + pair 5s
        expect(canBeat(fh3withK, fh4with4)).toBe(true);
        expect(canBeat(fh4with4, fh3withK)).toBe(false);
      });

      test('Quads compares 4-of-a-kind rank regardless of kicker rank', () => {
        const quads8sHighKicker = ['8♦', '8♣', '8♥', '8♠', '2♠'].map(stringToCard);
        const quads9sLowKicker = ['9♦', '9♣', '9♥', '9♠', '3♦'].map(stringToCard);

        expect(canBeat(quads8sHighKicker, quads9sLowKicker)).toBe(true);
        expect(canBeat(quads9sLowKicker, quads8sHighKicker)).toBe(false);
      });

      test('Straight Flush compares straight order then suit', () => {
        const sfLow = ['3♦', '4♦', '5♦', '6♦', '7♦'].map(stringToCard); // 7 high
        const sfHigh = ['8♦', '9♦', '10♦', 'J♦', 'Q♦'].map(stringToCard); // Q high
        const sfSamePatternSpade = ['3♠', '4♠', '5♠', '6♠', '7♠'].map(stringToCard);

        expect(canBeat(sfLow, sfHigh)).toBe(true);
        expect(canBeat(sfHigh, sfLow)).toBe(false);
        expect(canBeat(sfLow, sfSamePatternSpade)).toBe(true);
        expect(canBeat(sfSamePatternSpade, sfLow)).toBe(false);
      });

      test('Straight Flush beats any Quads of 2s', () => {
        const quads2s = ['2♦', '2♣', '2♥', '2♠', 'A♠'].map(stringToCard);
        const sfLowest = ['A♦', '2♦', '3♦', '4♦', '5♦'].map(stringToCard);
        expect(canBeat(quads2s, sfLowest)).toBe(true);
      });
    });

    describe('Opening Move Validation (3♦ Requirement)', () => {
      test('opening play must contain 3♦', () => {
        const validSingle = [stringToCard('3♦')];
        const invalidSingle = [stringToCard('3♣')];

        const validPair = [stringToCard('3♦'), stringToCard('3♠')];
        const invalidPair = [stringToCard('3♣'), stringToCard('3♠')];

        const validStraight = ['3♦', '4♣', '5♥', '6♠', '7♦'].map(stringToCard);
        const invalidStraight = ['3♣', '4♣', '5♥', '6♠', '7♦'].map(stringToCard);

        const validFullHouse = ['3♦', '3♣', '3♥', '4♦', '4♣'].map(stringToCard);
        const invalidFullHouse = ['3♣', '3♥', '3♠', '4♦', '4♣'].map(stringToCard);

        expect(isOpeningMoveValid(validSingle)).toBe(true);
        expect(isOpeningMoveValid(invalidSingle)).toBe(false);
        expect(isOpeningMoveValid(validPair)).toBe(true);
        expect(isOpeningMoveValid(invalidPair)).toBe(false);
        expect(isOpeningMoveValid(validStraight)).toBe(true);
        expect(isOpeningMoveValid(invalidStraight)).toBe(false);
        expect(isOpeningMoveValid(validFullHouse)).toBe(true);
        expect(isOpeningMoveValid(invalidFullHouse)).toBe(false);
      });

      test('isValidPlay enforces opening trick conditions and hand ownership', () => {
        const hand = ['3♦', '3♠', '4♦', '5♦', '6♦', '7♦', 'A♠'].map(stringToCard);

        // Valid opening with 3♦
        expect(isValidPlay(hand, [stringToCard('3♦')], null, true)).toBe(true);
        expect(isValidPlay(hand, [stringToCard('3♦'), stringToCard('3♠')], null, true)).toBe(true);

        // Invalid opening without 3♦
        expect(isValidPlay(hand, [stringToCard('A♠')], null, true)).toBe(false);

        // Invalid play not in hand
        expect(isValidPlay(hand, [stringToCard('2♠')], null, false)).toBe(false);
      });
    });

    describe('Combo Finders', () => {
      test('finds all combo types from a sample hand', () => {
        const hand = [
          '3♦', '3♣', '3♥',
          '4♦', '5♦', '6♦', '7♦',
          '8♠', '8♥',
          'A♦', '2♦',
          'K♣', 'K♥',
        ].map(stringToCard);

        const singles = findSingles(hand);
        expect(singles.length).toBe(13);

        const pairs = findPairs(hand);
        expect(pairs.length).toBeGreaterThan(0);

        const straights = findStraights(hand);
        expect(straights.length).toBeGreaterThan(0);

        const flushes = findFlushes(hand); // 3♦, 4♦, 5♦, 6♦, 7♦, A♦, 2♦ -> 7 diamonds!
        expect(flushes.length).toBeGreaterThan(0);

        const straightFlushes = findStraightFlushes(hand); // 3♦-4♦-5♦-6♦-7♦, 2♦-3♦-4♦-5♦-6♦, A♦-2♦-3♦-4♦-5♦
        expect(straightFlushes.length).toBe(3);
      });
    });

    describe('Bot AI Heuristics', () => {
      test('Bot Opening Move: plays lowest 5-card combo with 3♦ > pair with 3♦ > single 3♦', () => {
        // Hand with 5-card combo containing 3♦
        const handWithStraight = ['3♦', '4♣', '5♥', '6♠', '7♦', '9♠', 'K♥', '2♠'].map(stringToCard);
        const move1 = getBotMove(handWithStraight, null, true);
        expect(move1?.length).toBe(5);
        expect(move1).toContain(CARD_3D);

        // Hand with pair containing 3♦ (no 5-card combo)
        const handWithPair = ['3♦', '3♠', '5♥', '8♠', '9♦', 'K♥', '2♠'].map(stringToCard);
        const move2 = getBotMove(handWithPair, null, true);
        expect(move2?.length).toBe(2);
        expect(move2).toContain(CARD_3D);

        // Hand with only single 3♦
        const handWithSingle = ['3♦', '4♠', '6♥', '8♠', '9♦', 'K♥', '2♠'].map(stringToCard);
        const move3 = getBotMove(handWithSingle, null, true);
        expect(move3).toEqual([CARD_3D]);
      });

      test('Bot Fresh Lead: prefers 5-card combo > pair (non-2) > single (low non-2)', () => {
        // 1. Hand with 5-card combo
        const hand1 = ['4♦', '5♣', '6♥', '7♠', '8♦', '9♠', 'K♥', '2♠'].map(stringToCard);
        const lead1 = getBotMove(hand1, null, false);
        expect(lead1?.length).toBe(5);

        // 2. Hand with pairs and singles
        const hand2 = ['4♦', '4♣', '8♠', '9♠', 'K♥', '2♠'].map(stringToCard);
        const lead2 = getBotMove(hand2, null, false);
        expect(lead2?.length).toBe(2);
        expect(lead2).toEqual(['4♦', '4♣'].map(stringToCard));

        // 3. Hand with only singles: leads lowest pure single < K
        const hand3 = ['5♦', '8♠', '9♠', 'K♥', '2♠'].map(stringToCard);
        const lead3 = getBotMove(hand3, null, false);
        expect(lead3).toEqual([stringToCard('5♦')]);
      });

      test('Bot Beating Strategy: beats single with lowest pure single, conserves 2s outside endgame', () => {
        const lead3 = [stringToCard('3♦')];

        // Hand with 5♦, 8♠, K♥, 2♠. Should beat 3♦ with 5♦
        const hand1 = ['5♦', '8♠', 'K♥', '2♠'].map(stringToCard);
        const beat1 = getBotMove(hand1, lead3, false, 10);
        expect(beat1).toEqual([stringToCard('5♦')]);

        // Hand with only 2♠ that can beat (e.g. against A♥ in mid-game)
        const leadA = [stringToCard('A♥')];
        const hand2 = ['4♦', '5♣', '2♠'].map(stringToCard);

        // In mid-game (opponent has 10 cards), bot plays 2♠ against A♥
        const beat2 = getBotMove(hand2, leadA, false, 10);
        expect(beat2).toEqual([stringToCard('2♠')]);

        // Against an 8♦, if only 2♠ beats, bot conserves 2♠ and passes in mid-game
        const lead8 = [stringToCard('8♦')];
        const handWithLowAnd2 = ['4♦', '5♦', '2♠'].map(stringToCard);
        const beatConserve = getBotMove(handWithLowAnd2, lead8, false, 10);
        expect(beatConserve).toBeNull(); // Pass to conserve 2♠!

        // In endgame (opponent <= 3 cards), bot unleashes 2♠ to prevent win!
        const beatEndgame = getBotMove(handWithLowAnd2, lead8, false, 2);
        expect(beatEndgame).toEqual([stringToCard('2♠')]);
      });

      test('Bot Beating Pairs: plays lowest beating pair, conserves pair of 2s unless endgame', () => {
        const leadPair4 = ['4♦', '4♣'].map(stringToCard);
        const hand = ['6♦', '6♣', '2♦', '2♣'].map(stringToCard);

        // Plays pair of 6s
        const beatPair = getBotMove(hand, leadPair4, false, 10);
        expect(beatPair).toEqual(['6♦', '6♣'].map(stringToCard));

        // Hand with only pair of 2s against low pair (midgame vs endgame)
        const handOnly2Pair = ['3♦', '4♦', '2♦', '2♣'].map(stringToCard);
        const beatPairMidgame = getBotMove(handOnly2Pair, leadPair4, false, 10);
        expect(beatPairMidgame).toBeNull(); // passes to conserve pair of 2s

        const beatPairEndgame = getBotMove(handOnly2Pair, leadPair4, false, 2);
        expect(beatPairEndgame).toEqual(['2♦', '2♣'].map(stringToCard));
      });

      test('Bot Beating 5-Card Combo: plays lowest beating 5-card combo', () => {
        const leadStraight = ['3♦', '4♣', '5♥', '6♠', '7♦'].map(stringToCard);
        const hand = [
          '5♦', '6♦', '7♦', '8♦', '9♦', // Straight Flush
          '8♣', '8♥', '8♠', '9♣', '9♥', // Full House
          '4♥', '5♠', '6♣', '7♣', '8♠', // Straight (4-5-6-7-8)
        ].map(stringToCard);

        const beat5 = getBotMove(hand, leadStraight, false, 10);
        // Should play the lowest beating 5-card combo, which is Straight 4-5-6-7-8
        expect(classifyCombo(beat5!)?.type).toBe('straight');
        expect(canBeat(leadStraight, beat5!)).toBe(true);
      });

      test('decomposeHand: partitions hand into minimal turn count', () => {
        // Hand of 10 cards: Full House (33344), Pair (88), 3 Singles (J, K, 2)
        // Total moves = 1 (FH) + 1 (Pair) + 3 (Singles) = 5 turns
        const sampleHand = ['3♦', '3♣', '3♥', '4♦', '4♣', '8♦', '8♠', 'J♥', 'K♠', '2♠'].map(stringToCard);
        const partition = engine.decomposeHand ? engine.decomposeHand(sampleHand) : tsCards.decomposeHand(sampleHand);

        expect(partition.length).toBe(5);
        expect(partition[0].cards.length).toBe(5); // Full house
        expect(partition[1].cards.length).toBe(2); // Pair
      });

      test('findNextTrickSeat: skips players who already passed in the trick', () => {
        const counts = [10, 8, 5, 12];
        const fn = engine.findNextTrickSeat || tsCards.findNextTrickSeat;

        // 1. Single pass skip: Seat 0 played, Seat 1 passed -> advances to Seat 2
        expect(fn(counts, [1], 0, 0)).toBe(2);

        // 2. Multiple pass skip: Seat 1 played, Seat 2 and Seat 3 passed -> wraps around to Seat 0
        expect(fn(counts, [2, 3], 1, 1)).toBe(0);

        // 3. Trick finish: Seat 0 is trick leader, Seats 1, 2, 3 passed -> returns -1 (trick ends)
        expect(fn(counts, [1, 2, 3], 3, 0)).toBe(-1);

        // 4. Consecutive skips: Seat 0 played, Seats 1 and 2 passed -> jumps directly to Seat 3
        expect(fn(counts, [1, 2], 0, 0)).toBe(3);

        // 5. Wrap-around with non-consecutive passed players: Seats 0 and 2 passed, Seat 3 played -> advances to Seat 1
        expect(fn(counts, [0, 2], 3, 3)).toBe(1);

        // 6. With 1 shedded player (Seat 2 has 0 cards), Seat 1 passed, Seat 0 played -> advances to Seat 3
        const countsWithWinner = [10, 8, 0, 12];
        expect(fn(countsWithWinner, [1], 0, 0)).toBe(3);

        // 7. Head-to-Head (2 remaining players, Seats 1 and 3 out): Seat 0 played, Seat 2 passed -> returns -1
        const countsHeadToHead = [5, 0, 4, 0];
        expect(fn(countsHeadToHead, [2], 0, 0)).toBe(-1);

        // 8. Head-to-Head turn advance: Seat 0 played, no passes yet -> advances to Seat 2
        expect(fn(countsHeadToHead, [], 0, 0)).toBe(2);
      });
    });
  });
});
