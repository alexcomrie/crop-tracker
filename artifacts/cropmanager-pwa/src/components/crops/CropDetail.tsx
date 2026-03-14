import React, { useState } from 'react';
import { BottomSheet } from '../shared/BottomSheet';
import { StageTimeline } from '../shared/StageTimeline';
import { Button } from '@/components/ui/button';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import type { Crop } from '../../types';
import { parseDate, formatDateDisplay, daysBetween, today } from '../../lib/dates';
import { STAGE_COLORS } from '../../lib/stages';
import { FertScheduleView } from './FertScheduleView';

import { Trash2, Edit3 } from 'lucide-react';

interface CropDetailProps {
  crop: Crop;
  onClose: () => void;
  onUpdate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const STAGE_ORDER = ['Seed', 'Germinated', 'Seedling', 'Transplanted', 'Vegetative', 'Flowering', 'Fruiting', 'Harvested'];

export function CropDetail({ crop, onClose, onUpdate, onEdit, onDelete }: CropDetailProps) {
  const treatmentLogs = useLiveQuery(() => db.treatmentLogs.where('cropId').equals(crop.id).sortBy('date'), [crop.id]);
  const stageLogs = useLiveQuery(() => db.stageLogs.where('trackingId').equals(crop.id).sortBy('date'), [crop.id]);
  const planted = parseDate(crop.plantingDate);
  const daysOld = planted ? daysBetween(planted, today()) : 0;
  const [showFert, setShowFert] = useState(false);

  const stages = [
    { label: 'Planted', date: crop.plantingDate, done: !!crop.plantingDate },
    { label: 'Germinated', date: crop.germinationDate, done: !!crop.germinationDate },
    { label: 'Transplanted', date: crop.transplantDateActual, done: !!crop.transplantDateActual },
    { label: 'Harvested', date: crop.harvestDateActual, done: !!crop.harvestDateActual },
  ];

  return (
    <BottomSheet open onClose={onClose} title={`${crop.cropName}${crop.variety ? ' · ' + crop.variety : ''}`}>
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: STAGE_COLORS[crop.plantStage] ?? '#9e9e9e' }}>
            {crop.plantStage}
          </span>
          <span className="text-sm text-muted-foreground">Day {daysOld}</span>
          <span className="text-xs font-mono text-muted-foreground ml-auto">{crop.id}</span>
        </div>

        <StageTimeline stages={stages} />

        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <p className="text-muted-foreground">Planted</p><p className="font-medium">{crop.plantingDate || '—'}</p>
            <p className="text-muted-foreground">Germinated</p><p className="font-medium">{crop.germinationDate || '—'}</p>
            <p className="text-muted-foreground">Transplant Sched.</p><p className="font-medium">{crop.transplantDateScheduled || '—'}</p>
            <p className="text-muted-foreground">Transplanted</p><p className="font-medium">{crop.transplantDateActual || '—'}</p>
            <p className="text-muted-foreground">Est. Harvest</p><p className="font-medium text-green-700">{crop.harvestDateEstimated || '—'}</p>
            <p className="text-muted-foreground">Actual Harvest</p><p className="font-medium">{crop.harvestDateActual || '—'}</p>
          </div>
        </div>

        {(crop.fungusSprayDates || crop.pestSprayDates) && (
          <div className="bg-amber-50 rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">Spray Schedule</p>
            {crop.fungusSprayDates && <p className="text-xs"><span className="text-muted-foreground">🍄 Fungus:</span> {crop.fungusSprayDates}</p>}
            {crop.pestSprayDates && <p className="text-xs"><span className="text-muted-foreground">🐛 Pest:</span> {crop.pestSprayDates}</p>}
          </div>
        )}

        {crop.notes && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">Notes</p>
            <p className="text-muted-foreground whitespace-pre-line">{crop.notes}</p>
          </div>
        )}

        {treatmentLogs && treatmentLogs.length > 0 && (
          <div>
            <p className="font-medium text-sm mb-2">Treatment Log</p>
            <div className="space-y-1">
              {treatmentLogs.map(t => (
                <div key={t.id} className="flex items-start gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <span>{t.type === 'fungus' ? '🍄' : t.type === 'pest' ? '🐛' : '💧'}</span>
                  <div>
                    <p className="font-medium">{t.product}</p>
                    <p className="text-muted-foreground">{t.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {stageLogs && stageLogs.length > 0 && (
          <div>
            <p className="font-medium text-sm mb-2">Stage Log</p>
            <div className="space-y-1">
              {stageLogs.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-muted-foreground">{s.stageFrom} →</span>
                  <span className="font-medium">{s.stageTo}</span>
                  <span className="text-muted-foreground ml-auto">{s.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={onUpdate}>Update Status</Button>
          <Button variant="outline" className="border-gray-200" onClick={onEdit}>
            <Edit3 className="w-4 h-4 mr-2" /> Edit
          </Button>
          <Button className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={() => setShowFert(true)}>
            Fertilizer
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-red-500 border border-gray-100 h-10 w-10 shrink-0" onClick={onDelete}>
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <BottomSheet open={showFert} onClose={() => setShowFert(false)} title="Fertilizer Schedule" position="center">
        <FertScheduleView crop={crop} />
      </BottomSheet>
    </BottomSheet>
  );
}
