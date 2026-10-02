import React, { useState } from 'react';
import type { Tracking, TrackingEntry } from '../../types';
import { parseDate, daysBetween, today } from '../../lib/dates';
import { DateInput } from '../shared/DateInput';

interface TrackingCardProps {
  tracking: Tracking;
  entries: TrackingEntry[];
  onFinish: (id: string, startDate: string, label: string) => void;
  onFail: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveEdit: (id: string, patch: { label: string; tagNumber: string; startDate: string; notes: string }) => void;
  onAddEntry: (trackingId: string, text: string) => void;
  onDeleteEntry: (entryId: string) => void;
}

/** Shared fruit/crop growth tracking card: start date + elapsed days only. No guessed maturity. */
export function TrackingCard({ tracking: t, entries, onFinish, onFail, onDelete, onSaveEdit, onAddEntry, onDeleteEntry }: TrackingCardProps) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(t.label);
  const [editTag, setEditTag] = useState(t.tagNumber);
  const [editDate, setEditDate] = useState(t.startDate);
  const [editNotes, setEditNotes] = useState(t.notes);
  const [entryText, setEntryText] = useState('');

  const start = parseDate(t.startDate);
  const end = t.status !== 'active' && t.endDate ? (parseDate(t.endDate) ?? today()) : today();
  const elapsed = start ? Math.max(0, daysBetween(start, end)) : 0;
  const isActive = t.status === 'active';

  function saveEdit() {
    const startStr = parseDate(editDate) ? editDate : t.startDate;
    onSaveEdit(t.id, {
      label: editLabel.trim() || t.label,
      tagNumber: editTag.trim(),
      startDate: startStr,
      notes: editNotes.trim(),
    });
    setEditing(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-[13px] truncate">
          {t.tagNumber && <span className="mr-1.5 inline-block bg-green-50 text-green-700 px-1.5 py-0.5 rounded-md text-[10px] font-bold">#{t.tagNumber}</span>}
          {t.label}
        </p>
        <span className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${t.status === 'active' ? 'bg-green-50 text-green-700' : t.status === 'done' ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            {t.status === 'done' ? 'ripe' : t.status}
          </span>
          <button onClick={() => { setEditLabel(t.label); setEditTag(t.tagNumber); setEditDate(t.startDate); setEditNotes(t.notes); setEditing(v => !v); }} aria-label="Edit tracking" title="Edit" className="w-6 h-6 rounded-lg hover:bg-gray-100 text-gray-400 flex items-center justify-center text-sm">✎</button>
        </span>
      </div>

      {editing ? (
        <div className="space-y-2 mt-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Label" className="border rounded-lg p-2 text-sm" />
            <input value={editTag} onChange={e => setEditTag(e.target.value)} placeholder="Tag #" className="border rounded-lg p-2 text-sm" />
          </div>
          <DateInput value={editDate} onChange={setEditDate} ariaLabel="Tracking start date" />
          <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes" className="w-full border rounded-lg p-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={saveEdit} className="flex-1 text-xs font-semibold text-white bg-green-700 rounded-lg py-1.5">Save</button>
            <button onClick={() => setEditing(false)} className="flex-1 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg py-1.5">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
            <span>Started {t.startDate}</span>
            <span className="font-bold text-gray-900 text-[13px]">Day {elapsed}</span>
          </div>
          {t.status !== 'active' && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t.status === 'done' ? `Ripe ${t.endDate} · took ${elapsed}d` : `Stopped ${t.endDate || ''}`.trim()}
            </p>
          )}
          {t.notes && <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{t.notes}</p>}

          {isActive && entries.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
              {entries.map(e => (
                <div key={e.id} className="flex items-start justify-between gap-2 text-xs">
                  <p className="flex-1"><span className="text-muted-foreground font-semibold mr-1">{e.date}</span><span className="whitespace-pre-line">{e.text}</span></p>
                  <button onClick={() => onDeleteEntry(e.id)} aria-label="Delete journal entry" className="text-red-400 font-bold shrink-0">×</button>
                </div>
              ))}
            </div>
          )}

          {isActive && (
            <div className="flex gap-2 mt-2">
              <input value={entryText} onChange={e => setEntryText(e.target.value)} placeholder="Log what's happening…" className="flex-1 border rounded-lg p-2 text-xs" />
              <button
                onClick={() => { if (entryText.trim()) { onAddEntry(t.id, entryText.trim()); setEntryText(''); } }}
                disabled={!entryText.trim()}
                className="text-xs font-semibold text-green-700 bg-green-50 rounded-lg px-3 disabled:opacity-40"
              >Add</button>
            </div>
          )}

          <div className="flex gap-2 mt-2">
            {isActive ? (
              <>
                <button onClick={() => onFail(t.id)} className="flex-1 text-xs font-semibold text-red-600 bg-red-50 rounded-lg py-1.5">Failed</button>
                <button onClick={() => onFinish(t.id, t.startDate, t.tagNumber ? `#${t.tagNumber} ${t.label}` : t.label)} className="flex-1 text-xs font-semibold text-green-700 bg-green-50 rounded-lg py-1.5">Ripe — finish</button>
              </>
            ) : (
              <button onClick={() => onDelete(t.id)} className="flex-1 text-xs font-semibold text-red-600 bg-red-50 rounded-lg py-1.5">Delete</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
