import { describe, expect, test } from 'bun:test';
import { Card, CardCombo, Hand, Trick, BotEngine } from './index';

describe('BotEngine AI Heuristics', () => {
  describe('Scenario E: Opening Move Strategy', () => {
    test('Bot opening move prefers 5-card combo with 3♦ > pair with 3♦ > single 3♦', () => {
      // 1. Hand with straight containing 3♦
      const handWithStraight = new Hand(['3♦', '4♣', '5♥', '6♠', '7♦', '9♠', 'K♥', '2♠'].map(Card.fromString));
      const move1 = BotEngine.decideMove({
        hand: handWithStraight,
        trick: Trick.createFresh(0),
        isOpeningMove: true,
      });
      expect(move1.action).toBe('play');
      expect(move1.cards.length).toBe(5);
      expect(move1.cards.some((c) => c.is3Diamonds)).toBe(true);

      // 2. Hand with pair containing 3♦ (no 5-card combo with 3♦)
      const handWithPair = new Hand(['3♦', '3♠', '7♦', '9♠', 'K♥', '2♠'].map(Card.fromString));
      const move2 = BotEngine.decideMove({
        hand: handWithPair,
        trick: Trick.createFresh(0),
        isOpeningMove: true,
      });
      expect(move2.action).toBe('play');
      expect(move2.cards.length).toBe(2);
      expect(move2.cards.some((c) => c.is3Diamonds)).toBe(true);

      // 3. Hand with single 3♦
      const handWithSingle = new Hand(['3♦', '4♠', '7♦', '9♠', 'K♥', '2♠'].map(Card.fromString));
      const move3 = BotEngine.decideMove({
        hand: handWithSingle,
        trick: Trick.createFresh(0),
        isOpeningMove: true,
      });
      expect(move3.action).toBe('play');
      expect(move3.cards.length).toBe(1);
      expect(move3.cards[0].is3Diamonds).toBe(true);
    });

    test('Bot NEVER passes on opening move across diverse hand compositions', () => {
      const hands = [
        new Hand(['3♦', '2♠'].map(Card.fromString)),
        new Hand(['3♦', '3♣', '3♥', '3♠'].map(Card.fromString)),
        new Hand(['3♦', '4♦', '5♦', '6♦', '7♦'].map(Card.fromString)),
        new Hand(['3♦', 'K♠', 'A♠', '2♠'].map(Card.fromString)),
      ];

      for (const hand of hands) {
        const move = BotEngine.decideMove({
          hand,
          trick: Trick.createFresh(0),
          isOpeningMove: true,
        });
        expect(move.action).toBe('play');
        expect(move.cards.length).toBeGreaterThan(0);
        expect(move.cards.some((c) => c.is3Diamonds)).toBe(true);
      }
    });
  });

  describe('Scenario E: Fresh Trick Lead Strategy', () => {
    test('Bot leads 5-card combo when available on fresh trick', () => {
      const hand = new Hand(['3♣', '4♦', '5♥', '6♠', '7♦', '9♠', 'K♥'].map(Card.fromString));
      const move = BotEngine.decideMove({
        hand,
        trick: Trick.createFresh(1),
        isOpeningMove: false,
      });
      expect(move.action).toBe('play');
      expect(move.cards.length).toBe(5);
      expect(move.combo?.type).toBe('straight');
    });

    test('Bot leads lowest safe pair when no 5-card combo is available', () => {
      const hand = new Hand(['4♦', '4♣', '9♥', '9♠', 'K♥', '2♠'].map(Card.fromString));
      const move = BotEngine.decideMove({
        hand,
        trick: Trick.createFresh(1),
        isOpeningMove: false,
        counts: [10, 6, 10, 10],
      });
      expect(move.action).toBe('play');
      expect(move.cards.length).toBe(2);
      expect(move.cards[0].rankName).toBe('4');
    });

    test('Bot leads lowest safe single when no pairs or 5-card combos are available', () => {
      const hand = new Hand(['4♦', '7♣', '9♥', 'K♠', '2♠'].map(Card.fromString));
      const move = BotEngine.decideMove({
        hand,
        trick: Trick.createFresh(1),
        isOpeningMove: false,
        counts: [10, 5, 10, 10],
      });
      expect(move.action).toBe('play');
      expect(move.cards.length).toBe(1);
      expect(move.cards[0].rankName).toBe('4');
    });

    test('Bot NEVER passes on fresh trick lead even with only 2s or 1 card left', () => {
      const single2Hand = new Hand(['2♠'].map(Card.fromString));
      const move1 = BotEngine.decideMove({
        hand: single2Hand,
        trick: Trick.createFresh(2),
        isOpeningMove: false,
        counts: [10, 10, 1, 10],
      });
      expect(move1.action).toBe('play');
      expect(move1.cards[0].name).toBe('2♠');

      const pair2Hand = new Hand(['2♥', '2♠'].map(Card.fromString));
      const move2 = BotEngine.decideMove({
        hand: pair2Hand,
        trick: Trick.createFresh(2),
        isOpeningMove: false,
        counts: [10, 10, 2, 10],
      });
      expect(move2.action).toBe('play');
      expect(move2.cards.length).toBe(2);
    });
  });

  describe('Scenario E: Beating Heuristics & 2 Conservation', () => {
    test('Bot beats Ace with 2 outside endgame', () => {
      const hand = new Hand(['4♦', '5♣', '2♠'].map(Card.fromString));
      const leadA = Trick.createFresh(0).applyPlay(CardCombo.evaluate([Card.fromString('A♥')])!, 0);

      const move = BotEngine.decideMove({
        hand,
        trick: leadA,
        isOpeningMove: false,
        counts: [10, 3, 10, 10],
      });
      expect(move.action).toBe('play');
      expect(move.cards[0].name).toBe('2♠');
    });

    test('Bot conserves 2 against King outside endgame', () => {
      const hand = new Hand(['4♦', '5♣', '2♠'].map(Card.fromString));
      const leadK = Trick.createFresh(0).applyPlay(CardCombo.evaluate([Card.fromString('K♥')])!, 0);

      // Opponents and bot all have >= 4 cards (no endgame danger)
      const move = BotEngine.decideMove({
        hand,
        trick: leadK,
        isOpeningMove: false,
        counts: [10, 10, 10, 10],
        seatIndex: 1,
      });
      expect(move.action).toBe('pass');
      expect(move.cards).toEqual([]);
    });

    test('Bot uses 2 against King when opponent is in endgame (<= 3 cards)', () => {
      const hand = new Hand(['4♦', '5♣', '2♠'].map(Card.fromString));
      const leadK = Trick.createFresh(0).applyPlay(CardCombo.evaluate([Card.fromString('K♥')])!, 0);

      // Opponent seat 0 has 2 cards left!
      const move = BotEngine.decideMove({
        hand,
        trick: leadK,
        isOpeningMove: false,
        counts: [2, 10, 10, 10],
        seatIndex: 1,
      });
      expect(move.action).toBe('play');
      expect(move.cards[0].name).toBe('2♠');
    });

    test('Bot uses 2 against King when bot itself is in endgame (<= 3 cards)', () => {
      const hand = new Hand(['2♠'].map(Card.fromString));
      const leadK = Trick.createFresh(0).applyPlay(CardCombo.evaluate([Card.fromString('K♥')])!, 0);

      // Bot seat 1 has 1 card left! Opponents have 8+
      const move = BotEngine.decideMove({
        hand,
        trick: leadK,
        isOpeningMove: false,
        counts: [8, 1, 8, 8],
        seatIndex: 1,
      });
      expect(move.action).toBe('play');
      expect(move.cards[0].name).toBe('2♠');
    });

    test('Bot beats 5-card combo with lowest available beating combo', () => {
      // Hand contains a flush and a full house
      const hand = new Hand([
        '3♦', '5♦', '8♦', '10♦', 'K♦', // Flush
        '4♠', '4♥', '4♣', '9♠', '9♥', // Full House
      ].map(Card.fromString));

      const leadStraight = Trick.createFresh(0).applyPlay(
        CardCombo.evaluate(['3♣', '4♣', '5♣', '6♣', '7♦'].map(Card.fromString))!,
        0
      );

      // Should beat straight with lowest winning 5-card combo (Flush < Full House)
      const move = BotEngine.decideMove({
        hand,
        trick: leadStraight,
        isOpeningMove: false,
      });

      expect(move.action).toBe('play');
      expect(move.combo?.type).toBe('flush');
    });

    test('Bot passes when it cannot beat current trick', () => {
      const hand = new Hand(['4♦', '5♣', '6♥'].map(Card.fromString));
      const leadK = Trick.createFresh(0).applyPlay(CardCombo.evaluate([Card.fromString('K♠')])!, 0);

      const move = BotEngine.decideMove({
        hand,
        trick: leadK,
        isOpeningMove: false,
      });
      expect(move.action).toBe('pass');
      expect(move.cards).toEqual([]);
    });
  });
});

