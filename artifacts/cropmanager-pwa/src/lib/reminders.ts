import type { Crop, Propagation, Reminder, CropData, CropDbAdjustment, PropDbAdjustment } from '../types';
import { generateId } from './ids';
import { parseDate, addDays, formatDateShort } from './dates';
import { getAdjustedValue, calculateHarvestDate, calculateTransplantDate } from './harvest';
import { calcSprayDates } from './sprays';
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
  return {
    id: generateId('REM'),
    type,
    cropPlantName,
    trackingId,
    sendDate: formatDateShort(sendDate),
    subject,
    body,
    sent: false,
    chatId,
    syncStatus: 'pending',
    updatedAt: Date.now(),
  };
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

  // Transplant reminder (only if transplant method)
  const transplantDate = calculateTransplantDate(planted, null, cropData, adjustments, key, crop.variety, threshold);
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

  // Fungus spray reminders
  const fungusDates = calcSprayDates(planted, cropData.fungus_spray_days || []);
  fungusDates.forEach(d => {
    reminders.push(makeReminder(
      'spray_fungus', crop.cropName, crop.id,
      d,
      `🍄 Fungus Spray: ${crop.cropName}`,
      `Apply fungus spray to ${crop.cropName} (${crop.variety}).`,
      chatId
    ));
  });

  // Pest spray reminders
  const pestDates = calcSprayDates(planted, cropData.pest_spray_days || []);
  pestDates.forEach(d => {
    reminders.push(makeReminder(
      'spray_pest', crop.cropName, crop.id,
      d,
      `🐛 Pest Spray: ${crop.cropName}`,
      `Apply pest spray to ${crop.cropName} (${crop.variety}).`,
      chatId
    ));
  });

  return reminders;
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
