/**
 * AutoUpdateService — overhauls the "auto update" function
 * Replaces manual Refresh Timings + foreground-only autoTransition
 * with a unified, background-aware scheduler that also consults micro-crop.
 *
 * Inspired by gist's training loop scheduling + file/services/refresh-service.ts
 */
import db from '../db/db';
import { resolveEffectiveCropData } from './personalCropDb';
import { calculateHarvestDate, calculateTransplantDate } from './harvest';
import { getPredictedHarvestDate } from './micro-crop/hybrid';
import { formatDateStored, parseDate, addDays } from './dates';
import { calcBatchOffset, calcNumBatches } from './continuous';
import { generateCropReminders } from './reminders';
import { autoAdjustTransplantSchedule, autoTransitionCrop } from './stages';

const TEXT_REFRESH_MS = 5 * 60 * 1000;
const TRANSPLANT_BUMP_MS = 60 * 1000;

type Listener = () => void;

class AutoUpdateService {
  private textTimer: number | null = null;
  private bumpTimer: number | null = null;
  private lastRefresh = 0;
  private running = false;
  private listeners = new Set<Listener>();
  private bc: BroadcastChannel | null = null;

  start() {
    if (this.running) return;
    this.running = true;

    // Broadcast to other tabs
    try { this.bc = new BroadcastChannel('cropmanager_auto'); } catch { this.bc = null; }

    // Initial idle refresh
    this.scheduleIdle(() => this.refreshAll('startup'));

    // Periodic text/data refresh (5m)
    this.textTimer = window.setInterval(() => this.refreshAll('interval'), TEXT_REFRESH_MS);
    // Transplant bump check (1m) — lightweight
    this.bumpTimer = window.setInterval(() => this.bumpTransplants(), TRANSPLANT_BUMP_MS);

    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
    // Periodic Sync if available
    const maybePeriodic = navigator as unknown as { periodicSync?: { register: (t: string, o: unknown) => Promise<void> } };
    if (maybePeriodic.periodicSync) {
      maybePeriodic.periodicSync.register('cropmanager-refresh', { minInterval: TEXT_REFRESH_MS }).catch(() => {});
    }
  }

  stop() {
    if (this.textTimer) clearInterval(this.textTimer);
    if (this.bumpTimer) clearInterval(this.bumpTimer);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    this.bc?.close();
    this.running = false;
  }

  onUpdate(cb: Listener) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async triggerNow(reason = 'manual') {
    return this.refreshAll(reason);
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - this.lastRefresh >= TEXT_REFRESH_MS) this.scheduleIdle(() => this.refreshAll('visible'));
      else this.bumpTransplants();
    }
  };

  private scheduleIdle(fn: () => void) {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(fn, { timeout: 2000 });
    else setTimeout(fn, 300);
  }

  private async bumpTransplants() {
    try {
      const crops = await db.crops.where('status').equals('Active').toArray();
      const cropDb = await this.getCropDb();
      for (const c of crops) {
        if ((c as unknown as { autoHold?: boolean }).autoHold) continue;
        const cdEff = await resolveEffectiveCropData(c.cropName, cropDb as Record<string, unknown>);
        if (!cdEff) continue;
        const adjusted = autoAdjustTransplantSchedule(c, cdEff);
        if (adjusted) await db.crops.put(adjusted);
      }
    } catch (e) {
      console.warn('[autoUpdate] bumpTransplants failed', e);
    }
  }

  private async getCropDb(): Promise<Record<string, unknown>> {
    try {
      const raw = localStorage.getItem('crop_db_override_v1');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    // fallback to the live store (useAppStore only depends on zustand + types: no cycle)
    try {
      const { useAppStore } = await import('../store/useAppStore');
      const stateCropDb = useAppStore.getState().cropDb;
      if (stateCropDb && Object.keys(stateCropDb).length > 0) return stateCropDb as Record<string, unknown>;
    } catch { /* ignore */ }
    return {};
  }

  async refreshAll(reason: string) {
    const now = Date.now();
    // debounce 10s
    if (now - this.lastRefresh < 10_000 && reason !== 'manual') return;
    this.lastRefresh = now;

    try {
      const [adjustments, microModelRow] = await Promise.all([
        db.cropDbAdjustments.toArray(),
        db.microModels?.get('micro_crop_v1').catch(() => null) as Promise<unknown>,
      ]);

      const cropDb = await this.getCropDb();
      const allActive = await db.crops.where('status').equals('Active').toArray();
      let updatedCount = 0;

      for (const c of allActive) {
        // Manual hold: hand-managed history, skip all automatic writes
        if ((c as unknown as { autoHold?: boolean }).autoHold) continue;
        const cdRaw = await resolveEffectiveCropData(c.cropName, cropDb as Record<string, unknown>);
        if (!cdRaw) continue;
        const cd = cdRaw;

        const planted = parseDate(c.plantingDate);
        if (!planted) continue;

        // Prefer micro-crop predicted harvest if available and confident
        let hDate: Date | null = null;
        try {
          const micro = microModelRow as { serialized?: Record<string, number[][]>; config?: unknown; itos?: string[] } | null;
          if (micro?.serialized && micro?.config && micro?.itos) {
            hDate = await getPredictedHarvestDate(c, cd, adjustments, micro as never);
          }
        } catch (e) {
          console.debug('[autoUpdate] micro harvest fallback', { crop: c.cropName, e });
        }
        if (!hDate) hDate = calculateHarvestDate(c, cd, adjustments);

        const tDate = calculateTransplantDate(planted, c.germinationDate ? parseDate(c.germinationDate) : null, cd, adjustments, c.cropName.toLowerCase(), c.variety);

        const patch: Record<string, unknown> = { updatedAt: Date.now() };
        if (tDate) patch.transplantDateScheduled = formatDateStored(tDate);
        if (hDate) patch.harvestDateEstimated = formatDateStored(hDate);

        // C-H logic tinygpt-enhanced (canonical math in lib/continuous.ts)
        if (c.isContinuous) {
          const freqDays = c.harvestFrequency || 7;
          let batchOffset: number;
          // try micro-crop batch prediction
          let microBatch: number | null = null;
          try {
            const micro = microModelRow as { serialized?: Record<string, number[][]>; config?: unknown; itos?: string[] } | null;
            if (micro?.serialized) {
              const { loadModel } = await import('./micro-crop/inference');
              const model = loadModel(micro.serialized, micro.config as never, micro.itos ?? []);
              const { predictBatchOffsetDays } = await import('./micro-crop/inference');
              microBatch = predictBatchOffsetDays(model, c.cropName.toLowerCase(), `${c.cropName}|${c.variety}|${c.plantingMethod}`);
            }
          } catch (e) {
            console.debug('[autoUpdate] micro batch fallback', { crop: c.cropName, e });
          }
          if (microBatch && microBatch > 3 && microBatch < 60) batchOffset = microBatch;
          else batchOffset = calcBatchOffset(cd, freqDays);
          const numBatches = calcNumBatches(cd, batchOffset);
          patch.batchOffset = batchOffset;
          patch.numPlots = numBatches;
        }

        const needsUpdate =
          (patch.transplantDateScheduled && patch.transplantDateScheduled !== c.transplantDateScheduled) ||
          (patch.harvestDateEstimated && patch.harvestDateEstimated !== c.harvestDateEstimated) ||
          (patch.batchOffset !== undefined && patch.batchOffset !== c.batchOffset);

        if (needsUpdate) {
          await db.crops.update(c.id, patch as never);
          updatedCount++;

          // Regenerate reminders: delete old then recreate (fixes leak)
          await db.reminders.where('trackingId').equals(c.id).delete();
          const updated = await db.crops.get(c.id);
          if (updated) {
            const chatId = (updated as unknown as { telegramChatId?: string }).telegramChatId || '';
            const rems = generateCropReminders(updated as never, cd, adjustments, chatId);
            if (rems.length) await db.reminders.bulkAdd(rems as never);
          }

          // Update batch logs
          if ((patch as { batchOffset?: number }).batchOffset != null) {
            const batches = await db.batchPlantingLogs.where('cropTrackingId').equals(c.id).toArray();
            for (const b of batches) {
              const bd = addDays(planted, (b.batchNumber - 1) * (patch as { batchOffset: number }).batchOffset);
              const nb = addDays(planted, b.batchNumber * (patch as { batchOffset: number }).batchOffset);
              await db.batchPlantingLogs.update(b.id, {
                batchPlantingDate: formatDateStored(bd),
                nextBatchDate: formatDateStored(nb),
                updatedAt: Date.now(),
              } as never);
            }
          }
        }
      }

      // Global auto-transition pass (not tied to CropsScreen mount)
      for (const c of allActive) {
        if ((c as unknown as { autoHold?: boolean }).autoHold) continue;
        const cd = await resolveEffectiveCropData(c.cropName, cropDb as Record<string, unknown>);
        if (!cd) continue;
        let cur: typeof c | null = c as never;
        let guard = 0;
        while (cur && guard++ < 8) {
          const transitioned = await autoTransitionCrop(cur as never, cd as never, { stageLogs: db.stageLogs, crops: db.crops } as never);
          if (!transitioned) break;
          cur = await db.crops.get(c.id) as never;
        }
      }

      // Expire Deleted → real delete after 3d (migrated from CropsScreen)
      const threshold = Date.now() - 3 * 86400000;
      const toDelete = await db.crops.where('status').equals('Deleted').toArray();
      for (const d of toDelete) if ((d as unknown as { updatedAt: number }).updatedAt < threshold) {
        await db.crops.delete(d.id);
        await db.stageLogs.where('trackingId').equals(d.id).delete();
        await db.harvestLogs.where('cropTrackingId').equals(d.id).delete();
        await db.reminders.where('trackingId').equals(d.id).delete();
        await (db as unknown as { treatmentLogs: { where: (k: string) => { equals: (v: string) => { delete: () => Promise<void> } } } }).treatmentLogs.where('cropId').equals(d.id).delete();
      }

      if (updatedCount > 0) {
        this.listeners.forEach(fn => { try { fn(); } catch (e) { console.warn('[autoUpdate] listener failed', e); } });
        this.bc?.postMessage({ type: 'refreshed', count: updatedCount, reason });
      }
    } catch (e) {
      console.error('[autoUpdate] refresh failed', e);
    }
  }
}

export const autoUpdateService = new AutoUpdateService();
