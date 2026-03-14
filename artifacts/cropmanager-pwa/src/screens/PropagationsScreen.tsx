import React, { useState } from 'react';
import { useProps } from '../hooks/useProps';
import { PropCard } from '../components/props/PropCard';
import { PropForm } from '../components/props/PropForm';
import { PropDetail } from '../components/props/PropDetail';
import type { Propagation } from '../types';
import { formatDateShort, today, parseDate, daysBetween } from '../lib/dates';
import { BottomSheet } from '../components/shared/BottomSheet';
import db from '../db/db';
import { generateId } from '../lib/ids';

const FILTERS = ['All', 'Propagating', 'Callusing', 'Rooted', 'Potted / Transplanted', 'Failed'];

export function PropagationsScreen() {
  const [filter, setFilter] = useState('All');
  const props = useProps(filter) ?? [];

  const [selectedProp, setSelectedProp] = useState<Propagation | null>(null);
  const [editProp, setEditProp] = useState<Propagation | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);

  const handleDelete = async (id: string) => {
    if (confirm('Delete this propagation?')) {
      await db.propagations.delete(id);
      await db.reminders.where('trackingId').equals(id).delete();
      setSelectedProp(null);
    }
  };

  const handleAction = async (prop: Propagation, newStatus: string) => {
    const update: Partial<Propagation> = { status: newStatus, updatedAt: Date.now() };
    if (newStatus === 'Rooted') {
      update.actualRootingDate = formatDateShort(today());
      const start = parseDate(prop.propagationDate);
      if (start) {
        update.daysToRootActual = daysBetween(start, today());
      }
    }
    await db.propagations.update(prop.id, update);
  };

  return (
    <div className="pb-24 pt-2">
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 whitespace-nowrap scrollbar-hide">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm border ${filter === f ? 'bg-green-700 text-white border-green-700' : 'bg-white border-gray-300 text-gray-700'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="px-4 pt-2">
        {props.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
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
                onClick={() => setSelectedProp(prop)}
                onAction={(newStatus) => handleAction(prop, newStatus)}
              />
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-green-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-40"
      >
        +
      </button>

      {showForm && (
        <PropForm 
          open={showForm} 
          onClose={() => { setShowForm(false); setEditProp(undefined); }} 
          editProp={editProp}
        />
      )}

      {selectedProp && (
        <PropDetail
          prop={selectedProp}
          onClose={() => setSelectedProp(null)}
          onEdit={() => { setEditProp(selectedProp); setShowForm(true); setSelectedProp(null); }}
          onDelete={() => handleDelete(selectedProp.id)}
        />
      )}
    </div>
  );
}
