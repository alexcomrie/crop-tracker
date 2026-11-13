import React, { useEffect, useState } from 'react';
import { getUpdateState, subscribeUpdateState, type UpdateState } from '../lib/pwaUpdater';

/**
 * Blocking-ish overlay shown while a new deploy settles into the service
 * worker. It stays light: the app keeps working behind it, and the reload
 * sequence runs on its own. This exists so users read a deliberate "checking
 * for update" moment instead of seeing the page blink three times.
 */
export function UpdateOverlay() {
  const [state, setState] = useState<UpdateState>(getUpdateState);

  useEffect(() => {
    setState(getUpdateState());
    return subscribeUpdateState(() => setState(getUpdateState()));
  }, []);

  if (!state.active) return null;

  const pct = Math.min(100, Math.round((state.pass / state.total) * 100));

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-6"
      role="status"
      aria-live="polite"
      aria-label="Checking for update"
    >
      <div className="w-full max-w-xs rounded-2xl bg-white shadow-xl border border-gray-100 p-6 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
          <span className="block h-6 w-6 rounded-full border-2 border-green-600 border-t-transparent animate-spin" />
        </div>
        <p className="text-base font-bold text-gray-900">Checking for update</p>
        <p className="mt-1 text-xs text-gray-500">
          Applying the newest version — this only takes a moment.
        </p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-green-600 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] font-medium text-gray-400">
          Pass {state.pass} of {state.total}
        </p>
      </div>
    </div>
  );
}

export default UpdateOverlay;
