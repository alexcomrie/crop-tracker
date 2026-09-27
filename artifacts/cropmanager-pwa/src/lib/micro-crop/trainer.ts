/**
 * Trainer — Adam loop ported from microgpt.py
 * Runs on main thread but chunked via idle to avoid blocking UI.
 * For larger datasets, move to Worker (micro-crop.worker.ts).
 */
import { Value } from './value';
import { DEFAULT_MICRO_CONFIG, buildStateDict, flattenParams, gpt, softmax, type StateDict, type MicroConfig, SeededRNG, serialize, deserialize, type SerializedStateDict } from './model';
import { createTokenizer, BOS } from './tokenizer';

export interface TrainResult {
  stateDict: StateDict;
  serialized: SerializedStateDict;
  tokenizer: { itos: string[] };
  config: MicroConfig;
  finalLoss: number;
  steps: number;
}

export interface TrainOptions {
  numSteps?: number;
  learningRate?: number;
  beta1?: number;
  beta2?: number;
  epsAdam?: number;
  seed?: number;
  onProgress?: (step: number, loss: number) => void;
  signal?: AbortSignal;
}

export async function trainFromDocs(
  docs: string[],
  opts: TrainOptions = {}
): Promise<TrainResult | null> {
  const {
    numSteps = 800,
    learningRate = 0.01,
    beta1 = 0.85,
    beta2 = 0.99,
    epsAdam = 1e-8,
    seed = 42,
    onProgress,
    signal,
  } = opts;

  if (docs.length === 0) return null;

  const rng = new SeededRNG(seed);
  const shuffled = [...docs];
  rng.shuffle(shuffled);

  const tokenizer = createTokenizer(shuffled);
  const vocabSize = tokenizer.vocabSize;
  const cfg: MicroConfig = { ...DEFAULT_MICRO_CONFIG, blockSize: Math.min(32, Math.max(...shuffled.map(d => d.length)) + 2), vocabSize };

  const sd = buildStateDict(vocabSize, cfg, rng);
  const params = flattenParams(sd);

  const m = new Array(params.length).fill(0);
  const v = new Array(params.length).fill(0);

  let finalLoss = 0;

  for (let step = 0; step < numSteps; step++) {
    if (signal?.aborted) break;

    const doc = shuffled[step % shuffled.length];
    const tokens = [BOS, ...tokenizer.encode(doc), BOS];
    const n = Math.min(cfg.blockSize, tokens.length - 1);
    if (n <= 0) continue;

    const keys: Value[][][] = Array.from({ length: cfg.nLayer }, () => []);
    const values: Value[][][] = Array.from({ length: cfg.nLayer }, () => []);
    const losses: Value[] = [];

    for (let pos = 0; pos < n; pos++) {
      const tokenId = tokens[pos];
      const targetId = tokens[pos + 1];
      const logits = gpt(tokenId, pos, keys, values, sd, cfg);
      const probs = softmax(logits);
      // clamp prob for numerical stability
      const p = Math.max(1e-9, probs[targetId].data);
      // we still use Value graph for log prob
      const lossT = probs[targetId].log().neg();
      losses.push(lossT);
      // Need prob value for lossT graph already; p clamp handled via Value internals
      void p;
    }

    let loss: Value = new Value(0);
    for (const l of losses) loss = loss.add(l);
    loss = loss.div(n);
    finalLoss = loss.data;

    loss.backward();

    const lrT = learningRate * (1 - step / numSteps);
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      m[i] = beta1 * m[i] + (1 - beta1) * p.grad;
      v[i] = beta2 * v[i] + (1 - beta2) * p.grad * p.grad;
      const mHat = m[i] / (1 - Math.pow(beta1, step + 1));
      const vHat = v[i] / (1 - Math.pow(beta2, step + 1));
      p.data -= lrT * mHat / (Math.sqrt(vHat) + epsAdam);
      p.grad = 0;
    }

    if (onProgress && step % 50 === 0) onProgress(step, finalLoss);

    // Yield to event loop every 50 steps to keep UI responsive
    if (step % 50 === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }

  return {
    stateDict: sd,
    serialized: serialize(sd),
    tokenizer: { itos: tokenizer.itos },
    config: cfg,
    finalLoss,
    steps: numSteps,
  };
}

export function loadStateDict(serialized: SerializedStateDict): StateDict {
  return deserialize(serialized);
}
