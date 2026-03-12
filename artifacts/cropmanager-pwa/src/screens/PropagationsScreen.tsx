import React, { useState } from 'react';
import { useProps } from '../hooks/useProps';
import { PropCard } from '../components/props/PropCard';
import { PropForm } from '../components/props/PropForm';
import type { Propagation } from '../types';
import { formatDateShort, today, parseDate, daysBetween } from '../lib/dates';
import { BottomSheet } from '../components/shared/BottomSheet';
import db from '../db/db';
import { generateId } from '../lib/ids';

const FILTERS = ['All', 'Propagating', 'Rooted', 'Transplanted', 'Failed'];

export function PropagationsScreen() {
  const [filter, setFilter] = useState('All');
  const props = useProps(filter) ?? [];
  const [showForm, setShowForm] = useState(false);
  const [actionProp, setActionProp] = useState<{ prop: Propagation; action: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleQuickAction(prop: Propagation, action: string) {
    setSaving(true);
    const now = today();
    const nowStr = formatDateShort(now);
    if (action === 'rooted') {
      const propDate = parseDate(prop.propagationDate);
      const daysToRoot = propDate ? daysBetween(propDate, now) : 0;
      await db.propagations.where('id').equals(prop.id).modify({
        actualRootingDate: nowStr,
        daysToRootActual: daysToRoot,
        status: 'Rooted',
        syncStatus: 'pending',
        updatedAt: Date.now(),
      });
      await db.stageLogs.add({
        id: generateId('SL'),
        trackingId: prop.id,
        cropName: prop.plantName,
        variety: '',
        stageFrom: 'Propagating',
        stageTo: 'Rooted',
        date: nowStr,
        daysElapsed: daysToRoot,
        method: prop.propagationMethod,
        notes: '',
        syncStatus: 'pending',
        updatedAt: Date.now(),
      });
    } else if (action === 'transplanted') {
      await db.propagations.where('id').equals(prop.id).modify({
        status: 'Transplanted',
        syncStatus: 'pending',
        updatedAt: Date.now(),
      });
    }
    setSaving(false);
    setActionProp(null);
  }

  return (
    <div className="pb-24 pt-2">
      <div className="flex gap-2 overflow-x-auto px-4 pb-2">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm border ${filter === f ? 'bg-green-700 text-white border-green-700' : 'bg-white border-gray-300 text-gray-700'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="px-4 pt-2">
        {props.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-4xl mb-3">🌿</p>
            <p className="font-semibold text-lg">No propagations yet</p>
            <p className="text-sm text-muted-foreground mb-4">Tap + to log a propagation.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {props.map(prop => (
              <PropCard
                key={prop.id}
                prop={prop}
                onClick={() => {}}
                onAction={action => setActionProp({ prop, action })}
              />
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-amber-500 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-40"
      >
        +
      </button>

      <PropForm open={showForm} onClose={() => setShowForm(false)} />

      {actionProp && (
        <BottomSheet open onClose={() => setActionProp(null)} title={`${actionProp.action === 'rooted' ? 'Mark Rooted' : 'Mark Transplanted'}`}>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {actionProp.prop.plantName} · {actionProp.prop.propagationMethod}
            </p>
            <p className="text-sm">Date: <strong>{formatDateShort(today())}</strong></p>
            <button
              className="w-full bg-green-700 text-white rounded-xl py-3 font-semibold"
              onClick={() => handleQuickAction(actionProp.prop, actionProp.action)}
              disabled={saving}
            >
              {saving ? 'Saving...' : '✅ Confirm'}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
