import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(here, '../artifacts/cropmanager-pwa/public/data/treatment_database.json');

const url = process.env.TREATMENT_DB_URL || process.env.GAS_SYNC_URL || '';
const token = process.env.TREATMENT_ADMIN_TOKEN || process.env.GAS_SYNC_TOKEN || '';

if (!url || !token) {
  console.error('Set TREATMENT_DB_URL and TREATMENT_ADMIN_TOKEN (or GAS_SYNC_URL/GAS_SYNC_TOKEN) first.');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const entries = Array.isArray(raw.entries) ? raw.entries : Array.isArray(raw.products) ? raw.products : [];
console.log(`Pushing ${entries.length} treatment products to ${url} …`);

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'replace', token, payload: { entries } }),
});
const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
