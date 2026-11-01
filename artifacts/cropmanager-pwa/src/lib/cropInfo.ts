import type { Crop } from '../types';

export const PH_RANGES: Record<string, [number, number]> = {
  tomato: [6.0, 6.8], tomatoes: [6.0, 6.8],
  pepper: [6.0, 6.8], 'sweet pepper': [6.0, 6.8], 'hot pepper': [6.0, 6.8], 'scotch bonnet': [6.0, 6.8],
  eggplant: [6.0, 6.8], okra: [6.0, 6.8],
  cucumber: [6.0, 6.8], pumpkin: [6.0, 6.8], squash: [6.0, 6.8], watermelon: [6.0, 6.8], melon: [6.0, 6.8],
  cabbage: [6.0, 6.8], broccoli: [6.0, 6.8], cauliflower: [6.0, 6.8], kale: [6.0, 6.8],
  lettuce: [6.0, 7.0], spinach: [6.0, 7.0], callaloo: [6.0, 7.0], 'pak choi': [6.0, 7.0], 'bok choy': [6.0, 7.0],
  carrot: [6.0, 6.8], beet: [6.0, 7.0], beetroot: [6.0, 7.0], radish: [6.0, 7.0],
  onion: [6.0, 6.8], scallion: [6.0, 6.8], garlic: [6.0, 7.0],
  corn: [5.8, 7.0], maize: [5.8, 7.0],
  beans: [6.0, 7.0], 'string beans': [6.0, 7.0], 'green beans': [6.0, 7.0], 'red peas': [6.0, 7.0], 'gungo peas': [6.0, 7.0], 'pigeon peas': [6.0, 7.0],
  'sweet potato': [5.8, 6.5], cassava: [5.5, 6.5],
  thyme: [6.0, 7.5], basil: [6.0, 7.5], mint: [6.0, 7.5], lemongrass: [6.0, 7.5], ginger: [5.5, 6.5],
  mango: [5.5, 7.5], papaya: [6.0, 7.0], banana: [5.5, 7.0], citrus: [5.5, 7.0], avocado: [5.5, 7.0],
  guava: [5.0, 7.0], soursop: [5.5, 7.0],
};

const TYPE_RANGES: Record<string, [number, number]> = {
  fruiting: [6.0, 6.8],
  cucurbit: [6.0, 6.8],
  brassica: [6.0, 6.8],
  leafy: [6.0, 7.0],
  herb: [6.0, 7.5],
  root: [6.0, 6.8],
  legume: [6.0, 7.0],
  allium: [6.0, 6.8],
  grain: [5.8, 7.0],
  tuber: [5.5, 6.5],
};

export function getCropPhRange(cropName: string, plantType?: string): [number, number] | null {
  const key = cropName.trim().toLowerCase();
  if (PH_RANGES[key]) return PH_RANGES[key];
  const type = (plantType ?? '').trim().toLowerCase();
  return TYPE_RANGES[type] ?? null;
}

export function suggestEnvironment(crop: Crop): string {
  const method = `${crop.plantingMethod ?? ''}`.toLowerCase();
  if (/greenhouse|shade house|shadehouse|nursery/.test(method)) return 'Greenhouse / shade house';
  if (/pot|container|bag|tray/.test(method)) return 'Container';
  if (/raised bed/.test(method)) return 'Raised bed';
  if (/trellis/.test(method)) return 'Trellised field';
  return 'Open field';
}

/** General soil-biology guidance; deliberately generic, not a product recipe. */
export function bacteriaGuidance(plantType?: string): string {
  const type = (plantType ?? '').toLowerCase();
  if (type === 'legume') {
    return 'Legumes work with rhizobia to fix nitrogen. Use a fresh inoculant at planting and avoid over-liming.';
  }
  if (type === 'leafy' || type === 'brassica') {
    return 'Keep soil biology active with compost and mulch. Avoid waterlogging, which favours root-rot organisms.';
  }
  if (type === 'fruiting' || type === 'cucurbit') {
    return 'Mycorrhizae and Bacillus-based products can support root growth. Apply to moist soil, not dry, and keep out of strong sun.';
  }
  return 'Feed the soil with compost and mulch, rotate families, and keep moisture even. Beneficial microbes work best in living soil.';
}
