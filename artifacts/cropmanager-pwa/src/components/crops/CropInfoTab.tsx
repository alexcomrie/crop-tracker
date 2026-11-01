import React, { useState } from 'react';
import { Camera, Trash2, Save, Leaf, FlaskConical, Bug, ShieldAlert, Microscope, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import db from '../../db/db';
import type { Crop, CropData, HarvestLog, StageLog, TreatmentLog } from '../../types';
import { parseDate, daysBetween, today } from '../../lib/dates';
import { compressImage } from '../../lib/image';
import { bacteriaGuidance, getCropPhRange, suggestEnvironment } from '../../lib/cropInfo';

interface CropInfoTabProps {
  crop: Crop;
  cropData: CropData | null;
  stageLogs: StageLog[];
  harvestLogs: HarvestLog[];
  treatmentLogs: TreatmentLog[];
}

const ENVIRONMENTS = [
  'Open field',
  'Raised bed',
  'Container',
  'Greenhouse / shade house',
  'Trellised field',
  'Nursery',
];

export function CropInfoTab({ crop, cropData, stageLogs, harvestLogs, treatmentLogs }: CropInfoTabProps) {
  const [imageBusy, setImageBusy] = useState(false);
  const [environment, setEnvironment] = useState(crop.environment || suggestEnvironment(crop));
  const [locLat, setLocLat] = useState(crop.location?.lat?.toString() ?? '');
  const [locLng, setLocLng] = useState(crop.location?.lng?.toString() ?? '');
  const [phMin, setPhMin] = useState(crop.soilPhMin?.toString() ?? '');
  const [phMax, setPhMax] = useState(crop.soilPhMax?.toString() ?? '');
  const [phActual, setPhActual] = useState(crop.soilPhActual?.toString() ?? '');
  const [bacteria, setBacteria] = useState(crop.bacteriaNotes ?? '');
  const [savingInfo, setSavingInfo] = useState(false);

  const planted = parseDate(crop.plantingDate);
  const ageDays = planted ? daysBetween(planted, today()) : 0;
  const referencePh = getCropPhRange(crop.cropName, cropData?.plant_type);

  const harvests = harvestLogs.length;
  const avgHarvestInterval = (() => {
    if (harvestLogs.length < 2) return null;
    const dates = harvestLogs
      .map(h => parseDate(h.harvestDate))
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length < 2) return null;
    let total = 0;
    for (let i = 1; i < dates.length; i++) total += daysBetween(dates[i - 1], dates[i]);
    return Math.round(total / (dates.length - 1));
  })();

  const lastTreatment = [...treatmentLogs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const lastTreatmentDays = lastTreatment ? (parseDate(lastTreatment.date) ? daysBetween(parseDate(lastTreatment.date)!, today()) : null) : null;

  async function updateCrop(patch: Partial<Crop>) {
    await db.crops.update(crop.id, { ...patch, updatedAt: Date.now() } as never);
  }

  async function handleImage(file: File | null) {
    if (!file) return;
    setImageBusy(true);
    try {
      const dataUrl = await compressImage(file);
      await updateCrop({ imageDataUrl: dataUrl });
      toast.success('Crop photo saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save photo');
    } finally {
      setImageBusy(false);
    }
  }

  async function handleRemoveImage() {
    try {
      await updateCrop({ imageDataUrl: undefined });
      toast.success('Photo removed');
    } catch (e) {
      toast.error('Could not remove photo: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function saveDetails() {
    setSavingInfo(true);
    try {
      const parse = (v: string): number | undefined => {
        const n = Number(v);
        return v.trim() === '' || !Number.isFinite(n) ? undefined : n;
      };
      const lat = Number(locLat);
      const lng = Number(locLng);
      await updateCrop({
        environment,
        location: Number.isFinite(lat) && Number.isFinite(lng) && locLat.trim() && locLng.trim() ? { lat, lng } : undefined,
        soilPhMin: parse(phMin),
        soilPhMax: parse(phMax),
        soilPhActual: parse(phActual),
        bacteriaNotes: bacteria.trim() || undefined,
      });
      toast.success('Crop info saved');
    } catch (e) {
      toast.error('Could not save: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSavingInfo(false);
    }
  }

  const pests = cropData?.pests ?? [];
  const diseases = cropData?.diseases ?? [];

  return (
    <div className="space-y-3">
      {/* Photo */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {crop.imageDataUrl ? (
          <div className="relative">
            <img src={crop.imageDataUrl} alt={`${crop.cropName} planting`} className="w-full h-44 object-cover" />
            <div className="absolute top-2 right-2 flex gap-1.5">
              <label className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center cursor-pointer">
                <Camera className="w-4 h-4" />
                <input type="file" accept="image/*" className="hidden" onChange={e => void handleImage(e.target.files?.[0] ?? null)} />
              </label>
              <button onClick={() => void handleRemoveImage()} className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center" aria-label="Remove photo">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-1.5 h-32 bg-gray-50 text-gray-400 cursor-pointer hover:bg-gray-100">
            <ImagePlus className="w-6 h-6" />
            <span className="text-[11px] font-semibold">{imageBusy ? 'Saving photo…' : 'Add a crop / planting photo'}</span>
            <span className="text-[9px]">Stored on this device only</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => void handleImage(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </div>

      {/* Identity */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1"><Leaf className="w-3 h-3" /> Crop details</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <Info label="Crop" value={crop.cropName} />
          <Info label="Variety" value={crop.variety || '—'} />
          <div>
            <p className="text-[9px] font-bold uppercase text-gray-400">Environment</p>
            <select
              value={environment}
              onChange={e => setEnvironment(e.target.value)}
              className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
            >
              {Array.from(new Set([environment, ...ENVIRONMENTS])).filter(Boolean).map(env => (
                <option key={env} value={env}>{env}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <p className="text-[9px] font-bold uppercase text-gray-400">Location (optional)</p>
            <div className="grid grid-cols-2 gap-2 mt-0.5">
              <input type="number" step="0.000001" value={locLat} onChange={e => setLocLat(e.target.value)} placeholder="Latitude" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
              <input type="number" step="0.000001" value={locLng} onChange={e => setLocLng(e.target.value)} placeholder="Longitude" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
            </div>
          </div>
          <Info label="Planting method" value={crop.plantingMethod || '—'} />
          <Info label="Planted" value={crop.plantingDate || '—'} />
          <Info label="Age" value={`${ageDays} days`} />
          <Info label="Plot / batch" value={[crop.plotId, crop.batchNumber ? `Batch ${crop.batchNumber}` : ''].filter(Boolean).join(' · ') || '—'} />
          <Info label="Stage" value={crop.plantStage || '—'} />
          {crop.propagationMethod && <Info label="Propagation" value={`${crop.propagationMethod}${crop.propagationStage ? ` · ${crop.propagationStage}` : ''}`} />}
          <Info label="Est. harvest" value={crop.harvestDateEstimated || '—'} />
          <Info label="Status" value={crop.status || '—'} />
        </div>
      </div>

      {/* Soil pH */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1"><FlaskConical className="w-3 h-3" /> Soil pH</p>
        {referencePh && (
          <p className="text-[11px] text-gray-600">
            Reference range for {crop.cropName}: <strong className="text-green-700">{referencePh[0]}–{referencePh[1]}</strong>
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[9px] font-bold uppercase text-gray-400">Min</label>
            <input type="number" step="0.1" value={phMin} placeholder={referencePh ? String(referencePh[0]) : '—'} onChange={e => setPhMin(e.target.value)} className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase text-gray-400">Max</label>
            <input type="number" step="0.1" value={phMax} placeholder={referencePh ? String(referencePh[1]) : '—'} onChange={e => setPhMax(e.target.value)} className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase text-gray-400">Measured</label>
            <input type="number" step="0.1" value={phActual} placeholder="e.g. 6.4" onChange={e => setPhActual(e.target.value)} className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          </div>
        </div>
        {phActual && referencePh && (() => {
          const n = Number(phActual);
          const ok = n >= referencePh[0] && n <= referencePh[1];
          return (
            <p className={`text-[11px] font-medium ${ok ? 'text-green-700' : 'text-amber-700'}`}>
              {ok ? `Measured pH ${n} is inside the reference range.` : `Measured pH ${n} is outside ${referencePh[0]}–${referencePh[1]} — adjust gradually and retest.`}
            </p>
          );
        })()}
      </div>

      {/* Pests & diseases */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1"><Bug className="w-3 h-3" /> Pests & diseases</p>
        <div>
          <p className="text-[9px] font-bold uppercase text-gray-400">Common pests</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {pests.length ? pests.map(p => (
              <span key={p} className="text-[10px] bg-orange-50 text-orange-700 border border-orange-100 rounded-full px-2 py-0.5">{p}</span>
            )) : <span className="text-[11px] text-gray-400">No pest data for this crop yet.</span>}
          </div>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-gray-400">Common diseases</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {diseases.length ? diseases.map(d => (
              <span key={d} className="text-[10px] bg-red-50 text-red-700 border border-red-100 rounded-full px-2 py-0.5">{d}</span>
            )) : <span className="text-[11px] text-gray-400">No disease data for this crop yet.</span>}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground italic flex items-start gap-1">
          <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />
          Use the Treatment Database for product rates, REI and PHI before spraying.
        </p>
      </div>

      {/* Bacteria / soil biology */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1"><Microscope className="w-3 h-3" /> Beneficial bacteria / soil biology</p>
        <p className="text-[11px] text-gray-500">{bacteriaGuidance(cropData?.plant_type)}</p>
        <textarea
          value={bacteria}
          onChange={e => setBacteria(e.target.value)}
          placeholder="What you applied, when, and what you noticed…"
          rows={3}
          className="w-full border border-gray-200 rounded-lg p-2 text-xs"
        />
      </div>

      {/* Local analytics */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Local analytics</p>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Days in ground" value={`${ageDays}d`} />
          <Metric label="Stage changes" value={String(stageLogs.length)} />
          <Metric label="Treatments logged" value={String(treatmentLogs.length)} />
          <Metric label="Harvests logged" value={String(harvests)} />
          <Metric label="Avg harvest gap" value={avgHarvestInterval ? `${avgHarvestInterval}d` : '—'} />
          <Metric label="Last treatment" value={lastTreatment ? (lastTreatmentDays === 0 ? 'today' : `${lastTreatmentDays}d ago`) : '—'} />
        </div>
        {lastTreatment && (
          <p className="text-[10px] text-gray-500">
            Last product: <strong>{lastTreatment.product || lastTreatment.type}</strong> on {lastTreatment.date}
          </p>
        )}
      </div>

      <button
        onClick={() => void saveDetails()}
        disabled={savingInfo}
        className="w-full bg-green-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        <Save className="w-4 h-4" /> {savingInfo ? 'Saving…' : 'Save crop info'}
      </button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase text-gray-400">{label}</p>
      <p className="text-[11px] font-medium text-gray-800 truncate">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-2 py-1.5">
      <p className="text-[9px] text-gray-400 uppercase font-bold">{label}</p>
      <p className="text-sm font-bold text-gray-800">{value}</p>
    </div>
  );
}
