import { describe, it, expect } from 'bun:test';
import { Card } from '../domain/Card';
import { CardCombo } from '../domain/CardCombo';
import { Hand } from '../domain/Hand';
import { Trick } from '../domain/Trick';
import { CARD_3D } from '../domain/constants';
import { validateAndFinalizeMove, LLMBotValidator } from './LLMBotValidator';
import type { RawLLMDecision } from './types';

describe('LLMBotValidator', () => {
  const card3D = Card.fromString('3D'); // 0
  const card3H = Card.fromString('3H'); // 2
  const card4C = Card.fromString('4C'); // 5
  const card10S = Card.fromString('10S'); // 31
  const cardJH = Card.fromString('JH'); // 34
  const cardJS = Card.fromString('JS'); // 35
  const cardKS = Card.fromString('KS'); // 43
  const card2S = Card.fromString('2S'); // 51

  describe('Valid LLM Moves (source: llm)', () => {
    it('accepts valid opening move containing 3♦', () => {
      const hand = new Hand([card3D, card3H, card10S, card2S]);
      const trick = Trick.createFresh(0);
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['3D'] };

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: true,
      });

      expect(decision.source).toBe('llm');
      expect(decision.action).toBe('play');
      expect(decision.cards).toEqual([CARD_3D]);
      expect(decision.combo?.type).toBe('single');
    });

    it('accepts valid opening pair containing 3♦', () => {
      const hand = new Hand([card3D, card3H, card10S]);
      const trick = Trick.createFresh(0);
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['3D', '3H'] };

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: true,
      });

      expect(decision.source).toBe('llm');
      expect(decision.action).toBe('play');
      expect(decision.cards).toEqual([card3D.code, card3H.code]);
      expect(decision.combo?.type).toBe('pair');
    });

    it('accepts valid fresh trick lead', () => {
      const hand = new Hand([card4C, card10S, card2S]);
      const trick = Trick.createFresh(0);
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['4C'] };

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: false,
      });

      expect(decision.source).toBe('llm');
      expect(decision.action).toBe('play');
      expect(decision.cards).toEqual([card4C.code]);
    });

    it('accepts valid move beating an active trick combo', () => {
      const hand = new Hand([card4C, card10S, cardKS, card2S]);
      const currentCombo = CardCombo.evaluate([card10S])!;
      const trick = new Trick({ lastCombo: currentCombo, lastPlaySeatIndex: 1 });
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['KS'] };

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: false,
      });

      expect(decision.source).toBe('llm');
      expect(decision.action).toBe('play');
      expect(decision.cards).toEqual([cardKS.code]);
    });

    it('accepts valid pass on active trick', () => {
      const hand = new Hand([card4C, card10S]);
      const currentCombo = CardCombo.evaluate([card2S])!;
      const trick = new Trick({ lastCombo: currentCombo, lastPlaySeatIndex: 1 });
      const rawDecision: RawLLMDecision = { action: 'pass', cards: [] };

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: false,
      });

      expect(decision.source).toBe('llm');
      expect(decision.action).toBe('pass');
      expect(decision.cards).toEqual([]);
    });

    it('LLMBotValidator static method works equivalently', () => {
      const hand = new Hand([card4C]);
      const trick = Trick.createFresh(0);
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['4C'] };

      const decision = LLMBotValidator.validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
      });

      expect(decision.source).toBe('llm');
      expect(decision.cards).toEqual([card4C.code]);
    });
  });

  describe('Invalid LLM Moves with Fallback (source: fallback)', () => {
    it('falls back on null or malformed rawDecision', () => {
      const hand = new Hand([card3D, card4C]);
      const trick = Trick.createFresh(0);

      const decision = validateAndFinalizeMove({
        rawDecision: null,
        hand,
        trick,
        isOpeningMove: true,
      });

      expect(decision.source).toBe('fallback');
      expect(decision.action).toBe('play');
      expect(decision.cards).toContain(CARD_3D);
    });

    it('falls back if LLM tries to pass on opening move', () => {
      const hand = new Hand([card3D, card4C]);
      const trick = Trick.createFresh(0);
      const rawDecision: RawLLMDecision = { action: 'pass', cards: [] };

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: true,
      });

      expect(decision.source).toBe('fallback');
      expect(decision.action).toBe('play');
      expect(decision.cards).toContain(CARD_3D);
    });

    it('falls back if LLM plays cards not containing 3♦ on opening move', () => {
      const hand = new Hand([card3D, card4C, card10S]);
      const trick = Trick.createFresh(0);
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['4C'] };

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: true,
      });

      expect(decision.source).toBe('fallback');
      expect(decision.action).toBe('play');
      expect(decision.cards).toContain(CARD_3D);
    });

    it('falls back if LLM tries to pass on fresh trick', () => {
      const hand = new Hand([card4C, card10S]);
      const trick = Trick.createFresh(0);
      const rawDecision: RawLLMDecision = { action: 'pass', cards: [] };

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: false,
      });

      expect(decision.source).toBe('fallback');
      expect(decision.action).toBe('play');
      expect(decision.cards.length).toBeGreaterThan(0);
    });

    it('falls back if LLM hallucinated cards not in hand', () => {
      const hand = new Hand([card4C, card10S]);
      const trick = Trick.createFresh(0);
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['2S'] }; // hand doesn't have 2S

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: false,
      });

      expect(decision.source).toBe('fallback');
      expect(decision.action).toBe('play');
      expect(hand.hasCards(decision.cards)).toBe(true);
    });

    it('falls back if LLM outputs invalid card strings', () => {
      const hand = new Hand([card4C]);
      const trick = Trick.createFresh(0);
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['INVALID_CARD'] };

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: false,
      });

      expect(decision.source).toBe('fallback');
      expect(decision.action).toBe('play');
    });

    it('falls back if LLM plays invalid combo structure (e.g. 3 cards or unmatched pair)', () => {
      const hand = new Hand([card4C, card10S, card2S]);
      const trick = Trick.createFresh(0);
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['4C', '10S'] }; // Not a pair

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: false,
      });

      expect(decision.source).toBe('fallback');
      expect(decision.action).toBe('play');
    });

    it('falls back if LLM plays a combo that cannot beat current trick', () => {
      const hand = new Hand([card4C, card10S]);
      const currentCombo = CardCombo.evaluate([cardKS])!; // Table has King
      const trick = new Trick({ lastCombo: currentCombo, lastPlaySeatIndex: 1 });
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['10S'] }; // 10 cannot beat King

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: false,
      });

      expect(decision.source).toBe('fallback');
      // Should fall back to BotEngine which decides to pass when it cannot beat King
      expect(decision.action).toBe('pass');
    });

    it('falls back if LLM plays wrong card count against active trick', () => {
      const hand = new Hand([cardJH, cardJS, cardKS]);
      const currentSingle = CardCombo.evaluate([card10S])!;
      const trick = new Trick({ lastCombo: currentSingle, lastPlaySeatIndex: 1 });
      const rawDecision: RawLLMDecision = { action: 'play', cards: ['JH', 'JS'] }; // Pair against Single

      const decision = validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove: false,
      });

      expect(decision.source).toBe('fallback');
      expect(decision.action).toBe('play');
      expect(decision.cards.length).toBe(1); // BotEngine plays single
    });
  });
});
