import React from 'react';
import { BottomSheet } from '../shared/BottomSheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateShort } from '../../lib/dates';
import type { Propagation } from '../../types';
import { Trash2, Edit3, Calendar, Tag, Info } from 'lucide-react';

interface PropDetailProps {
  prop: Propagation;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function PropDetail({ prop, onClose, onEdit, onDelete }: PropDetailProps) {
  return (
    <BottomSheet open onClose={onClose} title="Propagation Details">
      <div className="space-y-6 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{prop.plantName}</h2>
            <div className="flex gap-2 mt-1">
              <Badge variant="secondary" className="bg-green-50 text-green-700 border-none font-bold uppercase text-[10px]">
                {prop.status}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-gray-500">
                {prop.propagationMethod}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Started</p>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="w-4 h-4 text-green-600" />
              {prop.propagationDate}
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Expected Rooting</p>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Info className="w-4 h-4 text-amber-600" />
              {prop.expectedRootingStart}
            </div>
          </div>
        </div>

        {prop.notes && (
          <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100">
            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-2">Notes</p>
            <p className="text-sm text-amber-900 leading-relaxed">{prop.notes}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1 border-gray-200" onClick={onEdit}>
            <Edit3 className="w-4 h-4 mr-2" /> Edit
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-red-500 border border-gray-100 h-10 w-10 shrink-0" onClick={onDelete}>
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
