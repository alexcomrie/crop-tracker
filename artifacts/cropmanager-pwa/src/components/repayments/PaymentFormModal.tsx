import React, { useRef, useState } from 'react';
import db from '../../db/db';
import { generateId } from '../../lib/ids';
import { addDiaryEntry } from '../../lib/diary';
import { formatDateShort, today } from '../../lib/dates';
import { fmtMoney } from '../../lib/pos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/shared/DateInput';
import { toast } from 'sonner';
import { Camera, Upload, X, Image as ImageIcon, CreditCard } from 'lucide-react';
import type { RepaymentDebt } from '../../types';
import { PAYMENT_METHODS } from '../../lib/repayments';

interface Props {
  debt: RepaymentDebt;
  currency: string;
  remaining: number;
  onClose: () => void;
  onSaved: () => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/** Shrink camera photos before storing them in IndexedDB. */
async function compressImage(file: File): Promise<string> {
  const raw = await readFileAsDataUrl(file);
  try {
    const img = await loadImage(raw);
    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.height || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return raw;
  }
}

export function PaymentFormModal({ debt, currency, remaining, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState(remaining > 0 ? remaining.toFixed(2) : '');
  const [date, setDate] = useState(formatDateShort(today()));
  const [method, setMethod] = useState('Cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = Math.max(0, 5 - proofImages.length);
    const chosen = Array.from(files).slice(0, room);
    if (chosen.length === 0) { toast.error('You can attach up to 5 proof images'); return; }
    try {
      const compressed = await Promise.all(chosen.map(compressImage));
      setProofImages(prev => [...prev, ...compressed].slice(0, 5));
    } catch (e) {
      console.error('[repayments] proof image failed', { e });
      toast.error('Could not add that image');
    }
  }

  function removeProof(index: number) {
    setProofImages(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast.error('Enter the amount paid'); return; }

    setSaving(true);
    try {
      const now = Date.now();
      let paidTotal = 0;
      await db.transaction('rw', [db.repaymentPayments, db.repaymentDebts], async () => {
        await db.repaymentPayments.add({
          id: generateId('RPM'),
          debtId: debt.id,
          debtName: debt.name,
          amount: value,
          date,
          method,
          reference: reference.trim(),
          note: note.trim(),
          currency,
          proofImages,
          createdAt: now,
          updatedAt: now,
        });
        const all = await db.repaymentPayments.where('debtId').equals(debt.id).toArray();
        paidTotal = all.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        if (paidTotal >= (Number(debt.originalAmount) || 0)) {
          await db.repaymentDebts.update(debt.id, { status: 'settled', settledAt: now, updatedAt: now });
        } else if (debt.status === 'settled') {
          await db.repaymentDebts.update(debt.id, { status: 'active', settledAt: undefined, updatedAt: now });
        }
      });

      const left = Math.max(0, (Number(debt.originalAmount) || 0) - paidTotal);
      await addDiaryEntry({
        entryType: 'repayment',
        description: `Repayment: ${debt.name}`,
        details: `${fmtMoney(value, currency)} paid${method ? ` (${method})` : ''} · ${left > 0 ? `${fmtMoney(left, currency)} remaining` : 'Settled'}`,
        date,
      });

      toast.success(left > 0
        ? `Payment recorded · ${fmtMoney(left, currency)} remaining`
        : 'Payment recorded · debt settled 🎉');
      onSaved();
      onClose();
    } catch (e) {
      console.error('[repayments] save payment failed', { e });
      toast.error('Could not record payment: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-teal-600" />
          <h2 className="font-bold text-lg flex-1">Record Payment</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
          <p className="text-sm font-semibold text-teal-800">{debt.name}</p>
          <p className="text-xs text-teal-700">{fmtMoney(remaining, currency)} remaining</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Amount Paid *</Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              min={0}
              step={0.01}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <DateInput value={date} onChange={setDate} className="w-full border rounded-lg p-2 text-sm min-h-[40px] bg-white" />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Payment Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Reference / Transaction ID</Label>
          <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" className="text-sm" />
        </div>

        <div className="space-y-1">
          <Label>Note</Label>
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note about this payment..." className="text-sm min-h-[60px]" />
        </div>

        <div className="space-y-2">
          <Label>Proof of Payment (optional)</Label>
          <p className="text-[11px] text-gray-500 leading-snug">
            Attach a screenshot or take a photo of your proof of payment. You can skip this step.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 h-9 text-xs gap-1.5" onClick={() => uploadRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" /> Upload Image
            </Button>
            <Button type="button" variant="outline" className="flex-1 h-9 text-xs gap-1.5" onClick={() => cameraRef.current?.click()}>
              <Camera className="w-3.5 h-3.5" /> Take Photo
            </Button>
          </div>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          />
          {proofImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {proofImages.map((src, i) => (
                <div key={i} className="relative rounded-lg overflow-hidden border bg-gray-50">
                  <img src={src} alt={`Proof ${i + 1}`} className="w-full h-20 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeProof(i)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
                    aria-label="Remove proof image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {proofImages.length === 0 && (
            <p className="text-[10px] text-gray-400 flex items-center gap-1"><ImageIcon className="w-3 h-3" /> No proof attached</p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-1 bg-teal-600 hover:bg-teal-700" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Payment'}
          </Button>
        </div>
      </div>
    </div>
  );
}
