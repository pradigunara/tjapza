import type { CardCombo, Trick } from '../domain';

export type ModelStatus = 'unloaded' | 'ready';

export interface BotDecisionResult {
  action: 'play' | 'pass';
  cards: number[];
  combo?: CardCombo;
  source: 'mcts' | 'fallback';
  latencyMs?: number;
}

export interface AdvancedBotContext {
  handCards: number[];
  /** Current trick state (immutable domain entity); fresh/absent when leading. */
  trick?: Trick;
  opponentCounts: number[];
  isOpeningMove: boolean;
  seatIndex?: number;
  /** All card codes already played in this game (visible information). */
  playedCardCodes?: number[];
}
