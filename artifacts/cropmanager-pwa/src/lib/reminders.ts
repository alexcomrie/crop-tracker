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

  // Fertilizer repeating reminders (firtilizer.md logic)
  const fertReminders = generateFertilizerReminders(crop, cropData, adjustments, chatId, threshold);
  reminders.push(...fertReminders);

  return reminders;
}

export function generateFertilizerReminders(
  crop: Crop,
  cropData: CropData,
  adjustments: CropDbAdjustment[],
  chatId: string,
  threshold = 3
): Reminder[] {
  const reminders: Reminder[] = [];
  const planted = parseDate(crop.plantingDate);
  if (!planted) return reminders;

  const growingTime = cropData.growing_time_days || 60;
  const transplantDays = cropData.transplant_days || 21;
  const harvestDate = calculateHarvestDate(crop, cropData, adjustments, threshold) || addDays(planted, growingTime);
  const transplantDate = calculateTransplantDate(planted, null, cropData, adjustments, crop.cropName.toLowerCase(), crop.variety, threshold) || addDays(planted, transplantDays);

  const stages = [
    { name: 'Seedling', start: planted, end: transplantDate, interval: 7, emoji: '🌱' },
    { name: 'Mid-Veg', start: transplantDate, end: addDays(planted, Math.floor(growingTime * 0.35)), interval: 10, emoji: '🌿' },
    { name: 'Flowering', start: addDays(planted, Math.floor(growingTime * 0.35)), end: addDays(planted, Math.floor(growingTime * 0.60)), interval: 10, emoji: '🌸' },
    { name: 'Fruiting', start: addDays(planted, Math.floor(growingTime * 0.60)), end: harvestDate, interval: 14, emoji: '🍅' },
  ];

  stages.forEach(stage => {
    let current = stage.start;
    let appNum = 1;
    const totalApps = Math.max(1, Math.ceil(daysBetween(stage.start, stage.end) / stage.interval));

    while (current < stage.end) {
      const nextDate = addDays(current, stage.interval);
      const isFirstOfStage = appNum === 1;
      
      let body = `${isFirstOfStage ? '🚀 New growth stage — switch to this mix\n' : ''}`;
      body += `Application ${appNum} of ~${totalApps}\n`;
      body += `Apply today: ${formatDateShort(current)}\n`;
      if (nextDate < stage.end) {
        body += `Next application: ${formatDateShort(nextDate)}\n`;
      }
      body += `\nMix for ${stage.name} stage: See Fertilizer guide in app.`;

      reminders.push(makeReminder(
        'fert_application', crop.cropName, crop.id,
        current,
        `${stage.emoji} Fertilizer: ${stage.name} - ${crop.cropName}`,
        body,
        chatId
      ));

      current = nextDate;
      appNum++;
    }
  });

  return reminders;
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
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
