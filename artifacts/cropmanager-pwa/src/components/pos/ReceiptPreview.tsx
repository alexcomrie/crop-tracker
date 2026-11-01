import React from 'react';
import type { PrintSettings } from '../../lib/receiptPrinter';
import { fmtMoney } from '../../lib/pos';
import type { PosSaleItem } from '../../types';

export interface ReceiptPreviewData {
  kind: 'sale' | 'held';
  receiptNumber?: number;
  name?: string;
  date: string;
  customerName?: string;
  items: PosSaleItem[];
  subtotal: number;
  discount: number;
  tax?: number;
  taxLabel?: string;
  taxRate?: number;
  total: number;
  amountPaid?: number;
  change?: number;
  paymentMethod?: string;
  reprint?: boolean;
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? 'font-bold' : ''} ${tone ?? ''}`}>
      <span className="truncate">{label}</span>
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
}

/** Paper-style receipt body — the same layout as the settings receipt preview. */
export function ReceiptPreview({ data, settings }: { data: ReceiptPreviewData; settings: PrintSettings }) {
  const cur = settings.currency || '$';
  const charCount = settings.printCharPerLine || 32;
  const divider = '─'.repeat(Math.max(12, charCount));
  const tax = data.tax ?? Math.max(0, data.total - (data.subtotal - data.discount));
  const taxLabel = data.taxLabel ?? settings.taxLabel;
  const taxRate = data.taxRate ?? settings.taxRate;
  const title = data.kind === 'held'
    ? (data.name || 'Held Receipt')
    : `Receipt #${String(data.receiptNumber ?? 0).padStart(6, '0')}`;

  return (
    <div className="bg-white font-mono text-[11px] leading-relaxed text-gray-900">
      {data.reprint && (
        <p className="text-center font-bold tracking-[0.25em] text-red-600 border border-red-300 rounded-md py-1 mb-2">
          REPRINT
        </p>
      )}
      {settings.showLogo && settings.logoDataUrl && (
        <div className="text-center mb-1">
          <img src={settings.logoDataUrl} alt="Logo" className="h-9 mx-auto object-contain" />
        </div>
      )}
      <p className="font-bold text-sm text-center">{settings.businessName}</p>
      {settings.businessAddress && <p className="text-center text-gray-500">{settings.businessAddress}</p>}
      {settings.businessPhone && <p className="text-center text-gray-500">Tel: {settings.businessPhone}</p>}
      {settings.businessEmail && <p className="text-center text-gray-500">{settings.businessEmail}</p>}
      <p className="text-center text-gray-400">{divider}</p>
      <p className="text-center font-bold">{title}</p>
      {data.kind === 'held' && (
        <p className="text-center text-[9px] uppercase tracking-[0.2em] text-blue-600">Held receipt preview</p>
      )}
      <p className="text-center text-gray-500">{data.date}</p>
      {settings.showCustomer && data.customerName && (
        <p className="text-center text-gray-500">Customer: {data.customerName}</p>
      )}
      <p className="text-center text-gray-400">{divider}</p>

      <div className="grid grid-cols-[1fr_3.2rem_3.6rem_3.6rem] gap-x-1 text-gray-500">
        <span>Item</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Price</span>
        <span className="text-right">Total</span>
      </div>
      <p className="text-center text-gray-400">{divider}</p>
      {data.items.map((item, i) => (
        <div key={`${item.productId}-${i}`} className="grid grid-cols-[1fr_3.2rem_3.6rem_3.6rem] gap-x-1">
          <span className="truncate">{item.productName}</span>
          <span className="text-right whitespace-nowrap">{item.quantity} {item.unit}</span>
          <span className="text-right whitespace-nowrap">{fmtMoney(item.unitPrice, cur)}</span>
          <span className="text-right whitespace-nowrap">{fmtMoney(item.total, cur)}</span>
        </div>
      ))}
      <p className="text-center text-gray-400">{divider}</p>

      <Row label="Subtotal:" value={fmtMoney(data.subtotal, cur)} />
      {data.discount > 0 && <Row label="Discount:" value={`-${fmtMoney(data.discount, cur)}`} tone="text-red-500" />}
      {tax > 0 && (
        <Row label={`${taxLabel}${taxRate > 0 ? ` (${taxRate}%)` : ''}:`} value={fmtMoney(tax, cur)} />
      )}
      <p className="text-center text-gray-400">{divider}</p>
      <Row label="TOTAL:" value={fmtMoney(data.total, cur)} bold tone="text-green-700 text-sm" />
      <p className="text-center text-gray-400">{divider}</p>

      {data.amountPaid !== undefined && <Row label="Paid:" value={fmtMoney(data.amountPaid, cur)} />}
      {data.change !== undefined && data.change > 0 && <Row label="Change:" value={fmtMoney(data.change, cur)} />}
      {data.paymentMethod && (
        <p className="text-center text-gray-500">Payment: {data.paymentMethod.toUpperCase()}</p>
      )}
      {data.kind === 'held' && (
        <p className="text-center text-gray-500">Balance due: {fmtMoney(data.total, cur)}</p>
      )}
      <p className="text-center text-gray-500 mt-1">{settings.receiptFooter}</p>
      {data.reprint && (
        <p className="text-center text-[9px] tracking-[0.2em] text-gray-400 mt-1">DUPLICATE COPY</p>
      )}
    </div>
  );
}

interface ModalProps {
  data: ReceiptPreviewData;
  settings: PrintSettings;
  onClose: () => void;
  /** Optional action buttons (reprint, redownload, resend...). Taps here don't close the preview. */
  actions?: React.ReactNode;
}

/** Full centred receipt popup. Tap anywhere outside the action bar to close. */
export function ReceiptPreviewModal({ data, settings, onClose, actions }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={data.kind === 'held' ? 'Held receipt preview' : 'Receipt preview'}
    >
      <div
        className="w-full max-w-sm max-h-[90vh] overflow-y-auto"
        onClick={e => {
          const target = e.target as HTMLElement;
          if (!target.closest('[data-receipt-actions]')) onClose();
        }}
      >
        <div className="bg-white rounded-2xl p-4 shadow-2xl">
          <ReceiptPreview data={data} settings={settings} />
        </div>
        {actions && (
          <div
            data-receipt-actions
            className="mt-3 bg-white rounded-2xl p-3 space-y-2 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
        <p className="text-center text-[10px] text-white/80 mt-2">Tap anywhere to close</p>
      </div>
    </div>
  );
}
