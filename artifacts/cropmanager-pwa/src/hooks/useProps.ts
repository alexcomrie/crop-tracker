import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import type { Propagation } from '../types';

export function useProps(filter?: string) {
  return useLiveQuery(async () => {
    const all = await db.propagations.toArray();
    if (!filter || filter === 'All') return all;
    return all.filter(p => p.status === filter);
  }, [filter]);
}

export function useProp(id: string) {
  return useLiveQuery(() => db.propagations.get(id), [id]);
}

export async function saveProp(prop: Propagation) {
  await db.propagations.put({ ...prop, syncStatus: 'pending', updatedAt: Date.now() });
}
