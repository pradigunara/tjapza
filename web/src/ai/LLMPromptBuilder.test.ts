import { describe, it, expect } from 'bun:test';
import { Card } from '../domain/Card';
import { CardCombo } from '../domain/CardCombo';
import { CARD_3D } from '../domain/constants';
import {
  formatCard,
  formatCardList,
  formatTrickCombo,
  buildSystemPrompt,
  buildUserPrompt,
  buildPrompt,
  parseResponse,
  LLMPromptBuilder,
} from './LLMPromptBuilder';
import type { GameContextForLLM } from './types';

describe('LLMPromptBuilder', () => {
  describe('formatCard & formatCardList', () => {
    it('formats card codes and Card instances into clean notations (3D, 10S, 2S)', () => {
      expect(formatCard(CARD_3D)).toBe('3D');
      expect(formatCard(new Card(0))).toBe('3D');
      expect(formatCard(31)).toBe('10S'); // Rank 7 (10), Suit 3 (S)
      expect(formatCard(51)).toBe('2S');  // Rank 12 (2), Suit 3 (S)
      expect(formatCard(Card.fromString('AH'))).toBe('AH');
      expect(formatCard(Card.fromString('4C'))).toBe('4C');
    });

    it('formats and sorts card lists in ascending order', () => {
      const formatted = formatCardList([51, 0, 31, 6]); // 2S, 3D, 10S, 4H
      expect(formatted).toBe('3D, 4H, 10S, 2S');
    });
  });

  describe('formatTrickCombo', () => {
    it('formats null/undefined as fresh trick indicator', () => {
      expect(formatTrickCombo(null)).toContain('fresh trick');
      expect(formatTrickCombo(undefined)).toContain('fresh trick');
    });

    it('formats single, pair, and 5-card combos', () => {
      const single = CardCombo.evaluate([Card.fromString('10S')])!;
      expect(formatTrickCombo(single)).toBe('SINGLE [10S] (10♠)');

      const pair = CardCombo.evaluate([Card.fromString('9H'), Card.fromString('9S')])!;
      expect(formatTrickCombo(pair)).toBe('PAIR [9H, 9S] (Pair of 9s)');

      const straight = CardCombo.evaluate([
        Card.fromString('3D'),
        Card.fromString('4C'),
        Card.fromString('5H'),
        Card.fromString('6S'),
        Card.fromString('7D'),
      ])!;
      expect(formatTrickCombo(straight)).toContain('STRAIGHT');
      expect(formatTrickCombo(straight)).toContain('3D, 4C, 5H, 6S, 7D');
    });
  });

  describe('Prompt Generation', () => {
    it('buildSystemPrompt includes Capsa rules, rank hierarchy, and schema', () => {
      const systemPrompt = buildSystemPrompt();
      expect(systemPrompt).toContain('Capsa Banting');
      expect(systemPrompt).toContain('3 < 4 < 5');
      expect(systemPrompt).toContain('D (Diamonds) < C (Clubs)');
      expect(systemPrompt).toContain('Opening Move: You MUST play a valid combination containing 3D');
      expect(systemPrompt).toContain('{"action": "play", "cards": ["3D"]}');
    });

    it('buildUserPrompt handles opening move context', () => {
      const context: GameContextForLLM = {
        handCards: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48],
        trickCombo: undefined,
        opponentCounts: [13, 13, 13],
        isOpeningMove: true,
        isFreshTrick: true,
      };

      const userPrompt = buildUserPrompt(context);
      expect(userPrompt).toContain('Opening move: MUST play a combination containing 3D');
      expect(userPrompt).toContain('Opponent Card Counts: [13, 13, 13]');
      expect(userPrompt).toContain('3D');
    });

    it('buildUserPrompt handles active trick context', () => {
      const trickCombo = CardCombo.evaluate([Card.fromString('9S')])!;
      const context: GameContextForLLM = {
        handCards: [31, 47, 51], // 10S, AS, 2S
        trickCombo,
        opponentCounts: [8, 5, 2],
        isOpeningMove: false,
        isFreshTrick: false,
      };

      const userPrompt = buildUserPrompt(context);
      expect(userPrompt).toContain('Active trick: Must beat SINGLE [9S]');
      expect(userPrompt).toContain('Opponent Card Counts: [8, 5, 2]');
    });

    it('buildPrompt wraps system and user prompts in LFM2.5 chat template format', () => {
      const context: GameContextForLLM = {
        handCards: [0, 1, 2],
        trickCombo: undefined,
        opponentCounts: [13, 13, 13],
        isOpeningMove: true,
        isFreshTrick: true,
      };

      const fullPrompt = buildPrompt(context);
      expect(fullPrompt.startsWith('<|start_of_role|>system<|end_of_role|>')).toBe(true);
      expect(fullPrompt).toContain('<|start_of_role|>user<|end_of_role|>');
      expect(fullPrompt.endsWith('<|start_of_role|>assistant<|end_of_role|>')).toBe(true);
    });

    it('static LLMPromptBuilder methods mirror standalone functions', () => {
      const context: GameContextForLLM = {
        handCards: [0],
        opponentCounts: [10],
        isOpeningMove: false,
        isFreshTrick: true,
      };
      expect(LLMPromptBuilder.buildPrompt(context)).toBe(buildPrompt(context));
    });
  });

  describe('parseResponse', () => {
    it('parses pure JSON play action', () => {
      const raw = '{"action": "play", "cards": ["3D", "3H"]}';
      const parsed = parseResponse(raw);
      expect(parsed).toEqual({ action: 'play', cards: ['3D', '3H'] });
    });

    it('parses pure JSON pass action', () => {
      const raw = '{"action": "pass", "cards": []}';
      const parsed = parseResponse(raw);
      expect(parsed).toEqual({ action: 'pass', cards: [] });
    });

    it('handles markdown code block fences (json and untagged)', () => {
      const withJson = '```json\n{\n  "action": "play",\n  "cards": ["10S"]\n}\n```';
      expect(parseResponse(withJson)).toEqual({ action: 'play', cards: ['10S'] });

      const withoutJson = '```\n{"action": "pass", "cards": []}\n```';
      expect(parseResponse(withoutJson)).toEqual({ action: 'pass', cards: [] });
    });

    it('handles surrounding conversational text and whitespace', () => {
      const raw = 'I will play the lowest card here:\n\n{"action": "play", "cards": ["4C"]}\n\nGood luck!';
      expect(parseResponse(raw)).toEqual({ action: 'play', cards: ['4C'] });
    });

    it('normalizes action case and card casing', () => {
      const raw = '{"action": "PLAY", "cards": ["3d", "10s", "2s"]}';
      expect(parseResponse(raw)).toEqual({ action: 'play', cards: ['3D', '10S', '2S'] });
    });

    it('returns null on invalid / unparseable outputs', () => {
      expect(parseResponse('')).toBeNull();
      expect(parseResponse('I want to pass')).toBeNull();
      expect(parseResponse('{"action": "invalid"}')).toBeNull();
      expect(parseResponse('{"action": "play"}')).toBeNull();
      expect(parseResponse('{"action": "play", "cards": "3D"}')).toBeNull();
      expect(parseResponse('{"action": "play", "cards": ["X"]}')).toBeNull();
      expect(parseResponse('{"foo": "bar"}')).toBeNull();
    });
  });
});
