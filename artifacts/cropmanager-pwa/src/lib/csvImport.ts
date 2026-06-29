import Papa from 'papaparse';
import db from '../db/db';
import { generateId } from './ids';
import type { Crop, Propagation, Reminder } from '../types';

export interface ImportResult {
  success: boolean;
  count: number;
  errors: string[];
}

export async function importCSVData(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: Papa.ParseResult<any>) => {
        const errors: string[] = [];
        let count = 0;

        try {
          for (const row of results.data) {
            // Determine the type of data based on headers or a 'type' column
            // For now, let's assume we are importing 'crops' if 'cropName' exists
            if (row.cropName) {
              const crop: Crop = {
                ...row,
                id: row.id || generateId('CROP'),
                cropName: row.cropName,
                variety: row.variety || '',
                status: row.status || 'active',
                plantStage: row.plantStage || 'Seed',
                updatedAt: Date.now(),
              };
              await db.crops.put(crop);
              count++;
            } else if (row.plantName) {
              const prop: Propagation = {
                ...row,
                id: row.id || generateId('PROP'),
                plantName: row.plantName,
                status: row.status || 'active',
                updatedAt: Date.now(),
              };
              await db.propagations.put(prop);
              count++;
            }
            // Add more types as needed
          }
          resolve({ success: true, count, errors });
        } catch (err: any) {
          resolve({ success: false, count, errors: [err.message] });
        }
      },
      error: (error: Error) => {
        resolve({ success: false, count: 0, errors: [error.message] });
      }
    });
  });
}
