import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '../../store/useAppStore';
import { pullFromGAS, exportJsonBackup } from '../../lib/sync';
import db from '../../db/db';

export function DataManagement() {
  const { settings } = useAppStore();
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState('');
  const [clearInput, setClearInput] = useState('');
  const [showClear, setShowClear] = useState(false);

  async function handlePull() {
    if (!confirm('This will replace ALL local data with data from Google Sheets. Continue?')) return;
    setPulling(true);
    setPullMsg('Pulling...');
    const result = await pullFromGAS(settings);
    setPullMsg(result.success ? `✅ Pulled ${result.count} records` : `❌ ${result.error}`);
    setPulling(false);
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

  async function handleClear() {
    if (clearInput !== 'CLEAR') return;
    await Promise.all([
      db.crops.clear(), db.propagations.clear(), db.reminders.clear(),
      db.stageLogs.clear(), db.harvestLogs.clear(), db.treatmentLogs.clear(),
    ]);
    setClearInput('');
    setShowClear(false);
    alert('Local data cleared.');
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold">Data Management</h3>

        <Button variant="outline" className="w-full" onClick={handlePull} disabled={pulling || !settings.gasWebAppUrl}>
          {pulling ? '⏳ Pulling...' : '📥 Pull from Sheets'}
        </Button>
        {pullMsg && <p className="text-sm text-center text-muted-foreground">{pullMsg}</p>}

        <Button variant="outline" className="w-full" onClick={handleExport}>
          📦 Export JSON Backup
        </Button>

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
    </div>
  );
}
