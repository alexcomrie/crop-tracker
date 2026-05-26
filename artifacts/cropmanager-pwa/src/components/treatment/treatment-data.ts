export interface TreatmentRate {
  label: string;
  min: number;
  max: number;
  unit: 'mL' | 'g' | 'L';
  perVolume: number;
  perVolumeUnit: 'L' | 'gal' | 'ha';
  notes?: string;
}

export interface TreatmentProduct {
  id: string;
  name: string;
  category: 'Fungicide' | 'Insecticide' | 'Herbicide' | 'Fertilizer' | 'Other';
  classification: 'Contact' | 'Systemic' | 'Both';
  rates: TreatmentRate[];
  notes?: string;
  isCustom?: boolean;
}

const FUNGICIDES: TreatmentProduct[] = [
  {
    id: 'fung-1', name: 'Titan 20% EW', category: 'Fungicide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 10, max: 20, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'fung-2', name: 'Control 75% WP', category: 'Fungicide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 10, max: 10, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'fung-3', name: 'Mancozeb 80% WP', category: 'Fungicide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 30, max: 30, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'fung-4', name: 'Carigold 22.3 EC', category: 'Fungicide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 10, max: 15, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'fung-5', name: 'Sulcox-OH 50 WP', category: 'Fungicide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 30, max: 45, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'fung-6', name: 'Acrobat 69% WP', category: 'Fungicide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 10, max: 20, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'fung-7', name: 'Carbendazim 50 SC', category: 'Fungicide', classification: 'Systemic',
    rates: [{ label: 'Standard', min: 2.5, max: 5, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'fung-8', name: 'Topsin-M 70% WP', category: 'Fungicide', classification: 'Systemic',
    rates: [{ label: 'Standard', min: 10, max: 10, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'fung-9', name: 'Regnum', category: 'Fungicide', classification: 'Systemic',
    rates: [{ label: 'Standard', min: 0.4, max: 1.25, unit: 'L', perVolume: 1, perVolumeUnit: 'ha', notes: 'Crop-dependent; see label' }],
  },
  {
    id: 'fung-10', name: 'Zampro DM 52.5 SC', category: 'Fungicide', classification: 'Systemic',
    rates: [{ label: 'Standard', min: 8, max: 12, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'fung-11', name: 'Bellis 38 WG', category: 'Fungicide', classification: 'Systemic',
    rates: [
      { label: 'Standard', min: 8, max: 12, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' },
      { label: 'AgCelence', min: 16, max: 16, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' },
    ],
  },
  {
    id: 'fung-12', name: 'Metazeb Gold 72% WP', category: 'Fungicide', classification: 'Both',
    rates: [{ label: 'Standard', min: 10, max: 10, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'fung-13', name: 'Trifmine 30% WP', category: 'Fungicide', classification: 'Both',
    rates: [{ label: 'Standard', min: 5, max: 5, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
];

const INSECTICIDES: TreatmentProduct[] = [
  {
    id: 'ins-1', name: 'Advance 10EC', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 5, max: 10, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-2', name: 'Carimectin 2.3% EC', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 2.5, max: 5, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-3', name: 'Pegastar', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 2.5, max: 3.0, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-4', name: 'Lufen 5 EC', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 2.5, max: 5, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-5', name: 'Phoenix 20 WP', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 2.5, max: 5, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-6', name: 'Nissorun 10 WP', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 2.5, max: 5, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-7', name: 'Cure 1.8 EC', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 2.5, max: 5, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-8', name: 'Botanigard ES', category: 'Insecticide', classification: 'Contact',
    rates: [
      { label: 'Aphids/Whiteflies', min: 15, max: 20, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' },
      { label: 'Other Pests', min: 40, max: 45, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' },
    ],
  },
  {
    id: 'ins-9', name: 'MiMiC', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 5, max: 10, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-10', name: 'Caratrax 5 EC', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 2.5, max: 5, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-11', name: 'Indicarb 14.5% SC', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 5, max: 10, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-12', name: 'Carbaryl 85% WP', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 30, max: 45, unit: 'g', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-13', name: 'Suldan', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 875, max: 875, unit: 'mL', perVolume: 1, perVolumeUnit: 'ha', notes: '350 mL/acre' }],
  },
  {
    id: 'ins-14', name: 'Danitol 10 EC', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 15, max: 30, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-15', name: 'Definite 2.5 EC', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 5, max: 10, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-16', name: 'Diazinon 48% EC', category: 'Insecticide', classification: 'Contact',
    rates: [{ label: 'Standard', min: 15, max: 30, unit: 'mL', perVolume: 1, perVolumeUnit: 'gal' }],
  },
  {
    id: 'ins-17', name: 'Protect 35% SC', category: 'Insecticide', classification: 'Systemic',
    rates: [
      { label: 'Foliar', min: 2.5, max: 5, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' },
      { label: 'Soil Drench', min: 15, max: 25, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L', notes: 'Crop-dependent' },
    ],
  },
  {
    id: 'ins-18', name: 'Caprid 20 SL', category: 'Insecticide', classification: 'Systemic',
    rates: [{ label: 'Standard', min: 2.5, max: 5, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
  {
    id: 'ins-19', name: 'Dimethoate 40 EC', category: 'Insecticide', classification: 'Systemic',
    rates: [{ label: 'Standard', min: 10, max: 10, unit: 'mL', perVolume: 3.8, perVolumeUnit: 'L' }],
  },
];

export const ALL_PRODUCTS = [...FUNGICIDES, ...INSECTICIDES];
