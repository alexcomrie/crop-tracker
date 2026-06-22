import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { generateId } from '../../lib/ids';
import { MapPin, Navigation, Trash2, Edit3, Hand, Save, RotateCcw, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GeoPoint, FarmArea, RowDetail } from '../../types';

const COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#795548', '#607D8B'];
const PLANTING_METHODS = ['Direct Ground', 'Seed Bed', 'Seed Tray', 'Pot / Container', 'Hydroponic'];
const CANVAS_W = 320;
const CANVAS_H = 280;
const MIN_POINT_DISTANCE = 1.5;

function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2));
}

function calcArea(points: GeoPoint[]): { sqM: number; display: string } {
  if (points.length < 3) return { sqM: 0, display: '0 m²' };
  const avgLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
  const pts = points.map(p => ({ x: p.lng * mPerDegLng, y: p.lat * mPerDegLat }));
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  area = Math.abs(area / 2);
  if (area >= 10000) return { sqM: area, display: `${(area / 10000).toFixed(2)} ha` };
  if (area >= 100) return { sqM: area, display: `${area.toFixed(0)} m²` };
  return { sqM: area, display: `${area.toFixed(1)} m²` };
}

function gpsToSvg(points: GeoPoint[], w: number, h: number, pad = 20): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = (maxLat - minLat) || 0.0001;
  const lngRange = (maxLng - minLng) || 0.0001;
  const uw = w - pad * 2;
  const uh = h - pad * 2;
  return points.map(p => ({
    x: pad + ((p.lng - minLng) / lngRange) * uw,
    y: pad + ((maxLat - p.lat) / latRange) * uh,
  }));
}

function formatAreaShort(sqm: number): string {
  if (sqm >= 10000) return `${(sqm / 10000).toFixed(2)} ha`;
  if (sqm >= 1) return `${sqm.toFixed(1)} m²`;
  return `${(sqm * 10000).toFixed(0)} cm²`;
}

function AreaSvgThumb({ points, w = 120, h = 80 }: { points: GeoPoint[]; w?: number; h?: number }) {
  const svgPts = gpsToSvg(points, w, h, 8);
  const polyStr = svgPts.map(p => `${p.x},${p.y}`).join(' ');
  return (
    <svg width={w} height={h} className="rounded bg-green-50 border shrink-0">
      {svgPts.length >= 3 ? (
        <polygon points={polyStr} fill="rgba(34,197,94,0.3)" stroke="#16a34a" strokeWidth="1.5" />
      ) : (
        <text x={w / 2} y={h / 2} textAnchor="middle" fontSize="10" fill="#86efac">Not mapped</text>
      )}
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { unmapped: 'bg-gray-100 text-gray-600', mapped: 'bg-blue-100 text-blue-700', cultivated: 'bg-green-100 text-green-700' };
  return <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${colors[status] || colors.unmapped}`}>{status}</span>;
}

async function getNextAreaTag(): Promise<string> {
  const all = await db.farmAreas.toArray();
  const nextNum = all.length + 1;
  return `AREA${nextNum.toString().padStart(4, '0')}`;
}

export function AreaMapperScreen({ onClose }: { onClose: () => void }) {
  const areas = useLiveQuery(() => db.farmAreas.toArray(), []);
  const [mode, setMode] = useState<'list' | 'gps' | 'manual' | 'details'>('list');
  const [currentPoints, setCurrentPoints] = useState<GeoPoint[]>([]);
  const [areaTag, setAreaTag] = useState('');
  const [areaName, setAreaName] = useState('');
  const [watchId, setWatchId] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState('');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [status, setStatus] = useState<'unmapped' | 'mapped' | 'cultivated'>('unmapped');
  const [rowCount, setRowCount] = useState(1);
  const [rowSpacing, setRowSpacing] = useState(30);
  const [rowDetails, setRowDetails] = useState<RowDetail[]>([{ rowNumber: 1, cropName: '', spacingInRow: 20, notes: '' }]);
  const [plantingMethod, setPlantingMethod] = useState('Direct Ground');
  const [farmNotes, setFarmNotes] = useState('');
  const manualCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  }, [watchId]);

  useEffect(() => {
    if (mode === 'manual' && manualCanvasRef.current) drawManualGrid(manualCanvasRef.current, currentPoints);
  }, [mode, currentPoints]);

  function drawManualGrid(canvas: HTMLCanvasElement, pts: GeoPoint[]) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    if (pts.length === 0) return;
    const maxCoord = Math.max(w, h);
    const scale = maxCoord * 0.4;
    const cx = w / 2;
    const cy = h / 2;
    const scaled = pts.map(p => ({ x: cx + p.lng * scale, y: cy - p.lat * scale }));
    ctx.beginPath(); ctx.moveTo(scaled[0].x, scaled[0].y);
    for (let i = 1; i < scaled.length; i++) ctx.lineTo(scaled[i].x, scaled[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(76, 175, 80, 0.15)'; ctx.fill();
    ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; ctx.stroke();
    for (const p of scaled) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#4CAF50'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function startGpsWalk() {
    if (!navigator.geolocation) { setGpsStatus('Geolocation not available'); return; }
    setCurrentPoints([]);
    setGpsAccuracy(null);
    setGpsStatus('Acquiring GPS...');
    const id = navigator.geolocation.watchPosition(
      pos => {
        const pt: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsAccuracy(pos.coords.accuracy);
        setCurrentPoints(prev => {
          if (prev.length === 0) return [pt];
          if (haversineMeters(prev[prev.length - 1], pt) < MIN_POINT_DISTANCE) return prev;
          return [...prev, pt];
        });
      },
      err => setGpsStatus(`GPS error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
    setWatchId(id);
  }

  function stopGpsWalk() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    setWatchId(null);
    if (currentPoints.length < 3) setGpsStatus('Need at least 3 points');
    else setGpsStatus(`${currentPoints.length} points recorded`);
  }

  function addManualPoint(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = manualCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = canvas.width;
    const h = canvas.height;
    const maxCoord = Math.max(w, h);
    const scale = maxCoord * 0.4;
    setCurrentPoints(prev => [...prev, { lat: (h / 2 - y) / scale, lng: (x - w / 2) / scale }]);
  }

  function undoLastPoint() { setCurrentPoints(prev => prev.slice(0, -1)); }

  function resetForm() {
    setCurrentPoints([]);
    setAreaTag('');
    setAreaName('');
    setEditId(null);
    setStatus('unmapped');
    setRowCount(1);
    setRowSpacing(30);
    setRowDetails([{ rowNumber: 1, cropName: '', spacingInRow: 20, notes: '' }]);
    setPlantingMethod('Direct Ground');
    setFarmNotes('');
  }

  async function saveArea() {
    if (currentPoints.length < 3 || !areaName.trim()) return;
    try {
      const { sqM, display } = calcArea(currentPoints);
      const tag = editId ? areaTag : await getNextAreaTag();
      const area: FarmArea = {
        id: editId || generateId('FA'),
        tag,
        name: areaName.trim(),
        points: currentPoints,
        areaSqM: sqM,
        areaDisplay: display,
        color: COLORS[(areas?.length || 0) % COLORS.length],
        status: status === 'unmapped' ? 'mapped' : status,
        rowCount,
        rowSpacing,
        rowDetails: rowDetails.filter(r => r.rowNumber <= rowCount),
        plantingMethod,
        notes: farmNotes,
        createdAt: editId ? (areas?.find(a => a.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: Date.now(),
      };
      await db.farmAreas.put(area);
      resetForm();
      setMode('list');
    } catch (err) {
      alert('Failed to save area: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function saveDetails() {
    if (!editId) return;
    try {
      await db.farmAreas.update(editId, {
        name: areaName.trim(),
        rowCount,
        rowSpacing,
        rowDetails: rowDetails.filter(r => r.rowNumber <= rowCount),
        plantingMethod,
        notes: farmNotes,
        status: 'cultivated',
        updatedAt: Date.now(),
      });
      resetForm();
      setMode('list');
    } catch (err) {
      alert('Failed to save details: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function deleteArea(id: string) {
    if (window.confirm('Delete this area?')) await db.farmAreas.delete(id);
  }

  function editPerimeter(area: FarmArea) {
    setCurrentPoints(area.points);
    setAreaTag(area.tag);
    setAreaName(area.name);
    setEditId(area.id);
    setStatus(area.status);
    setRowCount(area.rowCount || 1);
    setRowSpacing(area.rowSpacing || 30);
    setRowDetails(area.rowDetails?.length ? area.rowDetails : [{ rowNumber: 1, cropName: '', spacingInRow: 20, notes: '' }]);
    setPlantingMethod(area.plantingMethod || 'Direct Ground');
    setFarmNotes(area.notes || '');
    setMode('gps');
  }

  function openDetails(area: FarmArea) {
    setEditId(area.id);
    setAreaTag(area.tag);
    setAreaName(area.name);
    setRowCount(area.rowCount || 1);
    setRowSpacing(area.rowSpacing || 30);
    setRowDetails(area.rowDetails?.length ? area.rowDetails : [{ rowNumber: 1, cropName: '', spacingInRow: 20, notes: '' }]);
    setPlantingMethod(area.plantingMethod || 'Direct Ground');
    setFarmNotes(area.notes || '');
    setMode('details');
  }

  function updateRow(index: number, field: keyof RowDetail, value: string | number) {
    setRowDetails(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  }

  function handleRowCountChange(val: number) {
    const count = Math.max(1, Math.min(100, val));
    setRowCount(count);
    setRowDetails(prev => Array.from({ length: count }, (_, i) => prev[i] || { rowNumber: i + 1, cropName: '', spacingInRow: 20, notes: '' }));
  }

  function renderLiveSvg(pts: GeoPoint[]) {
    if (pts.length === 0) return null;
    const svgPts = gpsToSvg(pts, CANVAS_W, CANVAS_H, 20);
    const polylineStr = svgPts.map(p => `${p.x},${p.y}`).join(' ');
    const polygonStr = pts.length >= 3 ? polylineStr : '';
    return (
      <svg width="100%" height={CANVAS_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="rounded border bg-green-50">
        {polygonStr && <polygon points={polygonStr} fill="rgba(34,197,94,0.25)" stroke="#16a34a" strokeWidth="2" strokeLinejoin="round" />}
        {pts.length >= 2 && !polygonStr && <polyline points={polylineStr} fill="none" stroke="#16a34a" strokeWidth="2" strokeLinejoin="round" />}
        {svgPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 6 : 3} fill={i === 0 ? '#15803d' : '#4ade80'} stroke="white" strokeWidth="1" />
        ))}
        {svgPts[0] && <text x={svgPts[0].x + 8} y={svgPts[0].y + 4} fontSize="10" fill="#15803d" fontWeight="bold">START</text>}
        {pts.length === 0 && <text x={CANVAS_W / 2} y={CANVAS_H / 2} textAnchor="middle" fontSize="13" fill="#86efac">Walk the perimeter to map this area</text>}
      </svg>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b sticky top-0 z-10">
        <button onClick={() => { if (mode !== 'list') { resetForm(); if (watchId !== null) navigator.geolocation.clearWatch(watchId); setWatchId(null); setMode('list'); } else onClose(); }} className="text-gray-600 text-lg">←</button>
        <h1 className="font-bold text-lg">Area Mapper</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ─── LIST MODE ─── */}
        {mode === 'list' && (
          <>
            <div className="flex gap-2">
              <button onClick={() => { resetForm(); setMode('gps'); }} className="flex-1 bg-green-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"><Navigation className="w-5 h-5" /> GPS Walk</button>
              <button onClick={() => { resetForm(); setMode('manual'); }} className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"><Hand className="w-5 h-5" /> Manual</button>
            </div>
            {(!areas || areas.length === 0) && (
              <div className="text-center py-20 text-gray-400"><MapPin className="w-12 h-12 mx-auto mb-3 opacity-40" /><p>No areas mapped yet</p><p className="text-sm">Walk a perimeter or tap points on a grid</p></div>
            )}
            {areas?.map(a => {
              const { sqM } = calcArea(a.points);
              return (
                <div key={a.id} className="bg-white rounded-xl border p-3 flex gap-3">
                  <AreaSvgThumb points={a.points} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{a.tag}</span>
                      {a.name && <span className="text-xs text-gray-500 truncate">— {a.name}</span>}
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{formatAreaShort(sqM)} · {a.points.length} points</p>
                    {(a.rowCount || 0) > 0 && <p className="text-xs text-gray-500">{a.rowCount} row{(a.rowCount || 0) !== 1 ? 's' : ''}{a.rowSpacing ? ` · ${a.rowSpacing} cm spacing` : ''}</p>}
                    {a.plantingMethod && <p className="text-xs text-gray-500">{a.plantingMethod}</p>}
                    {(a.rowDetails || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {[...new Set(a.rowDetails.map(r => r.cropName).filter(Boolean))].map(crop => (
                          <span key={crop} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{crop}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => editPerimeter(a)} className="p-1.5 hover:bg-green-50 rounded-lg" title="Re-walk perimeter"><Navigation className="w-4 h-4 text-green-600" /></button>
                    <button onClick={() => openDetails(a)} className="p-1.5 hover:bg-blue-50 rounded-lg" title="Edit details"><Pencil className="w-4 h-4 text-blue-500" /></button>
                    <button onClick={() => deleteArea(a.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ─── GPS MODE ─── */}
        {mode === 'gps' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><Navigation className="w-5 h-5 text-green-600" /> Perimeter Walk{areaTag ? ` — ${areaTag}` : ''}</h2>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={`px-2 py-0.5 rounded font-bold ${watchId !== null ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{watchId !== null ? '● Recording' : 'Stopped'}</span>
                {gpsAccuracy !== null && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">GPS ±{gpsAccuracy.toFixed(0)} m</span>}
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{currentPoints.length} points</span>
                {currentPoints.length >= 3 && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-mono">{calcArea(currentPoints).display}</span>}
              </div>
              {renderLiveSvg(currentPoints)}
              <p className="text-xs text-gray-500">{gpsStatus}</p>
              {watchId === null ? (
                <Button onClick={startGpsWalk} className="w-full bg-green-600 hover:bg-green-700"><Navigation className="w-4 h-4" /> {currentPoints.length > 0 ? 'Resume Recording' : 'Start Walk'}</Button>
              ) : (
                <Button onClick={stopGpsWalk} className="w-full bg-red-600 hover:bg-red-700">Pause Recording</Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={undoLastPoint} disabled={currentPoints.length === 0}>Undo Point</Button>
                <Button variant="outline" onClick={() => { setCurrentPoints([]); setGpsAccuracy(null); setGpsStatus(''); }} disabled={currentPoints.length === 0}>Clear</Button>
              </div>
            </div>
            {currentPoints.length >= 3 && (
              <div className="bg-white rounded-xl border p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Area Details</p>
                <input type="text" placeholder="Area name (e.g. North Field)" value={areaName} onChange={e => setAreaName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">Rows</label><input type="number" min={1} value={rowCount} onChange={e => handleRowCountChange(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-gray-500">Row Spacing (cm)</label><input type="number" min={1} value={rowSpacing} onChange={e => setRowSpacing(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <select value={plantingMethod} onChange={e => setPlantingMethod(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {PLANTING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                {rowDetails.slice(0, rowCount).map((row, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Row {i + 1}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" placeholder="Crop name" value={row.cropName} onChange={e => updateRow(i, 'cropName', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                      <input type="number" placeholder="Spacing (cm)" value={row.spacingInRow} onChange={e => updateRow(i, 'spacingInRow', Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" min={1} />
                    </div>
                    <input type="text" placeholder="Row notes (optional)" value={row.notes || ''} onChange={e => updateRow(i, 'notes', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                ))}
                <textarea placeholder="General notes about this area..." value={farmNotes} onChange={e => setFarmNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetForm} className="flex-1"><RotateCcw className="w-4 h-4" /> Reset</Button>
                  <Button onClick={saveArea} className="flex-1 bg-green-600 text-white" disabled={!areaName.trim()}><Save className="w-4 h-4" /> Save Area</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── MANUAL MODE ─── */}
        {mode === 'manual' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><Hand className="w-5 h-5 text-blue-600" /> Manual Point Entry</h2>
              <p className="text-sm text-gray-500">Tap the grid to place points.</p>
              <canvas ref={manualCanvasRef} width={340} height={300} onClick={addManualPoint} className="w-full border rounded-lg bg-white cursor-crosshair" style={{ maxWidth: 340, margin: '0 auto' }} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{currentPoints.length} points</span>
                {currentPoints.length >= 3 && <span className="font-mono text-green-700">{calcArea(currentPoints).display}</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={undoLastPoint} disabled={currentPoints.length === 0} className="flex-1">Undo</Button>
                <Button variant="outline" onClick={() => setCurrentPoints([])} disabled={currentPoints.length === 0} className="flex-1">Clear</Button>
              </div>
            </div>
            {currentPoints.length >= 3 && (
              <div className="bg-white rounded-xl border p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Area Details</p>
                <input type="text" placeholder="Area name" value={areaName} onChange={e => setAreaName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">Rows</label><input type="number" min={1} value={rowCount} onChange={e => handleRowCountChange(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="text-xs text-gray-500">Row Spacing (cm)</label><input type="number" min={1} value={rowSpacing} onChange={e => setRowSpacing(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <select value={plantingMethod} onChange={e => setPlantingMethod(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {PLANTING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                {rowDetails.slice(0, rowCount).map((row, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Row {i + 1}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" placeholder="Crop name" value={row.cropName} onChange={e => updateRow(i, 'cropName', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                      <input type="number" placeholder="Spacing (cm)" value={row.spacingInRow} onChange={e => updateRow(i, 'spacingInRow', Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" min={1} />
                    </div>
                    <input type="text" placeholder="Row notes" value={row.notes || ''} onChange={e => updateRow(i, 'notes', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                ))}
                <textarea placeholder="General notes..." value={farmNotes} onChange={e => setFarmNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetForm} className="flex-1"><RotateCcw className="w-4 h-4" /> Reset</Button>
                  <Button onClick={saveArea} className="flex-1 bg-blue-600 text-white" disabled={!areaName.trim()}><Save className="w-4 h-4" /> Save Area</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── DETAILS EDIT MODE ─── */}
        {mode === 'details' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><Edit3 className="w-5 h-5 text-blue-600" /> Edit Details — {areaTag}</h2>
              <input type="text" placeholder="Area name" value={areaName} onChange={e => setAreaName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500">Rows</label><input type="number" min={1} value={rowCount} onChange={e => handleRowCountChange(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="text-xs text-gray-500">Row Spacing (cm)</label><input type="number" min={1} value={rowSpacing} onChange={e => setRowSpacing(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <select value={plantingMethod} onChange={e => setPlantingMethod(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                {PLANTING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              {rowDetails.slice(0, rowCount).map((row, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Row {i + 1}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Crop name" value={row.cropName} onChange={e => updateRow(i, 'cropName', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    <input type="number" placeholder="Spacing (cm)" value={row.spacingInRow} onChange={e => updateRow(i, 'spacingInRow', Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" min={1} />
                  </div>
                  <input type="text" placeholder="Row notes" value={row.notes || ''} onChange={e => updateRow(i, 'notes', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
              <textarea placeholder="General notes..." value={farmNotes} onChange={e => setFarmNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { resetForm(); setMode('list'); }} className="flex-1">Cancel</Button>
                <Button onClick={saveDetails} className="flex-1 bg-blue-600 text-white"><Save className="w-4 h-4" /> Save Details</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}