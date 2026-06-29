import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Search, Trash2, Printer, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateShort } from '../../lib/dates';

interface Props {
  onBack: () => void;
}

export function SalesHistory({ onBack }: Props) {
  const [search, setSearch] = useState('');
  const sales = useLiveQuery(() => db.posSales.orderBy('createdAt').reverse().toArray(), []) ?? [];

  const filtered = search
    ? sales.filter(s =>
        String(s.receiptNumber).includes(search) ||
        s.customerName?.toLowerCase().includes(search.toLowerCase()) ||
        s.items.some(i => i.productName.toLowerCase().includes(search.toLowerCase()))
      )
    : sales;

  async function handleDelete(id: string) {
    if (window.confirm('Delete this sale?')) {
      await db.posSales.delete(id);
      toast.success('Sale deleted');
    }
  }

  return (
    <div className="flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
        <h1 className="font-bold text-lg flex-1">Sales History</h1>
        <span className="text-xs text-gray-500">{sales.length} sale{sales.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="p-4">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search by receipt #, customer, product..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="space-y-2">
          {filtered.map(sale => (
            <div key={sale.id} className="bg-white rounded-xl border p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-sm">#{String(sale.receiptNumber).padStart(6, '0')}</p>
                  <p className="text-xs text-gray-500">{sale.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-700">${sale.total.toFixed(2)}</p>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{sale.paymentMethod}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                {sale.items.slice(0, 3).map((item, i) => (
                  <p key={i}>{item.quantity}× {item.productName} @ ${item.unitPrice.toFixed(2)}</p>
                ))}
                {sale.items.length > 3 && <p className="text-gray-400">+{sale.items.length - 3} more items</p>}
              </div>
              {sale.customerName && <p className="text-xs text-blue-600 mt-1">Customer: {sale.customerName}</p>}
              <div className="flex gap-1 mt-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleDelete(sale.id)}><Trash2 className="w-3 h-3 mr-1" /> Delete</Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No sales found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
