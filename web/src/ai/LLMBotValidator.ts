import { Card } from '../domain/Card';
import { CardCombo } from '../domain/CardCombo';
import { Hand } from '../domain/Hand';
import { Trick } from '../domain/Trick';
import { BotEngine } from '../domain/BotEngine';
import { CARD_3D } from '../domain/constants';
import type { LLMBotDecision, RawLLMDecision } from './types';

export interface ValidateMoveParams {
  rawDecision: RawLLMDecision | null;
  hand: Hand;
  trick: Trick;
  isOpeningMove?: boolean;
  counts?: number[];
}

/**
 * Validates raw LLM decisions against Capsa Banting domain rules.
 * Automatically falls back to deterministic BotEngine heuristics if the LLM output is invalid.
 */
export function validateAndFinalizeMove(params: ValidateMoveParams): LLMBotDecision {
  const { rawDecision, hand, trick, isOpeningMove = false, counts = [13, 13, 13, 13] } = params;

  const fallback = (): LLMBotDecision => {
    const botMove = BotEngine.decideMove({ hand, trick, isOpeningMove, counts });
    return {
      action: botMove.action,
      cards: botMove.cards.map((c) => c.code),
      combo: botMove.combo,
      source: 'fallback',
    };
  };

  if (!rawDecision || typeof rawDecision !== 'object') {
    return fallback();
  }

  const { action, cards } = rawDecision;

  // 1. Pass move validation
  if (action === 'pass') {
    // Opening move of the game cannot pass (must play combo with 3♦)
    if (isOpeningMove) {
      return fallback();
    }
    // Fresh trick leader cannot pass (must lead a combo)
    if (trick.isFresh) {
      return fallback();
    }
    // Following an active play can always pass
    return {
      action: 'pass',
      cards: [],
      source: 'llm',
    };
  }

  // 2. Play move validation
  if (action === 'play') {
    if (!Array.isArray(cards) || cards.length === 0) {
      return fallback();
    }

    // Parse card strings
    const parsedCards: Card[] = [];
    for (const cardStr of cards) {
      if (typeof cardStr !== 'string') {
        return fallback();
      }
      try {
        parsedCards.push(Card.fromString(cardStr.trim()));
      } catch {
        return fallback();
      }
    }

    // Verify player holds all specified cards in hand (including duplicates/multiplicity)
    if (!hand.hasCards(parsedCards)) {
      return fallback();
    }

    // Evaluate combination validity (1, 2, or 5 valid cards)
    const combo = CardCombo.evaluate(parsedCards);
    if (!combo) {
      return fallback();
    }

    // Opening move must contain 3♦
    if (isOpeningMove && !combo.containsCardCode(CARD_3D)) {
      return fallback();
    }

    // Active trick: combo must be able to beat current trick
    if (!trick.isFresh && trick.lastCombo) {
      if (!combo.canBeat(trick.lastCombo)) {
        return fallback();
      }
    }

    // All validation passed
    return {
      action: 'play',
      cards: combo.cardCodes,
      combo,
      source: 'llm',
    };
  }

  return fallback();
}

export class LLMBotValidator {
  public static validateAndFinalizeMove(params: ValidateMoveParams): LLMBotDecision {
    return validateAndFinalizeMove(params);
  }
}
