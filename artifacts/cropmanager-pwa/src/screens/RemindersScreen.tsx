import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, CheckCircle2, Clock, Trash2, Plus, X } from 'lucide-react';
import { markReminderDone } from '../hooks/useReminders';
import { generateId } from '../lib/ids';
import { formatDateShort, today } from '../lib/dates';

const REM_TYPES = [
  { id: 'fungicide', label: 'Fungicide spray', icon: '🍄' },
  { id: 'pesticide', label: 'Pesticide spray', icon: '🐛' },
  { id: 'fertilizer', label: 'Fertilizer', icon: '🧪' },
  { id: 'water', label: 'Watering check', icon: '💧' },
  { id: 'inspect', label: 'Inspect plant', icon: '🔍' },
  { id: 'harvest', label: 'Check harvest', icon: '🥬' },
  { id: 'custom', label: 'Custom task', icon: '📝' },
];

export function RemindersScreen() {
  const reminders = useLiveQuery(() => 
    db.reminders.orderBy('sendDate').reverse().toArray()
  ) ?? [];

  const [showForm, setShowForm] = useState(false);
  const [plant, setPlant] = useState('');
  const [type, setType] = useState('fungicide');
  const [product, setProduct] = useState('');
  const [date, setDate] = useState(formatDateShort(today()));
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    if (!plant || !date) return;
    const rem = {
      id: generateId('REM'),
      type,
      cropPlantName: plant,
      trackingId: 'MANUAL',
      sendDate: date,
      subject: `${REM_TYPES.find(t => t.id === type)?.icon} ${REM_TYPES.find(t => t.id === type)?.label}`,
      body: `${product ? `Product: ${product}. ` : ''}${notes}`,
      sent: false,
      chatId: '', // Will be filled by system if needed
      updatedAt: Date.now(),
    };
    await db.reminders.add(rem);
    setShowForm(false);
    setPlant('');
    setProduct('');
    setNotes('');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this reminder?')) {
      await db.reminders.delete(id);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-600" />
            Reminders Queue
          </h1>
          <p className="text-[10px] text-gray-500 font-semibold uppercase mt-1">Manual & System Alerts</p>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setShowForm(!showForm)}
          className={`h-9 w-9 rounded-lg border border-gray-100 shadow-sm transition-transform ${showForm ? 'rotate-45 text-red-500 bg-red-50' : 'text-purple-600 bg-purple-50'}`}
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {showForm && (
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-900">New Manual Reminder</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Plant / Crop Name</label>
                <Input placeholder="e.g. Peppers (back bed)" value={plant} onChange={e => setPlant(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Task Type</label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REM_TYPES.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.icon} {t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Due Date</label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Product / Details</label>
                <Input placeholder="e.g. Copper fungicide, Neem oil" value={product} onChange={e => setProduct(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Notes</label>
                <Input placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700 h-10 font-bold" onClick={handleSave}>💾 Save Reminder</Button>
              <Button variant="ghost" className="h-10 text-gray-400" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {reminders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
              <Bell className="w-12 h-12 mb-3" />
              <p className="font-semibold">No reminders found</p>
            </div>
          ) : (
            reminders.map(r => (
              <div 
                key={r.id} 
                className={`bg-white border border-gray-100 rounded-xl p-4 shadow-sm transition-opacity ${r.sent ? 'opacity-50' : 'opacity-100'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] uppercase border-none ${r.sent ? 'bg-gray-100 text-gray-500' : 'bg-purple-50 text-purple-700'}`}>
                      {r.type.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {r.sendDate}
                    </span>
                  </div>
                  {!r.sent && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-300 hover:text-red-500" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                
                <h3 className="font-bold text-sm text-gray-900 mb-1">{r.subject}: {r.cropPlantName}</h3>
                <p className="text-xs text-gray-500 leading-relaxed mb-4">{r.body}</p>

                {!r.sent ? (
                  <Button 
                    className="w-full bg-purple-600 hover:bg-purple-700 h-9 rounded-lg text-xs font-bold gap-2"
                    onClick={() => markReminderDone(r.id)}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark as Completed
                  </Button>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-bold text-green-600 bg-green-50 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    Task Finished
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
