import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { generateId } from '../lib/ids';
import { formatDateShort, today } from '../lib/dates';
import { toast } from 'sonner';

/** Standalone quick notes (More screen). Personal scratchpad, independent of crops. */
export function NoteTakerScreen() {
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const notes = useLiveQuery(() => db.quickNotes.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const isLoading = useLiveQuery(() => db.quickNotes.count(), []) === undefined;

  async function handleAdd() {
    if (!text.trim()) { toast.error('Write the note first'); return; }
    try {
      await db.quickNotes.add({
        id: generateId('DE' as never) as string,
        text: text.trim(),
        updatedAt: Date.now(),
      } as never);
      setText('');
      toast.success('Note saved');
    } catch (e) {
      console.error('[notes] add failed', { e });
      toast.error('Could not save note: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editText.trim()) { toast.error('Note cannot be empty'); return; }
    try {
      await db.quickNotes.update(id, { text: editText.trim(), updatedAt: Date.now() });
      setEditingId(null);
      toast.success('Note updated');
    } catch (e) {
      console.error('[notes] edit failed', { id, e });
      toast.error('Could not update note: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this note?')) return;
    try {
      await db.quickNotes.delete(id);
      if (editingId === id) setEditingId(null);
      toast.success('Note deleted');
    } catch (e) {
      console.error('[notes] delete failed', { id, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2">
      <div className="max-w-md mx-auto px-4 space-y-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">New Note · {formatDateShort(today())}</p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Jot it down…"
            className="w-full border rounded-lg p-2 text-sm min-h-[100px]"
          />
          <button onClick={handleAdd} className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-semibold">Save Note</button>
        </div>

        <div className="space-y-1.5">
          {isLoading ? (
            <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : notes.length === 0 ? (
            <p className="text-xs text-muted-foreground bg-white rounded-xl p-3 border text-center">No notes yet</p>
          ) : notes.map(n => (
            <div key={n.id} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{formatDateShort(new Date(n.updatedAt))}</p>
                <span className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setEditingId(n.id); setEditText(n.text); }}
                    aria-label="Edit note"
                    title="Edit"
                    className="w-6 h-6 rounded-lg hover:bg-gray-100 text-gray-400 flex items-center justify-center text-sm"
                  >✎</button>
                  <button
                    onClick={() => handleDelete(n.id)}
                    aria-label="Delete note"
                    title="Delete"
                    className="w-6 h-6 rounded-lg hover:bg-red-50 text-red-400 flex items-center justify-center text-sm"
                  >×</button>
                </span>
              </div>
              {editingId === n.id ? (
                <>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)} className="w-full mt-1 border rounded-lg p-2 text-sm min-h-[80px]" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleSaveEdit(n.id)} className="flex-1 text-xs font-semibold text-white bg-green-700 rounded-lg py-1.5">Save</button>
                    <button onClick={() => setEditingId(null)} className="flex-1 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg py-1.5">Cancel</button>
                  </div>
                </>
              ) : (
                <p className="text-sm mt-1 whitespace-pre-line">{n.text}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
