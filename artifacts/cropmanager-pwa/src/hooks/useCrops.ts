import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import type { Crop } from '../types';

export function useCrops(filter?: string) {
  return useLiveQuery(async () => {
    let query = db.crops.toCollection();
    const all = await query.toArray();
    if (!filter || filter === 'All') return all.filter(c => c.status !== 'Deleted');
    if (filter === 'Deleted') return all.filter(c => c.status === 'Deleted');
    if (filter === 'Active') return all.filter(c => c.status === 'Active');
    if (filter === 'Harvested') return all.filter(c => c.status === 'Harvested');
    return all.filter(c => c.plantStage === filter && c.status !== 'Deleted');
  }, [filter]);
}

export function useCrop(id: string) {
  return useLiveQuery(() => db.crops.get(id), [id]);
}

export async function saveCrop(crop: Crop) {
  await db.crops.put({ ...crop, syncStatus: 'pending', updatedAt: Date.now() });
}

export async function deleteCrop(id: string) {
  await db.crops.where('id').equals(id).modify({ status: 'Deleted', plantStage: 'Deleted', syncStatus: 'pending', updatedAt: Date.now() });
}
