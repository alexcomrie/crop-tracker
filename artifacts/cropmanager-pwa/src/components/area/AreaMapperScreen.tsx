import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { generateId } from '../../lib/ids';
import { MapPin, Navigation, Trash2, Edit3, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GeoPoint, FarmArea } from '../../types';

function calcArea(points: GeoPoint[]): { sqM: number; display: string } {
  if (points.length < 3) return { sqM: 0, display: '0 m²' };
  const R = 6371000;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = points[i].lng * Math.PI / 180;
    const y1 = points[i].lat * Math.PI / 180;
    const x2 = points[j].lng * Math.PI / 180;
    const y2 = points[j].lat * Math.PI / 180;
    area += (x2 - x1) * (2 + Math.sin(y1) + Math.sin(y2));
  }
  area = Math.abs(area * R * R / 2);
  const hectares = area / 10000;
  if (hectares >= 1) return { sqM: area, display: `${hectares.toFixed(2)} ha` };
  if (area >= 100) return { sqM: area, display: `${area.toFixed(0)} m²` };
  return { sqM: area, display: `${area.toFixed(1)} m²` };
}

function latLngToXY(points: GeoPoint[], w: number, h: number, pad = 40): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const rangeLat = (maxLat - minLat) || 1;
  const rangeLng = (maxLng - minLng) || 1;
  const drawW = w - pad * 2;
  const drawH = h - pad * 2;
  return points.map(p => ({
    x: pad + ((p.lng - minLng) / rangeLng) * drawW,
    y: pad + ((maxLat - p.lat) / rangeLat) * drawH,
  }));
}

const COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#795548', '#607D8B'];

export function AreaMapperScreen({ onClose }: { onClose: () => void }) {
  const areas = useLiveQuery(() => db.farmAreas.toArray(), []);
  const [mode, setMode] = useState<'list' | 'gps' | 'manual' | 'view'>('list');
  const [currentPoints, setCurrentPoints] = useState<GeoPoint[]>([]);
  const [areaName, setAreaName] = useState('');
  const [watchId, setWatchId] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState('');
  const [viewArea, setViewArea] = useState<FarmArea | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    ctx.beginPath();
    ctx.moveTo(scaled[0].x, scaled[0].y);
    for (let i = 1; i < scaled.length; i++) ctx.lineTo(scaled[i].x, scaled[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(76, 175, 80, 0.15)';
    ctx.fill();
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (const p of scaled) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#4CAF50';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function startGpsWalk() {
    if (!navigator.geolocation) { setGpsStatus('Geolocation not available'); return; }
    setCurrentPoints([]);
    setGpsStatus('Acquiring GPS...');
    const id = navigator.geolocation.watchPosition(
      pos => {
        const pt: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentPoints(prev => {
          if (prev.length === 0) return [pt];
          const last = prev[prev.length - 1];
          const d = ((last.lat - pt.lat) ** 2 + (last.lng - pt.lng) ** 2) ** 0.5;
          if (d < 0.00001) return prev;
          return [...prev, pt];
        });
        setGpsStatus(`Recording... ${currentPoints.length + 1} points`);
      },
      err => setGpsStatus(`GPS error: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000 }
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
    const cx = w / 2;
    const cy = h / 2;
    const lat = (cy - y) / scale;
    const lng = (x - cx) / scale;
    setCurrentPoints(prev => [...prev, { lat, lng }]);
  }

  function undoLastPoint() {
    setCurrentPoints(prev => prev.slice(0, -1));
  }

  async function saveArea() {
    if (currentPoints.length < 3 || !areaName.trim()) return;
    try {
      const { sqM, display } = calcArea(currentPoints);
      const area: FarmArea = {
        id: editId || generateId('FA'),
        name: areaName.trim(),
        points: currentPoints,
        areaSqM: sqM,
        areaDisplay: display,
        color: COLORS[(areas?.length || 0) % COLORS.length],
        createdAt: new Date().toISOString(),
        updatedAt: Date.now(),
      };
      await db.farmAreas.put(area);
      setCurrentPoints([]);
      setAreaName('');
      setEditId(null);
      setMode('list');
    } catch (err) {
      alert('Failed to save area: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function deleteArea(id: string) {
    if (window.confirm('Delete this area?')) await db.farmAreas.delete(id);
  }

  function editArea(area: FarmArea) {
    setCurrentPoints(area.points);
    setAreaName(area.name);
    setEditId(area.id);
    setMode('gps');
  }

  function viewOnMap(area: FarmArea) {
    setViewArea(area);
  }

  function renderPolygonSvg(pts: GeoPoint[], w = 280, h = 200): string {
    if (pts.length < 3) return '';
    const xy = latLngToXY(pts, w, h);
    return xy.map(p => `${p.x},${p.y}`).join(' ');
  }

  function renderSvgPreview(pts: GeoPoint[], color = '#4CAF50') {
    if (pts.length < 3) return null;
    return (
      <svg width="100%" height="120" viewBox="0 0 280 200" preserveAspectRatio="xMidYMid meet">
        <polygon points={renderPolygonSvg(pts)} fill={`${color}20`} stroke={color} strokeWidth="2" />
        {latLngToXY(pts, 280, 200).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} stroke="#fff" strokeWidth="1.5" />
        ))}
      </svg>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b sticky top-0 z-10">
        <button onClick={() => { if (mode !== 'list') { setMode('list'); setCurrentPoints([]); setAreaName(''); setEditId(null); if (watchId !== null) navigator.geolocation.clearWatch(watchId); setWatchId(null); } else onClose(); }} className="text-gray-600 text-lg">←</button>
        <h1 className="font-bold text-lg">Area Mapper</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mode === 'list' && (
          <>
            <div className="flex gap-2">
              <button onClick={() => setMode('gps')} className="flex-1 bg-green-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"><Navigation className="w-5 h-5" /> GPS Walk</button>
              <button onClick={() => { setCurrentPoints([]); setMode('manual'); }} className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"><Hand className="w-5 h-5" /> Manual</button>
            </div>
            {(!areas || areas.length === 0) && (
              <div className="text-center py-20 text-gray-400"><MapPin className="w-12 h-12 mx-auto mb-3 opacity-40" /><p>No areas mapped yet</p><p className="text-sm">Walk a perimeter or tap points on a grid</p></div>
            )}
            {areas?.map(a => (
              <div key={a.id} className="bg-white rounded-xl border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color }} />
                    <h3 className="font-semibold">{a.name}</h3>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => editArea(a)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => deleteArea(a.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>
                <p className="text-sm font-mono text-gray-500">{a.areaDisplay} · {a.points.length} points</p>
                {renderSvgPreview(a.points, a.color)}
              </div>
            ))}
          </>
        )}

        {mode === 'gps' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><Navigation className="w-5 h-5 text-green-600" /> GPS Perimeter Walk</h2>
              {watchId === null ? (
                <Button onClick={startGpsWalk} className="w-full bg-green-600 hover:bg-green-700"><Navigation className="w-4 h-4" /> Start Walk</Button>
              ) : (
                <Button onClick={stopGpsWalk} className="w-full bg-red-600 hover:bg-red-700">Stop Recording</Button>
              )}
              <p className="text-sm text-gray-500">{gpsStatus}</p>
              {currentPoints.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Points: {currentPoints.length}</p>
                  {currentPoints.length >= 3 && (
                    <p className="text-sm font-mono text-green-700">{calcArea(currentPoints).display}</p>
                  )}
                </div>
              )}
              {currentPoints.length >= 3 && renderSvgPreview(currentPoints)}
            </div>
            {currentPoints.length >= 3 && (
              <div className="bg-white rounded-xl border p-4 space-y-3">
                <input
                  type="text"
                  placeholder="Area name (e.g. North Field)"
                  value={areaName}
                  onChange={e => setAreaName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={undoLastPoint} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Undo Point</button>
                  <button onClick={() => { setCurrentPoints([]); setAreaName(''); }} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Clear</button>
                  <button onClick={saveArea} className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-semibold" disabled={!areaName.trim()}>Save Area</button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'manual' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><Hand className="w-5 h-5 text-blue-600" /> Manual Point Entry</h2>
              <p className="text-sm text-gray-500">Tap on the grid to add points. Points are relative to center.</p>
              <canvas
                ref={manualCanvasRef}
                width={340}
                height={300}
                onClick={addManualPoint}
                className="w-full border rounded-lg bg-white cursor-crosshair"
                style={{ maxWidth: 340, margin: '0 auto' }}
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{currentPoints.length} points placed</span>
                {currentPoints.length >= 3 && (
                  <span className="font-mono text-green-700">{calcArea(currentPoints).display}</span>
                )}
              </div>
            </div>
            {currentPoints.length >= 3 && (
              <div className="bg-white rounded-xl border p-4 space-y-3">
                <input
                  type="text"
                  placeholder="Area name"
                  value={areaName}
                  onChange={e => setAreaName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={undoLastPoint} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Undo</button>
                  <button onClick={() => { setCurrentPoints([]); setAreaName(''); }} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Clear</button>
                  <button onClick={saveArea} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold" disabled={!areaName.trim()}>Save Area</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
