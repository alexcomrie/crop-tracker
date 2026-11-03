import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import db from '../../db/db';
import type { FarmLand, FarmPoint, FarmPointKind, GeoPoint, PointTagDraft } from '../../types';
import { findLandForPoint, nearestLandForPoint } from '../../lib/geo';
import { ROUTES } from '../../lib/routes';
import { InteractiveMap } from './InteractiveMap';

interface PointTagPickerProps {
  value: PointTagDraft | null;
  onChange: (value: PointTagDraft | null) => void;
  defaultLabel?: string;
  defaultKind?: FarmPointKind;
  height?: number;
}

const KIND_LABELS: Record<FarmPointKind, string> = {
  crop: 'Crop / plant',
  tree: 'Tree',
  object: 'Object / feature',
};

/**
 * Shared point-tag builder used by field observations, crop observations and
 * crop info. It never asks for raw latitude/longitude: the tag is placed by
 * tapping the land map or by capturing the device GPS fix.
 */
export function PointTagPicker({
  value,
  onChange,
  defaultLabel = 'Point tag',
  defaultKind = 'crop',
  height = 220,
}: PointTagPickerProps) {
  const navigate = useNavigate();
  const lands = useLiveQuery(() => db.farmLands.toArray().catch((): FarmLand[] => []), []) ?? [];
  const mappedLands = useMemo(() => lands.filter(l => l.points && l.points.length >= 3), [lands]);

  const [landId, setLandId] = useState(value?.landId ?? '');
  const [point, setPoint] = useState<GeoPoint | null>(value?.point ?? null);
  const [label, setLabel] = useState(value?.label ?? defaultLabel);
  const [kind, setKind] = useState<FarmPointKind>(value?.kind ?? defaultKind);
  const [notes, setNotes] = useState(value?.notes ?? '');
  const [source, setSource] = useState<'gps' | 'map' | undefined>(value?.source);
  const [busy, setBusy] = useState(false);
  const lastEmitted = useRef(value ? JSON.stringify(value) : '');

  const selectedLand = mappedLands.find(l => l.id === landId) ?? null;
  const existingPoints = useLiveQuery(
    () => (landId ? db.farmPoints.where('landId').equals(landId).toArray().catch((): FarmPoint[] => []) : []),
    [landId],
  ) ?? [];

  // Adopt an externally loaded point (e.g. an existing crop tag) without
  // echoing the same draft back to the parent in a loop. A null value means
  // the parent cleared the tag (after save), so reset the local editor too.
  useEffect(() => {
    const json = value ? JSON.stringify(value) : '';
    if (json === lastEmitted.current) return;
    lastEmitted.current = json;
    if (!value) {
      setPoint(null);
      setLabel(defaultLabel);
      setNotes('');
      setSource(undefined);
      return;
    }
    setLandId(value.landId);
    setPoint(value.point);
    setLabel(value.label);
    setKind(value.kind);
    setNotes(value.notes ?? '');
    setSource(value.source);
  }, [value, defaultLabel]);

  // Default to the first mapped land once the live query resolves.
  useEffect(() => {
    if (!landId && mappedLands.length > 0) setLandId(mappedLands[0].id);
  }, [landId, mappedLands]);

  function emit(next: PointTagDraft | null) {
    const json = next ? JSON.stringify(next) : '';
    if (json === lastEmitted.current) return;
    lastEmitted.current = json;
    onChange(next);
  }

  function emitCurrent(patch: Partial<PointTagDraft> = {}) {
    const nextLandId = patch.landId ?? landId;
    const nextPoint = patch.point ?? point;
    if (!nextLandId || !nextPoint) {
      emit(null);
      return;
    }
    const nextLabel = (patch.label ?? label).trim() || defaultLabel;
    const nextKind = patch.kind ?? kind;
    const nextNotes = patch.notes ?? notes;
    const nextSource = patch.source ?? source;
    emit({
      landId: nextLandId,
      point: nextPoint,
      label: nextLabel,
      kind: nextKind,
      notes: nextNotes.trim() || undefined,
      source: nextSource,
    });
  }

  function setMapPoint(gps: GeoPoint) {
    setPoint(gps);
    setSource('map');
    emitCurrent({ point: gps, source: 'map' });
  }

  function captureGps() {
    if (!navigator.geolocation) {
      toast.error('GPS is not available on this device');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const containing = findLandForPoint(gps, mappedLands);
        const land = containing ?? nearestLandForPoint(gps, mappedLands);
        setBusy(false);
        if (!land) {
          toast.error('Map a land first — point tags belong to a land');
          return;
        }
        setLandId(land.id);
        setPoint(gps);
        setSource('gps');
        emitCurrent({ landId: land.id, point: gps, source: 'gps' });
        toast.success(containing ? `Tagged inside ${land.name}` : `Tagged near ${land.name}`);
      },
      err => {
        setBusy(false);
        toast.error(err.code === err.PERMISSION_DENIED ? 'Location permission denied' : 'Could not read GPS');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function clearPoint() {
    setPoint(null);
    setLabel(defaultLabel);
    setNotes('');
    setSource(undefined);
    emit(null);
  }

  const draftMarker: FarmPoint | null = point && landId ? {
    id: 'draft-point',
    landId,
    point,
    label: label.trim() || defaultLabel,
    kind,
    notes: notes.trim() || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: Date.now(),
  } : null;

  if (mappedLands.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 space-y-2">
        <p className="text-[11px] text-amber-800 font-semibold flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" /> No mapped land yet
        </p>
        <p className="text-[10px] text-amber-700 leading-tight">
          Point tags live inside a land. Map a land perimeter in Area Mapper first, then come back to tag this spot.
        </p>
        <button
          type="button"
          onClick={() => navigate(ROUTES.MORE_AREA_MAPPER)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-white border border-amber-300 rounded-lg px-2.5 py-1.5"
        >
          Open Area Mapper <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1">
          <MapPin className="w-3 h-3 text-green-700" /> Point tag (optional)
        </p>
        {point && (
          <button type="button" onClick={clearPoint} className="text-[10px] text-gray-400 font-semibold flex items-center gap-0.5">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      <select
        value={landId}
        onChange={e => {
          setLandId(e.target.value);
          setPoint(null);
          setSource(undefined);
          emit(null);
        }}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
        aria-label="Land for this point tag"
      >
        {mappedLands.map(l => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>

      {selectedLand && (
        <InteractiveMap
          mapData={[{ land: selectedLand, plots: [] }]}
          points={[...existingPoints, ...(draftMarker ? [draftMarker] : [])]}
          onMapTap={setMapPoint}
          height={height}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={captureGps}
          disabled={busy}
          className="flex-1 text-xs font-semibold text-amber-700 border border-amber-200 rounded-lg py-1.5 disabled:opacity-50"
        >
          {busy ? 'Reading GPS…' : 'Use my current location'}
        </button>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : 'Tap map'}
        </span>
      </div>

      <input
        value={label}
        onChange={e => { setLabel(e.target.value); emitCurrent({ label: e.target.value }); }}
        placeholder="Tag label (e.g. Mango tree #1)"
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={kind}
          onChange={e => { const k = e.target.value as FarmPointKind; setKind(k); emitCurrent({ kind: k }); }}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
          aria-label="Point tag type"
        >
          {(Object.keys(KIND_LABELS) as FarmPointKind[]).map(k => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
        <input
          value={notes}
          onChange={e => { setNotes(e.target.value); emitCurrent({ notes: e.target.value }); }}
          placeholder="Notes (optional)"
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
        />
      </div>
      {point && (
        <p className="text-[10px] text-green-700 font-semibold">
          📍 Tagged {source === 'gps' ? 'from GPS' : 'on the map'} inside {selectedLand?.name}
        </p>
      )}
    </div>
  );
}
