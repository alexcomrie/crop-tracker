import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Trash2, DollarSign, ShoppingCart, Package, TrendingUp, BarChart3, Pencil } from 'lucide-react';
import { generateId } from '../../lib/ids';
import { formatDateShort, today } from '../../lib/dates';
import type { LedgerEntry, LedgerEntryType } from '../../types';

const EXPENSE_CATEGORIES = ['Seeds', 'Fungicide', 'Herbicide', 'Insecticide', 'Pesticide', 'Fertilizer', 'Tools', 'Equipment', 'Labor', 'Irrigation', 'Soil/Media', 'Transport', 'Packaging', 'Other'];
const AUTO_INVENTORY_CATEGORIES = ['Seeds', 'Fungicide', 'Herbicide', 'Insecticide', 'Pesticide'];
const SALE_CATEGORIES = ['Wholesale', 'Retail', 'Direct-to-Consumer', 'Farmers Market', 'Other'];
const INVENTORY_CATEGORIES = ['Harvested Produce', 'Seeds', 'Fungicide', 'Herbicide', 'Insecticide', 'Pesticide', 'Fertilizer', 'Tools'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type LedgerTab = 'expense' | 'sales' | 'inventory' | 'pnl' | 'charts';

export function FarmLedgerScreen({ onClose }: { onClose: () => void }) {
  const entries = useLiveQuery(() => 
    db.ledgerEntries.orderBy('date').reverse().toArray()
  ) ?? [];

  const [tab, setTab] = useState<LedgerTab>('expense');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [form, setForm] = useState({
    date: formatDateShort(today()),
    type: 'expense' as LedgerEntryType,
    category: '',
    amount: '',
    quantity: '',
    unit: '',
    description: '',
    buyer: '',
    paymentStatus: 'paid',
    expiryDate: '',
    batch: '',
    cropName: '',
    purchaseLocation: '',
    notes: '',
  });

  const expenses = useMemo(() => entries.filter(e => e.type === 'expense'), [entries]);
  const sales = useMemo(() => entries.filter(e => e.type === 'sale'), [entries]);
  const inventory = useMemo(() => entries.filter(e => e.type === 'inventory'), [entries]);
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const totalSales = useMemo(() => sales.reduce((s, e) => s + e.amount, 0), [sales]);

  function resetForm(entry?: LedgerEntry) {
    setEditId(entry?.id || null);
    const defaultType = tab === 'expense' ? 'expense' : tab === 'sales' ? 'sale' : 'inventory';
    setForm({
      date: entry?.date || formatDateShort(today()),
      type: entry?.type || defaultType,
      category: entry?.category || '',
      amount: entry?.amount?.toString() || '',
      quantity: entry?.quantity?.toString() || '',
      unit: entry?.unit || '',
      description: entry?.description || '',
      buyer: entry?.buyer || '',
      paymentStatus: entry?.paymentStatus || 'paid',
      expiryDate: entry?.expiryDate || '',
      batch: entry?.batch || '',
      cropName: entry?.cropName || '',
      purchaseLocation: entry?.purchaseLocation || '',
      notes: entry?.notes || '',
    });
  }

  async function handleSave() {
    if (!form.category || !form.amount) return;
    setSaving(true);
    const entryData: LedgerEntry = {
      id: editId || generateId('LED'),
      type: form.type,
      date: form.date || formatDateShort(today()),
      category: form.category,
      amount: parseFloat(form.amount) || 0,
      quantity: parseFloat(form.quantity) || 0,
      unit: form.unit,
      description: form.description,
      buyer: form.buyer,
      paymentStatus: form.paymentStatus,
      expiryDate: form.expiryDate,
      batch: form.batch,
      cropName: form.cropName,
      purchaseLocation: form.purchaseLocation,
      notes: form.notes,
      updatedAt: Date.now(),
    };
    await db.ledgerEntries.put(entryData);
    // Auto-log inventory for expense categories Seeds, Fungicide, Herbicide, Pesticide
    if (form.type === 'expense' && AUTO_INVENTORY_CATEGORIES.includes(form.category)) {
      const invEntry: LedgerEntry = {
        id: generateId('LED'),
        type: 'inventory',
        date: form.date || formatDateShort(today()),
        category: form.category,
        amount: 0,
        quantity: parseFloat(form.quantity) || 0,
        unit: form.unit,
        description: `Auto-logged from ${form.category} purchase: ${form.description || form.category}`,
        buyer: '',
        paymentStatus: 'paid',
        expiryDate: form.expiryDate,
        batch: form.batch || `B${Date.now()}`,
        cropName: '',
        purchaseLocation: form.purchaseLocation,
        notes: `Auto-inventory: ${form.purchaseLocation ? `Purchased at ${form.purchaseLocation}. ` : ''}${form.notes || ''}`,
        updatedAt: Date.now(),
      };
      // Check if similar inventory entry exists and update quantity instead
      const existing = await db.ledgerEntries
        .where('type').equals('inventory')
        .and(e => e.category === form.category && e.batch === (form.batch || `B${Date.now()}`))
        .toArray();
      if (existing.length > 0 && invEntry.category !== 'Seeds') {
        invEntry.quantity += existing[0].quantity;
        invEntry.id = existing[0].id;
      }
      await db.ledgerEntries.put(invEntry);
    }
    setSaving(false);
    setShowForm(false);
    setEditId(null);
    resetForm();
  }

  async function handleBulkSave() {
    const lines = bulkInput.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split('\t').map(p => p.trim());
      const [cat, val, desc, qty, unit, extra] = parts;
      if (!cat || !val) continue;
      const entry: LedgerEntry = {
        id: generateId('LED'),
        type: tab === 'sales' ? 'sale' : (tab === 'inventory' ? 'inventory' : 'expense'),
        date: formatDateShort(today()),
        category: cat,
        amount: tab === 'inventory' ? 0 : (parseFloat(val) || 0),
        quantity: parseFloat(tab === 'inventory' ? val : (qty || '0')) || 0,
        unit: tab === 'inventory' ? '' : (unit || ''),
        description: desc || '',
        buyer: tab === 'sales' ? (desc || '') : '',
        paymentStatus: tab === 'sales' ? (extra || 'paid') : 'paid',
        expiryDate: '',
        batch: tab === 'inventory' ? (qty || '') : '',
        cropName: tab === 'sales' ? (qty || '') : '',
        purchaseLocation: tab === 'expense' ? (extra || '') : '',
        notes: '',
        updatedAt: Date.now(),
      };
      await db.ledgerEntries.put(entry);
    }
    setBulkMode(false);
    setBulkInput('');
  }

  async function handleDelete(id: string) {
    if (confirm('Delete this entry?')) {
      await db.ledgerEntries.delete(id);
    }
  }

  function fmtDate(iso: string) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m-1]} ${y}`;
  }

  const categories = tab === 'expense' ? EXPENSE_CATEGORIES
    : tab === 'sales' ? SALE_CATEGORIES
    : INVENTORY_CATEGORIES;

  const currentEntries = tab === 'expense' ? expenses
    : tab === 'sales' ? sales
    : inventory;

  const TABS: { key: LedgerTab; label: string; icon: React.ReactNode }[] = [
    { key: 'expense', label: 'Expenses', icon: <DollarSign className="w-4 h-4" /> },
    { key: 'sales', label: 'Sales', icon: <ShoppingCart className="w-4 h-4" /> },
    { key: 'inventory', label: 'Inventory', icon: <Package className="w-4 h-4" /> },
    { key: 'pnl', label: 'P&L', icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'charts', label: 'Charts', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const monthlyData = useMemo(() => {
    const months: Record<string, { income: number; expense: number }> = {};
    for (const e of entries) {
      if (!e.date) continue;
      const key = e.date.substring(0, 7);
      if (!months[key]) months[key] = { income: 0, expense: 0 };
      if (e.type === 'sale') months[key].income += e.amount;
      else if (e.type === 'expense') months[key].expense += e.amount;
    }
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const expenseBreakdown = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const e of expenses) cats[e.category] = (cats[e.category] || 0) + e.amount;
    return Object.entries(cats).sort(([, a], [, b]) => b - a);
  }, [expenses]);

  const salesBreakdown = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const e of sales) cats[e.category] = (cats[e.category] || 0) + e.amount;
    return Object.entries(cats).sort(([, a], [, b]) => b - a);
  }, [sales]);

  const purchaseLocations = useMemo(() => {
    const locs = new Set<string>();
    for (const e of expenses) {
      if (e.purchaseLocation) locs.add(e.purchaseLocation);
    }
    return Array.from(locs).sort();
  }, [expenses]);

  return (
    <div className="absolute inset-0 bg-[#f5f5f0] flex flex-col z-[60] animate-in slide-in-from-right duration-300">
      <div className="bg-white border-b border-gray-200 h-14 flex items-center gap-3 px-4 shrink-0">
        <button onClick={onClose} className="w-8 h-8 rounded-lg border bg-[#f9f9f6] text-gray-600 flex items-center justify-center">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-[16px] flex-1">🌱 Farm Ledger</h2>
        {tab !== 'pnl' && tab !== 'charts' && (
          <div className="flex gap-1">
            <Button className="h-8" onClick={() => { resetForm(); setShowForm(true); }}>+ Add</Button>
            <Button variant="outline" className="h-8" onClick={() => { setBulkMode(!bulkMode); setBulkInput(''); }}>Bulk</Button>
          </div>
        )}
      </div>

      <div className="flex gap-1 p-2 bg-white border-b border-gray-100 overflow-x-auto shrink-0">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${tab === t.key ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {showForm && tab !== 'pnl' && tab !== 'charts' && (
          <div className="p-4 border-b border-gray-100 bg-white">
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-sm">{editId ? 'Edit' : 'New'} {tab === 'expense' ? 'Expense' : tab === 'sales' ? 'Sale' : 'Inventory'} Entry</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Date</label>
                  <Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value || formatDateShort(today())})} className="mt-1" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Amount ($)</label>
                  <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="mt-1" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Category</label>
                <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full mt-1 border rounded-lg p-2 text-sm bg-white">
                  <option value="">Select...</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Description</label>
                <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="mt-1" placeholder="e.g. Tomato seeds..." />
              </div>
              {tab === 'expense' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Quantity</label>
                    <Input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Unit</label>
                    <Input value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="mt-1" placeholder="kg, L, pcs..." />
                  </div>
                </div>
              )}
              {tab === 'expense' && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Purchase Location</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      list="purchaseLocs"
                      value={form.purchaseLocation}
                      onChange={e => setForm({...form, purchaseLocation: e.target.value})}
                      className="flex-1 border rounded-lg p-2 text-sm bg-white"
                      placeholder="Farm store name..."
                    />
                    <datalist id="purchaseLocs">
                      {purchaseLocations.map(l => <option key={l} value={l} />)}
                    </datalist>
                  </div>
                </div>
              )}
              {tab === 'sales' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Buyer</label>
                      <Input value={form.buyer} onChange={e => setForm({...form, buyer: e.target.value})} className="mt-1" placeholder="Buyer name" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Payment</label>
                      <select value={form.paymentStatus} onChange={e => setForm({...form, paymentStatus: e.target.value})} className="w-full mt-1 border rounded-lg p-2 text-sm bg-white">
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Crop</label>
                    <Input value={form.cropName} onChange={e => setForm({...form, cropName: e.target.value})} className="mt-1" placeholder="Crop sold" />
                  </div>
                </>
              )}
              {tab === 'inventory' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Batch #</label>
                    <Input value={form.batch} onChange={e => setForm({...form, batch: e.target.value})} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Expiry</label>
                    <Input type="date" value={form.expiryDate} onChange={e => setForm({...form, expiryDate: e.target.value})} className="mt-1" />
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Notes</label>
                <Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="mt-1" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button className="flex-1" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : editId ? '💾 Update' : '💾 Save'}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {bulkMode && (
          <div className="p-4 border-b border-gray-100 bg-white">
            <div className="bg-yellow-50 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-sm">Bulk Add {tab === 'expense' ? 'Expenses' : tab === 'sales' ? 'Sales' : 'Inventory'}</h3>
              <p className="text-xs text-gray-500">One entry per line, tab-separated fields:
                {tab === 'expense' && <span className="block mt-1 font-mono">Category ⇥ Amount ⇥ Description ⇥ Quantity ⇥ Unit ⇥ Location</span>}
                {tab === 'sales' && <span className="block mt-1 font-mono">Category ⇥ Amount ⇥ Buyer ⇥ Crop ⇥ PaymentStatus</span>}
                {tab === 'inventory' && <span className="block mt-1 font-mono">Category ⇥ Quantity ⇥ Unit ⇥ Batch ⇥ Expiry</span>}
              </p>
              <textarea
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
                className="w-full border rounded-lg p-3 text-sm font-mono bg-white h-32 resize-none"
                placeholder={tab === 'expense' ? 'Seeds\t50\tTomato seeds\t2\tkg\tFarm Store\nFertilizer\t25\t10-10-10\t1\tbag' : tab === 'sales' ? 'Retail\t100\tJohn Doe\tTomato\tpaid' : 'Seeds\t50\tkg\tB001\t2026-12-31'}
              />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleBulkSave}>Save All</Button>
                <Button variant="outline" onClick={() => setBulkMode(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* Expense Tab */}
        {tab === 'expense' && (
          <div className="p-4 space-y-3">
            <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-600">Total Expenses</span>
              <span className="text-lg font-bold text-red-600">${totalExpenses.toFixed(2)}</span>
            </div>
            {expenses.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-gray-400">
                <DollarSign className="w-10 h-10 mb-2" />
                <p className="text-sm">No expenses recorded yet.</p>
              </div>
            ) : expenses.map(e => (
              <div key={e.id} className="bg-white border border-[#e0e0e0] rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-[14px]">{e.category} — <span className="text-red-600">${e.amount.toFixed(2)}</span></div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{fmtDate(e.date)}{e.buyer ? ` · ${e.buyer}` : ''}{e.purchaseLocation ? ` · 🏪 ${e.purchaseLocation}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { resetForm(e); setShowForm(true); }} className="text-gray-400 hover:text-blue-500"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(e.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {e.description && <div className="text-sm text-gray-600 mt-1">{e.description}</div>}
                {e.quantity > 0 && <div className="text-xs text-gray-500 mt-0.5">Qty: {e.quantity} {e.unit}</div>}
                {e.notes && <div className="text-xs text-gray-400 mt-1">{e.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Sales Tab */}
        {tab === 'sales' && (
          <div className="p-4 space-y-3">
            <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-600">Total Revenue</span>
              <span className="text-lg font-bold text-green-600">${totalSales.toFixed(2)}</span>
            </div>
            {sales.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-gray-400">
                <ShoppingCart className="w-10 h-10 mb-2" />
                <p className="text-sm">No sales recorded yet.</p>
              </div>
            ) : sales.map(s => (
              <div key={s.id} className="bg-white border border-[#e0e0e0] rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-[14px]">{s.category} — <span className="text-green-600">${s.amount.toFixed(2)}</span></div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{fmtDate(s.date)}{s.buyer ? ` · ${s.buyer}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      s.paymentStatus === 'paid' ? 'bg-green-50 text-green-700' :
                      s.paymentStatus === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                      'bg-red-50 text-red-700'
                    }`}>{s.paymentStatus}</span>
                    <button onClick={() => { resetForm(s); setShowForm(true); }} className="text-gray-400 hover:text-blue-500"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(s.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {s.cropName && <div className="text-xs text-gray-500 mt-1">Crop: {s.cropName}</div>}
                {s.notes && <div className="text-xs text-gray-400 mt-1">{s.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Inventory Tab */}
        {tab === 'inventory' && (
          <div className="p-4 space-y-3">
            {inventory.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-gray-400">
                <Package className="w-10 h-10 mb-2" />
                <p className="text-sm">No inventory items recorded.</p>
              </div>
            ) : inventory.map(i => (
              <div key={i.id} className="bg-white border border-[#e0e0e0] rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-[14px]">{i.category}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{fmtDate(i.date)}{i.batch ? ` · Batch: ${i.batch}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {i.quantity > 0 && <span className="text-sm font-bold">{i.quantity} {i.unit}</span>}
                    <button onClick={() => { resetForm(i); setShowForm(true); }} className="text-gray-400 hover:text-blue-500"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(i.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {i.description && <div className="text-sm text-gray-600 mt-1">{i.description}</div>}
                {i.expiryDate && (
                  <div className="text-xs text-gray-500 mt-1">
                    Expires: {fmtDate(i.expiryDate)}
                    {new Date(i.expiryDate) < new Date() && <span className="text-red-500 ml-1 font-semibold">⚠ EXPIRED</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* P&L Tab */}
        {tab === 'pnl' && (
          <div className="p-4 space-y-4">
            <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-3">
              <h3 className="font-bold text-sm">Profit & Loss Summary</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-[10px] font-bold text-green-600 uppercase">Revenue</div>
                  <div className="text-lg font-bold text-green-700">${totalSales.toFixed(2)}</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-[10px] font-bold text-red-600 uppercase">Expenses</div>
                  <div className="text-lg font-bold text-red-700">${totalExpenses.toFixed(2)}</div>
                </div>
              </div>
              <div className="text-center pt-2 border-t border-gray-100">
                <div className="text-[10px] font-bold text-gray-400 uppercase">Net Profit</div>
                <div className={`text-2xl font-bold ${totalSales - totalExpenses >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${(totalSales - totalExpenses).toFixed(2)}
                </div>
              </div>
            </div>
            <div className="bg-white border border-[#e0e0e0] rounded-xl p-4">
              <h3 className="font-bold text-sm mb-3">Monthly Breakdown</h3>
              {monthlyData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No data yet.</p>
              ) : (
                <div className="space-y-2">
                  {monthlyData.map(([month, data]) => (
                    <div key={month} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-sm font-medium">{MONTHS[parseInt(month.split('-')[1])-1]} {month.split('-')[0]}</span>
                      <div className="flex gap-4 text-xs">
                        <span className="text-green-600 font-semibold">+${data.income.toFixed(0)}</span>
                        <span className="text-red-600 font-semibold">-${data.expense.toFixed(0)}</span>
                        <span className={`font-bold ${data.income - data.expense >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          ${(data.income - data.expense).toFixed(0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Charts Tab */}
        {tab === 'charts' && (
          <div className="p-4 space-y-4">
            <div className="bg-white border border-[#e0e0e0] rounded-xl p-4">
              <h3 className="font-bold text-sm mb-3">Monthly Income vs Expenses</h3>
              {monthlyData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Add some entries to see charts.</p>
              ) : (
                <div className="space-y-2">
                  {monthlyData.map(([month, data]) => {
                    const maxVal = Math.max(data.income, data.expense, 1);
                    return (
                      <div key={month} className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-500">
                          <span>{MONTHS[parseInt(month.split('-')[1])-1]} {month.split('-')[0]}</span>
                          <span>${(data.income - data.expense).toFixed(0)}</span>
                        </div>
                        <div className="flex gap-0.5 h-6">
                          <div className="flex-1 bg-gray-100 rounded-l flex items-center" style={{ direction: 'rtl' }}>
                            <div className="h-3 bg-red-400 rounded-l" style={{ width: `${(data.expense / maxVal) * 50}%` }} />
                          </div>
                          <div className="flex-1 bg-gray-100 rounded-r flex items-center">
                            <div className="h-3 bg-green-400 rounded-r" style={{ width: `${(data.income / maxVal) * 50}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {expenseBreakdown.length > 0 && (
              <div className="bg-white border border-[#e0e0e0] rounded-xl p-4">
                <h3 className="font-bold text-sm mb-3">Expenses by Category</h3>
                <div className="space-y-2">
                  {expenseBreakdown.map(([cat, amt]) => {
                    const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span>{cat}</span>
                          <span className="font-semibold">${amt.toFixed(0)} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-red-400" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {salesBreakdown.length > 0 && (
              <div className="bg-white border border-[#e0e0e0] rounded-xl p-4">
                <h3 className="font-bold text-sm mb-3">Revenue by Category</h3>
                <div className="space-y-2">
                  {salesBreakdown.map(([cat, amt]) => {
                    const pct = totalSales > 0 ? (amt / totalSales) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span>{cat}</span>
                          <span className="font-semibold">${amt.toFixed(0)} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-green-400" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}