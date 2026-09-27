/**
 * Web Worker wrapper for trainer — offloads Adam loop.
 * Usage: new Worker(new URL('./micro-crop.worker.ts', import.meta.url))
 */
import { trainFromDocs } from './trainer';

self.onmessage = async (e: MessageEvent<{ docs: string[]; opts?: Record<string, unknown> }>) => {
  const { docs, opts } = e.data;
  try {
    const result = await trainFromDocs(docs, {
      ...(opts as object),
      onProgress: (step: number, loss: number) => {
        (self as unknown as Worker).postMessage({ type: 'progress', step, loss });
      },
    } as never);
    (self as unknown as Worker).postMessage({ type: 'done', result: result ? {
      serialized: result.serialized,
      config: result.config,
      itos: result.tokenizer.itos,
      finalLoss: result.finalLoss,
      steps: result.steps,
    } : null });
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', error: String(err) });
  }
};
