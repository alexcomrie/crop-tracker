import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Search, Trash2, Receipt, Printer, Download, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePosCurrency, usePosPrintSettings, fmtMoney } from '../../lib/pos';
import type { PosSale } from '../../types';
import {
  buildSaleReceipt,
  buildSaleReceiptText,
  connectBluetoothPrinter,
  getActivePrinter,
  printViaBluetooth,
  setActivePrinter,
} from '../../lib/receiptPrinter';
import { toPng } from 'html-to-image';
import { ReceiptPreview, ReceiptPreviewModal, type ReceiptPreviewData } from './ReceiptPreview';

interface Props {
  onBack: () => void;
}

export function SalesHistory({ onBack }: Props) {
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<PosSale | null>(null);
  const [busy, setBusy] = useState<'print' | 'download' | 'resend' | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const cur = usePosCurrency();
  const printSettings = usePosPrintSettings();
  const sales = useLiveQuery(() => db.posSales.orderBy('createdAt').reverse().limit(100).toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.posCustomers.toArray(), []) ?? [];

  const filtered = search
    ? sales.filter(s =>
        String(s.receiptNumber).includes(search) ||
        s.customerName?.toLowerCase().includes(search.toLowerCase()) ||
        s.items.some(i => i.productName.toLowerCase().includes(search.toLowerCase()))
      )
    : sales;

  const previewData: ReceiptPreviewData | null = preview ? {
    kind: 'sale',
    receiptNumber: preview.receiptNumber,
    date: preview.date,
    customerName: preview.customerName,
    items: preview.items,
    subtotal: preview.subtotal,
    discount: preview.discount,
    tax: preview.tax,
    taxLabel: printSettings.taxLabel,
    taxRate: preview.taxRate,
    total: preview.total,
    amountPaid: preview.amountPaid,
    change: preview.change,
    paymentMethod: preview.paymentMethod,
    reprint: true,
  } : null;

  async function handleDelete(id: string) {
    if (window.confirm('Delete this sale?')) {
      try {
        await db.posSales.delete(id);
        toast.success('Sale deleted');
      } catch (e) {
        console.error('[pos] sale delete failed', { id, e });
        toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
  }

  async function captureReceiptImage(sale: PosSale): Promise<string | null> {
    if (!captureRef.current) return null;
    return toPng(captureRef.current, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
  }

  async function handleReprint() {
    if (!preview) return;
    setBusy('print');
    try {
      let device = getActivePrinter();
      if (!device) {
        device = await connectBluetoothPrinter();
        if (!device) return;
        setActivePrinter(device);
      }
      const bytes = buildSaleReceipt({
        receiptNumber: preview.receiptNumber,
        date: preview.date,
        items: preview.items,
        subtotal: preview.subtotal,
        discount: preview.discount,
        tax: preview.tax,
        total: preview.total,
        amountPaid: preview.amountPaid,
        change: preview.change,
        paymentMethod: preview.paymentMethod,
        customerName: preview.customerName,
      }, printSettings, { reprint: true });
      await printViaBluetooth(device, bytes);
      toast.success('Reprint sent to printer');
    } catch (e) {
      console.error('[pos] reprint failed', { receiptNumber: preview.receiptNumber, e });
      toast.error('Reprint failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    if (!preview) return;
    setBusy('download');
    try {
      const dataUrl = await captureReceiptImage(preview);
      if (!dataUrl) { toast.error('Could not render receipt'); return; }
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `receipt-${String(preview.receiptNumber).padStart(6, '0')}-reprint.png`;
      a.click();
      toast.success('Reprint image downloaded');
    } catch (e) {
      console.error('[pos] reprint download failed', { receiptNumber: preview.receiptNumber, e });
      toast.error('Download failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }

  async function handleResend() {
    if (!preview) return;
    setBusy('resend');
    try {
      const text = buildSaleReceiptText({
        receiptNumber: preview.receiptNumber,
        date: preview.date,
        customerName: preview.customerName,
        items: preview.items,
        subtotal: preview.subtotal,
        discount: preview.discount,
        tax: preview.tax,
        total: preview.total,
        paymentMethod: preview.paymentMethod,
        businessName: printSettings.businessName,
        currency: printSettings.currency,
        reprint: true,
      }, printSettings.printCharPerLine);

      let file: File | null = null;
      try {
        const dataUrl = await captureReceiptImage(preview);
        if (dataUrl) {
          const blob = await (await fetch(dataUrl)).blob();
          file = new File([blob], `receipt-${String(preview.receiptNumber).padStart(6, '0')}-reprint.png`, { type: 'image/png' });
        }
      } catch {
        // Fall back to the text receipt.
      }

      if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Receipt reprint', text });
        toast.success('Reprint shared');
        return;
      }

      const phone = customers.find(c => c.id === preview.customerId)?.phone || '';
      const clean = phone.replace(/\D/g, '');
      window.open(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`, '_blank');
      toast.success('WhatsApp opened with the reprint');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      console.error('[pos] reprint resend failed', { receiptNumber: preview.receiptNumber, e });
      toast.error('Resend failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
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
            <div
              key={sale.id}
              role="button"
              tabIndex={0}
              onClick={() => setPreview(sale)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setPreview(sale); }}
              className="bg-white rounded-xl border p-3 cursor-pointer hover:border-green-300 active:scale-[0.99] transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-sm">#{String(sale.receiptNumber).padStart(6, '0')}</p>
                  <p className="text-xs text-gray-500">{sale.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-700">{fmtMoney(sale.total, cur)}</p>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{sale.paymentMethod}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                {sale.items.slice(0, 3).map((item, i) => (
                  <p key={i}>{item.quantity}× {item.productName} @ {fmtMoney(item.unitPrice, cur)}</p>
                ))}
                {sale.items.length > 3 && <p className="text-gray-400">+{sale.items.length - 3} more items</p>}
              </div>
              {sale.customerName && <p className="text-xs text-blue-600 mt-1">Customer: {sale.customerName}</p>}
              <p className="text-[10px] text-gray-400 mt-1">Tap to view receipt · reprint options</p>
              <div className="flex gap-1 mt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-red-500"
                  onClick={e => { e.stopPropagation(); handleDelete(sale.id); }}
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
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

      {preview && previewData && (
        <ReceiptPreviewModal
          onClose={() => setPreview(null)}
          settings={printSettings}
          data={previewData}
          actions={
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-auto py-2 flex-col gap-1 text-[11px]"
                onClick={handleReprint}
                disabled={busy !== null}
              >
                {busy === 'print' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Reprint
              </Button>
              <Button
                variant="outline"
                className="h-auto py-2 flex-col gap-1 text-[11px]"
                onClick={handleDownload}
                disabled={busy !== null}
              >
                {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Redownload
              </Button>
              <Button
                variant="outline"
                className="h-auto py-2 flex-col gap-1 text-[11px]"
                onClick={handleResend}
                disabled={busy !== null}
              >
                {busy === 'resend' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Resend
              </Button>
            </div>
          }
        />
      )}

      {/* Off-screen reprint render used for image download/share */}
      <div className="fixed -left-[9999px] top-0">
        {previewData && (
          <div ref={captureRef} className="bg-white p-4">
            <ReceiptPreview data={previewData} settings={printSettings} />
          </div>
        )}
      </div>
    </div>
  );
}
