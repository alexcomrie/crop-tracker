import type { Crop, Propagation, Reminder, CropData, CropDbAdjustment, PropDbAdjustment } from '../types';
import { generateId } from './ids';
import { parseDate, addDays, formatDateShort } from './dates';
import { getAdjustedValue, calculateHarvestDate, calculateTransplantDate } from './harvest';
import { needsTransplant } from './stages';
import { getRootingDays } from './propagation';

function makeReminder(
  type: string,
  cropPlantName: string,
  trackingId: string,
  sendDate: Date,
  subject: string,
  body: string,
  chatId: string
): Reminder {
  // Format the date safely - always return a valid string
  let formattedDate: string
  if (!sendDate || !(sendDate instanceof Date) || isNaN(sendDate.getTime())) {
    // Invalid date - use empty string
    formattedDate = ''
  } else {
    // Valid date - format it
    formattedDate = formatDateShort(sendDate)
    // If formatting returned 'N/A', use empty string
    if (formattedDate === 'N/A') formattedDate = ''
  }
  // Extra type safety - ensure it's a non-empty string for Dexie schema
  const sendDateValue: string = formattedDate !== '' ? formattedDate : ''
  return {
    id: generateId('REM'),
    type,
    cropPlantName,
    trackingId,
    sendDate: sendDateValue,
    subject,
    body,
    sent: false,
    chatId,
    updatedAt: Date.now(),
  }
}

export function generateCropReminders(
  crop: Crop,
  cropData: CropData,
  adjustments: CropDbAdjustment[],
  chatId: string,
  threshold = 3
): Reminder[] {
  const reminders: Reminder[] = [];
  const planted = parseDate(crop.plantingDate);
  if (!planted) return reminders;
  const key = crop.cropName.toLowerCase();

  // Germination check
  const germMin = getAdjustedValue(key, 'germination_days_min', cropData.germination_days_min, crop.variety, adjustments, threshold);
  const germDate = addDays(planted, germMin);
  reminders.push(makeReminder(
    'germination_check', crop.cropName, crop.id,
    germDate,
    `🌱 Germination Check: ${crop.cropName}`,
    `Check if ${crop.cropName} (${crop.variety}) has germinated.`,
    chatId
  ));

  // Harvest
  const harvestDate = calculateHarvestDate(crop, cropData, adjustments, threshold);
  if (harvestDate) {
    const harvestRemDate = addDays(harvestDate, -2);
    reminders.push(makeReminder(
      'harvest', crop.cropName, crop.id,
      harvestRemDate,
      `🥬 Harvest Ready: ${crop.cropName}`,
      `${crop.cropName} (${crop.variety}) is ready to harvest in 2 days.`,
      chatId
    ));
  }

  // Transplant reminder (every method except Direct Ground)
  const transplantDate = needsTransplant(crop.plantingMethod)
    ? calculateTransplantDate(planted, null, cropData, adjustments, key, crop.variety, threshold)
    : null;
  if (transplantDate) {
    const tRemDate = addDays(transplantDate, -1);
    reminders.push(makeReminder(
      'transplant', crop.cropName, crop.id,
      tRemDate,
      `🌱 Transplant Tomorrow: ${crop.cropName}`,
      `Prepare to transplant ${crop.cropName} (${crop.variety}) tomorrow.`,
      chatId
    ));
  }

  // NOTE: pest/fungus/fertilizer schedules no longer come from the
  // foundation database. Each crop carries its own repeat interval
  // (pestIntervalDays / fungusIntervalDays / fertilizerIntervalDays),
  // managed from the Treatment tab — see lib/treatmentReminders.ts.

  // Continuous harvest batch planting reminders
  if (crop.isContinuous) {
    const batchReminders = generateContinuousPlantingReminders(crop, cropData, chatId);
    reminders.push(...batchReminders);
  }

  return reminders;
}

export function generateContinuousPlantingReminders(
  crop: Crop,
  cropData: CropData,
  chatId: string
): Reminder[] {
  const reminders: Reminder[] = [];
  const planted = parseDate(crop.plantingDate);
  if (!planted) return reminders;

  const batchDates = calculateBatchPlantingDates(crop, cropData);
  
  batchDates.forEach(batch => {
    const reminderDate = addDays(batch.date, -1);
    reminders.push(makeReminder(
      'next_batch_planting', crop.cropName, crop.id,
      reminderDate,
      `📅 Batch Planting Reminder: ${crop.cropName} (Batch #${batch.batchNumber})`,
      `Tomorrow is the planting date for ${crop.cropName} Batch #${batch.batchNumber} (${formatDateShort(batch.date)}).\n\nReply with 'planted ${crop.id} ${batch.batchNumber}' when done to update.`,
      chatId
    ));
  });

  return reminders;
}

export function calculateBatchPlantingDates(
  crop: Crop,
  cropData: CropData,
  monthsAhead = 3
): Array<{ batchNumber: number; date: Date }> {
  const planted = parseDate(crop.plantingDate);
  if (!planted) return [];

  const numWeeks = cropData.number_of_weeks_harvest || 1;

  let batchOffsetDays = crop.batchOffset || 7; // Use the stored batchOffset if available
  
  if (!crop.batchOffset) {
    if (numWeeks === 2) {
      batchOffsetDays = 7;
    } else if (numWeeks > 2) {
      batchOffsetDays = (numWeeks - 2) * 7;
    }
  }

  const batchDates: Array<{ batchNumber: number; date: Date }> = [];
  const endDate = addDays(planted, monthsAhead * 30);
  
  let currentPlantingDate = addDays(planted, batchOffsetDays);
  let batchNum = 2;

  while (currentPlantingDate <= endDate) {
    batchDates.push({ batchNumber: batchNum, date: currentPlantingDate });
    currentPlantingDate = addDays(currentPlantingDate, batchOffsetDays);
    batchNum++;
  }

  return batchDates;
}

export function generatePropReminders(
  prop: Propagation,
  propAdjustments: PropDbAdjustment[],
  chatId: string
): Reminder[] {
  const reminders: Reminder[] = [];
  const propDate = parseDate(prop.propagationDate);
  if (!propDate) return reminders;

  const rootingDays = getRootingDays(prop.plantName, prop.propagationMethod, propAdjustments);
  const rootingStart = addDays(propDate, rootingDays.min);
  reminders.push(makeReminder(
    'rooting_check', prop.plantName, prop.id,
    rootingStart,
    `🌿 Rooting Check: ${prop.plantName}`,
    `Check if ${prop.plantName} cutting has rooted (${rootingDays.min}-${rootingDays.max} day window).`,
    chatId
  ));
  return reminders;
}
