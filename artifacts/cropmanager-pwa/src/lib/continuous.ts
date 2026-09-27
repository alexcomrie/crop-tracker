import type { CropData } from '../types';

export function calcBatchOffset(cropData: CropData, freqDays: number): number {
  const harvestWks = cropData.number_of_weeks_harvest || 1;
  const harvestDays = harvestWks * 7;
  const harvestIntv = cropData.harvest_interval || 7;
  const isMulti = harvestWks > 1;
  if (cropData.batch_offset_days && cropData.batch_offset_days > 0) return cropData.batch_offset_days;
  if (!isMulti) return freqDays;
  const natural = Math.max(harvestDays - harvestIntv, harvestIntv);
  return Math.max(natural, freqDays);
}

export function calcNumBatches(cropData: CropData, batchOffset: number): number {
  const growDays = cropData.growing_time_days || 60;
  const harvestWks = cropData.number_of_weeks_harvest || 1;
  const harvestDays = harvestWks * 7;
  const isMulti = harvestWks > 1;
  if (!isMulti) return Math.ceil(growDays / batchOffset);
  return Math.max(2, Math.ceil(harvestDays / batchOffset));
}
