import { Hand, Trick, BotEngine } from '../domain';
import { MonteCarloBotEngine } from './MonteCarloBotEngine';
import type { ModelStatus, BotDecisionResult, AdvancedBotContext } from './types';

const AI_ENABLED_KEY = 'tjapza_enable_ai_bot';

export interface GenerateOptions {
  rolloutsPerMove?: number;
}

type StatusListener = (status: ModelStatus) => void;

function readEnabledFlag(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(AI_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Service managing the Advanced Bot (Determinized Monte Carlo Search).
 * Instantly ready with 0 MB download and sub-100ms decision latency.
 */
export class ModelManager {
  private status: ModelStatus = 'unloaded';
  private statusListeners = new Set<StatusListener>();

  public getStatus(): ModelStatus {
    return this.status;
  }

  public isEnabled(): boolean {
    return readEnabledFlag();
  }

  public isReady(): boolean {
    return this.status === 'ready' && this.isEnabled();
  }

  public setEnabled(enabled: boolean): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(AI_ENABLED_KEY, enabled ? 'true' : 'false');
      } catch (err) {
        console.warn('Failed to persist AI preference:', err);
      }
    }
    if (enabled) {
      this.init();
    } else {
      this.terminate();
    }
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: ModelStatus): void {
    if (this.status !== status) {
      this.status = status;
      for (const listener of this.statusListeners) {
        try {
          listener(status);
        } catch (err) {
          console.error('Error in status listener:', err);
        }
      }
    }
  }

  /** Initializes the Advanced Bot Engine (instant activation). */
  public init(): void {
    this.setStatus('ready');
  }

  /** Generates a move decision using Determinized Monte Carlo Search (PIMC). */
  public async generateDecision(
    context: AdvancedBotContext,
    options: GenerateOptions = {}
  ): Promise<BotDecisionResult> {
    const t0 = performance.now();
    const hand = Hand.fromCodes(context.handCards);
    const seatIndex = context.seatIndex ?? 0;
    const trick = context.trick ?? Trick.createFresh(seatIndex);

    const fallback = (): BotDecisionResult => {
      const move = BotEngine.decideMove({
        hand,
        trick,
        isOpeningMove: context.isOpeningMove,
        counts: context.opponentCounts,
        seatIndex,
      });
      return {
        action: move.action,
        cards: move.cards.map((c) => c.code),
        combo: move.combo,
        source: 'fallback',
      };
    };

    if (this.status !== 'ready') return fallback();

    try {
      const decision = MonteCarloBotEngine.decideMove({
        hand,
        trick,
        isOpeningMove: context.isOpeningMove,
        counts: context.opponentCounts,
        seatIndex,
        playedCardCodes: context.playedCardCodes,
        options,
      });
      const latencyMs = Math.round(performance.now() - t0);
      console.log(
        `[Advanced Bot 🧠] Decision in ${latencyMs}ms: ${decision.action} [${decision.cards.map((c) => c.name).join(', ')}]`
      );
      return {
        action: decision.action,
        cards: decision.cards.map((c) => c.code),
        combo: decision.combo,
        source: 'mcts',
        latencyMs,
      };
    } catch (err: any) {
      console.warn('[Advanced Bot 🧠] Search failed, falling back to heuristic:', err?.message);
      return fallback();
    }
  }

  /** Resets the engine status. */
  public terminate(): void {
    this.setStatus('unloaded');
  }
}

export const modelManager = new ModelManager();
