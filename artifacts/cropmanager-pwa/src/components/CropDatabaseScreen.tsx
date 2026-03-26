import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Download, ChevronLeft, X, ArrowRight, Tag, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { loadCropDatabase, getNonAliasCrops, getAliases, isAlias, saveCropDatabaseOverride } from '../lib/cropDb';
import type { CropDatabase, CropData, CropDbRecord } from '../types';
import { useAppStore } from '../store/useAppStore';

const PLANT_TYPES = [
  'Leafy Greens', 'Brassica', 'Fruiting Vegetable', 'Vine / Fruiting Vegetable', 
  'Vine Crop', 'Root Crop', 'Grain', 'Legume', 'Herb', 'Bulb', 'Rhizome', 'Tuber'
];

export function CropDatabaseScreen({ onClose }: { onClose: () => void }) {
  const [db, setDb] = useState<CropDatabase | null>(null);
  const { setCropDb } = useAppStore();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAliases, setShowAliases] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');

  useEffect(() => {
    loadCropDatabase().then(data => {
      setDb(data);
      setLoading(false);
    });
  }, []);

  if (loading || !db) return <div className="p-8 text-center">Loading database...</div>;

  const nonAliasCrops = getNonAliasCrops(db);
  const aliases = getAliases(db);

  const filteredCrops = nonAliasCrops.filter(({ key, entry }) => 
    key.toLowerCase().includes(searchQuery.toLowerCase()) || 
    entry.display_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAliases = showAliases ? aliases.filter(({ key, target }) => 
    key.toLowerCase().includes(searchQuery.toLowerCase()) || 
    target.toLowerCase().includes(searchQuery.toLowerCase())
  ) : [];

  const selectedEntry = selectedKey ? db[selectedKey] : null;

  const handleUpdate = (updated: CropData) => {
    if (!selectedKey) return;
    setDb(prev => prev ? { ...prev, [selectedKey]: updated } : prev);
  };

  const handleDelete = (key: string) => {
    if (!db || !window.confirm(`Delete ${key}?`)) return;
    const next = { ...db };
    delete next[key];
    setDb(next);
    setSelectedKey(null);
  };

  const handleAdd = () => {
    if (!db || !newKey) return;
    const key = newKey.toLowerCase().replace(/\s+/g, '_');
    if (db[key]) {
      alert('Key already exists');
      return;
    }
    const entry: CropData = {
      display_name: newKey,
      plant_type: 'Leafy Greens',
      varieties: [],
      number_of_weeks_harvest: 1,
      growing_time_days: 60,
      transplant_days: null,
      growing_from_transplant: null,
      harvest_interval: 7,
      batch_offset_days: 14,
      germination_days_min: 5,
      germination_days_max: 10,
      fungus_spray_days: [],
      pest_spray_days: [],
      planting_method: 'Direct Sow',
      diseases: [],
      pests: [],
      consistent_harvest: false
    };
    setDb({ ...db, [key]: entry });
    setSelectedKey(key);
    setIsAdding(false);
    setNewKey('');
  };

  const handleSaveDb = () => {
    if (!db) return;
    saveCropDatabaseOverride(db);
    setCropDb(db);
    alert('Crop Database saved locally on this device.');
  };

  const exportJson = () => {
    const json = JSON.stringify(db, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crop_database.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white animate-in slide-in-from-right duration-300">
      <header className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={selectedKey ? () => setSelectedKey(null) : onClose} className="p-1 hover:bg-gray-100 rounded-full">
            {selectedKey ? (
              <>
                <ArrowLeft className="w-6 h-6 md:hidden" />
                <ChevronLeft className="w-6 h-6 hidden md:block" />
              </>
            ) : (
              <ChevronLeft className="w-6 h-6" />
            )}
          </button>
          <h2 className="font-bold text-lg">
            {selectedKey && !isAlias(selectedEntry) ? (selectedEntry as CropData).display_name : 'Crop Database'}
          </h2>
        </div>
        <div className="flex gap-2">
          {!selectedKey && (
            <Button size="sm" onClick={() => setIsAdding(true)} className="bg-green-700">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleSaveDb} className="text-green-700 hidden sm:flex">
             Save File
          </Button>
          <Button variant="ghost" size="sm" onClick={exportJson} className="text-green-700 hidden sm:flex">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${selectedKey ? 'hidden md:flex' : 'flex'} w-full md:w-64 border-r flex-col h-full`}>
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search..." 
                className="pl-9 h-9 text-sm" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowAliases(!showAliases)}
                className={`flex-1 text-[10px] font-semibold px-2 py-1 rounded border transition-colors ${showAliases ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
              >
                {showAliases ? 'Aliases On' : 'Show Aliases'}
              </button>
              <Button size="sm" onClick={() => setIsAdding(true)} className="bg-green-700 md:hidden h-7 px-2 text-[10px]">
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredCrops.map(({ key, entry }) => (
              <button
                key={key}
                onClick={() => setSelectedKey(key)}
                className={`w-full text-left p-2 rounded-lg transition-colors ${selectedKey === key ? 'bg-green-50 text-green-700 border-green-200 border' : 'hover:bg-gray-50'}`}
              >
                <p className="text-sm font-bold truncate">{entry.display_name}</p>
                <p className="text-[10px] uppercase text-gray-500">{entry.plant_type}</p>
              </button>
            ))}
            {filteredAliases.map(({ key, target }) => (
              <button
                key={key}
                onClick={() => setSelectedKey(key)}
                className={`w-full text-left p-2 rounded-lg border border-dashed transition-colors ${selectedKey === key ? 'bg-amber-50 text-amber-700 border-amber-200' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                <p className="text-sm font-bold truncate flex items-center gap-1">
                  <ArrowRight className="w-3 h-3 shrink-0" /> {key}
                </p>
                <p className="text-[10px] text-gray-400">Alias for {target}</p>
              </button>
            ))}
          </div>
          
          <div className="p-3 border-t md:hidden bg-gray-50 flex gap-2">
             <Button variant="outline" size="sm" onClick={handleSaveDb} className="flex-1 text-[10px] h-8">Save</Button>
             <Button variant="outline" size="sm" onClick={exportJson} className="flex-1 text-[10px] h-8">Export</Button>
          </div>
        </div>

        {/* Editor */}
        <div className={`${selectedKey ? 'flex' : 'hidden md:block'} flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 flex-col`}>
          {!selectedKey ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-3xl">🌱</div>
              <p>Select a crop to edit its definitions</p>
            </div>
          ) : isAlias(selectedEntry) ? (
            <div className="max-w-2xl mx-auto bg-white p-6 md:p-8 rounded-2xl border shadow-sm space-y-6">
               <h2 className="text-xl md:text-2xl font-bold">{selectedKey}</h2>
               <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-4">
                 <div className="text-2xl">🔗</div>
                 <div className="flex-1">
                   <p className="font-bold text-amber-900 text-sm md:text-base">This is an alias entry</p>
                   <p className="text-xs md:text-sm text-amber-700">It redirects to <strong>{selectedEntry.alias}</strong></p>
                 </div>
                 <Button size="sm" onClick={() => setSelectedKey(selectedEntry.alias)} className="bg-amber-600 text-xs h-8">Go to Target</Button>
               </div>
               <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 w-full md:w-auto" onClick={() => handleDelete(selectedKey!)}>
                 <Trash2 className="w-4 h-4 mr-2" /> Delete Alias
               </Button>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {(() => {
                const entry = selectedEntry as CropData;
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl md:text-2xl font-bold">{entry.display_name}</h2>
                      <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 h-8 text-xs" onClick={() => handleDelete(selectedKey!)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete Crop
                      </Button>
                    </div>

                    {/* Basic Info */}
                    <section className="bg-white rounded-xl border p-4 space-y-4 shadow-sm">
                      <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest">Basic Info</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Display Name</label>
                          <Input 
                            value={entry.display_name} 
                            onChange={e => handleUpdate({ ...entry, display_name: e.target.value })} 
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Plant Type</label>
                          <select 
                            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                            value={entry.plant_type}
                            onChange={e => handleUpdate({ ...entry, plant_type: e.target.value })}
                          >
                            {PLANT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Planting Method</label>
                          <Input 
                            value={entry.planting_method} 
                            onChange={e => handleUpdate({ ...entry, planting_method: e.target.value })} 
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Varieties (comma separated)</label>
                        <Input 
                          value={entry.varieties.join(', ')} 
                          onChange={e => handleUpdate({ ...entry, varieties: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} 
                        />
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.varieties.map(v => (
                            <Badge key={v} variant="secondary" className="bg-green-50 text-green-700 border-none font-medium px-2 py-0.5 text-[10px]">
                              {v}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </section>

                    {/* Timing */}
                    <section className="bg-white rounded-xl border p-4 space-y-4 shadow-sm">
                      <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest">Timing & Harvest</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Grow Days</label>
                          <Input type="number" value={entry.growing_time_days} onChange={e => handleUpdate({ ...entry, growing_time_days: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Harvest Weeks</label>
                          <Input type="number" value={entry.number_of_weeks_harvest} onChange={e => handleUpdate({ ...entry, number_of_weeks_harvest: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Harvest Interval (d)</label>
                          <Input type="number" value={entry.harvest_interval} onChange={e => handleUpdate({ ...entry, harvest_interval: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Germ Min</label>
                          <Input type="number" value={entry.germination_days_min} onChange={e => handleUpdate({ ...entry, germination_days_min: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Germ Max</label>
                          <Input type="number" value={entry.germination_days_max} onChange={e => handleUpdate({ ...entry, germination_days_max: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Batch Offset</label>
                          <Input type="number" value={entry.batch_offset_days} onChange={e => handleUpdate({ ...entry, batch_offset_days: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Transplant (d)</label>
                          <Input type="number" value={entry.transplant_days ?? ''} onChange={e => handleUpdate({ ...entry, transplant_days: e.target.value ? parseInt(e.target.value) : null })} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Grow from TP (d)</label>
                          <Input type="number" value={entry.growing_from_transplant ?? ''} onChange={e => handleUpdate({ ...entry, growing_from_transplant: e.target.value ? parseInt(e.target.value) : null })} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                        <div>
                          <p className="text-xs font-bold">Continuous Production</p>
                          <p className="text-[9px] text-gray-500">Auto-sets harvest window to 4 weeks</p>
                        </div>
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 accent-green-600"
                          checked={entry.number_of_weeks_harvest > 1}
                          onChange={e => handleUpdate({ ...entry, number_of_weeks_harvest: e.target.checked ? 4 : 1 })}
                        />
                      </div>
                    </section>

                    {/* Spray Schedule */}
                    <section className="bg-white rounded-xl border p-4 space-y-4 shadow-sm">
                      <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest">Spray Schedule (Days)</h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-red-600 uppercase">Fungus Spray Days</label>
                          <div className="flex flex-wrap gap-2">
                            {entry.fungus_spray_days.map((d, i) => (
                              <Badge key={i} variant="secondary" className="bg-red-50 text-red-700 border-none px-2 py-1 flex items-center gap-1 text-[10px]">
                                Day {d}
                                <button onClick={() => {
                                  const next = [...entry.fungus_spray_days];
                                  next.splice(i, 1);
                                  handleUpdate({ ...entry, fungus_spray_days: next });
                                }}><X className="w-3 h-3" /></button>
                              </Badge>
                            ))}
                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => {
                              const d = prompt('Add fungus spray day (number):');
                              if (d && !isNaN(parseInt(d))) {
                                handleUpdate({ ...entry, fungus_spray_days: [...entry.fungus_spray_days, parseInt(d)].sort((a,b) => a-b) });
                              }
                            }}>+ Add Day</Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-amber-600 uppercase">Pest Spray Days</label>
                          <div className="flex flex-wrap gap-2">
                            {entry.pest_spray_days.map((d, i) => (
                              <Badge key={i} variant="secondary" className="bg-amber-50 text-amber-700 border-none px-2 py-1 flex items-center gap-1 text-[10px]">
                                Day {d}
                                <button onClick={() => {
                                  const next = [...entry.pest_spray_days];
                                  next.splice(i, 1);
                                  handleUpdate({ ...entry, pest_spray_days: next });
                                }}><X className="w-3 h-3" /></button>
                              </Badge>
                            ))}
                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => {
                              const d = prompt('Add pest spray day (number):');
                              if (d && !isNaN(parseInt(d))) {
                                handleUpdate({ ...entry, pest_spray_days: [...entry.pest_spray_days, parseInt(d)].sort((a,b) => a-b) });
                              }
                            }}>+ Add Day</Button>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Diseases & Pests */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <section className="bg-white rounded-xl border p-4 space-y-3 shadow-sm">
                        <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest">Diseases</h3>
                        <div className="flex flex-wrap gap-1">
                          {entry.diseases.map((d, i) => (
                            <Badge key={i} className="bg-gray-100 text-gray-700 border-none text-[10px]">
                              {d} <button onClick={() => {
                                const next = [...entry.diseases];
                                next.splice(i, 1);
                                handleUpdate({ ...entry, diseases: next });
                              }} className="ml-1 opacity-50"><X className="w-3 h-3" /></button>
                            </Badge>
                          ))}
                        </div>
                        <Input placeholder="Add disease..." className="text-xs h-8" onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            if (val) {
                              handleUpdate({ ...entry, diseases: [...entry.diseases, val] });
                              e.currentTarget.value = '';
                            }
                          }
                        }} />
                      </section>
                      <section className="bg-white rounded-xl border p-4 space-y-3 shadow-sm">
                        <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest">Pests</h3>
                        <div className="flex flex-wrap gap-1">
                          {entry.pests.map((p, i) => (
                            <Badge key={i} className="bg-gray-100 text-gray-700 border-none text-[10px]">
                              {p} <button onClick={() => {
                                const next = [...entry.pests];
                                next.splice(i, 1);
                                handleUpdate({ ...entry, pests: next });
                              }} className="ml-1 opacity-50"><X className="w-3 h-3" /></button>
                            </Badge>
                          ))}
                        </div>
                        <Input placeholder="Add pest..." className="text-xs h-8" onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            if (val) {
                              handleUpdate({ ...entry, pests: [...entry.pests, val] });
                              e.currentTarget.value = '';
                            }
                          }
                        }} />
                      </section>
                    </div>
                  </>
                );
              })()}
              <div className="h-10" />
            </div>
          )}
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h3 className="text-xl font-bold">Add New Crop</h3>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase">Crop Name (e.g. Pak Choi)</label>
              <Input autoFocus value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Enter name..." />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1 bg-green-700" onClick={handleAdd}>Create Crop</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setIsAdding(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
