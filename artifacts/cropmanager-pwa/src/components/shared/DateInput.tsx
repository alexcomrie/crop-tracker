import React from 'react';
import { toInputDateStr, fromInputDateStr } from '../../lib/dates';

interface DateInputProps {
  /** Stored dd-MMM-yyyy date string. */
  value: string;
  /** Called with the new stored dd-MMM-yyyy string (only when valid). */
  onChange: (stored: string) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Date field used across all log forms. Forces the native picker open on tap
 * (some mobile browsers ignore taps on plain date inputs) and guarantees a
 * 44px minimum touch target.
 */
export function DateInput({ value, onChange, className, ariaLabel }: DateInputProps) {
  return (
    <input
      type="date"
      aria-label={ariaLabel ?? 'Select date'}
      value={toInputDateStr(value)}
      onChange={e => {
        const v = fromInputDateStr(e.target.value);
        if (v) onChange(v);
      }}
      onClick={e => {
        try {
          (e.target as HTMLInputElement).showPicker?.();
        } catch {
          /* older browsers: fall back to default tap behavior */
        }
      }}
      className={className ?? 'w-full border rounded-lg p-2 text-sm min-h-[44px] bg-white'}
    />
  );
}
