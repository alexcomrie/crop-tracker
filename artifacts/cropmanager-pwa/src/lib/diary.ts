import { generateId } from './ids';
import db from '../db/db';
import type { DiaryEntry, DiaryEntryType } from '../types';

export async function addDiaryEntry(opts: {
  entryType: DiaryEntryType;
  cropId?: string;
  cropName?: string;
  variety?: string;
  description: string;
  details?: string;
  date?: string;
}) {
  const entry: DiaryEntry = {
    id: generateId('DE'),
    date: opts.date ?? new Date().toISOString().split('T')[0],
    entryType: opts.entryType,
    cropId: opts.cropId ?? '',
    cropName: opts.cropName ?? '',
    variety: opts.variety ?? '',
    description: opts.description,
    details: opts.details ?? '',
    updatedAt: Date.now(),
  };
  await db.diaryEntries.add(entry);
}
