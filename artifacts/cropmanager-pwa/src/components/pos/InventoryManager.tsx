import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { generateId } from '../../lib/ids';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Package, Plus, Pencil, Trash2, X, Search, Sprout, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import type { PosInventoryItem } from '../../types';

const UNITS = ['each', 'lb', 'kg', 'oz', 'dozen', 'half-dozen', 'bunch', 'box', 'crate', 'bag', 'tray', 'per plant', 'per head', 'liter', 'gallon', 'bottle'];

interface Props {
  onClose: () => void;
}

export function InventoryManager({ onClose }: Props) {
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<PosInventoryItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('each');
  const [unitPrice, setUnitPrice] = useState(0);
  const [showImportCrops, setShowImportCrops] = useState(false);
  const [cropSearch, setCropSearch] = useState('');

  const items = useLiveQuery(() => db.posInventory.toArray(), []) ?? [];
  const crops = useLiveQuery(() => db.crops.where('status').equals('Active').toArray(), []) ?? [];

  const filtered = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase()))
    : items;

  const filteredCrops = cropSearch
    ? crops.filter(c => c.cropName.toLowerCase().includes(cropSearch.toLowerCase()) || (c.variety?.toLowerCase() || '').includes(cropSearch.toLowerCase()))
    : crops;

  function resetForm() {
    setName('');
    setCategory('');
    setUnit('each');
    setUnitPrice(0);
    setEditItem(null);
    setShowForm(false);
  }

  async function handleSave() {
    if (!name) { toast.error('Item name is required'); return; }
    const now = Date.now();
    if (editItem) {
      await db.posInventory.update(editItem.id, { name, category, unit, unitPrice, updatedAt: now });
      toast.success(`"${name}" updated`);
    } else {
      await db.posInventory.add({ id: generateId('INV'), name, category, unit, unitPrice, isActive: true, createdAt: now, updatedAt: now });
      toast.success(`"${name}" added to inventory`);
    }
    resetForm();
  }

  async function handleDelete(id: string) {
    if (window.confirm('Delete this item?')) {
      await db.posInventory.delete(id);
      toast.success('Item deleted');
    }
  }

  async function handleToggleActive(item: PosInventoryItem) {
    await db.posInventory.update(item.id, { isActive: !item.isActive, updatedAt: Date.now() });
  }

  async function importFromCrop(crop: typeof crops[0]) {
    const name = `${crop.cropName}${crop.variety ? ` (${crop.variety})` : ''}`;
    const exists = items.find(i => i.name === name);
    if (exists) {
      toast.info(`"${name}" already in inventory`);
      return;
    }
    const now = Date.now();
    await db.posInventory.add({
      id: generateId('INV'),
      name,
      category: crop.plantStage || 'General',
      unit: 'each',
      unitPrice: 0,
      isActive: true,
      sourceCropId: crop.id,
      createdAt: now,
      updatedAt: now,
    });
    toast.success(`"${name}" imported from crops`);
  }

  function openEdit(item: PosInventoryItem) {
    setEditItem(item);
    setName(item.name);
    setCategory(item.category);
    setUnit(item.unit);
    setUnitPrice(item.unitPrice);
    setShowForm(true);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-600" /></button>
        <h1 className="font-bold text-lg flex-1 flex items-center gap-2"><Package className="w-5 h-5 text-green-600" /> Inventory</h1>
        <Button size="sm" variant="outline" onClick={() => setShowImportCrops(!showImportCrops)}><Sprout className="w-4 h-4 mr-1" /> From Crops</Button>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="bg-green-600"><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Import from crops panel */}
        {showImportCrops && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-blue-800">Import from Crop Database</p>
              <button onClick={() => setShowImportCrops(false)}><X className="w-4 h-4 text-blue-500" /></button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search crops..." value={cropSearch} onChange={e => setCropSearch(e.target.value)} className="pl-9 text-sm bg-white" />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {filteredCrops.map(crop => (
                <button key={crop.id} onClick={() => importFromCrop(crop)} className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-white hover:bg-green-50 text-sm">
                  <span className="text-green-600">+</span>
                  <span className="font-medium">{crop.cropName}</span>
                  {crop.variety && <span className="text-xs text-gray-500">({crop.variety})</span>}
                </button>
              ))}
              {filteredCrops.length === 0 && <p className="text-xs text-blue-500 text-center py-2">No active crops found</p>}
            </div>
          </div>
        )}

        {/* Add/Edit form */}
        {showForm && (
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">{editItem ? 'Edit Item' : 'New Inventory Item'}</h3>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <Label>Item Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Roma Tomatoes" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label>Category / Type</Label>
                  <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Vegetables" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Selling Unit</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Unit Price ($)</Label>
                <Input type="number" value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value))} min={0} step={0.01} placeholder="0.00" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={resetForm}>Cancel</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleSave}><Save className="w-4 h-4 mr-1" /> {editItem ? 'Update' : 'Add'}</Button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Inventory grid */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No inventory items</p>
              <p className="text-xs mt-1">Add items or import from your crop database</p>
            </div>
          )}
          {filtered.map(item => (
            <div key={item.id} className={`bg-white rounded-xl border p-3 flex items-center gap-3 ${!item.isActive ? 'opacity-50' : ''}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.isActive ? 'bg-green-50' : 'bg-gray-50'}`}>
                <Package className={`w-5 h-5 ${item.isActive ? 'text-green-600' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{item.name}</p>
                <p className="text-xs text-gray-500">
                  {item.category && <span>{item.category} · </span>}
                  ${item.unitPrice.toFixed(2)} / {item.unit}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleToggleActive(item)} className="p-1.5 hover:bg-gray-100 rounded-lg" title={item.isActive ? 'Deactivate' : 'Activate'}>
                  {item.isActive ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                </button>
                <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-blue-50 rounded-lg"><Pencil className="w-4 h-4 text-blue-500" /></button>
                <button onClick={() => handleDelete(item.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
