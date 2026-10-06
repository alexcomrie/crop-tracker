import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { DateInput } from '../components/shared/DateInput';
import { shortCropId } from '../lib/ids';
import { cropDetailsPath } from '../lib/routes';
import { addDiaryEntry } from '../lib/diary';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PLANTING_METHODS = ['Seed Tray', 'Seed Bed', 'Direct Ground', 'Pot / Container', 'Cuttings', 'Division', 'Grafted', 'Hydroponic'];
const TRAY_CELLS = ['50', '75', '128', '200'];
const POT_SIZES = ['XS', 'SML', 'MED', 'LARGE', 'XL', 'XXL'];
const STATUSES = ['Active', 'Archived'];

/** Split the auto-managed "🧫 Container: ..." first line from free notes. */
function splitNotes(notes: string): { container: string; rest: string } {
  const lines = (notes ?? '').split('\n');
  if (lines[0]?.startsWith('🧫 Container:')) {
    return { container: lines[0].replace('🧫 Container:', '').trim(), rest: lines.slice(1).join('\n').trimStart() };
  }
  return { container: '', rest: notes ?? '' };
}

function parseContainer(container: string): { trayCells: string; trayCount: string; potSize: string; potCount: string } {
  const out = { trayCells: '', trayCount: '', potSize: '', potCount: '' };
  if (!container) return out;
  const cells = /(\S+)-cell/.exec(container)?.[1];
  if (cells) out.trayCells = TRAY_CELLS.includes(cells) ? cells : 'custom';
  const trays = /x(\d+)\s*trays?/.exec(container)?.[1];
  if (trays) out.trayCount = trays;
  const size = /size\s+([^·]+)/i.exec(container)?.[1]?.trim();
  if (size) out.potSize = POT_SIZES.includes(size) ? size : 'custom';
  const pots = /x(\d+)\s*pots?/.exec(container)?.[1];
  if (pots) out.potCount = pots;
  return out;
}

/**
 * Dedicated full-screen edit form for an existing crop. Unlike the new-crop
 * wizard (which rebuilds the whole record and can wipe dates/flags), this
 * patches only the edited fields and leaves everything else untouched.
 * Container fields stay blank for crops entered before that update.
 */
export function CropEditScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const crop = useLiveQuery(() => (id ? db.crops.get(id) : undefined), [id]);

  const [ready, setReady] = useState(false);
  const [variety, setVariety] = useState('');
  const [method, setMethod] = useState('');
  const [plantingDate, setPlantingDate] = useState('');
  const [germinationDate, setGerminationDate] = useState('');
  const [transplantScheduled, setTransplantScheduled] = useState('');
  const [transplantActual, setTransplantActual] = useState('');
  const [harvestEstimated, setHarvestEstimated] = useState('');
  const [status, setStatus] = useState('Active');
  const [trayCells, setTrayCells] = useState('');
  const [trayCellsCustom, setTrayCellsCustom] = useState('');
  const [trayCount, setTrayCount] = useState('');
  const [potSize, setPotSize] = useState('');
  const [potSizeCustom, setPotSizeCustom] = useState('');
  const [potCount, setPotCount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Seed the form once the crop loads (never overwrite while typing).
  useEffect(() => {
    if (!crop || ready) return;
    setVariety(crop.variety ?? '');
    setMethod(crop.plantingMethod ?? '');
    setPlantingDate(crop.plantingDate ?? '');
    setGerminationDate(crop.germinationDate ?? '');
    setTransplantScheduled(crop.transplantDateScheduled ?? '');
    setTransplantActual(crop.transplantDateActual ?? '');
    setHarvestEstimated(crop.harvestDateEstimated ?? '');
    setStatus(crop.status ?? 'Active');
    const { container, rest } = splitNotes(crop.notes ?? '');
    const parsed = parseContainer(container);
    setTrayCells(parsed.trayCells);
    if (parsed.trayCells === 'custom') {
      setTrayCellsCustom(/(\S+)-cell/.exec(container)?.[1] ?? '');
    }
    setTrayCount(parsed.trayCount);
    setPotSize(parsed.potSize);
    if (parsed.potSize === 'custom') {
      setPotSizeCustom(/size\s+([^·]+)/i.exec(container)?.[1]?.trim() ?? '');
    }
    setPotCount(parsed.potCount);
    setNotes(rest);
    setReady(true);
  }, [crop, ready]);

  if (!crop) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Crop not found</p>
        <button onClick={() => navigate('/crops')} className="ml-3 text-sm text-green-700 font-semibold">Back</button>
      </div>
    );
  }

  const trayCellsFinal = trayCells === 'custom' ? trayCellsCustom.trim() : trayCells;
  const potSizeFinal = potSize === 'custom' ? potSizeCustom.trim() : potSize;

  async function handleSave() {
    const current = crop;
    if (!id || !current) return;
    setSaving(true);
    try {
      const containerBits: string[] = [];
      if (method === 'Seed Tray') {
        if (trayCellsFinal) containerBits.push(`${trayCellsFinal}-cell`);
        if (trayCount.trim()) containerBits.push(`x${trayCount.trim()} tray${trayCount.trim() === '1' ? '' : 's'}`);
      } else if (method === 'Pot / Container') {
        if (potSizeFinal) containerBits.push(`size ${potSizeFinal}`);
        if (potCount.trim()) containerBits.push(`x${potCount.trim()} pot${potCount.trim() === '1' ? '' : 's'}`);
      }
      const notesStr = containerBits.length
        ? `🧫 Container: ${containerBits.join(' · ')}${notes.trim() ? '\n' + notes.trim() : ''}`
        : notes;

      await db.crops.update(id, {
        variety: variety.trim(),
        plantingMethod: method,
        plantingDate,
        germinationDate,
        transplantDateScheduled: transplantScheduled,
        transplantDateActual: transplantActual,
        harvestDateEstimated: harvestEstimated,
        status,
        notes: notesStr,
        updatedAt: Date.now(),
      } as never);
      await addDiaryEntry({
        entryType: 'note',
        cropId: id,
        cropName: current.cropName,
        variety: variety.trim(),
        description: 'Crop details edited',
        details: `Method: ${method}`,
        date: plantingDate || undefined,
      }).catch(() => {});
      toast.success('Crop updated');
      navigate(cropDetailsPath(id));
    } catch (e) {
      console.error('[edit] crop update failed', { id, e });
      toast.error('Could not save: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  const pill = (active: boolean) =>
    `px-3 py-2 rounded-full text-sm border ${active ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300'}`;

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2">
      <div className="max-w-md mx-auto px-4 py-2 space-y-4 overflow-y-auto">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Crop</p>
          <p className="text-lg font-bold mt-1">{crop.cropName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {shortCropId(crop.id)} · {crop.plantStage} · planted {crop.plantingDate}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Identity</p>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase">Variety</label>
            <Input value={variety} onChange={e => setVariety(e.target.value)} placeholder="Variety (optional)" className="mt-1" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase">Status</label>
            <div className="flex gap-2 mt-1">
              {STATUSES.map(s => (
                <button key={s} onClick={() => setStatus(s)} className={pill(status === s)}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Planting Method</p>
          <div className="flex flex-wrap gap-2">
            {PLANTING_METHODS.map(m => (
              <button key={m} onClick={() => setMethod(m)} className={pill(method === m)}>{m}</button>
            ))}
          </div>
          {method === 'Seed Tray' && (
            <div className="space-y-2 rounded-lg border border-green-200 bg-green-50/50 p-3">
              <p className="text-[11px] font-bold uppercase text-gray-500">Tray cells per tray</p>
              <div className="flex flex-wrap gap-2">
                {TRAY_CELLS.map(c => (
                  <button key={c} onClick={() => { setTrayCells(c); setTrayCellsCustom(''); }} className={pill(trayCells === c)}>{c}</button>
                ))}
                <button onClick={() => setTrayCells('custom')} className={pill(trayCells === 'custom')}>Manual</button>
              </div>
              {trayCells === 'custom' && (
                <Input placeholder="Cells per tray (e.g. 72)" inputMode="numeric" value={trayCellsCustom} onChange={e => setTrayCellsCustom(e.target.value)} />
              )}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Number of trays</label>
                <Input placeholder="e.g. 3 (blank for older crops)" inputMode="numeric" value={trayCount} onChange={e => setTrayCount(e.target.value)} className="mt-1" />
              </div>
            </div>
          )}
          {method === 'Pot / Container' && (
            <div className="space-y-2 rounded-lg border border-green-200 bg-green-50/50 p-3">
              <p className="text-[11px] font-bold uppercase text-gray-500">Pot size</p>
              <div className="flex flex-wrap gap-2">
                {POT_SIZES.map(s => (
                  <button key={s} onClick={() => { setPotSize(s); setPotSizeCustom(''); }} className={pill(potSize === s)}>{s}</button>
                ))}
                <button onClick={() => setPotSize('custom')} className={pill(potSize === 'custom')}>Manual</button>
              </div>
              {potSize === 'custom' && (
                <Input placeholder="Pot size (e.g. 1 gal)" value={potSizeCustom} onChange={e => setPotSizeCustom(e.target.value)} />
              )}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Number of pots</label>
                <Input placeholder="e.g. 10 (blank for older crops)" inputMode="numeric" value={potCount} onChange={e => setPotCount(e.target.value)} className="mt-1" />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Dates</p>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase">Planting date</label>
              <DateInput value={plantingDate} onChange={setPlantingDate} ariaLabel="Planting date" className="border rounded-lg px-2 py-1.5 text-xs w-full min-h-[44px] bg-white mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase">Germination date</label>
              <DateInput value={germinationDate} onChange={setGerminationDate} ariaLabel="Germination date" className="border rounded-lg px-2 py-1.5 text-xs w-full min-h-[44px] bg-white mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase">Transplant scheduled</label>
              <DateInput value={transplantScheduled} onChange={setTransplantScheduled} ariaLabel="Transplant scheduled date" className="border rounded-lg px-2 py-1.5 text-xs w-full min-h-[44px] bg-white mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase">Transplant actual</label>
              <DateInput value={transplantActual} onChange={setTransplantActual} ariaLabel="Transplant actual date" className="border rounded-lg px-2 py-1.5 text-xs w-full min-h-[44px] bg-white mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase">Harvest estimated</label>
              <DateInput value={harvestEstimated} onChange={setHarvestEstimated} ariaLabel="Harvest estimated date" className="border rounded-lg px-2 py-1.5 text-xs w-full min-h-[44px] bg-white mt-1" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Stage, harvest history, sprays and logs are untouched — edit those from Crop Details.</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Notes</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes..." className="w-full border rounded-lg p-2 text-sm min-h-[80px]" />
        </div>

        <Button className="w-full bg-green-700 hover:bg-green-800 h-12" disabled={saving || !method} onClick={handleSave}>
          {saving ? 'Saving...' : '💾 Save Changes'}
        </Button>
        <button onClick={() => navigate(cropDetailsPath(id!))} className="w-full text-sm text-muted-foreground">Cancel</button>
      </div>
    </div>
  );
}
