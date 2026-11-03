export interface PropStage {
  key: string;
  label: string;
  gif: string;
  hint: string;
}

export interface PropMethodDef {
  key: string;
  label: string;
  description: string;
  stages: PropStage[];
}

export const PROP_METHODS: PropMethodDef[] = [
  {
    key: 'Cutting',
    label: 'Cutting',
    description: 'A stem or leaf cutting is set, roots, then transplants out.',
    stages: [
      { key: 'Set', label: 'Set', gif: 'cutting_1_set.gif', hint: 'Cutting prepared and placed in the rooting medium.' },
      { key: 'Rooted', label: 'Rooted', gif: 'cutting_2_rooted.gif', hint: 'Roots visible — ready to pot on or transplant.' },
      { key: 'Transplanted', label: 'Transplanted', gif: 'cutting_3_transplanted.gif', hint: 'Moved into its growing position.' },
    ],
  },
  {
    key: 'Grafting',
    label: 'Grafting',
    description: 'Scion joined to a rootstock, then grows away.',
    stages: [
      { key: 'Grafted', label: 'Grafted', gif: 'graft_1_grafted.gif', hint: 'Graft joined and sealed.' },
      { key: 'Bud break', label: 'Bud break / scion growth', gif: 'graft_2_bud_break.gif', hint: 'Scion buds pushing new growth.' },
      { key: 'Transplanted', label: 'Transplanted', gif: 'graft_3_transplanted.gif', hint: 'Grafted plant moved to its growing position.' },
    ],
  },
  {
    key: 'Air Layering',
    label: 'Air Layering',
    description: 'A branch is ringed and wrapped to root while still on the parent.',
    stages: [
      { key: 'Air layered', label: 'Air layered', gif: 'airlayer_1_layered.gif', hint: 'Branch ringed, treated and wrapped with moist medium.' },
      { key: 'Rooted', label: 'Rooted', gif: 'airlayer_2_rooted.gif', hint: 'Roots visible through the wrap — ready to separate.' },
      { key: 'Transplanted', label: 'Transplanted', gif: 'airlayer_3_transplanted.gif', hint: 'Separated layer potted or planted out.' },
    ],
  },
  {
    key: 'Division',
    label: 'Division',
    description: 'A clump is split and replanted as separate plants.',
    stages: [
      { key: 'Replanted', label: 'Replanted', gif: 'division_1_replanted.gif', hint: 'Division replanted in its new position.' },
      { key: 'New growth', label: 'New growth', gif: 'division_2_new_growth.gif', hint: 'Fresh shoots show the division has taken.' },
    ],
  },
];

const METHOD_ALIASES: Record<string, string> = {
  cuttings: 'Cutting',
  cutting: 'Cutting',
  grafted: 'Grafting',
  grafting: 'Grafting',
  'air layering': 'Air Layering',
  airlayering: 'Air Layering',
  'air-layer': 'Air Layering',
  division: 'Division',
};

export function normalizePropMethod(method?: string): string | null {
  if (!method) return null;
  const key = method.trim().toLowerCase();
  return METHOD_ALIASES[key] ?? PROP_METHODS.find(m => m.key.toLowerCase() === key)?.key ?? null;
}

export function isPropagationMethod(method?: string): boolean {
  return normalizePropMethod(method) !== null;
}

export function getPropMethod(method?: string): PropMethodDef | null {
  const key = normalizePropMethod(method);
  return key ? PROP_METHODS.find(m => m.key === key) ?? null : null;
}

export function initialPropStage(method?: string): string | null {
  return getPropMethod(method)?.stages[0]?.key ?? null;
}

export function nextPropStage(method: string | undefined, current: string | undefined): PropStage | null {
  const def = getPropMethod(method);
  if (!def) return null;
  const idx = def.stages.findIndex(s => s.key === current);
  if (idx < 0) return def.stages[0] ?? null;
  return def.stages[idx + 1] ?? null;
}

export function propStageProgress(method: string | undefined, current: string | undefined): { index: number; total: number; def: PropMethodDef | null } {
  const def = getPropMethod(method);
  if (!def) return { index: 0, total: 0, def: null };
  const idx = Math.max(0, def.stages.findIndex(s => s.key === current));
  return { index: idx, total: def.stages.length, def };
}

/** Prop GIF for list cards (32px) and detail views (256px). */
export function propGifUrl(method: string | undefined, stage: string | undefined, size: 32 | 256): string | null {
  const def = getPropMethod(method);
  if (!def) return null;
  const found = def.stages.find(s => s.key === stage) ?? def.stages[0];
  if (!found) return null;
  const base = (import.meta.env.BASE_URL as string | undefined) || '/';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}prop-gifs/${size}/${found.gif}`;
}

/** Stage colours for the method-specific milestone strip. */
export const PROP_STAGE_COLORS: Record<string, string> = {
  Set: '#9e9e9e',
  Rooted: '#66bb6a',
  Transplanted: '#26a69a',
  Grafted: '#7e57c2',
  'Bud break': '#8bc34a',
  'Air layered': '#00acc1',
  Replanted: '#43a047',
  'New growth': '#2e7d32',
};

export function propStageColor(stage: string): string {
  return PROP_STAGE_COLORS[stage] ?? '#4CAF50';
}
