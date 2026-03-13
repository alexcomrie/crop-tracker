import Papa from 'papaparse';
import { db } from '../db/db';
import type { Crop, Propagation, Reminder } from '../types';
import { v4 as uuidv4 } from 'uuid';

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
                id: row.id || uuidv4(),
                cropName: row.cropName,
                variety: row.variety || '',
                status: row.status || 'active',
                plantStage: row.plantStage || 'nursery',
                syncStatus: 'pending',
                updatedAt: Date.now(),
                ...row
              };
              await db.crops.put(crop);
              count++;
            } else if (row.plantName) {
              const prop: Propagation = {
                id: row.id || uuidv4(),
                plantName: row.plantName,
                status: row.status || 'active',
                syncStatus: 'pending',
                updatedAt: Date.now(),
                ...row
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
