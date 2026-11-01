import type { RepaymentDebt, RepaymentDebtCategory, RepaymentPayment } from '../types';
import { parseDate } from './dates';

export const DEBT_CATEGORIES: { id: RepaymentDebtCategory; label: string; emoji: string }[] = [
  { id: 'loan', label: 'Loan', emoji: '🏦' },
  { id: 'debt', label: 'Debt', emoji: '📉' },
  { id: 'credit', label: 'Credit', emoji: '💳' },
  { id: 'supplier', label: 'Supplier', emoji: '🚚' },
  { id: 'personal', label: 'Personal', emoji: '🤝' },
  { id: 'other', label: 'Other', emoji: '📌' },
];

export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Mobile Money', 'Cheque', 'Other'];

export function categoryMeta(category: RepaymentDebtCategory) {
  return DEBT_CATEGORIES.find(c => c.id === category) ?? DEBT_CATEGORIES[DEBT_CATEGORIES.length - 1];
}

export function sumPayments(payments: RepaymentPayment[]): number {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export function paidForDebt(payments: RepaymentPayment[], debtId: string): number {
  return sumPayments(payments.filter(p => p.debtId === debtId));
}

export function remainingForDebt(debt: RepaymentDebt, paid: number): number {
  return Math.max(0, (Number(debt.originalAmount) || 0) - paid);
}

export function debtProgress(debt: RepaymentDebt, paid: number): number {
  const original = Number(debt.originalAmount) || 0;
  if (original <= 0) return paid > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (paid / original) * 100));
}

export interface RepaymentSummary {
  activeCount: number;
  settledCount: number;
  totalOriginal: number;
  totalPaid: number;
  totalOutstanding: number;
  progress: number;
  overdueCount: number;
  nextDue: RepaymentDebt | null;
}

/** Dashboard/list summary. Only active debts count toward outstanding totals. */
export function summarizeRepayments(debts: RepaymentDebt[], payments: RepaymentPayment[], todayStr: string): RepaymentSummary {
  const active = debts.filter(d => d.status === 'active');
  const settledCount = debts.filter(d => d.status === 'settled').length;
  const totalOriginal = active.reduce((sum, d) => sum + (Number(d.originalAmount) || 0), 0);
  const totalPaid = active.reduce((sum, d) => sum + Math.min(Number(d.originalAmount) || 0, paidForDebt(payments, d.id)), 0);
  const totalOutstanding = active.reduce((sum, d) => sum + remainingForDebt(d, paidForDebt(payments, d.id)), 0);

  const dueTime = (d: RepaymentDebt): number => parseDate(d.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const todayTime = parseDate(todayStr)?.getTime() ?? Date.now();
  const withDue = active
    .filter(d => !!d.dueDate)
    .sort((a, b) => dueTime(a) - dueTime(b));
  const nextDue = withDue.find(d => dueTime(d) >= todayTime) ?? withDue[0] ?? null;
  const overdueCount = active.filter(d => !!d.dueDate && dueTime(d) < todayTime).length;

  return {
    activeCount: active.length,
    settledCount,
    totalOriginal,
    totalPaid,
    totalOutstanding,
    progress: totalOriginal > 0 ? Math.min(100, (totalPaid / totalOriginal) * 100) : 0,
    overdueCount,
    nextDue,
  };
}
