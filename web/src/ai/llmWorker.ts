import { Wllama } from '@wllama/wllama';
import wllamaWasm from '@wllama/wllama/esm/wasm/wllama.wasm?url';
import type { WorkerIncomingMessage, WorkerOutgoingMessage } from './types';

const HF_REPO = 'LiquidAI/LFM2.5-230M-GGUF';
const HF_FILE = 'LFM2.5-230M-QAD-Q4_0.gguf';

let wllamaInstance: Wllama | null = null;
let isInitializing = false;

self.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'init') {
    if (wllamaInstance && wllamaInstance.isModelLoaded()) {
      self.postMessage({ type: 'ready' } as WorkerOutgoingMessage);
      return;
    }

    if (isInitializing) return;
    isInitializing = true;

    try {
      if (!wllamaInstance) {
        wllamaInstance = new Wllama({
          default: wllamaWasm,
        });
      }

      await wllamaInstance.loadModelFromHF(
        {
          repo: HF_REPO,
          file: HF_FILE,
        },
        {
          n_ctx: 512,
          useCache: true,
          progressCallback: ({ loaded, total }) => {
            const pct = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
            self.postMessage({
              type: 'progress',
              progress: pct,
              bytesLoaded: loaded,
              totalBytes: total,
              total,
              stage: 'Downloading AI model…',
            } as WorkerOutgoingMessage);
          },
        }
      );

      // Warmup minimal completion
      self.postMessage({
        type: 'progress',
        progress: 99,
        stage: 'Preparing AI engine…',
      } as WorkerOutgoingMessage);

      try {
        await wllamaInstance.createCompletion({
          prompt: '<|start_of_role|>system<|end_of_role|>test<|start_of_role|>user<|end_of_role|>hi<|start_of_role|>assistant<|end_of_role|>',
          max_tokens: 1,
          temperature: 0.1,
        });
      } catch (warmupErr) {
        console.warn('Wllama warmup warning:', warmupErr);
      }

      isInitializing = false;
      self.postMessage({ type: 'ready' } as WorkerOutgoingMessage);
    } catch (err: any) {
      isInitializing = false;
      console.error('Wllama init failed:', err);
      self.postMessage({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      } as WorkerOutgoingMessage);
    }
    return;
  }

  if (msg.type === 'generate') {
    if (!wllamaInstance || !wllamaInstance.isModelLoaded()) {
      self.postMessage({
        type: 'error',
        error: 'Model not initialized',
        id: msg.id,
      } as WorkerOutgoingMessage);
      return;
    }

    try {
      const startTime = performance.now();
      const response = await wllamaInstance.createCompletion({
        prompt: msg.prompt,
        max_tokens: msg.maxNewTokens || 36,
        temperature: 0.1,
      });

      const outputText = response.choices?.[0]?.text ?? '';
      const latencyMs = Math.round(performance.now() - startTime);

      self.postMessage({
        type: 'result',
        output: outputText,
        latencyMs,
        id: msg.id,
      } as WorkerOutgoingMessage);
    } catch (err: any) {
      console.error('Wllama generation error:', err);
      self.postMessage({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
        id: msg.id,
      } as WorkerOutgoingMessage);
    }
    return;
  }
};
