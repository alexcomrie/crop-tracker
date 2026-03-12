import type { FertDatabase, FertProfile, FertScheduleData, CropData, Crop } from '../types';
import { parseDate, daysBetween, today } from './dates';

const CROP_FERT_TYPE: Record<string, string> = {
  tomato: 'fruiting', pepper: 'fruiting', eggplant: 'fruiting', cucumber: 'cucurbit',
  zucchini: 'cucurbit', melon: 'cucurbit', watermelon: 'cucurbit', pumpkin: 'cucurbit',
  squash: 'cucurbit', cabbage: 'brassica', broccoli: 'brassica', cauliflower: 'brassica',
  kale: 'brassica', lettuce: 'leafy', spinach: 'leafy', arugula: 'leafy', basil: 'herb',
  thyme: 'herb', mint: 'herb', parsley: 'herb', cilantro: 'herb', carrot: 'root',
  beet: 'root', radish: 'root', turnip: 'root', bean: 'legume', pea: 'legume',
  cowpea: 'legume', onion: 'allium', garlic: 'allium', leek: 'allium', corn: 'grain',
  potato: 'tuber', sweet_potato: 'tuber',
};

const FERT_PROFILES: Record<string, FertProfile> = {
  fruiting: {
    seedling: { foliar: { final_dilution: '1:50', frequency: 'Every 10-14 days', mixing_example: '10ml in 500ml water' }, drench: { final_dilution: '1:100', frequency: 'Weekly', mixing_example: '5ml in 500ml water' } },
    mid_vegetative: { foliar: { final_dilution: '1:30', frequency: 'Every 7-10 days', mixing_example: '15ml in 500ml water' }, drench: { final_dilution: '1:50', frequency: 'Every 10 days', mixing_example: '10ml in 500ml water' } },
    flowering: { foliar: { final_dilution: '1:20', frequency: 'Every 7 days', mixing_example: '25ml in 500ml water' }, drench: { final_dilution: '1:30', frequency: 'Every 7 days', mixing_example: '15ml in 500ml water' } },
    fruiting: { foliar: { final_dilution: '1:15', frequency: 'Every 5-7 days', mixing_example: '33ml in 500ml water' }, drench: { final_dilution: '1:20', frequency: 'Every 7 days', mixing_example: '25ml in 500ml water' } },
  },
  leafy: {
    seedling: { foliar: { final_dilution: '1:50', frequency: 'Every 10 days', mixing_example: '10ml in 500ml water' }, drench: { final_dilution: '1:100', frequency: 'Weekly', mixing_example: '5ml in 500ml water' } },
    mid_vegetative: { foliar: { final_dilution: '1:25', frequency: 'Every 7 days', mixing_example: '20ml in 500ml water' }, drench: { final_dilution: '1:40', frequency: 'Every 7-10 days', mixing_example: '12ml in 500ml water' } },
    flowering: { foliar: { final_dilution: '1:25', frequency: 'Every 7 days', mixing_example: '20ml in 500ml water' }, drench: { final_dilution: '1:40', frequency: 'Weekly', mixing_example: '12ml in 500ml water' } },
    fruiting: { foliar: { final_dilution: '1:25', frequency: 'Weekly', mixing_example: '20ml in 500ml water' }, drench: { final_dilution: '1:40', frequency: 'Weekly', mixing_example: '12ml in 500ml water' } },
  },
  herb: {
    seedling: { foliar: { final_dilution: '1:75', frequency: 'Every 14 days', mixing_example: '7ml in 500ml water' }, drench: { final_dilution: '1:150', frequency: 'Every 14 days', mixing_example: '3ml in 500ml water' } },
    mid_vegetative: { foliar: { final_dilution: '1:50', frequency: 'Every 10-14 days', mixing_example: '10ml in 500ml water' }, drench: { final_dilution: '1:75', frequency: 'Every 14 days', mixing_example: '7ml in 500ml water' } },
    flowering: { foliar: { final_dilution: '1:50', frequency: 'Every 10 days', mixing_example: '10ml in 500ml water' }, drench: { final_dilution: '1:75', frequency: 'Every 10 days', mixing_example: '7ml in 500ml water' } },
    fruiting: { foliar: { final_dilution: '1:50', frequency: 'Every 10 days', mixing_example: '10ml in 500ml water' }, drench: { final_dilution: '1:75', frequency: 'Every 10 days', mixing_example: '7ml in 500ml water' } },
  },
};

const DEFAULT_META = {
  teas: {
    'Compost Tea': 'Broad-spectrum microbial inoculant. Builds beneficial soil biology.',
    'Nettle Tea': 'High nitrogen boost. Stimulates leafy growth and strengthens stems.',
    'Banana Peel Tea': 'Rich in potassium. Promotes flowering and fruit development.',
    'Moringa Tea': 'Growth stimulant with cytokinins. Increases yield and stress resistance.',
    'Fish Emulsion': 'Fast-acting nitrogen source. Excellent for vegetative growth.',
  },
  yeast_preparation: 'Mix 5g active dry yeast with 1L warm water + 1 tbsp molasses. Let ferment 2-4 hours at room temp.',
  yeast_dosing: 'Use at 1:200 dilution (5ml per 1L water) as soil drench. Apply monthly.',
  dilution_note: 'Final dilution = ratio of your concentrate to total water. 1:50 means 10ml in 490ml water = 500ml total.',
  thyme_oil_mosquito_control: 'Add 5ml food-grade thyme oil to your spray mix. Apply around plant bases at dusk for mosquito control.',
  application_tips: [
    'Apply foliar sprays early morning or late evening to avoid leaf burn.',
    'Never mix teas — apply each separately with 24h gap.',
    'Always water soil before applying drench fertilizers.',
    'Check leaf colour: yellowing = N deficiency; purple = P deficiency; brown edges = K deficiency.',
    'Stop foliar feeding 2 weeks before harvest to avoid residue.',
    'Rotate between products to prevent microbial resistance.',
    'Keep notes on response — adjust concentrations based on plant feedback.',
  ],
};

export function getFertProfile(cropName: string, fertDb: FertDatabase, cropDb: Record<string, any>): FertProfile {
  const key = cropName.toLowerCase().replace(/\s+/g, '_');
  if (fertDb[key]) return fertDb[key];
  if (fertDb[cropName]) return fertDb[cropName];
  const partial = Object.keys(fertDb).find(k => key.includes(k) || k.includes(key));
  if (partial) return fertDb[partial];
  const profileKey = CROP_FERT_TYPE[key] ?? 'leafy';
  return FERT_PROFILES[profileKey] ?? FERT_PROFILES.leafy;
}

function buildMixString(stage: any): string {
  if (!stage) return 'Standard mix';
  const f = stage.foliar ?? stage;
  if (f.mix_parts) {
    const parts = Object.entries(f.mix_parts).map(([k, v]) => `${v} ${k}`).join(' + ');
    return parts;
  }
  return f.final_dilution ? `Dilution: ${f.final_dilution}` : 'Standard mix';
}

export function buildFertScheduleData(
  cropName: string,
  variety: string,
  crop: Crop,
  fertDb: FertDatabase,
  cropDb: Record<string, any>
): FertScheduleData {
  const profile = getFertProfile(cropName, fertDb, cropDb);
  const meta = (profile as any)._meta ?? DEFAULT_META;

  const teas = Object.entries(meta.teas ?? DEFAULT_META.teas).map(([name, desc]) => ({
    name,
    description: desc as string,
  }));

  const planted = parseDate(crop.plantingDate);
  const daysOld = planted ? daysBetween(planted, today()) : 0;

  let currentActiveStageKey = 'seedling';
  if (daysOld > 60) currentActiveStageKey = 'fruiting';
  else if (daysOld > 40) currentActiveStageKey = 'flowering';
  else if (daysOld > 20) currentActiveStageKey = 'mid_vegetative';

  const stageKeys = ['seedling', 'mid_vegetative', 'flowering', 'fruiting'];
  const stageLabels: Record<string, string> = {
    seedling: '🌱 Seedling',
    mid_vegetative: '🌿 Mid-Vegetative',
    flowering: '🌸 Flowering',
    fruiting: '🍅 Fruiting',
  };

  const stages = stageKeys.map(key => {
    const s = (profile as any)[key];
    return {
      key,
      label: stageLabels[key],
      foliarStr: s?.foliar ? buildMixString(s.foliar) : 'Not applicable',
      foliarMixExample: s?.foliar?.mixing_example ?? '',
      drenchStr: s?.drench ? buildMixString(s.drench) : 'Not applicable',
      drenchMixExample: s?.drench?.mixing_example ?? '',
      frequency: s?.foliar?.frequency ?? s?.drench?.frequency ?? 'As needed',
      note: s?.foliar?.notes ?? s?.drench?.notes ?? '',
    };
  });

  return {
    teas,
    yeastPrep: meta.yeast_preparation ?? DEFAULT_META.yeast_preparation,
    yeastDosing: meta.yeast_dosing ?? DEFAULT_META.yeast_dosing,
    dilutionNote: meta.dilution_note ?? DEFAULT_META.dilution_note,
    thymeOilTip: meta.thyme_oil_mosquito_control ?? DEFAULT_META.thyme_oil_mosquito_control,
    stages,
    applicationRules: meta.application_tips ?? DEFAULT_META.application_tips,
    currentActiveStageKey,
  };
}
