export * from './value';
export * from './model';
export * from './tokenizer';
export * from './dataset';
export * from './trainer';
export * from './inference';

import type { MicroConfig } from './model';
export type StoredMicroModel = {
  id: string;
  serialized: Record<string, number[][]>;
  config: MicroConfig;
  itos: string[];
  finalLoss: number;
  steps: number;
  docsCount: number;
  createdAt: number;
  updatedAt: number;
};

export const MICRO_MODEL_ID = 'micro_crop_v1';
export const MIN_DOCS_FOR_TRAINING = 8; // keep low for farm bootstrap; gist used 1000 docs but we fallback gracefully
export const MICRO_CONFIDENCE_THRESHOLD = 0.35;

/**
 * Single source of truth for learning gates (previously four different
 * thresholds scattered across learning.ts, hybrid.ts, personalCropDb.ts).
 * Precedence: personal override (>= PERSONAL_OVERRIDE_SAMPLES) feeds the
 * scalar average; micro predictions blend 70/30 once SHOULD_USE_MICRO_DOCS
 * docs exist; scalar `useCustom` flips at SCALAR_CUSTOM_SAMPLES.
 */
export const SCALAR_CUSTOM_SAMPLES = 3;
export const PERSONAL_OVERRIDE_SAMPLES = 2;
export const MICRO_TRAIN_MIN_DOCS = 4;
