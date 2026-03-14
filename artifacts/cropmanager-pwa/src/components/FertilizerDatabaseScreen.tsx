import React, { useState, useEffect } from 'react';
import { Search, ChevronLeft, Download, Info, ArrowLeft, Leaf, Droplets, Flower2, Apple, Beaker, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { loadFertDatabase, getFertCrops } from '../lib/fertDb';
import type { FertDatabase, FertCropEntry, FertStage, FertMix } from '../types';

const TEA_COLORS: Record<string, string> = {
  cow_manure_tea: '#92400e',
  chicken_manure_tea: '#d97706',
  plant_based_tea: '#15803d',
  wood_ash_tea: '#6b7280'
};

const STAGE_ICONS: Record<string, React.ReactNode> = {
  seedling: <Leaf className="w-5 h-5 text-green-500" />,
  mid_vegetative: <Droplets className="w-5 h-5 text-blue-500" />,
  flowering: <Flower2 className="w-5 h-5 text-amber-500" />,
  fruiting: <Apple className="w-5 h-5 text-red-500" />
};

const STAGE_LABELS: Record<string, string> = {
  seedling: 'Seedling',
  mid_vegetative: 'Mid-Veg',
  flowering: 'Flowering',
  fruiting: 'Fruiting'
};

export function FertilizerDatabaseScreen({ onClose }: { onClose: () => void }) {
  const [db, setDb] = useState<FertDatabase | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<keyof FertCropEntry['stages']>('seedling');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showMeta, setShowMeta] = useState(false);

  useEffect(() => {
    loadFertDatabase().then(data => {
      setDb(data);
      setLoading(false);
    });
  }, []);

  if (loading || !db) return <div className="p-8 text-center">Loading database...</div>;

  const fertCrops = getFertCrops(db);
  const filteredCrops = fertCrops.filter(({ key, entry }) => 
    key.toLowerCase().includes(searchQuery.toLowerCase()) || 
    entry.display_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedEntry = selectedKey ? db.crops[selectedKey] : null;

  const calculateMixingExample = (mix: FertMix, type: 'foliar' | 'drench') => {
    if (!mix.mix_parts) return 'No teas defined';
    const activeTeas = Object.entries(mix.mix_parts).filter(([, v]) => (v ?? 0) > 0);
    const totalParts = activeTeas.reduce((sum, [, v]) => sum + (v ?? 0), 0);
    if (totalParts === 0) return 'No teas selected';

    const baseVol = type === 'foliar' ? 1000 : 5000;
    const dilution = typeof mix.final_dilution === 'string' ? parseFloat(mix.final_dilution.replace('1:', '')) : mix.final_dilution;
    const mlEach = Math.round((baseVol / (dilution || 1) / totalParts) * 2) / 2;
    const water = Math.round(baseVol - (mlEach * activeTeas.length));

    const teaList = activeTeas.map(([name]) => `${mlEach}ml ${name.replace(/_/g, ' ')}`).join(', ');
    const container = type === 'foliar' ? '1L spray bottle' : '5L watering can';
    
    return `Per ${container}: ${teaList}, top up with water (~${water}ml water)`;
  };

  const handleUpdateStage = (stageKey: string, type: 'foliar' | 'drench', patch: Partial<FertMix>) => {
    if (!selectedKey || !db) return;
    const currentStage = selectedEntry!.stages[stageKey as keyof FertCropEntry['stages']];
    const currentMix = currentStage[type];
    
    const nextMix = { ...currentMix, ...patch };
    // Ensure final_dilution is present
    if (nextMix.final_dilution === undefined && currentMix) {
      nextMix.final_dilution = currentMix.final_dilution;
    }
    nextMix.mixing_example = calculateMixingExample(nextMix as FertMix, type);

    const nextDb = {
      ...db,
      crops: {
        ...db.crops,
        [selectedKey]: {
          ...selectedEntry!,
          stages: {
            ...selectedEntry!.stages,
            [stageKey]: {
              ...currentStage,
              [type]: nextMix
            }
          }
        }
      }
    };
    setDb(nextDb);
  };

  const handleSaveDb = async () => {
    try {
      const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
      const response = await fetch(`${baseUrl}/api/data/fert-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(db),
      });
      if (response.ok) {
        alert('Fertilizer Database saved successfully to JSON file!');
      } else {
        alert('Failed to save to server. Local changes kept.');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving to server. Local changes kept.');
    }
  };

  const exportJson = () => {
    const json = JSON.stringify(db, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fertilizer_schedule.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white animate-in slide-in-from-right duration-300 overflow-hidden">
      <header className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={selectedKey ? () => setSelectedKey(null) : onClose} className="p-1 hover:bg-gray-100 rounded-full">
            {selectedKey ? <ArrowLeft className="w-6 h-6" /> : <ChevronLeft className="w-6 h-6" />}
          </button>
          <h2 className="font-bold text-lg">{selectedKey ? selectedEntry?.display_name : 'Fertilizer Guide'}</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleSaveDb} className="text-amber-700">
             Save File
          </Button>
          <Button variant="ghost" size="sm" onClick={exportJson} className="text-amber-700">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
        </div>
      </header>

      {!selectedKey ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 space-y-4 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search crops..." 
                className="pl-9 h-11 text-base rounded-xl" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            
            <button 
              onClick={() => setShowMeta(!showMeta)}
              className="w-full p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between text-left transition-colors hover:bg-amber-100/50"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                  <Info className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-amber-900">About the 5 Teas</p>
                  <p className="text-xs text-amber-700">Organic nutrient guide & yeast prep</p>
                </div>
              </div>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-3">
            {showMeta ? (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                <Button variant="ghost" size="sm" onClick={() => setShowMeta(false)} className="text-amber-700 mb-2">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Crops
                </Button>
                <section className="space-y-3">
                  <h3 className="text-xs font-bold text-amber-600 uppercase tracking-widest">Tea Descriptions</h3>
                  {Object.entries(db._meta.teas).map(([name, desc]) => (
                    <div key={name} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="font-bold text-sm text-gray-900 capitalize mb-1">{name.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </section>
                <section className="space-y-3">
                  <h3 className="text-xs font-bold text-amber-600 uppercase tracking-widest">Yeast Preparation</h3>
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                    <p className="text-xs text-blue-800 leading-relaxed whitespace-pre-line">{db._meta.yeast_preparation}</p>
                  </div>
                </section>
                <section className="space-y-3">
                  <h3 className="text-xs font-bold text-amber-600 uppercase tracking-widest">Application Tips</h3>
                  <div className="space-y-2">
                    {db._meta.application_tips.map((tip, i) => (
                      <div key={i} className="flex gap-2 text-xs text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> {tip}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              filteredCrops.map(({ key, entry }) => (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className="w-full bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between text-left transition-all active:scale-[0.98] shadow-sm hover:border-amber-200"
                >
                  <div>
                    <h3 className="font-bold text-gray-900">{entry.display_name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{entry.plant_type} · {entry.fert_profile}</p>
                  </div>
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                    <Beaker className="w-5 h-5" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          <div className="bg-white p-4 border-b shrink-0">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
              {(['seedling', 'mid_vegetative', 'flowering', 'fruiting'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setActiveStage(s)}
                  className={`flex-1 flex flex-col items-center justify-center py-2 rounded-lg transition-all ${activeStage === s ? 'bg-white shadow-sm text-green-700' : 'text-gray-500 hover:bg-white/50'}`}
                >
                  {STAGE_ICONS[s]}
                  <span className="text-[10px] font-bold mt-1">{STAGE_LABELS[s]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Stage Description</h3>
              <textarea 
                className="w-full text-sm text-gray-700 leading-relaxed focus:outline-none resize-none min-h-[60px]"
                value={selectedEntry!.stages[activeStage].description}
                onChange={e => {
                  const stage = selectedEntry!.stages[activeStage];
                  const nextDb = { ...db };
                  nextDb.crops[selectedKey!].stages[activeStage] = { ...stage, description: e.target.value };
                  setDb(nextDb);
                }}
              />
            </div>

            {(['foliar', 'drench'] as const).map(type => {
              const stage = selectedEntry!.stages[activeStage];
              const mix = stage[type];
              if (!mix) return null;
              const activeTeas = mix.mix_parts ? Object.entries(mix.mix_parts).filter(([, v]) => (v ?? 0) > 0) : [];
              const totalParts = activeTeas.reduce((sum, [, v]) => sum + (v ?? 0), 0);

              return (
                <div key={type} className="bg-white rounded-2xl border overflow-hidden shadow-sm">
                  <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
                      {type === 'foliar' ? <Leaf className="w-4 h-4 text-green-600" /> : <Droplets className="w-4 h-4 text-blue-600" />}
                      {type} Application
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400">1:X DILUTION</span>
                      <Input 
                        type="text" 
                        className="w-16 h-7 text-xs font-bold text-center" 
                        value={mix.final_dilution}
                        onChange={e => handleUpdateStage(activeStage, type, { final_dilution: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="p-4 space-y-6">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                      {mix.mix_parts && Object.entries(mix.mix_parts).map(([tea, val]) => (
                        <div key={tea} className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center justify-between">
                            {tea.replace(/_tea/g, '').replace(/_/g, ' ')}
                            <span className="text-gray-900">{val} pts</span>
                          </label>
                          <input 
                            type="range" min="0" max="5" step="0.5" 
                            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                            style={{ accentColor: TEA_COLORS[tea] || '#ccc', backgroundColor: '#f1f5f9' }}
                            value={val ?? 0}
                            onChange={e => {
                              const nextMixParts = { ...mix.mix_parts, [tea]: parseFloat(e.target.value) };
                              handleUpdateStage(activeStage, type, { mix_parts: nextMixParts });
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="h-2 w-full bg-gray-100 rounded-full flex overflow-hidden">
                      {mix.mix_parts && Object.entries(mix.mix_parts).map(([tea, val]) => (
                        <div 
                          key={tea} 
                          className="h-full transition-all"
                          style={{ width: `${((val ?? 0) / (totalParts || 1)) * 100}%`, backgroundColor: TEA_COLORS[tea] || '#ccc' }}
                        />
                      ))}
                    </div>

                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-xs text-gray-600 font-medium italic leading-relaxed">
                        {mix.mixing_example}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stage Notes</label>
                      <textarea 
                        className="w-full text-xs text-gray-500 bg-gray-50 rounded-xl p-3 border border-gray-100 min-h-[60px]"
                        placeholder="Add stage specific notes..."
                        value={mix.note}
                        onChange={e => handleUpdateStage(activeStage, type, { note: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="h-10" />
          </div>
        </div>
      )}
    </div>
  );
}
