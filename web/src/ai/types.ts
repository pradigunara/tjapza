import type { CardCombo } from '../domain/CardCombo';

export type ModelStatus = 'unloaded' | 'downloading' | 'ready' | 'error';

export interface ModelProgress {
  progress: number;
  bytesLoaded?: number;
  totalBytes?: number;
  stage?: string;
}

export interface LLMBotDecision {
  action: 'play' | 'pass';
  cards: number[];
  combo?: CardCombo;
  source: 'llm' | 'fallback';
  rawOutput?: string;
  latencyMs?: number;
}

export interface GameContextForLLM {
  handCards: number[];
  trickCombo?: CardCombo;
  opponentCounts: number[];
  isOpeningMove: boolean;
  isFreshTrick: boolean;
}

export interface RawLLMDecision {
  action: 'play' | 'pass';
  cards: string[];
}

export type WorkerIncomingMessage =
  | { type: 'init'; modelId?: string; device?: 'webgpu' | 'wasm' | 'cpu'; dtype?: string }
  | { type: 'generate'; prompt: string; context?: any; maxNewTokens?: number; id?: string };

export type WorkerOutgoingMessage =
  | { type: 'progress'; progress: number; bytesLoaded?: number; totalBytes?: number; total?: number; stage?: string }
  | { type: 'ready' }
  | { type: 'result'; output: string; latencyMs: number; id?: string }
  | { type: 'error'; error: string; id?: string };
