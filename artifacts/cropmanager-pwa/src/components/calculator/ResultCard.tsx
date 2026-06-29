import React from 'react';

interface ResultCardProps {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}

export function ResultCard({ label, value, sub, highlight }: ResultCardProps) {
  return (
    <div className={`rounded-xl p-4 flex flex-col gap-1 ${highlight ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${highlight ? 'text-green-100' : 'text-gray-500'}`}>
        {label}
      </p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className={`text-xs ${highlight ? 'text-green-100' : 'text-gray-500'}`}>{sub}</p>}
    </div>
  );
}

export function ResultGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

export function CalcSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </div>
  );
}
