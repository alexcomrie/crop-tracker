import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrops } from '../hooks/useCrops';
import { CropCard } from '../components/crops/CropCard';
import { CropGroupCard } from '../components/crops/CropGroupCard';
import { useAppStore } from '../store/useAppStore';
import { resolveCropData } from '../lib/cropDb';
import { autoUpdateService } from '../lib/autoUpdateService';
import { CANONICAL_STAGES, normalizeStage, processStageChange } from '../lib/stages';
import { addDiaryEntry } from '../lib/diary';
import { toast } from 'sonner';
import db from '../db/db';
import { EmptyState } from '../components/shared/EmptyState';
import { BottomSheet } from '../components/shared/BottomSheet';
import { ROUTES, cropDetailsPath, cropEditPath } from '../lib/routes';
import { today } from '../lib/dates';

const CROP_FILTERS = ['All', 'Seed', 'Germinated', 'Seedling', 'Vegetative Early', 'Vegetative Middle', 'Vegetative Late', 'Flowering', 'Fruiting'];

export function CropsScreen() {
  const [cropFilter, setCropFilter] = useState('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const { cropDb } = useAppStore();
  const navigate = useNavigate();
  const cropsData = useCrops('All');
  const isLoading = cropsData === undefined;

  const cropRows = (cropsData ?? []).filter(c =>
    cropFilter === 'All' || c.plantStage === cropFilter
  );
  const hasFilter = cropFilter !== 'All';
  const cropById = new Map((cropsData ?? []).map(c => [c.id, c]));

  async function handleRollbackStage(cropId: string, stage: string) {
    const crop = cropById.get(cropId);
    if (!crop) return;
    setRollingBack(true);
    try {
      const cropData = resolveCropData(cropDb, crop.cropName);
      const [adjustments, existing] = await Promise.all([
        db.cropDbAdjustments.toArray(),
        db.harvestLogs.where('cropTrackingId').equals(crop.id).toArray(),
      ]);
      const { updatedCrop, stageLog } = processStageChange(crop, stage, today(), cropData as never, adjustments, existing);
      // Pause auto-transitions so the correction sticks instead of jumping forward again.
      await db.crops.put({ ...updatedCrop, autoHold: true } as never);
      await db.stageLogs.add({ ...stageLog, notes: 'Manual rollback from list' } as never);
      await addDiaryEntry({
        entryType: 'stage_change',
        cropId: crop.id,
        cropName: crop.cropName,
        variety: crop.variety,
        description: `${crop.plantStage} → ${stage} (rollback)`,
        details: 'Rolled back from crop list; auto-update paused',
      });
      toast.success(`Rolled back → ${stage} (auto-update paused)`);
      setActionTarget(null);
    } catch (e) {
      console.error('[crops] rollback failed', { cropId, stage, e });
      toast.error('Rollback failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRollingBack(false);
    }
  }

  async function refreshTimings() {
    await autoUpdateService.triggerNow('manual');
    toast.success('Timings refreshed');
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function cancelSelecting() {
    setSelecting(false);
    setSelectedIds([]);
  }

  async function handleDeleteCrop(id: string) {
    if (!window.confirm('Delete this crop and all its logs?')) return;
    try {
      await db.crops.delete(id);
      await db.stageLogs.where('trackingId').equals(id).delete();
      await db.harvestLogs.where('cropTrackingId').equals(id).delete();
      await db.observationLogs.where('cropId').equals(id).delete();
      await db.reminders.where('trackingId').equals(id).delete();
      setActionTarget(null);
      toast.success('Crop deleted');
    } catch (e) {
      console.error('[crops] delete failed', { id, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function archiveSelected() {
    if (selectedIds.length === 0) return;
    const now = Date.now();
    try {
      await Promise.all(selectedIds.map(async id => {
        const c = cropById.get(id);
        await db.crops.update(id, { status: 'Archived', archivedFrom: c?.status ?? 'Active', updatedAt: now } as never);
      }));
      toast.success(`Archived ${selectedIds.length} crop${selectedIds.length === 1 ? '' : 's'}`);
      cancelSelecting();
    } catch (e) {
      console.error('[crops] archive failed', { e });
      toast.error('Archive failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function clearFilters() {
    setCropFilter('All');
  }

  // Same-name crops (2+) collapse into one group card ("Pumpkin ×3").
  const cropGroups = new Map<string, typeof cropRows>();
  for (const crop of cropRows) {
    const groupKey = crop.cropName.trim().toLowerCase();
    const list = cropGroups.get(groupKey) ?? [];
    list.push(crop);
    cropGroups.set(groupKey, list);
  }

  type ListItem =
    | { type: 'group'; key: string; name: string; crops: typeof cropRows; updatedAt: number }
    | { type: 'crop'; key: string; crop: (typeof cropRows)[number]; updatedAt: number };

  const listItems: ListItem[] = [];
  for (const [groupKey, groupCrops] of cropGroups) {
    if (groupCrops.length >= 2) {
      listItems.push({
        type: 'group',
        key: `group:${groupKey}`,
        name: groupCrops[0].cropName,
        crops: groupCrops,
        updatedAt: Math.max(...groupCrops.map(c => c.updatedAt)),
      });
    } else {
      const crop = groupCrops[0];
      listItems.push({ type: 'crop', key: `crop:${crop.id}`, crop, updatedAt: crop.updatedAt });
    }
  }
  listItems.sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2">
      <div className="px-4 pb-2 flex items-center justify-between gap-2">
        <button
          onClick={() => setFilterOpen(true)}
          aria-label="Filter crops"
          className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-full text-xs border font-semibold bg-white border-gray-300 text-gray-700"
        >
          <span aria-hidden="true">🔍</span>
          {hasFilter ? 'Filtered' : 'Filter'}
          {hasFilter && <span className="w-2 h-2 rounded-full bg-green-600" />}
        </button>
        <button
          onClick={() => navigate(ROUTES.CROPS_ARCHIVE)}
          className="text-xs px-3 py-2 min-h-[36px] rounded border bg-white hover:bg-gray-50"
          title="View archived crops"
          aria-label="View archived crops"
        >📦</button>
      </div>
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter crops">
        <div className="pt-2 space-y-4">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Crop stage</p>
            <div className="flex flex-wrap gap-2">
              {CROP_FILTERS.map(f => (
                <button key={f} onClick={() => setCropFilter(f)}
                  className={`px-3 py-2 rounded-full text-xs border font-semibold ${cropFilter === f ? 'bg-green-700 text-white border-green-700' : 'bg-white border-gray-300 text-gray-700'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          {hasFilter && (
            <button onClick={() => { clearFilters(); setFilterOpen(false); }} className="w-full mt-1 text-sm text-muted-foreground">Clear filters</button>
          )}
        </div>
      </BottomSheet>
      <div className="px-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={refreshTimings} className="text-xs px-3 py-2 min-h-[36px] rounded border bg-white hover:bg-gray-50">Refresh</button>
          {selecting ? (
            <button onClick={cancelSelecting} className="text-xs px-3 py-2 min-h-[36px] rounded border bg-white hover:bg-gray-50">Cancel</button>
          ) : (
            <button onClick={() => setSelecting(true)} className="text-xs px-3 py-2 min-h-[36px] rounded border bg-white hover:bg-gray-50">Archive</button>
          )}
          {!selecting && (
            <button
              onClick={() => navigate(ROUTES.MORE_OBSERVATIONS)}
              className="text-xs px-3 py-2 min-h-[36px] rounded border bg-white hover:bg-gray-50"
              title="Field observations"
              aria-label="Field observations"
            >👁️</button>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {selecting ? `${selectedIds.length} selected` : `${cropRows.length} crop${cropRows.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {selecting && (
        <p className="px-4 pt-2 text-[11px] text-muted-foreground">Tap crops to select them for archiving.</p>
      )}

      <div className="px-4 pt-3">
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : listItems.length === 0 ? (
          <EmptyState emoji="🌱" title="Nothing here yet" subtitle="Tap + to log your first crop. Cuttings, grafts, air layers and divisions are recorded inside the crop." />
        ) : (
          <div className="space-y-2">
            {listItems.map(item => {
              if (item.type === 'group') {
                const groupKey = item.key;
                return (
                  <CropGroupCard
                    key={groupKey}
                    name={item.name}
                    crops={item.crops}
                    expanded={selecting || !!expandedGroups[groupKey]}
                    onToggleExpand={() => setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))}
                    cropDataFor={crop => resolveCropData(cropDb, crop.cropName) || undefined}
                    selectMode={selecting}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onOpenCrop={crop => navigate(cropDetailsPath(crop.id))}
                    onLongPressCrop={crop => !selecting && setActionTarget(crop.id)}
                  />
                );
              }
              const crop = item.crop;
              const selKey = crop.id;
              return (
                <CropCard
                  key={selKey}
                  crop={crop}
                  cropData={resolveCropData(cropDb, crop.cropName) || undefined}
                  kind="crop"
                  selectMode={selecting}
                  selected={selectedIds.includes(selKey)}
                  onToggle={() => toggleSelect(selKey)}
                  onClick={() => selecting ? toggleSelect(selKey) : navigate(cropDetailsPath(crop.id))}
                  onLongPress={() => !selecting && setActionTarget(crop.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {selecting && (
        <div className="fixed left-4 right-4 z-40" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
          <button
            onClick={archiveSelected}
            disabled={selectedIds.length === 0}
            className="w-full bg-green-700 text-white rounded-xl py-3 text-sm font-semibold shadow-lg disabled:opacity-40"
          >
            Archive {selectedIds.length} crop{selectedIds.length === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {!selecting && (
        <button
          onClick={() => navigate(ROUTES.CROP_CREATE)}
          aria-label="Add crop"
          className="fixed right-4 w-14 h-14 bg-amber-500 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-40 hover:bg-amber-600 active:scale-95"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        >+</button>
      )}

      <BottomSheet open={actionTarget !== null} onClose={() => setActionTarget(null)} title={
        (actionTarget ? cropById.get(actionTarget)?.cropName : null) ?? 'Crop'
      }>
        <div className="pt-2 space-y-2">
          <button
            onClick={() => {
              if (!actionTarget) return;
              navigate(cropEditPath(actionTarget));
              setActionTarget(null);
            }}
            className="w-full bg-green-700 text-white rounded-xl py-3 text-sm font-semibold"
          >✎ Edit</button>
          <button
            onClick={() => {
              if (!actionTarget) return;
              const target = actionTarget;
              setActionTarget(null);
              void handleDeleteCrop(target);
            }}
            className="w-full bg-red-50 text-red-600 border border-red-200 rounded-xl py-3 text-sm font-semibold"
          >🗑 Delete</button>
          {actionTarget && (() => {
            const crop = cropById.get(actionTarget);
            if (!crop) return null;
            const idx = (CANONICAL_STAGES as readonly string[]).indexOf(normalizeStage(crop.plantStage));
            const past = idx > 0 ? (CANONICAL_STAGES as readonly string[]).slice(0, idx) : [];
            if (past.length === 0) return null;
            return (
              <div className="pt-2 mt-1 border-t border-gray-100">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  ↩ Roll back stage <span className="normal-case font-normal">(now: {crop.plantStage})</span>
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {past.map(s => (
                    <button key={s} disabled={rollingBack} onClick={() => void handleRollbackStage(crop.id, s)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white border-gray-300 text-gray-700 disabled:opacity-40">
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Rolls back with history kept · auto-update pauses so it sticks.</p>
              </div>
            );
          })()}
        </div>
      </BottomSheet>
    </div>
  );
}
