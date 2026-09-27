/**
 * micro-crop model — TS port of microgpt.py architecture
 * linear / softmax / rmsnorm / gpt()  + state_dict / params flattening
 * Config tuned for crop domain: tiny vocab, short sequences.
 */
import { Value } from './value';

// Seeded RNG matching Python random.gauss — Box-Muller with seed 42
export class SeededRNG {
  private s: number;
  constructor(seed = 42) { this.s = seed >>> 0; }
  next(): number { // LCG
    this.s = (1664525 * this.s + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  gauss(mean = 0, std = 1): number {
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return n * std + mean;
  }
  shuffle<T>(a: T[]): void {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  choice(weights: number[]): number {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return weights.length - 1;
  }
}

export interface MicroConfig {
  nLayer: number;
  nEmbd: number;
  blockSize: number;
  nHead: number;
  vocabSize: number;
  std: number;
}

export const DEFAULT_MICRO_CONFIG: Omit<MicroConfig, 'vocabSize'> = {
  nLayer: 2,
  nEmbd: 32,
  blockSize: 32,
  nHead: 4,
  std: 0.08,
};

export type Matrix = Value[][]; // [nout][nin]
export type StateDict = Record<string, Matrix>;

export function matrix(nout: number, nin: number, rng: SeededRNG, std = 0.08): Matrix {
  const m: Matrix = [];
  for (let i = 0; i < nout; i++) {
    const row: Value[] = [];
    for (let j = 0; j < nin; j++) row.push(new Value(rng.gauss(0, std)));
    m.push(row);
  }
  return m;
}

export function buildStateDict(vocabSize: number, cfg: Omit<MicroConfig, 'vocabSize'>, rng: SeededRNG): StateDict {
  const sd: StateDict = {};
  sd['wte'] = matrix(vocabSize, cfg.nEmbd, rng, cfg.std);
  sd['wpe'] = matrix(cfg.blockSize, cfg.nEmbd, rng, cfg.std);
  sd['lm_head'] = matrix(vocabSize, cfg.nEmbd, rng, cfg.std);
  for (let i = 0; i < cfg.nLayer; i++) {
    sd[`layer${i}.attn_wq`] = matrix(cfg.nEmbd, cfg.nEmbd, rng, cfg.std);
    sd[`layer${i}.attn_wk`] = matrix(cfg.nEmbd, cfg.nEmbd, rng, cfg.std);
    sd[`layer${i}.attn_wv`] = matrix(cfg.nEmbd, cfg.nEmbd, rng, cfg.std);
    sd[`layer${i}.attn_wo`] = matrix(cfg.nEmbd, cfg.nEmbd, rng, cfg.std);
    sd[`layer${i}.mlp_fc1`] = matrix(4 * cfg.nEmbd, cfg.nEmbd, rng, cfg.std);
    sd[`layer${i}.mlp_fc2`] = matrix(cfg.nEmbd, 4 * cfg.nEmbd, rng, cfg.std);
  }
  return sd;
}

export function flattenParams(sd: StateDict): Value[] {
  const out: Value[] = [];
  for (const mat of Object.values(sd)) for (const row of mat) for (const v of row) out.push(v);
  return out;
}

// ---- ops ----
export function linear(x: Value[], w: Matrix): Value[] {
  return w.map(wo => {
    let acc = new Value(0);
    for (let i = 0; i < wo.length; i++) acc = acc.add(wo[i].mul(x[i]));
    return acc;
  });
}

export function softmax(logits: Value[]): Value[] {
  let maxVal = logits[0].data;
  for (const v of logits) if (v.data > maxVal) maxVal = v.data;
  const exps = logits.map(v => v.sub(maxVal).exp());
  const total = Value.sum(exps);
  return exps.map(e => e.div(total));
}

export function rmsnorm(x: Value[]): Value[] {
  let ms = new Value(0);
  for (const xi of x) ms = ms.add(xi.mul(xi));
  ms = ms.div(x.length);
  const scale = ms.add(1e-5).pow(-0.5);
  return x.map(xi => xi.mul(scale.data));
}

export function gpt(
  tokenId: number,
  posId: number,
  keys: Value[][][],
  values: Value[][][],
  sd: StateDict,
  cfg: MicroConfig,
): Value[] {
  const headDim = cfg.nEmbd / cfg.nHead;
  const tokEmb = sd['wte'][tokenId];
  const posEmb = sd['wpe'][posId];
  let x: Value[] = tokEmb.map((t, i) => t.add(posEmb[i]));
  x = rmsnorm(x);

  for (let li = 0; li < cfg.nLayer; li++) {
    const xResidual = x.slice();
    x = rmsnorm(x);
    const q = linear(x, sd[`layer${li}.attn_wq`]);
    const k = linear(x, sd[`layer${li}.attn_wk`]);
    const v = linear(x, sd[`layer${li}.attn_wv`]);
    keys[li].push(k);
    values[li].push(v);

    const attnOut: Value[] = [];
    for (let h = 0; h < cfg.nHead; h++) {
      const hs = h * headDim;
      const qh = q.slice(hs, hs + headDim);
      const khList = keys[li].map(ki => ki.slice(hs, hs + headDim));
      const vhList = values[li].map(vi => vi.slice(hs, hs + headDim));
      const attnLogits: Value[] = [];
      for (let t = 0; t < khList.length; t++) {
        let s = new Value(0);
        for (let j = 0; j < headDim; j++) s = s.add(qh[j].mul(khList[t][j]));
        s = s.div(Math.sqrt(headDim));
        attnLogits.push(s);
      }
      const attnWeights = softmax(attnLogits);
      for (let j = 0; j < headDim; j++) {
        let acc = new Value(0);
        for (let t = 0; t < vhList.length; t++) acc = acc.add(attnWeights[t].mul(vhList[t][j]));
        attnOut.push(acc);
      }
    }
    x = linear(attnOut, sd[`layer${li}.attn_wo`]);
    x = x.map((a, i) => a.add(xResidual[i]));

    const xRes2 = x.slice();
    x = rmsnorm(x);
    x = linear(x, sd[`layer${li}.mlp_fc1`]);
    x = x.map(xi => xi.relu());
    x = linear(x, sd[`layer${li}.mlp_fc2`]);
    x = x.map((a, i) => a.add(xRes2[i]));
  }
  return linear(x, sd['lm_head']);
}

// Serialization for IndexedDB (store raw numbers, reconstruct Values on load)
export type SerializedStateDict = Record<string, number[][]>;

export function serialize(sd: StateDict): SerializedStateDict {
  const out: SerializedStateDict = {};
  for (const [k, mat] of Object.entries(sd)) out[k] = mat.map(row => row.map(v => v.data));
  return out;
}
export function deserialize(s: SerializedStateDict): StateDict {
  const out: StateDict = {};
  for (const [k, mat] of Object.entries(s)) out[k] = mat.map(row => row.map(d => new Value(d)));
  return out;
}
