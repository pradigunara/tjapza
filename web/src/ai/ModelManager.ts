import { Hand } from '../domain/Hand';
import { Trick } from '../domain/Trick';
import { LLMPromptBuilder } from './LLMPromptBuilder';
import { LLMBotValidator } from './LLMBotValidator';
import type {
  ModelStatus,
  ModelProgress,
  LLMBotDecision,
  GameContextForLLM,
  WorkerIncomingMessage,
  WorkerOutgoingMessage,
} from './types';

export interface ModelManagerInitOptions {
  modelId?: string;
  device?: 'webgpu' | 'wasm' | 'cpu';
  dtype?: string;
  workerFactory?: () => Worker;
}

export interface GenerateOptions {
  timeoutMs?: number;
  maxNewTokens?: number;
}

type ProgressListener = (progress: ModelProgress) => void;
type StatusListener = (status: ModelStatus) => void;

interface PendingRequest {
  resolve: (res: { output: string; latencyMs: number }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ModelManager {
  private status: ModelStatus = 'unloaded';
  private progress: ModelProgress = { progress: 0 };
  private worker: Worker | null = null;
  private progressListeners = new Set<ProgressListener>();
  private statusListeners = new Set<StatusListener>();
  private pendingRequests = new Map<string, PendingRequest>();
  private initPromise: Promise<void> | null = null;
  private reqIdCounter = 0;

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
   * Initializes the LLM worker and starts model download/compilation.
   */
  public async init(options: ModelManagerInitOptions = {}): Promise<void> {
    if (this.status === 'ready') {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      try {
        if (!this.worker) {
          if (options.workerFactory) {
            this.worker = options.workerFactory();
          } else if (typeof Worker !== 'undefined') {
            this.worker = new Worker(new URL('./llmWorker.ts', import.meta.url), {
              type: 'module',
            });
          } else {
            this.setStatus('error');
            this.initPromise = null;
            return reject(new Error('Web Worker is not supported in this environment'));
          }

          this.worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
            this.handleWorkerMessage(event.data);
          };

          this.worker.onerror = (err) => {
            console.error('Worker error:', err);
            this.setStatus('error');
          };
        }

        this.setStatus('downloading');

        const readyHandler = (status: ModelStatus) => {
          if (status === 'ready') {
            this.statusListeners.delete(readyHandler);
            this.initPromise = null;
            resolve();
          } else if (status === 'error') {
            this.statusListeners.delete(readyHandler);
            this.initPromise = null;
            reject(new Error('Model loading failed'));
          }
        };
        this.statusListeners.add(readyHandler);

        const initMsg: WorkerIncomingMessage = {
          type: 'init',
          modelId: options.modelId,
          device: options.device,
          dtype: options.dtype,
        };
        this.worker.postMessage(initMsg);
      } catch (err) {
        this.setStatus('error');
        this.initPromise = null;
        reject(err);
      }
    });

    return this.initPromise;
  }

  private handleWorkerMessage(msg: WorkerOutgoingMessage): void {
    if (!msg) return;

    switch (msg.type) {
      case 'progress': {
        this.updateProgress({
          progress: msg.progress,
          bytesLoaded: msg.bytesLoaded,
          totalBytes: msg.totalBytes ?? msg.total,
          stage: msg.stage,
        });
        break;
      }
      case 'ready': {
        this.updateProgress({ progress: 100, stage: 'ready' });
        this.setStatus('ready');
        break;
      }
      case 'result': {
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const req = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          clearTimeout(req.timer);
          req.resolve({ output: msg.output, latencyMs: msg.latencyMs });
        }
        break;
      }
      case 'error': {
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const req = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          clearTimeout(req.timer);
          req.reject(new Error(msg.error));
        } else {
          this.setStatus('error');
        }
        break;
      }
    }
  }

  /**
   * Generates a move decision using the LLM with automatic fallback on timeout (default 2000ms),
   * model unreadiness, or invalid output.
   */
  public async generateDecision(
    context: GameContextForLLM,
    options: GenerateOptions = {}
  ): Promise<LLMBotDecision> {
    const { timeoutMs = 2000, maxNewTokens = 64 } = options;

    const hand = Hand.fromCodes(context.handCards);
    const trick =
      context.isFreshTrick || !context.trickCombo
        ? Trick.createFresh(0)
        : new Trick({ lastCombo: context.trickCombo });
    const isOpeningMove = context.isOpeningMove;
    const counts = context.opponentCounts;

    // Fast-path fallback if model is not ready or worker is unavailable
    if (this.status !== 'ready' || !this.worker) {
      return LLMBotValidator.validateAndFinalizeMove({
        rawDecision: null,
        hand,
        trick,
        isOpeningMove,
        counts,
      });
    }

    const reqId = `req_${++this.reqIdCounter}_${Date.now()}`;
    const prompt = LLMPromptBuilder.buildPrompt(context);

    try {
      const response = await new Promise<{ output: string; latencyMs: number }>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingRequests.delete(reqId);
            reject(new Error(`LLM generation timed out after ${timeoutMs}ms`));
          }, timeoutMs);

          this.pendingRequests.set(reqId, { resolve, reject, timer });

          const msg: WorkerIncomingMessage = {
            type: 'generate',
            prompt,
            context,
            maxNewTokens,
            id: reqId,
          };
          this.worker!.postMessage(msg);
        }
      );

      console.log(`[AI Host 🧠] Invoking on-device model (${reqId})...`);
      console.log(`[AI Host 🧠] --- Prompt Begin ---\n${prompt}\n[AI Host 🧠] --- Prompt End ---`);

      const rawDecision = LLMPromptBuilder.parseResponse(response.output);
      console.log(`[AI Host 🧠] Model raw output (${response.latencyMs}ms):\n"${response.output}"`);
      console.log(`[AI Host 🧠] Parsed action:`, rawDecision);

      const decision = LLMBotValidator.validateAndFinalizeMove({
        rawDecision,
        hand,
        trick,
        isOpeningMove,
        counts,
      });

      console.log(`[AI Host 🧠] Final decision: action=${decision.action}, cards=${JSON.stringify(decision.cards)}, source=${decision.source}`);

      return {
        ...decision,
        rawOutput: response.output,
        latencyMs: response.latencyMs,
      };
    } catch (err: any) {
      console.warn(`[AI Host 🧠] Generation failed or timed out (${err?.message}), triggering safe fallback`);
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
   * Terminates the worker and cleans up listeners and pending requests.
   */
  public terminate(): void {
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('ModelManager terminated'));
    }
    this.pendingRequests.clear();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.initPromise = null;
    this.setStatus('unloaded');
    this.progress = { progress: 0 };
  }
}

export const modelManager = new ModelManager();
