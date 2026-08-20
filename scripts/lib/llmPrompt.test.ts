import { describe, it, expect } from 'bun:test';
import {
  Card,
  CardCombo,
  Hand,
  Trick,
  CapsaGame,
  CARD_3D,
} from '../../web/src/domain';
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseLlmResponse,
  validateLlmMove,
  simulateMockLlmDecision,
  decideLlmMove,
} from './llmPrompt';

describe('LLM Prompt and Decision Engine', () => {
  it('builds clear system and user prompts with complete game state', () => {
    const system = buildSystemPrompt();
    expect(system).toContain('Capsa Banting');
    expect(system).toContain('Rank Order');
    expect(system).toContain('OPENING MOVE');

    const hand = new Hand([CARD_3D, 4, 8, 12, 16]); // 3D, 4D, 5D, 6D, 7D
    const game = new CapsaGame({
      id: 'test-game',
      status: 'playing',
      counts: [13, 13, 13, 13],
      turnIndex: 0,
      leaderIndex: 0,
      trick: Trick.createFresh(0),
    });

    const userPrompt = buildUserPrompt({
      game,
      hand,
      seatIndex: 0,
      seatName: 'LLM Bot 0',
    });

    expect(userPrompt).toContain('LLM Bot 0');
    expect(userPrompt).toContain('3♦');
    expect(userPrompt).toContain('OPENING MOVE');
    expect(userPrompt).toContain('CANDIDATE LEGAL MOVES');
  });

  it('parses diverse JSON response formats safely', () => {
    // 1. Markdown code fence with numeric cards
    const raw1 = '```json\n{"reasoning": "Play 3D opening", "action": "play", "cards": [0]}\n```';
    const p1 = parseLlmResponse(raw1);
    expect(p1.action).toBe('play');
    expect(p1.cards).toEqual([0]);
    expect(p1.reasoning).toBe('Play 3D opening');

    // 2. Raw JSON with string cards
    const raw2 = '{"action": "play", "cards": ["3D", "4D", "5D", "6D", "7D"]}';
    const p2 = parseLlmResponse(raw2);
    expect(p2.action).toBe('play');
    expect(p2.cards).toEqual([0, 4, 8, 12, 16]);

    // 3. Pass action
    const raw3 = '{"reasoning": "Cannot beat", "action": "pass", "cards": []}';
    const p3 = parseLlmResponse(raw3);
    expect(p3.action).toBe('pass');
    expect(p3.cards).toEqual([]);
  });

  it('validates legal opening move with 3♦', () => {
    const hand = new Hand([CARD_3D, 4, 8]);
    const game = new CapsaGame({
      status: 'playing',
      counts: [13, 13, 13, 13],
      turnIndex: 0,
      leaderIndex: 0,
      trick: Trick.createFresh(0),
    });

    const validParsed = { action: 'play' as const, cards: [CARD_3D], reasoning: 'Open with 3D' };
    const res = validateLlmMove({
      game,
      hand,
      seatIndex: 0,
      parsed: validParsed,
    });

    expect(res.valid).toBe(true);
    expect(res.isFallback).toBe(false);
    expect(res.decision.action).toBe('play');
    expect(res.decision.cards[0].code).toBe(CARD_3D);
  });

  it('catches illegal pass on opening move and falls back to BotEngine', () => {
    const hand = new Hand([CARD_3D, 4, 8]);
    const game = new CapsaGame({
      status: 'playing',
      counts: [13, 13, 13, 13],
      turnIndex: 0,
      leaderIndex: 0,
      trick: Trick.createFresh(0),
    });

    const illegalPass = { action: 'pass' as const, cards: [], reasoning: 'Try to pass opening' };
    const res = validateLlmMove({
      game,
      hand,
      seatIndex: 0,
      parsed: illegalPass,
    });

    expect(res.valid).toBe(false);
    expect(res.isFallback).toBe(true);
    expect(res.illegalReason).toBe('illegal_pass_on_opening');
    expect(res.decision.action).toBe('play'); // Heuristic plays valid opening containing 3♦
    expect(res.decision.cards.some((c) => c.code === CARD_3D)).toBe(true);
  });

  it('catches hallucinated cards not in hand and falls back to BotEngine', () => {
    const hand = new Hand([4, 8, 12]);
    const game = new CapsaGame({
      status: 'playing',
      counts: [3, 10, 10, 10],
      turnIndex: 0,
      leaderIndex: 0,
      trick: Trick.createFresh(0),
    });

    // Hallucinate card code 51 (2♠)
    const hallucinated = { action: 'play' as const, cards: [51], reasoning: 'Play 2 of spades' };
    const res = validateLlmMove({
      game,
      hand,
      seatIndex: 0,
      parsed: hallucinated,
    });

    expect(res.valid).toBe(false);
    expect(res.isFallback).toBe(true);
    expect(res.illegalReason).toBe('cards_not_in_hand');
  });

  it('simulates mock LLM decision seamlessly through pipeline', async () => {
    const hand = new Hand([CARD_3D, 4, 8, 12, 16]); // Straight 3..7
    const game = new CapsaGame({
      status: 'playing',
      counts: [13, 13, 13, 13],
      turnIndex: 0,
      leaderIndex: 0,
      trick: Trick.createFresh(0),
    });

    const result = await decideLlmMove({
      game,
      hand,
      seatIndex: 0,
      mock: true,
    });

    expect(result.valid).toBe(true);
    expect(result.isFallback).toBe(false);
    expect(result.decision.action).toBe('play');
    expect(result.decision.cards.some((c) => c.code === CARD_3D)).toBe(true);
  });
});
