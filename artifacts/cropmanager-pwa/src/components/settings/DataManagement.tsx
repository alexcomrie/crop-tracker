import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAppStore } from '../../store/useAppStore';
import { exportJsonBackup, importJsonBackupFromFile } from '../../lib/backup';
import { importCSVData } from '../../lib/csvImport';
import db from '../../db/db';
import { ShieldAlert, Trash2, ScanEye } from 'lucide-react';

export function DataManagement() {
  const { settings } = useAppStore();
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState('');
  const [clearInput, setClearInput] = useState('');
  const [showClear, setShowClear] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setPullMsg('Importing CSV...');
    const result = await importCSVData(file);
    if (result.success) {
      setPullMsg(`✅ Imported ${result.count} CSV records.`);
    } else {
      setPullMsg(`❌ Import failed: ${result.errors.join(', ')}`);
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleExport() {
    const json = await exportJsonBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cropmanager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleJsonImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setPullMsg('Importing JSON backup...');
    try {
      const res = await importJsonBackupFromFile(file);
      setPullMsg(`✅ Restored: ${Object.entries(res.counts).map(([k,v]) => `${k}=${v}`).join(', ')}`);
    } catch (err: any) {
      setPullMsg(`❌ Import failed: ${String(err?.message || err)}`);
    } finally {
      setImporting(false);
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  }

  async function handleClear() {
    if (clearInput !== 'CLEAR') return;
    await Promise.all([
      db.crops.clear(),
      db.propagations.clear(),
      db.reminders.clear(),
      db.stageLogs.clear(),
      db.harvestLogs.clear(),
      db.treatmentLogs.clear(),
      db.cropDbAdjustments.clear(),
      db.propDbAdjustments.clear(),
      db.batchPlantingLogs.clear(),
      db.cropSearchLogs.clear(),
    ]);
    setClearInput('');
    setShowClear(false);
    toast.success('Local data cleared.');
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold">Data Management</h3>

        {pullMsg && <p className="text-sm text-center text-muted-foreground">{pullMsg}</p>}

        <Button variant="outline" className="w-full" onClick={handleExport}>
          📦 Export JSON Backup
        </Button>

        <div className="relative">
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleJsonImport}
            className="hidden"
            id="json-upload"
            ref={jsonInputRef}
          />
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => jsonInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? '⏳ Importing...' : '📥 Import JSON Backup'}
          </Button>
        </div>

        <div className="relative">
          <input
            type="file"
            accept=".csv"
            onChange={handleCSVImport}
            className="hidden"
            id="csv-upload"
            ref={fileInputRef}
          />
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? '⏳ Importing...' : '📄 Import CSV Data'}
          </Button>
        </div>

        <button
          className="w-full text-sm text-red-600 py-2 border border-red-200 rounded-lg hover:bg-red-50"
          onClick={() => setShowClear(true)}
        >
          🗑️ Clear Local Data
        </button>

        {showClear && (
          <div className="border border-red-200 rounded-lg p-3 space-y-2">
            <p className="text-sm text-red-700 font-medium">Type CLEAR to confirm deletion of all local data:</p>
            <Input
              value={clearInput}
              onChange={e => setClearInput(e.target.value)}
              placeholder="Type CLEAR"
              className="border-red-300"
            />
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1" onClick={handleClear} disabled={clearInput !== 'CLEAR'}>
                Delete All
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => { setShowClear(false); setClearInput(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Database Cleanup */}
      <div className="bg-white rounded-xl border border-orange-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-600" />
          <h3 className="font-semibold text-sm">Database Cleanup</h3>
        </div>

        <Button variant="outline" className="w-full text-orange-700 border-orange-300 hover:bg-orange-50 gap-2" onClick={async () => {
          if (!window.confirm('Remove all duplicate records across the entire app?')) return;
          let total = 0;

          // Diary entries: same cropId + date + entryType + description
          const diarySeen = new Set<string>();
          const diaryEntries = await db.diaryEntries.toArray();
          for (const e of diaryEntries) {
            const key = `${e.cropId}|${e.date}|${e.entryType}|${e.description}`;
            if (diarySeen.has(key)) { await db.diaryEntries.delete(e.id); total++; }
            else diarySeen.add(key);
          }

          // Stage logs: same trackingId + stageFrom + stageTo + date
          const slSeen = new Set<string>();
          const stageLogs = await db.stageLogs.toArray();
          for (const s of stageLogs) {
            const key = `${s.trackingId}|${s.stageFrom}|${s.stageTo}|${s.date}`;
            if (slSeen.has(key)) { await db.stageLogs.delete(s.id); total++; }
            else slSeen.add(key);
          }

          // Harvest logs: same cropTrackingId + harvestNumber
          const hlSeen = new Set<string>();
          const harvestLogs = await db.harvestLogs.toArray();
          for (const h of harvestLogs) {
            const key = `${h.cropTrackingId}|${h.harvestNumber}`;
            if (hlSeen.has(key)) { await db.harvestLogs.delete(h.id); total++; }
            else hlSeen.add(key);
          }

          // Treatment logs: same cropId + date + product
          const tlSeen = new Set<string>();
          const treatmentLogs = await db.treatmentLogs.toArray();
          for (const t of treatmentLogs) {
            const key = `${t.cropId}|${t.date}|${t.product}`;
            if (tlSeen.has(key)) { await db.treatmentLogs.delete(t.id); total++; }
            else tlSeen.add(key);
          }

          // Reminders: same trackingId + type + sendDate
          const remSeen = new Set<string>();
          const reminders = await db.reminders.toArray();
          for (const r of reminders) {
            const key = `${r.trackingId}|${r.type}|${r.sendDate}`;
            if (remSeen.has(key)) { await db.reminders.delete(r.id); total++; }
            else remSeen.add(key);
          }

          // Crops: same cropName + variety + plantingDate
          const cropSeen = new Set<string>();
          const crops = await db.crops.toArray();
          for (const c of crops) {
            const key = `${c.cropName}|${c.variety}|${c.plantingDate}`;
            if (cropSeen.has(key)) { await db.crops.delete(c.id); total++; }
            else cropSeen.add(key);
          }

          // Propagations: same plantName + propagationDate
          const propSeen = new Set<string>();
          const propagations = await db.propagations.toArray();
          for (const p of propagations) {
            const key = `${p.plantName}|${p.propagationDate}`;
            if (propSeen.has(key)) { await db.propagations.delete(p.id); total++; }
            else propSeen.add(key);
          }

          toast.success(`Removed ${total} duplicate records across all tables`);
        }}>
          <Trash2 className="w-4 h-4" /> Remove All Duplicate Records
        </Button>

        <Button variant="outline" className="w-full text-orange-700 border-orange-300 hover:bg-orange-50 gap-2" onClick={async () => {
          if (!window.confirm('Remove all orphaned records (data referencing crops or propagations that no longer exist)?')) return;
          const cropIds = new Set((await db.crops.toArray()).map(c => c.id));
          const propIds = new Set((await db.propagations.toArray()).map(p => p.id));
          let total = 0;

          const linkedTables = [
            { table: db.stageLogs, field: 'trackingId' },
            { table: db.harvestLogs, field: 'cropTrackingId' },
            { table: db.treatmentLogs, field: 'cropId' },
            { table: db.reminders, field: 'trackingId' },
            { table: db.batchPlantingLogs, field: 'cropTrackingId' },
            { table: db.diaryEntries, field: 'cropId' },
          ] as const;

          for (const { table, field } of linkedTables) {
            const all = await table.toArray();
            for (const item of all) {
              const id = (item as any)[field];
              if (id && !cropIds.has(id) && !propIds.has(id)) {
                await table.delete(item.id);
                total++;
              }
            }
          }

          toast.success(`Removed ${total} orphaned records`);
        }}>
          <ScanEye className="w-4 h-4" /> Remove All Orphaned Records
        </Button>

        <Button variant="outline" className="w-full text-orange-700 border-orange-300 hover:bg-orange-50 gap-2" onClick={async () => {
          if (!window.confirm('Delete all diary entries older than 1 year?')) return;
          const yearAgo = new Date();
          yearAgo.setFullYear(yearAgo.getFullYear() - 1);
          const cutoff = yearAgo.toISOString().split('T')[0];
          const all = await db.diaryEntries.toArray();
          let deleted = 0;
          for (const e of all) {
            if (e.date && e.date < cutoff) {
              await db.diaryEntries.delete(e.id);
              deleted++;
            }
          }
          toast.success(`Deleted ${deleted} old diary entries`);
        }}>
          <Trash2 className="w-4 h-4" /> Delete Diary Entries Older Than 1 Year
        </Button>
      </div>
    </div>
  );
}
