import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, Plus, Calendar, Droplets, Trash2, X } from 'lucide-react';
import { generateId } from '../lib/ids';
import { formatDateShort, today } from '../lib/dates';

export function HerbicideScheduleScreen() {
  const [showForm, setShowForm] = useState(false);
  const [product, setProduct] = useState('');
  const [area, setArea] = useState('');
  const [date, setDate] = useState(formatDateShort(today()));

  const logs = useLiveQuery(() => 
    db.treatmentLogs.filter(l => l.type === 'herbicide').reverse().toArray()
  ) ?? [];

  const handleSave = async () => {
    if (!product || !area) return;
    const log = {
      id: generateId('TL'),
      cropId: 'HERB',
      cropName: area,
      date,
      daysFromPlanting: 0,
      type: 'herbicide',
      product,
      notes: `Applied to: ${area}`,
      updatedAt: Date.now(),
    };
    await db.treatmentLogs.add(log);
    setShowForm(false);
    setProduct('');
    setArea('');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this entry?')) {
      await db.treatmentLogs.delete(id);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 flex items-center justify-between">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-600" />
          Herbicide Schedule
        </h1>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setShowForm(!showForm)}
          className={`h-9 w-9 rounded-lg border border-gray-100 shadow-sm transition-transform ${showForm ? 'rotate-45 text-red-500 bg-red-50' : 'text-green-600 bg-green-50'}`}
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {showForm && (
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-900 mb-2">Log New Application</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Product Name</label>
                <Input placeholder="e.g. Roundup, Gramoxone" value={product} onChange={e => setProduct(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Target Area / Block</label>
                <Input placeholder="e.g. Back field, Pepper bed" value={area} onChange={e => setArea(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date Applied</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-red-600 hover:bg-red-700 h-10 font-bold" onClick={handleSave}>💾 Save Application</Button>
              <Button variant="ghost" className="h-10 text-gray-400" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
              <ShieldAlert className="w-12 h-12 mb-3" />
              <p className="font-semibold">No herbicide logs found</p>
            </div>
          ) : (
            logs.map(l => (
              <div key={l.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="secondary" className="text-[10px] bg-red-50 text-red-700 border-none uppercase">
                    {l.product}
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-300 hover:text-red-500" onClick={() => handleDelete(l.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Droplets className="w-4 h-4 text-blue-500" />
                    {l.cropName}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                    <Calendar className="w-4 h-4" />
                    {l.date}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
