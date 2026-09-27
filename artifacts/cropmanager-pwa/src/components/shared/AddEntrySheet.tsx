import React from 'react';
import { BottomSheet } from './BottomSheet';
import { Sprout, Database } from 'lucide-react';

interface AddEntrySheetProps {
  open: boolean;
  onClose: () => void;
  onSelectCrop: () => void;
  onSelectPropagation: () => void;
}

/** Shared "what do you want to track?" chooser (dashboard FAB + crop list FAB). */
export function AddEntrySheet({ open, onClose, onSelectCrop, onSelectPropagation }: AddEntrySheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Quick Add Action" position="center">
      <div className="pt-2 space-y-4">
        <div className="flex gap-3">
          <button
            onClick={onSelectCrop}
            className="flex-1 bg-green-50 border border-green-100 rounded-2xl p-6 text-center hover:bg-green-100 transition-colors"
          >
            <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-green-200">
              <Sprout className="w-6 h-6" />
            </div>
            <p className="font-bold text-green-900">Track Crop</p>
            <p className="text-[10px] text-green-700 uppercase font-bold mt-1">Start Logging</p>
          </button>
          <button
            onClick={onSelectPropagation}
            className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center hover:bg-blue-100 transition-colors"
          >
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-blue-200">
              <Database className="w-6 h-6" />
            </div>
            <p className="font-bold text-blue-900">Propagation</p>
            <p className="text-[10px] text-blue-700 uppercase font-bold mt-1">Cuttings/Seeds</p>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
