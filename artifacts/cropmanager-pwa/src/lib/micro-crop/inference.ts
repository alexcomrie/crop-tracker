/**
 * Inference — temperature sampling like gist's inference loop
 * + deterministic prediction helpers for harvest delta & batch offset.
 */
import { Value } from './value';
import { gpt, softmax, type StateDict, type MicroConfig, SeededRNG } from './model';
import { deserializeTokenizer, BOS } from './tokenizer';

export interface MicroModel {
  stateDict: StateDict;
  config: MicroConfig;
  itos: string[];
}

export function loadModel(serialized: Record<string, number[][]>, config: MicroConfig, itos: string[]): MicroModel {
  const sd: StateDict = {};
  for (const [k, mat] of Object.entries(serialized)) {
    sd[k] = mat.map(row => row.map(d => new Value(d)));
  }
  return { stateDict: sd, config, itos };
}

export function sampleDocs(model: MicroModel, numSamples = 5, temperature = 0.6, maxLen = 32, seed = 42): string[] {
  const rng = new SeededRNG(seed);
  const tokenizer = deserializeTokenizer({ itos: model.itos });
  const out: string[] = [];
  for (let s = 0; s < numSamples; s++) {
    const keys: Value[][][] = Array.from({ length: model.config.nLayer }, () => []);
    const values: Value[][][] = Array.from({ length: model.config.nLayer }, () => []);
    let tokenId = BOS;
    const ids: number[] = [];
    for (let pos = 0; pos < maxLen; pos++) {
      const logits = gpt(tokenId, pos, keys, values, model.stateDict, model.config);
      const scaled = logits.map(l => new Value(l.data / Math.max(0.1, temperature)));
      const probs = softmax(scaled);
      const weights = probs.map(p => p.data);
      tokenId = rng.choice(weights);
      if (tokenId === BOS) break;
      ids.push(tokenId);
    }
    out.push(tokenizer.decode(ids));
  }
  return out;
}

/**
 * Predict harvest delta distribution for a given crop context doc prefix.
 * We feed the prefix doc (without delta) and let model predict the delta bucket char.
 * Returns estimated delta days (mode) + confidence.
 */
export function predictHarvestDelta(model: MicroModel, prefixDoc: string, seed = 42): { deltaDays: number; confidence: number; samples: string[] } {
  const rng = new SeededRNG(seed);
  const tokenizer = deserializeTokenizer({ itos: model.itos });
  const prefixTokens = tokenizer.encode(prefixDoc);
  // Run prefix through model to prime KV
  const keys: Value[][][] = Array.from({ length: model.config.nLayer }, () => []);
  const values: Value[][][] = Array.from({ length: model.config.nLayer }, () => []);
  let tokenId = BOS;
  for (let pos = 0; pos < prefixTokens.length; pos++) {
    const logits = gpt(tokenId, prefixTokens[pos] === undefined ? BOS : prefixTokens[pos], keys, values, model.stateDict, model.config);
    void logits;
    tokenId = prefixTokens[pos];
    if (pos >= model.config.blockSize - 2) break;
  }
  // Next token prediction
  const pos = Math.min(prefixTokens.length, model.config.blockSize - 1);
  const logits = gpt(tokenId, pos, keys, values, model.stateDict, model.config);
  const probs = softmax(logits);
  const weights = probs.map(p => p.data);
  const sampled = rng.choice(weights);
  const ch = model.itos[sampled] ?? '';
  // delta char is a-z → -13..+13 *2
  const deltaDays = ch >= 'a' && ch <= 'z' ? (ch.charCodeAt(0) - 97 - 13) * 2 : 0;
  const confidence = Math.max(...weights);
  const samples = sampleDocs(model, 3, 0.6, 32, seed);
  return { deltaDays, confidence, samples };
}

export function predictBatchOffsetDays(model: MicroModel, cropKey: string, prefixDoc: string): number | null {
  // Use model's sampled docs that mention the cropKey to vote for batch offset
  const docs = sampleDocs(model, 8, 0.7, 32, 42);
  const offsets: number[] = [];
  for (const d of docs) {
    if (!d.includes(cropKey.slice(0, 4))) continue;
    // heuristic: look for duration bucket digit 1-7 → map to offset days
    const m = d.match(/[1-7]/);
    if (m) offsets.push(parseInt(m[0], 10) * 7);
  }
  if (offsets.length === 0) return null;
  offsets.sort((a, b) => a - b);
  return offsets[Math.floor(offsets.length / 2)];
}
