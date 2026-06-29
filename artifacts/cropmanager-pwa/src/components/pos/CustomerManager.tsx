import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { generateId } from '../../lib/ids';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { User, Plus, Pencil, Trash2, X, Search, Save } from 'lucide-react';
import type { PosCustomer } from '../../types';
import { formatDateShort, today } from '../../lib/dates';

interface Props {
  onClose: () => void;
  onSelect?: (customer: PosCustomer) => void;
}

export function CustomerManager({ onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [editCustomer, setEditCustomer] = useState<PosCustomer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const customers = useLiveQuery(() => db.posCustomers.toArray(), []) ?? [];

  const filtered = search
    ? customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.toLowerCase().includes(search.toLowerCase()))
    : customers;

  function resetForm() {
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
    setEditCustomer(null);
    setShowForm(false);
  }

  async function handleSave() {
    if (!name) { toast.error('Customer name is required'); return; }
    const now = Date.now();
    if (editCustomer) {
      await db.posCustomers.update(editCustomer.id, { name, phone, email, notes, updatedAt: now });
      toast.success(`"${name}" updated`);
    } else {
      await db.posCustomers.add({
        id: generateId('CT'),
        name, phone, email, notes,
        totalPurchases: 0, pointsBalance: 0, pointsLifetime: 0,
        lastPurchaseDate: '', createdAt: now, updatedAt: now,
      });
      toast.success(`"${name}" added`);
    }
    resetForm();
  }

  async function handleDelete(id: string) {
    if (window.confirm('Delete this customer? This will NOT delete their sales history.')) {
      await db.posCustomers.delete(id);
      toast.success('Customer deleted');
    }
  }

  function openEdit(c: PosCustomer) {
    setEditCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email);
    setNotes(c.notes);
    setShowForm(true);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-600" /></button>
        <h1 className="font-bold text-lg flex-1 flex items-center gap-2"><User className="w-5 h-5 text-blue-600" /> Customers</h1>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="bg-blue-600"><Plus className="w-4 h-4 mr-1" /> Add</Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {showForm && (
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">{editCustomer ? 'Edit Customer' : 'New Customer'}</h3>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <Label>Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Email</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Notes</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={resetForm}>Cancel</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSave}><Save className="w-4 h-4 mr-1" /> {editCustomer ? 'Update' : 'Add'}</Button>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <User className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No customers found</p>
            </div>
          )}
          {filtered.map(c => (
            <div key={c.id} className="bg-white rounded-xl border p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <User className={`w-5 h-5 ${c.totalPurchases > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
              </div>
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => {
                  if (onSelect) {
                    onSelect(c);
                    onClose();
                  }
                }}
              >
                <p className="font-semibold text-sm truncate">{c.name}</p>
                <p className="text-xs text-gray-500">
                  {c.phone && <span>{c.phone}</span>}
                  {c.phone && c.email && <span> · </span>}
                  {c.email && <span>{c.email}</span>}
                </p>
                <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                  {c.totalPurchases > 0 && <span>Purchases: ${c.totalPurchases.toFixed(2)}</span>}
                  <span>Points: {c.pointsBalance}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-blue-50 rounded-lg"><Pencil className="w-4 h-4 text-blue-500" /></button>
                <button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
