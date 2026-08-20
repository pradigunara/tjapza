import { BotEngine, CardCombo, Hand, Trick, type BotDecision } from '../../web/src/domain';
import { effectiveLastCombo } from '../../web/src/application/tableSync';

/** PocketBase game snapshot fields the bot needs to choose a move. */
export interface GameBotSnapshot {
  last_combo?: { cards?: number[] } | null;
  counts: number[];
}

/**
 * Decide a play/pass from a server game record the same way domain bots do.
 * Empty last_combo.cards is treated as a discarded pile / fresh lead.
 */
export function decideBotMoveFromGame(
  game: GameBotSnapshot,
  myCards: number[],
  currentTurn: number
): BotDecision {
  const lastComboDto = effectiveLastCombo(game.last_combo);
  const lastCombo = lastComboDto ? CardCombo.evaluate(lastComboDto.cards) : null;
  const trick = lastCombo
    ? new Trick({ lastCombo })
    : Trick.createFresh(currentTurn);
  const isOpeningMove =
    lastCombo === null &&
    Array.isArray(game.counts) &&
    game.counts.length === 4 &&
    game.counts.every((c) => c === 13);

  return BotEngine.decideMove({
    hand: new Hand(myCards),
    trick,
    isOpeningMove,
    counts: game.counts,
  });
}
