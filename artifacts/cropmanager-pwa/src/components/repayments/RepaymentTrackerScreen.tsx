import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ChevronLeft, Plus, Wallet, Trash2, Pencil, CheckCircle2, RotateCcw,
  CreditCard, AlertTriangle, Image as ImageIcon, X, CalendarDays, User,
} from 'lucide-react';
import type { RepaymentDebt, RepaymentPayment } from '../../types';
import { formatDateShort, parseDate, today } from '../../lib/dates';
import { fmtMoney, usePosCurrency } from '../../lib/pos';
import {
  categoryMeta, debtProgress, remainingForDebt, summarizeRepayments,
} from '../../lib/repayments';
import { DebtFormModal } from './DebtFormModal';
import { PaymentFormModal } from './PaymentFormModal';

interface Props {
  onClose: () => void;
}

function isOverdue(debt: RepaymentDebt): boolean {
  if (debt.status !== 'active' || !debt.dueDate) return false;
  const due = parseDate(debt.dueDate);
  return !!due && due.getTime() < today().getTime();
}

export default function RepaymentTrackerScreen({ onClose }: Props) {
  const cur = usePosCurrency();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [debtForm, setDebtForm] = useState<{ debt: RepaymentDebt | null } | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const debts = useLiveQuery(() => db.repaymentDebts.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const payments = useLiveQuery(() => db.repaymentPayments.orderBy('createdAt').reverse().toArray(), []) ?? [];

  const paidByDebt = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      map.set(p.debtId, (map.get(p.debtId) ?? 0) + (Number(p.amount) || 0));
    }
    return map;
  }, [payments]);

  const paymentsByDebt = useMemo(() => {
    const map = new Map<string, RepaymentPayment[]>();
    for (const p of payments) {
      const list = map.get(p.debtId) ?? [];
      list.push(p);
      map.set(p.debtId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return map;
  }, [payments]);

  const summary = useMemo(
    () => summarizeRepayments(debts, payments, formatDateShort(today())),
    [debts, payments],
  );

  const sortedDebts = useMemo(() => [...debts].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    if (a.status === 'active') {
      const ad = parseDate(a.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bd = parseDate(b.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
    }
    return b.createdAt - a.createdAt;
  }), [debts]);

  const selected = selectedId ? debts.find(d => d.id === selectedId) ?? null : null;
  const selectedPaid = selected ? paidByDebt.get(selected.id) ?? 0 : 0;
  const selectedRemaining = selected ? remainingForDebt(selected, selectedPaid) : 0;
  const selectedPayments = selected ? paymentsByDebt.get(selected.id) ?? [] : [];

  async function handleDeleteDebt(debt: RepaymentDebt) {
    if (!window.confirm(`Delete "${debt.name}" and all its payment history?`)) return;
    try {
      await db.transaction('rw', [db.repaymentDebts, db.repaymentPayments], async () => {
        await db.repaymentPayments.where('debtId').equals(debt.id).delete();
        await db.repaymentDebts.delete(debt.id);
      });
      setSelectedId(null);
      toast.success('Debt deleted');
    } catch (e) {
      console.error('[repayments] delete debt failed', { id: debt.id, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDeletePayment(payment: RepaymentPayment) {
    if (!window.confirm('Delete this payment? The remaining balance will be recalculated.')) return;
    try {
      await db.transaction('rw', [db.repaymentDebts, db.repaymentPayments], async () => {
        await db.repaymentPayments.delete(payment.id);
        const debt = await db.repaymentDebts.get(payment.debtId);
        if (!debt) return;
        const all = await db.repaymentPayments.where('debtId').equals(debt.id).toArray();
        const paid = all.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        if (paid < (Number(debt.originalAmount) || 0) && debt.status === 'settled') {
          await db.repaymentDebts.update(debt.id, { status: 'active', settledAt: undefined, updatedAt: Date.now() });
        }
      });
      toast.success('Payment removed');
    } catch (e) {
      console.error('[repayments] delete payment failed', { id: payment.id, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function toggleSettled(debt: RepaymentDebt) {
    try {
      const next = debt.status === 'active' ? 'settled' : 'active';
      await db.repaymentDebts.update(debt.id, {
        status: next,
        settledAt: next === 'settled' ? Date.now() : undefined,
        updatedAt: Date.now(),
      });
      toast.success(next === 'settled' ? 'Debt marked settled' : 'Debt reopened');
    } catch (e) {
      console.error('[repayments] toggle status failed', { id: debt.id, e });
      toast.error('Could not update: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  if (selected) {
    const cat = categoryMeta(selected.category);
    const progress = debtProgress(selected, selectedPaid);
    const overdue = isOverdue(selected);

    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="bg-white border-b px-4 py-3 flex items-center gap-2 sticky top-0 z-10">
          <button onClick={() => setSelectedId(null)} className="p-1 rounded-lg hover:bg-gray-100" aria-label="Back to debts">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="font-bold text-lg flex-1 truncate">{selected.name}</h1>
          <button
            onClick={() => setDebtForm({ debt: selected })}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Edit debt"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteDebt(selected)}
            className="p-2 rounded-lg hover:bg-red-50 text-red-500"
            aria-label="Delete debt"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className={`rounded-2xl p-4 text-white space-y-3 ${selected.status === 'settled' ? 'bg-gradient-to-br from-emerald-600 to-green-700' : 'bg-gradient-to-br from-teal-600 to-emerald-700'}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-teal-100">
                  {selected.status === 'settled' ? 'Settled' : 'Remaining balance'}
                </p>
                <p className="text-3xl font-bold">{fmtMoney(selectedRemaining, cur)}</p>
              </div>
              <span className="text-2xl">{cat.emoji}</span>
            </div>
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-teal-50">
              <span>{fmtMoney(selectedPaid, cur)} paid of {fmtMoney(selected.originalAmount, cur)}</span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            {overdue && (
              <p className="text-[11px] font-semibold text-amber-200 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Past due — {selected.dueDate}
              </p>
            )}
            {selected.status === 'settled' && selectedRemaining > 0 && (
              <p className="text-[11px] text-teal-50/90">
                Marked settled — {fmtMoney(selectedRemaining, cur)} not recorded as payments.
              </p>
            )}
          </div>

          <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
            <p className="text-xs text-gray-500 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {cat.label}{selected.lender ? ` · ${selected.lender}` : ''}</p>
            <p className="text-xs text-gray-500 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Started {selected.startDate || '—'}{selected.dueDate ? ` · Due ${selected.dueDate}` : ' · No due date'}</p>
            {selected.notes && <p className="text-xs text-gray-600 border-t pt-2 whitespace-pre-wrap">{selected.notes}</p>}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 bg-teal-600 hover:bg-teal-700 h-11" onClick={() => setShowPayment(true)}>
              <Plus className="w-4 h-4 mr-1" /> Record Payment
            </Button>
            <Button
              variant="outline"
              className="h-11 px-3"
              onClick={() => toggleSettled(selected)}
              title={selected.status === 'active' ? 'Mark as settled' : 'Reopen debt'}
            >
              {selected.status === 'active'
                ? <><CheckCircle2 className="w-4 h-4 mr-1" /> Settle</>
                : <><RotateCcw className="w-4 h-4 mr-1" /> Reopen</>}
            </Button>
          </div>

          <section className="space-y-2">
            <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">
              Payment History ({selectedPayments.length})
            </h2>
            {selectedPayments.length === 0 && (
              <div className="bg-white border rounded-xl p-6 text-center text-gray-400">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No payments yet</p>
                <p className="text-xs mt-1">Record your first payment above</p>
              </div>
            )}
            {selectedPayments.map(p => (
              <div key={p.id} className="bg-white border rounded-xl p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-green-700">{fmtMoney(p.amount, p.currency || cur)}</p>
                    <p className="text-xs text-gray-500">{p.date} · {p.method || 'Payment'}</p>
                  </div>
                  <button
                    onClick={() => handleDeletePayment(p)}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete or undo payment"
                    title="Delete / undo payment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {p.reference && <p className="text-[11px] text-gray-500">Ref: {p.reference}</p>}
                {p.note && <p className="text-xs text-gray-600 whitespace-pre-wrap">{p.note}</p>}
                {p.proofImages?.length > 0 && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    {p.proofImages.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setViewImage(src)}
                        className="relative w-16 h-16 rounded-lg overflow-hidden border bg-gray-50"
                        aria-label={`View proof of payment ${i + 1}`}
                      >
                        <img src={src} alt={`Proof ${i + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 right-0 bg-black/60 text-white p-0.5">
                          <ImageIcon className="w-2.5 h-2.5" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        </div>

        {debtForm && (
          <DebtFormModal
            debt={debtForm.debt}
            paid={debtForm.debt ? paidByDebt.get(debtForm.debt.id) ?? 0 : 0}
            onClose={() => setDebtForm(null)}
            onSaved={id => setSelectedId(id)}
          />
        )}
        {showPayment && (
          <PaymentFormModal
            debt={selected}
            currency={cur}
            remaining={selectedRemaining}
            onClose={() => setShowPayment(false)}
            onSaved={() => {}}
          />
        )}
        {viewImage && (
          <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewImage(null)}>
            <button className="absolute top-4 right-4 bg-white/10 text-white rounded-full p-2" aria-label="Close image">
              <X className="w-5 h-5" />
            </button>
            <img src={viewImage} alt="Proof of payment" className="max-h-full max-w-full object-contain rounded-lg" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-2 sticky top-0 z-10">
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100" aria-label="Back">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="font-bold text-lg flex-1 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-teal-600" /> Repayment Tracker
        </h1>
        <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => setDebtForm({ debt: null })}>
          <Plus className="w-4 h-4 mr-1" /> New
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {debts.length === 0 ? (
          <div className="bg-white border rounded-2xl p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center mx-auto">
              <Wallet className="w-7 h-7 text-teal-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">No debts tracked yet</p>
              <p className="text-xs text-gray-500 mt-1 max-w-[240px] mx-auto">
                Add a loan, debt, or credit and record payments to see the remaining balance shrink.
              </p>
            </div>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => setDebtForm({ debt: null })}>
              <Plus className="w-4 h-4 mr-1" /> Add your first debt
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl p-4 text-white space-y-3 bg-gradient-to-br from-teal-600 to-emerald-700 shadow-sm">
              <p className="text-[11px] uppercase tracking-wider text-teal-100">Total outstanding</p>
              <p className="text-3xl font-bold">{fmtMoney(summary.totalOutstanding, cur)}</p>
              <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${summary.progress}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-teal-50">
                <span>{fmtMoney(summary.totalPaid, cur)} paid of {fmtMoney(summary.totalOriginal, cur)}</span>
                <span>{summary.progress.toFixed(0)}%</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-teal-50">
                <span>{summary.activeCount} active</span>
                {summary.settledCount > 0 && <span>· {summary.settledCount} settled</span>}
                {summary.overdueCount > 0 && (
                  <span className="text-amber-200 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {summary.overdueCount} overdue
                  </span>
                )}
              </div>
              {summary.nextDue && (
                <p className="text-[11px] text-teal-50 border-t border-white/20 pt-2">
                  Next due: <span className="font-semibold">{summary.nextDue.name}</span> · {summary.nextDue.dueDate}
                </p>
              )}
            </div>

            <section className="space-y-2">
              {sortedDebts.map(debt => {
                const paid = paidByDebt.get(debt.id) ?? 0;
                const remaining = remainingForDebt(debt, paid);
                const progress = debtProgress(debt, paid);
                const cat = categoryMeta(debt.category);
                const overdue = isOverdue(debt);
                return (
                  <button
                    key={debt.id}
                    onClick={() => setSelectedId(debt.id)}
                    className="w-full bg-white border rounded-xl p-4 text-left space-y-2 hover:border-teal-300 active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{debt.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {cat.emoji} {cat.label}{debt.lender ? ` · ${debt.lender}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold ${debt.status === 'settled' ? 'text-emerald-600' : 'text-teal-700'}`}>
                          {debt.status === 'settled' ? 'Settled' : fmtMoney(remaining, cur)}
                        </p>
                        <p className="text-[10px] text-gray-400">{debt.status === 'settled' ? 'complete' : 'remaining'}</p>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${debt.status === 'settled' ? 'bg-emerald-500' : 'bg-teal-500'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>{fmtMoney(paid, cur)} of {fmtMoney(debt.originalAmount, cur)} paid</span>
                      <span>{progress.toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-gray-400">{debt.dueDate ? `Due ${debt.dueDate}` : 'No due date'}</span>
                      {overdue && <span className="text-amber-600 font-semibold">Overdue</span>}
                      {debt.status === 'settled' && <span className="text-emerald-600 font-semibold">Settled</span>}
                    </div>
                  </button>
                );
              })}
            </section>
          </>
        )}
      </div>

      {debtForm && (
        <DebtFormModal
          debt={debtForm.debt}
          paid={debtForm.debt ? paidByDebt.get(debtForm.debt.id) ?? 0 : 0}
          onClose={() => setDebtForm(null)}
          onSaved={id => setSelectedId(id)}
        />
      )}
    </div>
  );
}
