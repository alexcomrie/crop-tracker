/**
 * CropTokenizer — char + bucket scheme inspired by gist's char tokenizer
 * Vocab is built from docs + special tokens, stays tiny (<128).
 */
export const BOS = 0; // reserved

export interface CropTokenizer {
  stoi: Map<string, number>;
  itos: string[];
  vocabSize: number;
  encode: (doc: string) => number[];
  decode: (ids: number[]) => string;
}

const SPECIAL = ['<BOS>'];

function buildVocab(docs: string[]): { stoi: Map<string, number>; itos: string[] } {
  const chars = new Set<string>();
  for (const d of docs) for (const ch of d) chars.add(ch);
  const sorted = [...chars].sort();
  const itos = [...SPECIAL, ...sorted];
  const stoi = new Map<string, number>();
  itos.forEach((ch, i) => stoi.set(ch, i));
  return { stoi, itos };
}

export function createTokenizer(docs: string[]): CropTokenizer {
  const { stoi, itos } = buildVocab(docs);
  return {
    stoi,
    itos,
    vocabSize: itos.length,
    encode(doc: string) {
      const out: number[] = [];
      for (const ch of doc) {
        const id = stoi.get(ch);
        if (id !== undefined) out.push(id);
        // unknown chars map to BOS (drop)
      }
      return out;
    },
    decode(ids: number[]) {
      return ids.map(id => itos[id] ?? '').join('').replace(/<BOS>/g, '');
    },
  };
}

// Serialize for storage
export function serializeTokenizer(t: CropTokenizer): { itos: string[] } {
  return { itos: t.itos };
}
export function deserializeTokenizer(s: { itos: string[] }): CropTokenizer {
  const stoi = new Map<string, number>();
  s.itos.forEach((ch, i) => stoi.set(ch, i));
  return {
    stoi,
    itos: s.itos,
    vocabSize: s.itos.length,
    encode(doc: string) {
      const out: number[] = [];
      for (const ch of doc) {
        const id = stoi.get(ch);
        if (id !== undefined) out.push(id);
      }
      return out;
    },
    decode(ids: number[]) {
      return ids.map(id => s.itos[id] ?? '').join('').replace(/<BOS>/g, '');
    },
  };
}
