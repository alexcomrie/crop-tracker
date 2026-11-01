import type { TreatmentProduct } from './treatment-data';

/**
 * Extra label/usage information layered on top of the rate table.
 * Values are typical for the products sold in Jamaica; formulations and
 * registered uses differ by market and brand, so the UI always tells the user
 * to confirm the printed label before mixing or spraying.
 */
export interface TreatmentGuide {
  activeIngredient?: string;
  /** Crops this product is commonly registered for. */
  crops?: string[];
  /** Pests/diseases the product targets. */
  targets?: string[];
  /** Re-entry interval in hours (typical label value). */
  reiHours?: number;
  /** Pre-harvest interval in days (typical label value). */
  phiDays?: number;
  /** Short directions for use. */
  guide?: string;
  /** Safety / resistance / compatibility warnings. */
  warnings?: string;
  /** Optional product photo (Google Drive direct link or local path). */
  imageUrl?: string;
}

const VEG = ['tomato', 'pepper', 'sweet pepper', 'hot pepper', 'okra', 'cucumber', 'pumpkin', 'cabbage', 'callaloo', 'lettuce', 'beans', 'corn'];
const FRUIT = ['mango', 'papaya', 'banana', 'citrus', 'avocado', 'guava', 'soursop'];

export const TREATMENT_GUIDES: Record<string, TreatmentGuide> = {
  // ── Fungicides ────────────────────────────────────────────────────────────
  'fung-1': {
    activeIngredient: 'Tebuconazole (verify on label)',
    crops: VEG, targets: ['leaf spot', 'rust', 'powdery mildew', 'anthracnose'],
    reiHours: 12, phiDays: 7,
    guide: 'Preventive spray at first sign of disease. Repeat every 7–14 days while conditions stay wet. Rotate with a different mode of action.',
    warnings: 'Triazole fungicide — do not spray during flowering if bees are active. Do not exceed the label number of applications per season.',
  },
  'fung-2': {
    activeIngredient: 'Chlorothalonil',
    crops: VEG, targets: ['leaf spot', 'early blight', 'late blight', 'downy mildew', 'fruit rot'],
    reiHours: 12, phiDays: 7,
    guide: 'Protectant — apply before disease establishes. Cover both leaf surfaces and repeat on the label interval.',
    warnings: 'Not for use on crops eaten raw within the PHI window. Wear gloves, eye protection and a respirator when mixing.',
  },
  'fung-3': {
    activeIngredient: 'Mancozeb',
    crops: VEG, targets: ['early blight', 'late blight', 'downy mildew', 'leaf spot', 'anthracnose'],
    reiHours: 24, phiDays: 7,
    guide: 'Protectant used in a preventive programme. Apply on a 7–10 day schedule in wet weather.',
    warnings: 'Do not apply within 7 days of harvest. Repeated use can build resistance — alternate with systemic products.',
  },
  'fung-4': {
    activeIngredient: 'Check product label',
    crops: VEG, targets: ['leaf spot', 'blight', 'rust'],
    reiHours: 12, phiDays: 7,
    guide: 'Use as part of a preventive spray programme. Confirm the registered crops on the label before use.',
    warnings: 'Label rates and intervals vary by formulation — confirm before mixing.',
  },
  'fung-5': {
    activeIngredient: 'Copper oxychloride (verify on label)',
    crops: VEG.concat(FRUIT), targets: ['bacterial spot', 'leaf spot', 'anthracnose', 'black spot'],
    reiHours: 24, phiDays: 7,
    guide: 'Copper protectant. Apply early morning or late afternoon; avoid spraying in strong sun to reduce leaf burn.',
    warnings: 'Copper can accumulate in soil and burn tender leaves. Do not tank-mix with strongly acidic products.',
  },
  'fung-6': {
    activeIngredient: 'Dimethomorph + mancozeb',
    crops: VEG, targets: ['downy mildew', 'late blight', 'fruit rot'],
    reiHours: 24, phiDays: 7,
    guide: 'Targets oomycete diseases. Apply preventively and alternate with a different mode of action.',
    warnings: 'Contains mancozeb — observe the 24-hour re-entry interval and 7-day PHI.',
  },
  'fung-7': {
    activeIngredient: 'Carbendazim',
    crops: VEG.concat(FRUIT), targets: ['powdery mildew', 'leaf spot', 'fruit rot', 'anthracnose'],
    reiHours: 12, phiDays: 7,
    guide: 'Systemic benzimidazole. Apply at first sign and repeat on the label interval.',
    warnings: 'Resistance develops quickly with benzimidazoles. Rotate modes of action and never exceed label applications.',
  },
  'fung-8': {
    activeIngredient: 'Thiophanate-methyl',
    crops: VEG.concat(FRUIT), targets: ['leaf spot', 'fruit rot', 'powdery mildew'],
    reiHours: 12, phiDays: 7,
    guide: 'Systemic protectant/curative. Apply on a 7–14 day schedule during disease pressure.',
    warnings: 'Benzimidazole resistance is common — rotate with unrelated fungicides.',
  },
  'fung-9': {
    activeIngredient: 'Pyraclostrobin',
    crops: VEG.concat(FRUIT), targets: ['anthracnose', 'leaf spot', 'rust', 'blight'],
    reiHours: 12, phiDays: 7,
    guide: 'Broad-spectrum strobilurin. Use preventively; area-based rate — calculate litres for the area actually sprayed.',
    warnings: 'Strobilurins are resistance-prone. Never apply more than two consecutive sprays.',
  },
  'fung-10': {
    activeIngredient: 'Ametoctradin + dimethomorph',
    crops: VEG, targets: ['downy mildew', 'late blight'],
    reiHours: 12, phiDays: 7,
    guide: 'Oomycete-specific. Apply before infection periods and alternate with another downy-mildew group.',
    warnings: 'Confirm the registered crop on the label; not a broad-spectrum fungicide.',
  },
  'fung-11': {
    activeIngredient: 'Boscalid + pyraclostrobin',
    crops: VEG.concat(FRUIT), targets: ['powdery mildew', 'leaf spot', 'anthracnose', 'blight'],
    reiHours: 12, phiDays: 7,
    guide: 'Two modes of action in one product. Use preventively on a 7–14 day interval.',
    warnings: 'Do not exceed the label maximum number of sprays per season. Rotate with a different group.',
  },
  'fung-12': {
    activeIngredient: 'Metalaxyl + mancozeb',
    crops: VEG, targets: ['downy mildew', 'late blight', 'damping off'],
    reiHours: 24, phiDays: 7,
    guide: 'Apply preventively when humidity is high. Good for seedling damping-off when used as a soil drench at label rate.',
    warnings: 'Metalaxyl resistance is common — always tank-mix or alternate with a different downy-mildew fungicide.',
  },
  'fung-13': {
    activeIngredient: 'Triflumizole (verify on label)',
    crops: VEG, targets: ['powdery mildew', 'leaf spot', 'rust'],
    reiHours: 12, phiDays: 7,
    guide: 'Systemic protectant. Apply at first sign and repeat on the label interval.',
    warnings: 'Confirm registered crops and maximum applications on the label.',
  },

  // ── Insecticides ──────────────────────────────────────────────────────────
  'ins-1': {
    activeIngredient: 'Check product label',
    crops: VEG, targets: ['aphids', 'whiteflies', 'thrips', 'leafminer'],
    reiHours: 12, phiDays: 7,
    guide: 'Spray to thorough coverage, especially leaf undersides where pests feed. Repeat on the label interval.',
    warnings: 'Confirm the active ingredient and registered crop on the label before use.',
  },
  'ins-2': {
    activeIngredient: 'Abamectin',
    crops: VEG.concat(FRUIT), targets: ['mites', 'leafminer', 'thrips'],
    reiHours: 12, phiDays: 7,
    guide: 'Translaminar — spray both leaf surfaces for mites and leafminer. Repeat after 7–10 days if needed.',
    warnings: 'Highly toxic to bees and aquatic life. Do not spray during bloom or near water. Maximum two consecutive applications.',
  },
  'ins-3': {
    activeIngredient: 'Check product label',
    crops: VEG, targets: ['aphids', 'whiteflies', 'thrips'],
    reiHours: 12, phiDays: 7,
    guide: 'Apply at first sign of infestation and repeat on the label interval.',
    warnings: 'Confirm the label before mixing; observe the PHI shown on the product.',
  },
  'ins-4': {
    activeIngredient: 'Lufenuron',
    crops: VEG, targets: ['caterpillars', 'leafminer', 'armyworm'],
    reiHours: 12, phiDays: 7,
    guide: 'Insect growth regulator — targets eggs and larvae, so apply early. Repeat after 7–10 days.',
    warnings: 'Slow-acting; do not expect a immediate knockdown. Best used in a rotation.',
  },
  'ins-5': {
    activeIngredient: 'Check product label',
    crops: VEG, targets: ['aphids', 'whiteflies', 'caterpillars'],
    reiHours: 12, phiDays: 7,
    guide: 'Apply as a foliar spray with thorough coverage. Repeat on the label interval.',
    warnings: 'Confirm the active ingredient on the label before use.',
  },
  'ins-6': {
    activeIngredient: 'Hexythiazox',
    crops: VEG.concat(FRUIT), targets: ['mites'],
    reiHours: 12, phiDays: 7,
    guide: 'Acaricide for eggs and immature mites. Apply when mites first appear; repeat after 7–10 days.',
    warnings: 'Not effective against adult mites — target early stages. Rotate with a different acaricide.',
  },
  'ins-7': {
    activeIngredient: 'Abamectin',
    crops: VEG.concat(FRUIT), targets: ['mites', 'leafminer', 'thrips'],
    reiHours: 12, phiDays: 7,
    guide: 'Spray both leaf surfaces. Repeat after 7–10 days if pressure continues.',
    warnings: 'Toxic to bees and fish. Do not spray during bloom or near water.',
  },
  'ins-8': {
    activeIngredient: 'Beauveria bassiana',
    crops: VEG, targets: ['aphids', 'whiteflies', 'thrips', 'mites'],
    reiHours: 4, phiDays: 0,
    guide: 'Biological insecticide. Apply in the evening or on cloudy days; keep the spray mix cool and use it soon after mixing.',
    warnings: 'Do not tank-mix with chemical fungicides. Store in a cool place and check the expiry date.',
  },
  'ins-9': {
    activeIngredient: 'Methoxyfenozide (verify on label)',
    crops: VEG, targets: ['caterpillars', 'armyworm', 'loopers'],
    reiHours: 4, phiDays: 7,
    guide: 'Targets caterpillar larvae. Apply when larvae are small and repeat on the label interval.',
    warnings: 'Confirm the active ingredient on the label; rotate to avoid resistance.',
  },
  'ins-10': {
    activeIngredient: 'Lambda-cyhalothrin (verify on label)',
    crops: VEG, targets: ['aphids', 'thrips', 'caterpillars', 'whiteflies'],
    reiHours: 24, phiDays: 7,
    guide: 'Broad-spectrum contact pyrethroid. Spray late evening to protect pollinators.',
    warnings: 'Highly toxic to bees and fish. Do not spray during flowering. Rotate with a different mode of action.',
  },
  'ins-11': {
    activeIngredient: 'Check product label',
    crops: VEG, targets: ['aphids', 'whiteflies', 'thrips'],
    reiHours: 12, phiDays: 7,
    guide: 'Foliar spray with thorough coverage. Repeat on the label interval.',
    warnings: 'Confirm the label before use; observe the PHI for the crop.',
  },
  'ins-12': {
    activeIngredient: 'Carbaryl',
    crops: VEG.concat(FRUIT), targets: ['caterpillars', 'beetles', 'aphids'],
    reiHours: 12, phiDays: 7,
    guide: 'Contact insecticide. Apply when pests are actively feeding and repeat on the label interval.',
    warnings: 'Highly toxic to bees and beneficial insects. Do not spray during bloom.',
  },
  'ins-13': {
    activeIngredient: 'Check product label',
    crops: VEG, targets: ['aphids', 'whiteflies', 'thrips', 'mites'],
    reiHours: 24, phiDays: 7,
    guide: 'Area-based product — enter the area actually sprayed, not the sprayer tank volume.',
    warnings: 'Confirm the label rate for the specific crop; area-based labels are easy to overdose.',
  },
  'ins-14': {
    activeIngredient: 'Fenpropathrin',
    crops: VEG.concat(FRUIT), targets: ['mites', 'aphids', 'whiteflies', 'thrips'],
    reiHours: 24, phiDays: 7,
    guide: 'Broad-spectrum pyrethroid/acaricide. Apply late evening and repeat on the label interval.',
    warnings: 'Highly toxic to bees, fish and beneficials. Do not spray during bloom or near water.',
  },
  'ins-15': {
    activeIngredient: 'Check product label',
    crops: VEG, targets: ['aphids', 'thrips', 'whiteflies'],
    reiHours: 12, phiDays: 7,
    guide: 'Foliar spray at first sign; repeat on the label interval.',
    warnings: 'Confirm the label before use; observe the PHI for the crop.',
  },
  'ins-16': {
    activeIngredient: 'Diazinon',
    crops: VEG, targets: ['aphids', 'thrips', 'soil insects'],
    reiHours: 24, phiDays: 10,
    guide: 'Apply as a foliar spray or soil drench at the label rate. Do not re-enter treated areas until the spray has dried.',
    warnings: 'Organophosphate — high toxicity. Wear full PPE, keep children and animals away, and observe the longer PHI.',
  },
  'ins-17': {
    activeIngredient: 'Imidacloprid (verify on label)',
    crops: VEG.concat(FRUIT), targets: ['aphids', 'whiteflies', 'thrips', 'leafhoppers'],
    reiHours: 12, phiDays: 7,
    guide: 'Systemic — foliar or soil drench. Soil drench needs to be watered in for uptake.',
    warnings: 'Highly toxic to bees. Never apply during flowering or let runoff reach waterways.',
  },
  'ins-18': {
    activeIngredient: 'Acetamiprid (verify on label)',
    crops: VEG, targets: ['aphids', 'whiteflies', 'thrips'],
    reiHours: 12, phiDays: 7,
    guide: 'Systemic foliar spray. Apply at first sign and repeat on the label interval.',
    warnings: 'Toxic to bees; avoid spraying during bloom. Confirm the active ingredient on the label.',
  },
  'ins-19': {
    activeIngredient: 'Dimethoate',
    crops: VEG.concat(FRUIT), targets: ['aphids', 'whiteflies', 'thrips', 'leafminer'],
    reiHours: 48, phiDays: 14,
    guide: 'Systemic organophosphate. Apply at first sign with thorough coverage; do not repeat more often than the label allows.',
    warnings: 'High toxicity — full PPE, 48-hour re-entry, 14-day PHI. Not for use near homes, schools or water.',
  },
};

/** Basic category-level fallback guide for custom / unknown products. */
export function fallbackGuide(category: TreatmentProduct['category']): TreatmentGuide {
  const base: TreatmentGuide = {
    crops: VEG,
    reiHours: 12,
    phiDays: 7,
    guide: 'Apply at the label rate with thorough coverage. Repeat on the interval printed on the product label.',
    warnings: 'Typical values only — always confirm the registered crop, rate, REI and PHI on the product label.',
  };
  if (category === 'Fungicide') {
    base.targets = ['leaf spot', 'blight', 'powdery mildew', 'rust'];
    base.guide = 'Preventive fungicide — apply before disease establishes, cover both leaf surfaces, and rotate modes of action.';
  } else if (category === 'Insecticide') {
    base.targets = ['aphids', 'whiteflies', 'thrips', 'caterpillars'];
    base.guide = 'Spray to thorough coverage including leaf undersides. Target young pests and repeat on the label interval.';
  } else if (category === 'Herbicide') {
    base.targets = ['grasses', 'broadleaf weeds'];
    base.guide = 'Apply to actively growing weeds at the label rate. Avoid spray drift onto crops and desirable plants.';
    base.warnings = 'Herbicides can damage sensitive crops. Use a dedicated sprayer and follow the label exactly.';
  } else if (category === 'Fertilizer') {
    base.targets = ['plant nutrition'];
    base.guide = 'Apply according to soil test or label directions. Avoid over-application, which can burn roots and pollute water.';
    base.warnings = 'Confirm the analysis (N-P-K) and application rate on the label.';
  }
  return base;
}
