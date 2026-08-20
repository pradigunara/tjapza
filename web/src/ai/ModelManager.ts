import { Hand } from '../domain/Hand';
import { Trick } from '../domain/Trick';
import { LLMBotValidator } from './LLMBotValidator';
import { MonteCarloBotEngine } from './MonteCarloBotEngine';
import type {
  ModelStatus,
  ModelProgress,
  LLMBotDecision,
  GameContextForLLM,
} from './types';

export interface ModelManagerInitOptions {
  modelId?: string;
  device?: 'webgpu' | 'wasm' | 'cpu';
  dtype?: string;
  workerFactory?: () => Worker;
}

export interface GenerateOptions {
  timeoutMs?: number;
  rolloutsPerMove?: number;
}

type ProgressListener = (progress: ModelProgress) => void;
type StatusListener = (status: ModelStatus) => void;

/**
 * Service managing Advanced Bot AI (Determinized Monte Carlo Search Engine).
 * Instantly ready with 0 MB download and sub-50ms execution latency.
 */
export class ModelManager {
  private status: ModelStatus = 'unloaded';
  private progress: ModelProgress = { progress: 0 };
  private progressListeners = new Set<ProgressListener>();
  private statusListeners = new Set<StatusListener>();

  public getStatus(): ModelStatus {
    return this.status;
  }

  public getProgress(): ModelProgress {
    return { ...this.progress };
  }

  public isReady(): boolean {
    return this.status === 'ready';
  }

  public onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
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

  private updateProgress(progress: ModelProgress): void {
    this.progress = progress;
    for (const listener of this.progressListeners) {
      try {
        listener(progress);
      } catch (err) {
        console.error('Error in progress listener:', err);
      }
    }
  }

  /**
   * Initializes the Advanced Bot Engine (instant activation).
   */
  public async init(_options: ModelManagerInitOptions = {}): Promise<void> {
    this.updateProgress({ progress: 100, stage: 'ready' });
    this.setStatus('ready');
    return Promise.resolve();
  }

  /**
   * Generates a move decision using Determinized Monte Carlo Search (PIMC).
   */
  public async generateDecision(
    context: GameContextForLLM,
    options: GenerateOptions = {}
  ): Promise<LLMBotDecision> {
    const { rolloutsPerMove = 30 } = options;
    const t0 = performance.now();

    const hand = Hand.fromCodes(context.handCards);
    const trick =
      context.isFreshTrick || !context.trickCombo
        ? Trick.createFresh(0)
        : new Trick({ lastCombo: context.trickCombo });
    const isOpeningMove = context.isOpeningMove;
    const counts = context.opponentCounts;

    if (this.status !== 'ready') {
      return LLMBotValidator.validateAndFinalizeMove({
        rawDecision: null,
        hand,
        trick,
        isOpeningMove,
        counts,
      });
    }

    try {
      const decision = MonteCarloBotEngine.decideMove({
        hand,
        trick,
        isOpeningMove,
        counts,
        seatIndex: context.seatIndex ?? 0,
        options: { rolloutsPerMove },
      });

      const latencyMs = Math.round(performance.now() - t0);
      console.log(
        `[Advanced Bot 🧠] Decision in ${latencyMs}ms: ${decision.action} [${decision.cards.map((c) => c.name).join(', ')}]`
      );

      return {
        action: decision.action,
        cards: decision.cards.map((c) => c.code),
        combo: decision.combo,
        source: 'llm',
        latencyMs,
      };
    } catch (err: any) {
      console.warn('[Advanced Bot 🧠] Search failed, falling back to heuristic:', err?.message);
      return LLMBotValidator.validateAndFinalizeMove({
        rawDecision: null,
        hand,
        trick,
        isOpeningMove,
        counts,
      });
    }
  }

  /**
   * Terminates and resets the engine status.
   */
  public terminate(): void {
    this.setStatus('unloaded');
    this.progress = { progress: 0 };
  }
}

export const modelManager = new ModelManager();
