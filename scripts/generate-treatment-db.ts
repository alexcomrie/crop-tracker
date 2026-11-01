/**
 * Regenerates public/data/treatment_database.json from the built-in product
 * list plus the usage-guide map. Run after editing treatment-data.ts or
 * treatment-guides.ts:
 *
 *   pnpm --dir artifacts/api-server exec tsx ../../scripts/generate-treatment-db.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_PRODUCTS } from '../artifacts/cropmanager-pwa/src/components/treatment/treatment-data';
import { TREATMENT_GUIDES, fallbackGuide } from '../artifacts/cropmanager-pwa/src/components/treatment/treatment-guides';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../artifacts/cropmanager-pwa/public/data/treatment_database.json');

const entries = ALL_PRODUCTS.map(product => ({
  ...product,
  ...(TREATMENT_GUIDES[product.id] ?? fallbackGuide(product.category)),
  source: 'builtin',
  updatedAt: Date.now(),
}));

const database = {
  version: 1,
  updatedAt: new Date().toISOString(),
  source: 'Built-in starter list — replace with your Google Sheet',
  entries,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
console.log(`Wrote ${entries.length} treatment products to ${out}`);
