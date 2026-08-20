import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ModelManager } from './ModelManager';
import { CARD_3D } from '../domain/constants';
import type { GameContextForLLM, WorkerIncomingMessage, WorkerOutgoingMessage } from './types';

/**
 * Mock Worker implementation for testing ModelManager lifecycle & timeout behaviors.
 */
class MockWorker {
  public onmessage: ((e: MessageEvent<WorkerOutgoingMessage>) => void) | null = null;
  public onerror: ((e: any) => void) | null = null;
  public messagesReceived: WorkerIncomingMessage[] = [];
  public terminated = false;
  private autoRespondToGenerate: ((msg: WorkerIncomingMessage) => WorkerOutgoingMessage | null) | null = null;

  public setAutoResponder(responder: (msg: WorkerIncomingMessage) => WorkerOutgoingMessage | null) {
    this.autoRespondToGenerate = responder;
  }

  public postMessage(message: WorkerIncomingMessage): void {
    this.messagesReceived.push(message);

    if (message.type === 'init') {
      setTimeout(() => {
        this.emitMessage({ type: 'progress', progress: 50, bytesLoaded: 500, totalBytes: 1000, stage: 'downloading' });
        setTimeout(() => {
          this.emitMessage({ type: 'ready' });
        }, 10);
      }, 10);
      return;
    }

    if (message.type === 'generate') {
      if (this.autoRespondToGenerate) {
        const response = this.autoRespondToGenerate(message);
        if (response) {
          setTimeout(() => {
            this.emitMessage(response);
          }, 10);
        }
      }
    }
  }

  public emitMessage(data: WorkerOutgoingMessage): void {
    if (this.onmessage && !this.terminated) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  public terminate(): void {
    this.terminated = true;
  }
}

describe('ModelManager', () => {
  let manager: ModelManager;
  let mockWorker: MockWorker;

  beforeEach(() => {
    manager = new ModelManager();
    mockWorker = new MockWorker();
  });

  afterEach(() => {
    manager.terminate();
  });

  it('starts in unloaded state and transitions to ready upon worker initialization', async () => {
    expect(manager.getStatus()).toBe('unloaded');
    expect(manager.isReady()).toBe(false);

    let progressEvents: number[] = [];
    manager.onProgress((p) => {
      progressEvents.push(p.progress);
    });

    let statusEvents: string[] = [];
    manager.onStatusChange((s) => {
      statusEvents.push(s);
    });

    await manager.init({
      workerFactory: () => mockWorker as unknown as Worker,
    });

    expect(manager.getStatus()).toBe('ready');
    expect(manager.isReady()).toBe(true);
    expect(statusEvents).toContain('downloading');
    expect(statusEvents).toContain('ready');
    expect(progressEvents).toContain(50);
    expect(progressEvents).toContain(100);
  });

  it('falls back automatically when model is not ready', async () => {
    // ModelManager not initialized / unloaded
    const context: GameContextForLLM = {
      handCards: [0, 4, 8], // 3D, 4D, 5D
      opponentCounts: [13, 13, 13],
      isOpeningMove: true,
      isFreshTrick: true,
    };

    const decision = await manager.generateDecision(context);
    expect(decision.source).toBe('fallback');
    expect(decision.action).toBe('play');
    expect(decision.cards).toContain(CARD_3D);
  });

  it('returns LLM decision when worker responds with valid JSON', async () => {
    mockWorker.setAutoResponder((msg: any) => ({
      type: 'result',
      output: '```json\n{"action": "play", "cards": ["3D"]}\n```',
      latencyMs: 45,
      id: msg.id,
    }));

    await manager.init({
      workerFactory: () => mockWorker as unknown as Worker,
    });

    const context: GameContextForLLM = {
      handCards: [0, 4, 8],
      opponentCounts: [13, 13, 13],
      isOpeningMove: true,
      isFreshTrick: true,
    };

    const decision = await manager.generateDecision(context);
    expect(decision.source).toBe('llm');
    expect(decision.action).toBe('play');
    expect(decision.cards).toEqual([CARD_3D]);
    expect(decision.rawOutput).toContain('{"action": "play", "cards": ["3D"]}');
  });

  it('falls back automatically when worker times out', async () => {
    // Worker receives message but never responds
    mockWorker.setAutoResponder(() => null);

    await manager.init({
      workerFactory: () => mockWorker as unknown as Worker,
    });

    const context: GameContextForLLM = {
      handCards: [0, 4, 8],
      opponentCounts: [13, 13, 13],
      isOpeningMove: true,
      isFreshTrick: true,
    };

    const decision = await manager.generateDecision(context, { timeoutMs: 50 });
    expect(decision.source).toBe('fallback');
    expect(decision.action).toBe('play');
    expect(decision.cards).toContain(CARD_3D);
  });

  it('falls back automatically when worker returns invalid move', async () => {
    mockWorker.setAutoResponder((msg: any) => ({
      type: 'result',
      output: '{"action": "play", "cards": ["2S"]}', // Doesn't have 2S in hand
      latencyMs: 20,
      id: msg.id,
    }));

    await manager.init({
      workerFactory: () => mockWorker as unknown as Worker,
    });

    const context: GameContextForLLM = {
      handCards: [0, 4, 8],
      opponentCounts: [13, 13, 13],
      isOpeningMove: true,
      isFreshTrick: true,
    };

    const decision = await manager.generateDecision(context);
    expect(decision.source).toBe('fallback');
    expect(decision.cards).toContain(CARD_3D);
  });

  it('terminates cleanly and rejects pending requests', async () => {
    await manager.init({
      workerFactory: () => mockWorker as unknown as Worker,
    });

    expect(manager.isReady()).toBe(true);
    manager.terminate();
    expect(manager.getStatus()).toBe('unloaded');
    expect(mockWorker.terminated).toBe(true);
  });
});
