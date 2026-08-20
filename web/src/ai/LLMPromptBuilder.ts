import { Card } from '../domain/Card';
import { CardCombo } from '../domain/CardCombo';
import { Hand } from '../domain/Hand';
import { SUIT_NAMES } from '../domain/constants';
import type { GameContextForLLM, RawLLMDecision } from './types';

/**
 * Formats a single card (or card code) into standard short notation: e.g. '3D', '10S', '2S'.
 */
export function formatCard(card: Card | number): string {
  const c = typeof card === 'number' ? new Card(card) : card;
  const suitLetter = SUIT_NAMES[c.suit];
  return `${c.rankName}${suitLetter}`;
}

/**
 * Formats an array of cards (or card codes) into a comma-separated list of short notations.
 */
export function formatCardList(cards: (Card | number)[]): string {
  return Card.sort(cards.map((c) => (typeof c === 'number' ? new Card(c) : c)))
    .map((c) => formatCard(c))
    .join(', ');
}

/**
 * Formats a CardCombo into a readable string for LLM context.
 */
export function formatTrickCombo(combo?: CardCombo | null): string {
  if (!combo) {
    return 'None (Table is empty - fresh trick)';
  }
  const cardsStr = combo.cards.map((c) => formatCard(c)).join(', ');
  return `${combo.type.toUpperCase()} [${cardsStr}] (${combo.description})`;
}

/**
 * Builds concise, high-signal system prompt for Capsa Banting (Big Two) LFM2.5-230M model.
 */
export function buildSystemPrompt(): string {
  return [
    'You are an expert AI player for Capsa Banting (Big Two card game).',
    'Rules:',
    '- Rank order (low to high): 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2.',
    '- Suit order (low to high): D (Diamonds) < C (Clubs) < H (Hearts) < S (Spades).',
    '- Valid combinations: Single (1 card), Pair (2 same rank), 5-Card combo (Straight, Flush, Full House, Quads, Straight Flush).',
    '- Move constraints:',
    '  * Opening Move: You MUST play a valid combination containing 3D (3 of Diamonds). You cannot pass.',
    '  * Fresh Trick (table empty): You MUST lead a valid combination from your hand. You cannot pass.',
    '  * Active Trick (table has play): Play a HIGHER combination of the EXACT SAME count/type (or higher tier 5-card combo), OR pass.',
    '- Master Strategies (Top-2 Ensemble):',
    '  1. Dynamic Equity: If hand power is strong (multiple 2s / 5-card combos), aggressively seize tempo and hunt for 1st place.',
    '  2. Anti-4th Defense: If hand is weak, dump bulk early, shed cards to escape double penalty (>=10 cards), and block downstream leads.',
    '  3. Combo Integrity: Prioritize playing orphan singles first. Never break natural pairs or 5-card combos for weak singles.',
    '  4. M. Lee Rule: On fresh leads with boss card (2S) + small singles, lead the intermediate card to draw out stoppers before closing.',
    '  5. Direct Out: If your remaining hand can be completely cleared in an unstoppable sequence, execute it immediately.',
    '- Response format: Return ONLY a valid JSON object matching this schema:',
    '  {"action": "play", "cards": ["3D"]} or {"action": "pass", "cards": []}',
    'Do not include reasoning or markdown outside the JSON block.',
  ].join('\n');
}

/**
 * Builds user prompt from current game context.
 */
export function buildUserPrompt(context: GameContextForLLM): string {
  const hand = Hand.fromCodes(context.handCards);
  const handStr = formatCardList(context.handCards);
  const trickStr = formatTrickCombo(context.trickCombo);
  const oppStr = context.opponentCounts.join(', ');

  const decomposed = hand.decompose();
  const natural5s = decomposed.filter((c) => c.is5CardCombo).map((c) => `${c.type}: [${c.cards.map(formatCard).join(', ')}]`);
  const naturalPairs = decomposed.filter((c) => c.type === 'pair').map((c) => `[${c.cards.map(formatCard).join(', ')}]`);
  const orphanSingles = decomposed.filter((c) => c.type === 'single').map((c) => formatCard(c.cards[0]));

  const constraints: string[] = [];
  if (context.isOpeningMove) {
    constraints.push('Opening move: MUST play a combination containing 3D.');
  } else if (context.isFreshTrick || !context.trickCombo) {
    constraints.push('Fresh trick: MUST lead a combination from your hand (cannot pass).');
  } else {
    constraints.push(`Active trick: Must beat ${trickStr} or pass.`);
  }

  const lines = [
    `Your Hand: [${handStr}]`,
    `Hand Structure: 5-Cards: [${natural5s.join(', ')}], Pairs: [${naturalPairs.join(', ')}], Orphan Singles: [${orphanSingles.join(', ')}]`,
    `Current Trick: ${trickStr}`,
    `Opponent Card Counts: [${oppStr}]`,
  ];

  if (constraints.length > 0) {
    lines.push(`Constraint: ${constraints.join(' ')}`);
  }

  lines.push('Output your move as JSON:');

  return lines.join('\n');
}

/**
 * Builds full chat prompt for Liquid AI LFM2.5-230M using standard role tokens:
 * <|start_of_role|>system<|end_of_role|>...<|start_of_role|>user<|end_of_role|>...<|start_of_role|>assistant<|end_of_role|>
 */
export function buildPrompt(context: GameContextForLLM): string {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(context);
  return `<|start_of_role|>system<|end_of_role|>${system}<|start_of_role|>user<|end_of_role|>${user}<|start_of_role|>assistant<|end_of_role|>`;
}

/**
 * Parses JSON response from raw model output.
 * Handles markdown code blocks, extra whitespace, and extracts action & cards.
 */
export function parseResponse(raw: string): RawLLMDecision | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  let text = raw.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // Find outermost JSON object {...}
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const jsonSubstring = text.substring(firstBrace, lastBrace + 1);

  try {
    const parsed = JSON.parse(jsonSubstring);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const rawAction = parsed.action;
    if (typeof rawAction !== 'string') {
      return null;
    }

    const action = rawAction.toLowerCase().trim();
    if (action !== 'play' && action !== 'pass') {
      return null;
    }

    if (action === 'pass') {
      return { action: 'pass', cards: [] };
    }

    const rawCards = parsed.cards;
    if (!Array.isArray(rawCards)) {
      return null;
    }

    const cards: string[] = [];
    for (const c of rawCards) {
      if (typeof c !== 'string') {
        return null;
      }
      const trimmed = c.trim().toUpperCase();
      if (trimmed.length < 2) {
        return null;
      }
      cards.push(trimmed);
    }

    return { action: 'play', cards };
  } catch {
    return null;
  }
}

export class LLMPromptBuilder {
  public static formatCard(card: Card | number): string {
    return formatCard(card);
  }

  public static formatCardList(cards: (Card | number)[]): string {
    return formatCardList(cards);
  }

  public static formatTrickCombo(combo?: CardCombo | null): string {
    return formatTrickCombo(combo);
  }

  public static buildSystemPrompt(): string {
    return buildSystemPrompt();
  }

  public static buildUserPrompt(context: GameContextForLLM): string {
    return buildUserPrompt(context);
  }

  public static buildPrompt(context: GameContextForLLM): string {
    return buildPrompt(context);
  }

  public static parseResponse(raw: string): RawLLMDecision | null {
    return parseResponse(raw);
  }
}

