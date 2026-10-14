import { normalizeStage } from './stages';

/**
 * Animated stage GIFs served as static files (public/stage-gifs) so the
 * animation survives the build untouched. 32px set for list cards,
 * 256px set for the details milestone bar.
 */
const STAGE_FILES: Record<string, string> = {
  Seed: '1_seed.gif',
  Germinated: '2_sprout.gif',
  Seedling: '3_seedling.gif',
  'Vegetative Early': '4_vegetative.gif',
  'Vegetative Middle': '4_vegetative.gif',
  'Vegetative Late': '4_vegetative.gif',
  Flowering: '5_flowering.gif',
  Fruiting: '6_fruiting.gif',
  // Recording actions have no dedicated art — nearest living stage.
  'Up-planted': '3_seedling.gif',
  Transplanted: '3_seedling.gif',
};

export function stageGifUrl(plantStage: string, size: 32 | 256): string {
  const base = (import.meta.env.BASE_URL as string | undefined) || '/';
  const root = base.endsWith('/') ? base : `${base}/`;
  const file = STAGE_FILES[normalizeStage(plantStage)] ?? STAGE_FILES.Seedling;
  return `${root}stage-gifs/${size}/${file}`;
}
