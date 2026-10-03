import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrops } from '../hooks/useCrops';
import { useProps } from '../hooks/useProps';
import { CropCard } from '../components/crops/CropCard';
import { PropCard } from '../components/props/PropCard';
import { PropDetail } from '../components/props/PropDetail';
import { PropForm } from '../components/props/PropForm';
import type { Propagation } from '../types';
import { useAppStore } from '../store/useAppStore';
import { resolveCropData } from '../lib/cropDb';
import { autoUpdateService } from '../lib/autoUpdateService';
import { toast } from 'sonner';
import db from '../db/db';
import { EmptyState } from '../components/shared/EmptyState';
import { BottomSheet } from '../components/shared/BottomSheet';
import { AddEntrySheet } from '../components/shared/AddEntrySheet';
import { formatDateShort, today, parseDate, daysBetween } from '../lib/dates';
import { ROUTES, cropDetailsPath } from '../lib/routes';

const CROP_FILTERS = ['All','Seed','Germinated','Seedling','Vegetative Early','Vegetative Middle','Vegetative Late','Flowering','Fruiting'];
const PROP_FILTERS = ['All','Propagating','Callusing','Rooted','Potted / Transplanted','Failed'];
const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'crop', label: '🌾 Crops' },
  { id: 'propagation', label: '🌿 Props' },
] as const;

type Kind = 'crop' | 'propagation';

export function CropsScreen() {
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [cropFilter, setCropFilter] = useState('All');
  const [propFilter, setPropFilter] = useState('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [showPropForm, setShowPropForm] = useState(false);
  const [editProp, setEditProp] = useState<Propagation | undefined>(undefined);
  const [selectedProp, setSelectedProp] = useState<Propagation | null>(null);
  const [actionTarget, setActionTarget] = useState<{ kind: Kind; id: string } | null>(null);
  const { cropDb } = useAppStore();
  const navigate = useNavigate();
  const cropsData = useCrops('All');
  const propsData = useProps('All');
  const isLoading = cropsData === undefined || propsData === undefined;

  const cropRows = (cropsData ?? []).filter(c =>
    kind !== 'propagation' && (cropFilter === 'All' || c.plantStage === cropFilter)
  );
  const propRows = (propsData ?? []).filter(p =>
    kind !== 'crop' && (propFilter === 'All' || p.status === propFilter)
  );
  const hasFilter = kind !== 'all' || cropFilter !== 'All' || propFilter !== 'All';

  type Row = { key: string; kind: Kind; updatedAt: number };
  const rows: Row[] = [
    ...cropRows.map(c => ({ key: `crop:${c.id}`, kind: 'crop' as const, updatedAt: c.updatedAt })),
    ...propRows.map(p => ({ key: `prop:${p.id}`, kind: 'propagation' as const, updatedAt: p.updatedAt })),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
  const cropById = new Map((cropsData ?? []).map(c => [c.id, c]));
  const propById = new Map((propsData ?? []).map(p => [p.id, p]));

  async function refreshTimings() {
    await autoUpdateService.triggerNow('manual');
    toast.success('Timings refreshed');
  }

  function toggleSelect(key: string) {
    setSelectedKeys(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
  }

  function cancelSelecting() {
    setSelecting(false);
    setSelectedKeys([]);
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
    if (selectedKeys.length === 0) return;
    const now = Date.now();
    try {
      const cropIds = selectedKeys.filter(k => k.startsWith('crop:')).map(k => k.slice(5));
      const propIds = selectedKeys.filter(k => k.startsWith('prop:')).map(k => k.slice(5));
      await Promise.all([
        ...cropIds.map(async id => {
          const c = cropById.get(id);
          await db.crops.update(id, { status: 'Archived', archivedFrom: c?.status ?? 'Active', updatedAt: now } as never);
        }),
        ...propIds.map(async id => {
          const p = propById.get(id);
          await db.propagations.update(id, { status: 'Archived', archivedFrom: p?.status ?? 'Propagating', updatedAt: now } as never);
        }),
      ]);
      toast.success(`Archived ${selectedKeys.length} item${selectedKeys.length === 1 ? '' : 's'}`);
      cancelSelecting();
    } catch (e) {
      console.error('[crops] archive failed', { e });
      toast.error('Archive failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDeleteProp(id: string) {
    try {
      await db.propagations.delete(id);
      await db.reminders.where('trackingId').equals(id).delete();
      setSelectedProp(null);
      toast.success('Propagation deleted');
    } catch (e) {
      console.error('[props] delete failed', { id, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handlePropAction(prop: Propagation, newStatus: string) {
    const update: Partial<Propagation> = { status: newStatus, updatedAt: Date.now() };
    if (newStatus === 'Rooted') {
      update.actualRootingDate = formatDateShort(today());
      const start = parseDate(prop.propagationDate);
      if (start) {
        update.daysToRootActual = daysBetween(start, today());
      }
    }
    try {
      await db.propagations.update(prop.id, update);
    } catch (e) {
      console.error('[props] status change failed', { id: prop.id, newStatus, e });
      toast.error('Update failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function clearFilters() {
    setKind('all');
    setCropFilter('All');
    setPropFilter('All');
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2">
      <div className="px-4 pb-2 flex items-center justify-between gap-2">
        <button
          onClick={() => setFilterOpen(true)}
          aria-label="Filter tracker"
          className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-full text-xs border font-semibold bg-white border-gray-300 text-gray-700"
        >
          <span aria-hidden="true">🔍</span>
          {hasFilter ? 'Filtered' : 'Filter'}
          {hasFilter && <span className="w-2 h-2 rounded-full bg-green-600" />}
        </button>
        <button
          onClick={() => navigate(ROUTES.CROPS_ARCHIVE)}
          className="text-xs px-3 py-2 min-h-[36px] rounded border bg-white hover:bg-gray-50"
          title="View archived items"
          aria-label="View archived items"
        >📦</button>
      </div>
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter tracker">
        <div className="pt-2 space-y-4">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Type</p>
            <div className="flex gap-2">
              {KINDS.map(k => (
                <button key={k.id} onClick={() => setKind(k.id)}
                  className={`flex-1 px-3 py-2 rounded-full text-xs border font-semibold ${kind===k.id?'bg-green-700 text-white border-green-700':'bg-white border-gray-300 text-gray-700'}`}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          {kind !== 'propagation' && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Crop stage</p>
              <div className="flex flex-wrap gap-2">
                {CROP_FILTERS.map(f => (
                  <button key={f} onClick={() => setCropFilter(f)}
                    className={`px-3 py-2 rounded-full text-xs border font-semibold ${cropFilter===f?'bg-green-700 text-white border-green-700':'bg-white border-gray-300 text-gray-700'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
          {kind !== 'crop' && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Propagation status</p>
              <div className="flex flex-wrap gap-2">
                {PROP_FILTERS.map(f => (
                  <button key={f} onClick={() => setPropFilter(f)}
                    className={`px-3 py-2 rounded-full text-xs border font-semibold ${propFilter===f?'bg-blue-700 text-white border-blue-700':'bg-white border-gray-300 text-gray-700'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
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
          {selecting ? `${selectedKeys.length} selected` : `${cropRows.length} crops · ${propRows.length} props`}
        </span>
      </div>
      {selecting && (
        <p className="px-4 pt-2 text-[11px] text-muted-foreground">Tap items to select them for archiving.</p>
      )}

      <div className="px-4 pt-3">
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <EmptyState emoji="🌱" title="Nothing here yet" subtitle="Tap + to log your first crop or propagation." />
        ) : (
          <div className="space-y-2">
            {rows.map(row => {
              if (row.kind === 'crop') {
                const crop = cropById.get(row.key.slice(5));
                if (!crop) return null;
                const selKey = row.key;
                return (
                  <CropCard
                    key={selKey}
                    crop={crop}
                    cropData={resolveCropData(cropDb, crop.cropName) || undefined}
                    kind="crop"
                    selectMode={selecting}
                    selected={selectedKeys.includes(selKey)}
                    onToggle={() => toggleSelect(selKey)}
                    onClick={() => selecting ? toggleSelect(selKey) : navigate(cropDetailsPath(crop.id))}
                    onLongPress={() => !selecting && setActionTarget({ kind: 'crop', id: crop.id })}
                  />
                );
              }
              const prop = propById.get(row.key.slice(5));
              if (!prop) return null;
              const selKey = row.key;
              return (
                <PropCard
                  key={selKey}
                  prop={prop}
                  selectMode={selecting}
                  selected={selectedKeys.includes(selKey)}
                  onToggle={() => toggleSelect(selKey)}
                  onClick={() => selecting ? toggleSelect(selKey) : setSelectedProp(prop)}
                  onAction={action => handlePropAction(prop, action)}
                  onLongPress={() => !selecting && setActionTarget({ kind: 'propagation', id: prop.id })}
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
            disabled={selectedKeys.length === 0}
            className="w-full bg-green-700 text-white rounded-xl py-3 text-sm font-semibold shadow-lg disabled:opacity-40"
          >
            Archive {selectedKeys.length} item{selectedKeys.length === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {!selecting && (
        <button
          onClick={() => setChooserOpen(true)}
          aria-label="Add crop or propagation"
          className="fixed right-4 w-14 h-14 bg-amber-500 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-40 hover:bg-amber-600 active:scale-95"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        >+</button>
      )}

      <AddEntrySheet
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onSelectCrop={() => { setChooserOpen(false); navigate(ROUTES.CROP_CREATE); }}
        onSelectPropagation={() => { setChooserOpen(false); setEditProp(undefined); setShowPropForm(true); }}
      />
      {showPropForm && (
        <PropForm
          open={showPropForm}
          onClose={() => { setShowPropForm(false); setEditProp(undefined); }}
          editProp={editProp}
        />
      )}
      {selectedProp && (
        <PropDetail
          prop={selectedProp}
          onClose={() => setSelectedProp(null)}
          onEdit={() => { setEditProp(selectedProp); setShowPropForm(true); setSelectedProp(null); }}
          onDelete={() => handleDeleteProp(selectedProp.id)}
        />
      )}
      <BottomSheet open={actionTarget !== null} onClose={() => setActionTarget(null)} title={
        actionTarget?.kind === 'crop'
          ? (cropById.get(actionTarget.id)?.cropName ?? 'Crop')
          : (propById.get(actionTarget?.id ?? '')?.plantName ?? 'Propagation')
      }>
        <div className="pt-2 space-y-2">
          <button
            onClick={() => {
              if (!actionTarget) return;
              if (actionTarget.kind === 'crop') {
                navigate(`/crops/new?edit=${actionTarget.id}`);
              } else {
                const prop = propById.get(actionTarget.id);
                if (prop) {
                  setEditProp(prop);
                  setShowPropForm(true);
                }
              }
              setActionTarget(null);
            }}
            className="w-full bg-green-700 text-white rounded-xl py-3 text-sm font-semibold"
          >✎ Edit</button>
          <button
            onClick={() => {
              if (!actionTarget) return;
              const target = actionTarget;
              setActionTarget(null);
              if (target.kind === 'crop') void handleDeleteCrop(target.id);
              else void handleDeleteProp(target.id);
            }}
            className="w-full bg-red-50 text-red-600 border border-red-200 rounded-xl py-3 text-sm font-semibold"
          >🗑 Delete</button>
        </div>
      </BottomSheet>
    </div>
  );
}
