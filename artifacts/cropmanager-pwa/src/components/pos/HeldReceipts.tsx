import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { ChevronLeft, Clock, ShoppingCart, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { PosHeldReceipt } from '../../types';
import { formatDateShort } from '../../lib/dates';

interface Props {
  onBack: () => void;
  onLoadReceipt: (receipt: PosHeldReceipt) => void;
}

export function HeldReceipts({ onBack, onLoadReceipt }: Props) {
  const heldReceipts = useLiveQuery(() => db.posHeldReceipts.orderBy('createdAt').reverse().toArray(), []) ?? [];

  async function handleDelete(id: string) {
    if (window.confirm('Delete this held receipt?')) {
      await db.posHeldReceipts.delete(id);
      toast.success('Receipt deleted');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
        <h1 className="font-bold text-lg flex-1 flex items-center gap-2"><Clock className="w-5 h-5 text-blue-600" /> Held Receipts</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {heldReceipts.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No held receipts</p>
            <p className="text-xs mt-1">Park a sale from the POS to save it here</p>
          </div>
        )}
        {heldReceipts.map(r => (
          <div key={r.id} className="bg-white border rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-gray-500">{formatDateShort(new Date(r.createdAt))} · {r.cart.length} item(s)</p>
              </div>
              <p className="font-bold text-green-700">${r.total.toFixed(2)}</p>
            </div>
            {r.customerName && <p className="text-xs text-gray-500">Customer: {r.customerName}</p>}
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="bg-blue-600" onClick={() => onLoadReceipt(r)}><ShoppingCart className="w-3 h-3 mr-1" /> Load</Button>
              <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleDelete(r.id)}><Trash2 className="w-3 h-3 mr-1" /> Delete</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
