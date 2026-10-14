import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import db from '../../db/db';
import { generateId, shortCropId } from '../../lib/ids';
import { DateInput } from '../shared/DateInput';
import { formatDateShort, today } from '../../lib/dates';
import { daysToParts, partsToDays, formatDuration, durationToDate, type DurationParts } from '../../lib/reminderTime';
import type { Crop } from '../../types';

export const REM_TYPES = [
  { id: 'fungicide', label: 'Fungicide spray', icon: '🍄' },
  { id: 'pesticide', label: 'Pesticide spray', icon: '🐛' },
  { id: 'fertilizer', label: 'Fertilizer', icon: '🧪' },
  { id: 'water', label: 'Watering check', icon: '💧' },
  { id: 'inspect', label: 'Inspect plant', icon: '🔍' },
  { id: 'harvest', label: 'Check harvest', icon: '🥬' },
  { id: 'custom', label: 'Custom task', icon: '📝' },
];

const QUICK_WAITS = [
  { label: '2d', days: 2 },
  { label: '1w', days: 7 },
  { label: '2w', days: 14 },
  { label: '1m', days: 28 },
];

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <span className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Less ${label}`}
          className="w-7 h-7 rounded-full bg-white border border-gray-200 text-base font-bold text-gray-600">−</button>
        <span className="w-6 text-center text-sm font-bold">{value}</span>
        <button onClick={() => onChange(value + 1)} aria-label={`More ${label}`}
          className="w-7 h-7 rounded-full bg-purple-600 text-white text-base font-bold">+</button>
      </span>
    </div>
  );
}

interface Props {
  /** When set, the reminder is locked to this crop (Crop Details usage). */
  fixedCrop?: { id: string; cropName: string } | null;
  crops: Crop[];
  onDone?: () => void;
}

/**
 * One form for every reminder: scope (crop vs field note), type, then
 * schedule mode — a specific date, or "in …" wait duration with smart
 * d/w/m stepping (7d → 1w, 4w → 1m).
 */
export function ReminderForm({ fixedCrop, crops, onDone }: Props) {
  const [scope, setScope] = useState<'crop' | 'field'>(fixedCrop ? 'crop' : 'field');
  const [cropId, setCropId] = useState(fixedCrop?.id ?? crops[0]?.id ?? '');
  const [plant, setPlant] = useState('');
  const [type, setType] = useState('fungicide');
  const [product, setProduct] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<'date' | 'wait'>('wait');
  const [date, setDate] = useState(formatDateShort(today()));
  const [parts, setParts] = useState<DurationParts>({ months: 0, weeks: 0, days: 2 });

  const totalDays = useMemo(() => partsToDays(parts), [parts]);
  const targetDate = mode === 'date' ? date : durationToDate(totalDays);

  function bump(key: keyof DurationParts, v: number) {
    setParts(prev => {
      const next = { ...prev, [key]: Math.max(0, v) };
      // Smart carry: 7d → 1w, 4w → 1m (keeps the display stepped)
      if (next.days > 6) {
        next.weeks += Math.floor(next.days / 7);
        next.days = next.days % 7;
      }
      if (next.weeks > 3) {
        next.months += Math.floor(next.weeks / 4);
        next.weeks = next.weeks % 4;
      }
      if (next.months > 11) next.months = 11;
      return next;
    });
  }

  async function handleSave() {
    const effectiveCropId = fixedCrop?.id ?? (scope === 'crop' ? cropId : '');
    const crop = crops.find(c => c.id === effectiveCropId);
    const name = fixedCrop?.cropName ?? (scope === 'crop' ? crop?.cropName ?? '' : plant.trim());
    if (!name) { toast.error(scope === 'crop' ? 'Pick a crop first' : 'Enter a plant name first'); return; }
    if (mode === 'date' && !date) { toast.error('Pick a date first'); return; }
    const sendDate = mode === 'date' ? date : durationToDate(totalDays);
    const meta = REM_TYPES.find(t => t.id === type);
    const waitBit = mode === 'wait' ? ` (in ${formatDuration(totalDays)})` : '';
    const rem = {
      id: generateId('REM'),
      type,
      cropPlantName: name,
      trackingId: effectiveCropId || 'MANUAL',
      sendDate,
      subject: `${meta?.icon ?? '🔔'} ${meta?.label ?? type}${waitBit}`,
      body: `${product ? `Product: ${product}. ` : ''}${notes}`.trim(),
      sent: false,
      durationDays: mode === 'wait' ? totalDays : undefined,
      chatId: '',
      updatedAt: Date.now(),
    };
    try {
      await db.reminders.add(rem as never);
    } catch (e) {
      console.error('[reminders] add failed', { rem, e });
      toast.error('Could not save reminder: ' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    toast.success(`Reminder set → ${sendDate}`);
    onDone?.();
  }

  const effectiveCrop = crops.find(c => c.id === (fixedCrop?.id ?? cropId));

  return (
    <div className="space-y-3">
      {!fixedCrop && (
        <div className="flex gap-1">
          {(['crop', 'field'] as const).map(s => (
            <button key={s} onClick={() => setScope(s)}
              className={`flex-1 py-1.5 rounded-full text-xs font-bold border ${scope === s ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-gray-200 text-gray-600'}`}>
              {s === 'crop' ? '🌾 Tracked crop' : '🌱 Field note'}
            </button>
          ))}
        </div>
      )}

      {scope === 'crop' && !fixedCrop && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Crop</label>
          {crops.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tracked crops — use Field note instead.</p>
          ) : (
            <select value={cropId} onChange={e => setCropId(e.target.value)} className="w-full border rounded-lg p-2 text-sm bg-white">
              {crops.map(c => (
                <option key={c.id} value={c.id}>{c.cropName}{c.variety ? ` (${c.variety})` : ''} · {shortCropId(c.id)}</option>
              ))}
            </select>
          )}
        </div>
      )}
      {(fixedCrop || (scope === 'crop' && effectiveCrop)) && (
        <p className="text-[11px] bg-purple-50 border border-purple-100 text-purple-800 rounded-lg px-2 py-1.5">
          🔔 For <strong>{fixedCrop?.cropName ?? effectiveCrop?.cropName}</strong> · {shortCropId(fixedCrop?.id ?? effectiveCrop?.id ?? '')}
        </p>
      )}
      {scope === 'field' && !fixedCrop && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Plant / Place</label>
          <Input placeholder="e.g. Peppers (back bed)" value={plant} onChange={e => setPlant(e.target.value)} />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Task Type</label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {REM_TYPES.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.icon} {t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1">
        {(['wait', 'date'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 py-1.5 rounded-full text-xs font-bold border ${mode === m ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-gray-200 text-gray-600'}`}>
            {m === 'wait' ? '⏳ Wait…' : '📅 Date…'}
          </button>
        ))}
      </div>

      {mode === 'wait' ? (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            {QUICK_WAITS.map(q => (
              <button key={q.label} onClick={() => setParts(daysToParts(q.days))}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${totalDays === q.days ? 'bg-purple-50 border-purple-400 text-purple-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                {q.label}
              </button>
            ))}
          </div>
          <Stepper label="Months" value={parts.months} onChange={v => bump('months', v)} />
          <Stepper label="Weeks" value={parts.weeks} onChange={v => bump('weeks', v)} />
          <Stepper label="Days" value={parts.days} onChange={v => bump('days', v)} />
          <p className="text-xs text-center font-bold text-purple-700">⏰ In {formatDuration(totalDays)} → {targetDate}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Due Date</label>
          <DateInput value={date} onChange={setDate} ariaLabel="Reminder due date" />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Product / Details</label>
        <Input placeholder="e.g. Copper fungicide, Neem oil" value={product} onChange={e => setProduct(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Notes</label>
        <Input placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <Button className="w-full bg-purple-600 hover:bg-purple-700 h-10 font-bold" onClick={handleSave}>💾 Save Reminder</Button>
    </div>
  );
}
