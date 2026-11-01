import React, { useState } from 'react';
import db from '../../db/db';
import { generateId } from '../../lib/ids';
import { formatDateShort, today } from '../../lib/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/shared/DateInput';
import { toast } from 'sonner';
import { X, Wallet } from 'lucide-react';
import type { RepaymentDebt, RepaymentDebtCategory } from '../../types';
import { DEBT_CATEGORIES } from '../../lib/repayments';

interface Props {
  debt: RepaymentDebt | null;
  paid: number;
  onClose: () => void;
  onSaved: (debtId: string) => void;
}

export function DebtFormModal({ debt, paid, onClose, onSaved }: Props) {
  const [name, setName] = useState(debt?.name ?? '');
  const [lender, setLender] = useState(debt?.lender ?? '');
  const [category, setCategory] = useState<RepaymentDebtCategory>(debt?.category ?? 'loan');
  const [originalAmount, setOriginalAmount] = useState(debt ? String(debt.originalAmount) : '');
  const [startDate, setStartDate] = useState(debt?.startDate ?? formatDateShort(today()));
  const [dueDate, setDueDate] = useState(debt?.dueDate ?? '');
  const [notes, setNotes] = useState(debt?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const amount = Number(originalAmount);
    if (!name.trim()) { toast.error('Enter a name for this debt'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter the original amount'); return; }

    setSaving(true);
    try {
      const now = Date.now();
      const status = paid >= amount ? 'settled' : (debt?.status ?? 'active');
      if (debt) {
        await db.repaymentDebts.update(debt.id, {
          name: name.trim(),
          lender: lender.trim(),
          category,
          originalAmount: amount,
          startDate,
          dueDate,
          notes: notes.trim(),
          status,
          updatedAt: now,
          settledAt: status === 'settled' ? (debt.settledAt ?? now) : undefined,
        });
        toast.success('Debt updated');
        onSaved(debt.id);
      } else {
        const id = generateId('DBT');
        await db.repaymentDebts.add({
          id,
          name: name.trim(),
          lender: lender.trim(),
          category,
          originalAmount: amount,
          startDate,
          dueDate,
          notes: notes.trim(),
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        toast.success('Debt added');
        onSaved(id);
      }
      onClose();
    } catch (e) {
      console.error('[repayments] save debt failed', { e });
      toast.error('Could not save: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-teal-600" />
          <h2 className="font-bold text-lg flex-1">{debt ? 'Edit Debt' : 'New Debt / Loan'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="space-y-1">
          <Label>Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Truck loan" className="text-sm" />
        </div>

        <div className="space-y-1">
          <Label>Lender / Creditor</Label>
          <Input value={lender} onChange={e => setLender(e.target.value)} placeholder="e.g. Farm Credit Bank" className="text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={category} onValueChange={(v: RepaymentDebtCategory) => setCategory(v)}>
              <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEBT_CATEGORIES.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.emoji} {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Original Amount *</Label>
            <Input
              type="number"
              value={originalAmount}
              onChange={e => setOriginalAmount(e.target.value)}
              placeholder="0.00"
              min={0}
              step={0.01}
              className="text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Start Date</Label>
            <DateInput value={startDate} onChange={setStartDate} className="w-full border rounded-lg p-2 text-sm min-h-[40px] bg-white" />
          </div>
          <div className="space-y-1">
            <Label>Due Date</Label>
            <DateInput value={dueDate} onChange={setDueDate} className="w-full border rounded-lg p-2 text-sm min-h-[40px] bg-white" />
            {dueDate && (
              <button onClick={() => setDueDate('')} className="text-[10px] text-gray-400 underline">Clear due date</button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Interest terms, payment plan, anything useful..." className="text-sm min-h-[70px]" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-1 bg-teal-600 hover:bg-teal-700" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : debt ? 'Save Changes' : 'Add Debt'}
          </Button>
        </div>
      </div>
    </div>
  );
}
