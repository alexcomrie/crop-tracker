import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { generateId } from '../../lib/ids';
import { MapPin, Navigation, Trash2, Edit3, Hand, Save, RotateCcw, Pencil, Plus, Home, ChevronRight, Eye, Link, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { InteractiveMap } from './InteractiveMap';
import { LeafletMapView } from './LeafletMapView';
import { LinkCropModal } from './LinkCropModal';
import { haversineMeters, calcArea, gpsToSvgAll, formatAreaShort } from '../../lib/geo';
import type { GeoPoint, FarmArea, FarmLand, RowDetail, CropAssignment } from '../../types';

const COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#795548', '#607D8B'];
const PLANTING_METHODS = ['Direct Ground', 'Seed Bed', 'Seed Tray', 'Pot / Container', 'Hydroponic'];
const CANVAS_W = 340;
const CANVAS_H = 280;
const MIN_POINT_DISTANCE = 1.5;

function AreaSvgThumb({ points, w = 120, h = 80 }: { points: GeoPoint[] | undefined | null; w?: number; h?: number }) {
  const svg = points && points.length >= 3 ? gpsToSvgAll([points], w, h, 8)[0] : [];
  const polyStr = svg.map(p => `${p.x},${p.y}`).join(' ');
  return (
    <svg width={w} height={h} className="rounded bg-green-50 border shrink-0">
      {polyStr ? (
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

async function getNextPlotTag(): Promise<string> {
  const count = await db.farmAreas.count();
  return `PLOT${(count + 1).toString().padStart(4, '0')}`;
}



export function AreaMapperScreen({ onClose }: { onClose: () => void }) {
  const lands = useLiveQuery(() => db.farmLands.toArray(), []);
  const [selectedLand, setSelectedLand] = useState<FarmLand | null>(null);
  const plots = useLiveQuery(() => selectedLand ? db.farmAreas.where('landId').equals(selectedLand.id).toArray() : [], [selectedLand]);
  const [mode, setMode] = useState<'lands' | 'land-gps' | 'plots' | 'gps' | 'manual' | 'details' | 'land-edit' | 'map'>('lands');
  const [currentPoints, setCurrentPoints] = useState<GeoPoint[]>([]);
  const [plotTag, setPlotTag] = useState('');
  const [plotName, setPlotName] = useState('');
  const [landName, setLandName] = useState('');
  const [landEditId, setLandEditId] = useState<string | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState('');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [status, setStatus] = useState<'unmapped' | 'mapped' | 'cultivated'>('unmapped');
  const [rowSpacing, setRowSpacing] = useState(12);
  const [cropAssignments, setCropAssignments] = useState<CropAssignment[]>([{ cropName: '', rowCount: 1, spacingInRow: 12 }]);
  const [plantingMethod, setPlantingMethod] = useState('Direct Ground');
  const [farmNotes, setFarmNotes] = useState('');
  const manualCanvasRef = useRef<HTMLCanvasElement>(null);
  const [obstacleActive, setObstacleActive] = useState(false);
  const [obstacleStartPos, setObstacleStartPos] = useState<GeoPoint | null>(null);
  const [obstacleCurrentPos, setObstacleCurrentPos] = useState<GeoPoint | null>(null);
  const obstacleActiveRef = useRef(false);
  const [linkModalPlot, setLinkModalPlot] = useState<string | null>(null);
  const [editingPoints, setEditingPoints] = useState(false);
  const [editingLandPoints, setEditingLandPoints] = useState(false);
  const allCrops = useLiveQuery(() => db.crops.where('status').equals('Active').toArray(), []) ?? [];

  function interpolatePoints(start: GeoPoint, end: GeoPoint): GeoPoint[] {
    const dist = haversineMeters(start, end);
    const numPoints = Math.max(2, Math.round(dist / MIN_POINT_DISTANCE));
    const pts: GeoPoint[] = [];
    for (let i = 1; i < numPoints; i++) {
      const t = i / numPoints;
      pts.push({ lat: start.lat + (end.lat - start.lat) * t, lng: start.lng + (end.lng - start.lng) * t });
    }
    return pts;
  }

  function startObstacle() {
    if (currentPoints.length === 0) return;
    obstacleActiveRef.current = true;
    setObstacleActive(true);
    setObstacleStartPos(currentPoints[currentPoints.length - 1]);
    setGpsStatus('Obstacle mode: walk around the obstacle');
  }

  function stopObstacle() {
    if (!obstacleStartPos || !obstacleCurrentPos) return;
    const newPoints = interpolatePoints(obstacleStartPos, obstacleCurrentPos);
    setCurrentPoints(prev => [...prev, ...newPoints]);
    obstacleActiveRef.current = false;
    setObstacleActive(false);
    setObstacleStartPos(null);
    setObstacleCurrentPos(null);
    setGpsStatus(`Obstacle bypassed: ${newPoints.length} points added`);
  }

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
    setGpsStatus('Getting starting position...');
    // Get an immediate starting position first, then switch to watchPosition
    navigator.geolocation.getCurrentPosition(
      initialPos => {
        const startPt: GeoPoint = { lat: initialPos.coords.latitude, lng: initialPos.coords.longitude };
        setCurrentPoints([startPt]);
        setGpsAccuracy(initialPos.coords.accuracy);
        setGpsStatus('Starting position acquired — now recording...');
        // Now start the continuous watch for subsequent points
        const id = navigator.geolocation.watchPosition(
          pos => {
            const pt: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setGpsAccuracy(pos.coords.accuracy);
            if (obstacleActiveRef.current) {
              setObstacleCurrentPos(pt);
              setGpsStatus('Obstacle mode: monitoring GPS...');
            } else {
              setCurrentPoints(prev => {
                if (prev.length === 0) return [pt];
                if (haversineMeters(prev[prev.length - 1], pt) < MIN_POINT_DISTANCE) return prev;
                return [...prev, pt];
              });
            }
          },
          err => setGpsStatus(`GPS error: ${err.message}`),
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
        );
        setWatchId(id);
      },
      err => {
        // Fallback: start watchPosition directly if getCurrentPosition fails
        setGpsStatus('Fast fix unavailable, acquiring GPS...');
        const id = navigator.geolocation.watchPosition(
          pos => {
            const pt: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setGpsAccuracy(pos.coords.accuracy);
            if (obstacleActiveRef.current) {
              setObstacleCurrentPos(pt);
              setGpsStatus('Obstacle mode: monitoring GPS...');
            } else {
              setCurrentPoints(prev => {
                if (prev.length === 0) return [pt];
                if (haversineMeters(prev[prev.length - 1], pt) < MIN_POINT_DISTANCE) return prev;
                return [...prev, pt];
              });
            }
          },
          err2 => setGpsStatus(`GPS error: ${err2.message}`),
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
        );
        setWatchId(id);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 2000 }
    );
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

  function resetPlotForm() {
    setCurrentPoints([]);
    setPlotTag('');
    setPlotName('');
    setEditId(null);
    setStatus('unmapped');
    setRowSpacing(12);
    setCropAssignments([{ cropName: '', rowCount: 1, spacingInRow: 12 }]);
    setPlantingMethod('Direct Ground');
    setFarmNotes('');
    setGpsAccuracy(null);
    setGpsStatus('');
  }

  function resetLandForm() {
    setCurrentPoints([]);
    setLandName('');
    setLandEditId(null);
    setGpsAccuracy(null);
    setGpsStatus('');
  }

  // ─── LAND OPERATIONS ───

  async function saveLand() {
    if (currentPoints.length < 3 || !landName.trim()) return;
    try {
      const { sqM, display } = calcArea(currentPoints);
      const land: FarmLand = {
        id: landEditId || generateId('LD'),
        name: landName.trim(),
        points: currentPoints,
        areaSqM: sqM,
        areaDisplay: display,
        color: COLORS[(lands?.length || 0) % COLORS.length],
        createdAt: landEditId ? (lands?.find(l => l.id === landEditId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: Date.now(),
      };
      await db.farmLands.put(land);
      if (landEditId) { setSelectedLand(land); setMode('plots'); toast.success('Land updated'); }
      else { resetLandForm(); setMode('lands'); toast.success('Land saved'); }
    } catch (err) {
      toast.error('Failed to save land: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function deleteLand(id: string) {
    if (!window.confirm('Delete this land and all its plots?')) return;
    await db.farmAreas.where('landId').equals(id).delete();
    await db.farmLands.delete(id);
  }

  function selectLand(land: FarmLand) {
    setSelectedLand(land);
    setMode('plots');
  }

  function editLandPerimeter(land: FarmLand) {
    setCurrentPoints(land.points || []);
    setLandName(land.name);
    setLandEditId(land.id);
    setMode('land-edit');
  }

  function backToLands() {
    setSelectedLand(null);
    resetPlotForm();
    resetLandForm();
    setMode('lands');
  }

  // ─── PLOT OPERATIONS ───

  async function savePlot() {
    if (currentPoints.length < 3 || !plotName.trim() || !selectedLand) return;
    try {
      const { sqM, display } = calcArea(currentPoints);
      const tag = editId ? plotTag : await getNextPlotTag();
      const plot: FarmArea = {
        id: editId || generateId('FA'),
        landId: selectedLand.id,
        tag,
        name: plotName.trim(),
        points: currentPoints,
        areaSqM: sqM,
        areaDisplay: display,
        color: COLORS[(plots?.length || 0) % COLORS.length],
        status: status === 'unmapped' ? 'mapped' : status,
        rowCount: cropAssignments.reduce((sum, ca) => sum + ca.rowCount, 0),
        rowSpacing,
        rowDetails: [],
        cropAssignments,
        plantingMethod,
        notes: farmNotes,
        createdAt: editId ? (plots?.find(p => p.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: Date.now(),
      };
      await db.farmAreas.put(plot);
      resetPlotForm();
      setMode('plots');
      toast.success('Plot saved');
    } catch (err) {
      toast.error('Failed to save plot: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function savePlotDetails() {
    if (!editId) return;
    try {
      await db.farmAreas.update(editId, {
        name: plotName.trim(),
        rowCount: cropAssignments.reduce((sum, ca) => sum + ca.rowCount, 0),
        rowSpacing,
        rowDetails: [],
        cropAssignments,
        plantingMethod,
        notes: farmNotes,
        status: 'cultivated',
        updatedAt: Date.now(),
      });
      resetPlotForm();
      setMode('plots');
      toast.success('Plot details saved');
    } catch (err) {
      toast.error('Failed to save details: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function deletePlot(id: string) {
    if (window.confirm('Delete this plot?')) await db.farmAreas.delete(id);
  }

  function editPlotPerimeter(plot: FarmArea) {
    setCurrentPoints(plot.points || []);
    setPlotTag(plot.tag);
    setPlotName(plot.name);
    setEditId(plot.id);
    setStatus(plot.status);
    setRowSpacing(plot.rowSpacing || 12);
    setCropAssignments(plot.cropAssignments?.length ? plot.cropAssignments : [{ cropName: '', rowCount: 1, spacingInRow: 12 }]);
    setPlantingMethod(plot.plantingMethod || 'Direct Ground');
    setFarmNotes(plot.notes || '');
    setMode('gps');
  }

  function openPlotDetails(plot: FarmArea) {
    setEditId(plot.id);
    setPlotTag(plot.tag);
    setPlotName(plot.name);
    setRowSpacing(plot.rowSpacing || 12);
    setCropAssignments(plot.cropAssignments?.length ? plot.cropAssignments : [{ cropName: '', rowCount: 1, spacingInRow: 12 }]);
    setPlantingMethod(plot.plantingMethod || 'Direct Ground');
    setFarmNotes(plot.notes || '');
    setMode('details');
  }

  function renderLiveSvg(pts: GeoPoint[]) {
    if (pts.length === 0) return null;
    const svgPts = gpsToSvgAll([pts], CANVAS_W, CANVAS_H, 20)[0] || [];
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

  function renderObstaclePreview(pts: GeoPoint[], start: GeoPoint, current: GeoPoint) {
    const allSvg = gpsToSvgAll([pts, [start, current]], CANVAS_W, CANVAS_H, 20);
    if (allSvg.length < 2) return null;
    const obsSvg = allSvg[1];
    if (!obsSvg || obsSvg.length < 2) return null;
    const lineStr = obsSvg.map(p => `${p.x},${p.y}`).join(' ');
    return (
      <svg width="100%" height={CANVAS_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="absolute top-0 left-0 pointer-events-none">
        <polyline points={lineStr} fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray="6,4" />
        <circle cx={obsSvg[0].x} cy={obsSvg[0].y} r="5" fill="#f59e0b" stroke="white" strokeWidth="1.5" />
        <text x={obsSvg[0].x + 8} y={obsSvg[0].y + 4} fontSize="10" fill="#f59e0b" fontWeight="bold">OBSTACLE</text>
      </svg>
    );
  }

  function renderPlotForm(primaryColor: string) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Plot Details</p>
        <input type="text" placeholder="Plot name (e.g. North Bed)" value={plotName} onChange={e => setPlotName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 shrink-0">Row Spacing:</label>
          <div className="flex items-center gap-1">
            <input type="number" min={1} value={rowSpacing} onChange={e => setRowSpacing(Number(e.target.value))} className="w-20 border rounded-lg px-2 py-1.5 text-sm" />
            <span className="text-xs text-gray-400">inches</span>
          </div>
        </div>
        <select value={plantingMethod} onChange={e => setPlantingMethod(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
          {PLANTING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Crop assignments (batch rows) */}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Crops in this Plot</p>
        <p className="text-[10px] text-gray-400">Add each crop grown in this plot and how many rows it occupies.</p>
        {cropAssignments.map((ca, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase">Crop {i + 1}</span>
              {cropAssignments.length > 1 && (
                <button onClick={() => setCropAssignments(prev => prev.filter((_, j) => j !== i))} className="text-red-400 text-xs">Remove</button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="text-[10px] text-gray-400">Crop</label>
                <input type="text" placeholder="e.g. Tomato" value={ca.cropName} onChange={e => setCropAssignments(prev => prev.map((r, j) => j === i ? { ...r, cropName: e.target.value } : r))} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400">Rows</label>
                <input type="number" min={1} value={ca.rowCount} onChange={e => setCropAssignments(prev => prev.map((r, j) => j === i ? { ...r, rowCount: Math.max(1, Number(e.target.value)) } : r))} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400">Spacing</label>
                <div className="flex items-center gap-1">
                  <input type="number" min={1} value={ca.spacingInRow} onChange={e => setCropAssignments(prev => prev.map((r, j) => j === i ? { ...r, spacingInRow: Number(e.target.value) } : r))} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                  <span className="text-[10px] text-gray-400">in</span>
                </div>
              </div>
            </div>
          </div>
        ))}
        <button onClick={() => setCropAssignments(prev => [...prev, { cropName: '', rowCount: 1, spacingInRow: 12 }])} className="text-xs text-blue-600 font-semibold w-full py-1.5 border border-dashed rounded-lg hover:bg-blue-50">
          + Add Another Crop
        </button>

        <textarea placeholder="General notes about this plot..." value={farmNotes} onChange={e => setFarmNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetPlotForm} className="flex-1"><RotateCcw className="w-4 h-4" /> Reset</Button>
          <Button onClick={savePlot} className="flex-1 text-white" style={{ backgroundColor: primaryColor }} disabled={!plotName.trim()}><Save className="w-4 h-4" /> Save Plot</Button>
        </div>
      </div>
    );
  }

  function stopGps() {
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); setWatchId(null); }
  }

  const backBtn = (onBack: () => void) => (
    <button onClick={onBack} className="text-gray-600 text-lg">←</button>
  );

  const backToPlots = () => { stopGps(); resetPlotForm(); setMode('plots'); };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b sticky top-0 z-10">
        {mode === 'lands' ? backBtn(onClose)
          : mode === 'land-gps' ? backBtn(() => { stopGps(); resetLandForm(); setMode('lands'); })
          : mode === 'land-edit' ? backBtn(() => { stopGps(); resetLandForm(); setMode('plots'); })
          : mode === 'plots' ? backBtn(backToLands)
          : backBtn(backToPlots)}
        <h1 className="font-bold text-lg">Area Mapper</h1>
        {(mode === 'plots' || mode === 'land-edit' || mode === 'gps' || mode === 'manual' || mode === 'details') && selectedLand && (
          <span className="text-sm text-gray-400 ml-1">— {selectedLand.name}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ─── LAND LIST ─── */}
        {mode === 'lands' && (
          <>
            <div className="flex gap-2">
              <button onClick={() => { resetLandForm(); setMode('land-gps'); }} className="flex-1 bg-green-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"><Plus className="w-5 h-5" /> Add Land</button>
            </div>
            {(!lands || lands.length === 0) && (
              <div className="text-center py-20 text-gray-400"><Home className="w-12 h-12 mx-auto mb-3 opacity-40" /><p>No farm lands yet</p><p className="text-sm">Walk the perimeter of your land to start mapping plots</p></div>
            )}
            {lands?.map(l => (
              <div key={l.id} onClick={() => selectLand(l)} className="bg-white rounded-xl border p-3 flex gap-3 active:scale-[0.98] transition-all cursor-pointer">
                <AreaSvgThumb points={l.points} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4 shrink-0" style={{ color: l.color }} />
                    <h3 className="font-semibold truncate">{l.name}</h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{l.areaDisplay || 'N/A'} · {l.points?.length ?? 0} points</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={e => { e.stopPropagation(); deleteLand(l.id); }} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  <ChevronRight className="w-5 h-5 text-gray-300 mt-1" />
                </div>
              </div>
            ))}
          </>
        )}

        {/* ─── LAND PERIMETER WALK (creation) ─── */}
        {mode === 'land-gps' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold">Walk Land Perimeter</h2>
              <p className="text-sm text-gray-500">Walk around the boundary of your land to map its shape.</p>
              <input type="text" placeholder="Land name (e.g. North Property)" value={landName} onChange={e => setLandName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={`px-2 py-0.5 rounded font-bold ${watchId !== null ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{watchId !== null ? '● Recording' : 'Stopped'}</span>
                {gpsAccuracy !== null && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">GPS ±{gpsAccuracy.toFixed(0)} m</span>}
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{currentPoints.length} points</span>
                {currentPoints.length >= 3 && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-mono">{calcArea(currentPoints).display}</span>}
              </div>
              <div className="relative">
                {renderLiveSvg(currentPoints)}
                {obstacleActive && obstacleStartPos && obstacleCurrentPos && renderObstaclePreview(currentPoints, obstacleStartPos, obstacleCurrentPos)}
              </div>
              {watchId === null ? (
                <Button onClick={startGpsWalk} className="w-full bg-green-600 hover:bg-green-700"><Navigation className="w-4 h-4" /> {currentPoints.length > 0 ? 'Resume Recording' : 'Start Walk'}</Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={stopGpsWalk} className="flex-1 bg-red-600 hover:bg-red-700">Pause Recording</Button>
                  {obstacleActive ? (
                    <Button onClick={stopObstacle} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"><Eye className="w-4 h-4" /> Obstacle Stop</Button>
                  ) : (
                    <Button onClick={startObstacle} variant="outline" className="flex-1 border-amber-400 text-amber-700" disabled={currentPoints.length === 0}><Eye className="w-4 h-4" /> Obstacle Start</Button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={undoLastPoint} disabled={currentPoints.length === 0}>Undo Point</Button>
                <Button variant="outline" onClick={() => { setCurrentPoints([]); setGpsAccuracy(null); setGpsStatus(''); }} disabled={currentPoints.length === 0}>Clear</Button>
              </div>
              {currentPoints.length >= 3 && (
                <Button onClick={saveLand} className="w-full bg-green-600 text-white" disabled={!landName.trim()}><Save className="w-4 h-4" /> Save Land</Button>
              )}
            </div>
          </div>
        )}

        {/* ─── LAND PERIMETER EDIT (re-walk) ─── */}
        {mode === 'land-edit' && selectedLand && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold">Edit Land Perimeter — {selectedLand.name}</h2>
              <p className="text-sm text-gray-500">Walk around the boundary to update the land shape.</p>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={`px-2 py-0.5 rounded font-bold ${watchId !== null ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{watchId !== null ? '● Recording' : 'Stopped'}</span>
                {gpsAccuracy !== null && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">GPS ±{gpsAccuracy.toFixed(0)} m</span>}
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{currentPoints.length} points</span>
                {currentPoints.length >= 3 && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-mono">{calcArea(currentPoints).display}</span>}
              </div>
              <div className="relative">
                {renderLiveSvg(currentPoints)}
                {obstacleActive && obstacleStartPos && obstacleCurrentPos && renderObstaclePreview(currentPoints, obstacleStartPos, obstacleCurrentPos)}
              </div>
              {watchId === null ? (
                <Button onClick={startGpsWalk} className="w-full bg-green-600 hover:bg-green-700"><Navigation className="w-4 h-4" /> {currentPoints.length > 0 ? 'Resume Recording' : 'Start Walk'}</Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={stopGpsWalk} className="flex-1 bg-red-600 hover:bg-red-700">Pause Recording</Button>
                  {obstacleActive ? (
                    <Button onClick={stopObstacle} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"><Eye className="w-4 h-4" /> Obstacle Stop</Button>
                  ) : (
                    <Button onClick={startObstacle} variant="outline" className="flex-1 border-amber-400 text-amber-700" disabled={currentPoints.length === 0}><Eye className="w-4 h-4" /> Obstacle Start</Button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={undoLastPoint} disabled={currentPoints.length === 0}>Undo Point</Button>
                <Button variant="outline" onClick={() => { setCurrentPoints([]); setGpsAccuracy(null); setGpsStatus(''); }} disabled={currentPoints.length === 0}>Clear</Button>
              </div>
              {currentPoints.length >= 3 && (
                <Button onClick={saveLand} className="w-full bg-green-600 text-white"><Save className="w-4 h-4" /> Update Land</Button>
              )}
            </div>
          </div>
        )}

        {/* ─── PLOT LIST (with combined map) ─── */}
        {mode === 'plots' && selectedLand && (
          <>
            {/* Combined map: land background + plot overlays */}
            {selectedLand.points?.length >= 3 && (
              <InteractiveMap
                mapData={[{ land: selectedLand, plots: plots || [] }]}
                onSelectPlot={plot => { if (plot) toast.info(`Selected: ${plot.tag} — ${plot.name || ''}`); }}
                editingLandId={editingLandPoints ? selectedLand.id : undefined}
                onPointsChange={(id, points) => {
                  if (id === selectedLand.id) {
                    const now = Date.now();
                    db.farmLands.where('id').equals(id).modify({ points, updatedAt: now });
                    toast.success('Land perimeter updated');
                    setEditingLandPoints(false);
                  }
                }}
                readOnly={!editingLandPoints}
              />
            )}
            <div className="flex gap-2">
              <button onClick={() => { resetPlotForm(); setMode('gps'); }} className="flex-1 bg-green-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"><Navigation className="w-5 h-5" /> GPS Walk</button>
              <button onClick={() => { resetPlotForm(); setMode('manual'); }} className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"><Hand className="w-5 h-5" /> Manual</button>
              {selectedLand.points?.length >= 3 && (
                <button onClick={() => setMode('map')} className="flex-1 bg-indigo-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"><MapPin className="w-5 h-5" /> Map</button>
              )}
            </div>
            {selectedLand.points?.length >= 3 && (
              <button onClick={() => setEditingLandPoints(!editingLandPoints)} className={`w-full text-xs rounded-lg py-2 flex items-center justify-center gap-1 ${editingLandPoints ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'text-gray-500 border border-dashed hover:bg-gray-50'}`}><Pencil className="w-3 h-3" /> {editingLandPoints ? 'Done Editing' : 'Edit land perimeter'}</button>
            )}
            <p className="text-xs text-gray-400">{plots?.length || 0} plot{(plots?.length || 0) !== 1 ? 's' : ''}</p>
            {(!plots || plots.length === 0) && (
              <div className="text-center py-10 text-gray-400"><MapPin className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">No plots mapped yet</p></div>
            )}
            {plots?.map(p => {
              const { sqM } = calcArea(p.points);
              const linkedCrops = allCrops.filter(c => c.plotId === p.id);
              return (
                <div key={p.id} className="bg-white rounded-xl border p-3 flex gap-3">
                  <AreaSvgThumb points={p.points} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{p.tag}</span>
                      {p.name && <span className="text-xs text-gray-500 truncate">— {p.name}</span>}
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{formatAreaShort(sqM)} · {p.points?.length ?? 0} points</p>
                    {(p.rowCount || 0) > 0 && <p className="text-xs text-gray-500">{p.rowCount} row{(p.rowCount || 0) !== 1 ? 's' : ''}{p.rowSpacing ? ` · ${p.rowSpacing} cm` : ''}</p>}
                    {p.plantingMethod && <p className="text-xs text-gray-500">{p.plantingMethod}</p>}
                    {(p.cropAssignments || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.cropAssignments.filter(ca => ca.cropName).map((ca, i) => (
                          <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{ca.cropName} ({ca.rowCount} row{ca.rowCount > 1 ? 's' : ''})</span>
                        ))}
                      </div>
                    )}
                    {linkedCrops.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {linkedCrops.map(c => (
                          <span key={c.id} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded flex items-center gap-1"><Link className="w-2.5 h-2.5" />{c.cropName}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => editPlotPerimeter(p)} className="p-1.5 hover:bg-green-50 rounded-lg" title="Re-walk"><Navigation className="w-4 h-4 text-green-600" /></button>
                    <button onClick={() => openPlotDetails(p)} className="p-1.5 hover:bg-blue-50 rounded-lg" title="Edit details"><Pencil className="w-4 h-4 text-blue-500" /></button>
                    <button onClick={() => setLinkModalPlot(p.id)} className="p-1.5 hover:bg-purple-50 rounded-lg" title="Link to crop"><Link className="w-4 h-4 text-purple-500" /></button>
                    <button onClick={() => deletePlot(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ─── MAP VIEW (Leaflet tiles) ─── */}
        {mode === 'map' && selectedLand && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setMode('plots')} className="text-sm text-indigo-600 font-semibold">← Back to Plots</button>
              <div className="flex gap-1 ml-auto">
                <button onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.geojson';
                  input.onchange = async () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    try {
                      const { parseGeoJsonFile, geoJsonToPlots } = await import('../../lib/geoJson');
                      const fc = await parseGeoJsonFile(file);
                      const now = Date.now();
                      for (const plot of geoJsonToPlots(fc, selectedLand.id)) {
                        const { sqM, display } = calcArea(plot.points);
                        const tag = await getNextPlotTag();
                        await db.farmAreas.put({
                          ...plot,
                          id: generateId('FA'),
                          tag: plot.tag || tag,
                          areaSqM: sqM,
                          areaDisplay: display,
                          createdAt: new Date().toISOString(),
                          updatedAt: now,
                        });
                      }
                      toast.success('GeoJSON plots imported');
                    } catch (e) {
                      toast.error('Import failed: ' + (e instanceof Error ? e.message : 'unknown error'));
                    }
                  };
                  input.click();
                }} className="text-xs bg-white border rounded-lg px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50">
                  Import GeoJSON
                </button>
              </div>
            </div>
            <LeafletMapView
              mapData={[{ land: selectedLand, plots: plots || [] }]}
              showGps
              onSelectPlot={plot => { if (plot) toast.info(`${plot.tag} — ${plot.name || ''}`); }}
            />
            <div className="text-xs text-gray-400 text-center">
              Tap a plot on the map to see details. GPS marker shows your location.
            </div>
          </div>
        )}

        {/* ─── LINK CROP MODAL ─── */}
        {linkModalPlot && (
          <LinkCropModal
            plotId={linkModalPlot}
            crops={allCrops}
            onClose={() => setLinkModalPlot(null)}
          />
        )}

        {/* ─── GPS MODE (Plot creation) ─── */}
        {mode === 'gps' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><Navigation className="w-5 h-5 text-green-600" /> Walk Plot Perimeter{plotTag ? ` — ${plotTag}` : ''}</h2>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={`px-2 py-0.5 rounded font-bold ${watchId !== null ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{watchId !== null ? '● Recording' : 'Stopped'}</span>
                {gpsAccuracy !== null && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">GPS ±{gpsAccuracy.toFixed(0)} m</span>}
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{currentPoints.length} points</span>
                {currentPoints.length >= 3 && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-mono">{calcArea(currentPoints).display}</span>}
              </div>
              <div className="relative">
                {renderLiveSvg(currentPoints)}
                {obstacleActive && obstacleStartPos && obstacleCurrentPos && renderObstaclePreview(currentPoints, obstacleStartPos, obstacleCurrentPos)}
              </div>
              <p className="text-xs text-gray-500">{gpsStatus}</p>
              {watchId === null ? (
                <Button onClick={startGpsWalk} className="w-full bg-green-600 hover:bg-green-700"><Navigation className="w-4 h-4" /> {currentPoints.length > 0 ? 'Resume Recording' : 'Start Walk'}</Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={stopGpsWalk} className="flex-1 bg-red-600 hover:bg-red-700">Pause Recording</Button>
                  {obstacleActive ? (
                    <Button onClick={stopObstacle} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"><Eye className="w-4 h-4" /> Obstacle Stop</Button>
                  ) : (
                    <Button onClick={startObstacle} variant="outline" className="flex-1 border-amber-400 text-amber-700" disabled={currentPoints.length === 0}><Eye className="w-4 h-4" /> Obstacle Start</Button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={undoLastPoint} disabled={currentPoints.length === 0}>Undo Point</Button>
                <Button variant="outline" onClick={() => { setCurrentPoints([]); setGpsAccuracy(null); setGpsStatus(''); }} disabled={currentPoints.length === 0}>Clear</Button>
              </div>
            </div>
            {currentPoints.length >= 3 && (
              <div className="bg-white rounded-xl border p-4 space-y-3">
                {renderPlotForm('#16a34a')}
              </div>
            )}
          </div>
        )}

        {/* ─── MANUAL MODE (Plot creation) ─── */}
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
                {renderPlotForm('#2563eb')}
              </div>
            )}
          </div>
        )}

        {/* ─── PLOT DETAILS EDIT ─── */}
        {mode === 'details' && (
          <div className="space-y-4">
            {selectedLand && selectedLand.points?.length >= 3 && (
              <InteractiveMap
                mapData={[{ land: selectedLand, plots: (plots || []).filter(p => p.id === editId) }]}
                selectedPlotId={editId ?? undefined}
                editingPlotId={editingPoints ? (editId ?? undefined) : undefined}
                onPointsChange={(plotId, points) => {
                  const now = Date.now();
                  db.farmAreas.where('id').equals(plotId).modify({ points, updatedAt: now });
                  toast.success('Points updated');
                  setEditingPoints(false);
                }}
                height={280}
              />
            )}
            <div className="flex gap-2">
              <button onClick={() => setEditingPoints(!editingPoints)} className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 ${editingPoints ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-50 text-gray-600 border'}`}>
                <Edit3 className="w-4 h-4" /> {editingPoints ? 'Done Editing' : 'Edit Points'}
              </button>
            </div>
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><Edit3 className="w-5 h-5 text-blue-600" /> Edit Details — {plotTag}</h2>
              <input type="text" placeholder="Plot name" value={plotName} onChange={e => setPlotName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 shrink-0">Row Spacing:</label>
                <div className="flex items-center gap-1">
                  <input type="number" min={1} value={rowSpacing} onChange={e => setRowSpacing(Number(e.target.value))} className="w-20 border rounded-lg px-2 py-1.5 text-sm" />
                  <span className="text-xs text-gray-400">inches</span>
                </div>
              </div>
              <select value={plantingMethod} onChange={e => setPlantingMethod(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                {PLANTING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Crops in this Plot</p>
              {cropAssignments.map((ca, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Crop {i + 1}</span>
                    {cropAssignments.length > 1 && (
                      <button onClick={() => setCropAssignments(prev => prev.filter((_, j) => j !== i))} className="text-red-400 text-xs">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <label className="text-[10px] text-gray-400">Crop</label>
                      <input type="text" placeholder="e.g. Tomato" value={ca.cropName} onChange={e => setCropAssignments(prev => prev.map((r, j) => j === i ? { ...r, cropName: e.target.value } : r))} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">Rows</label>
                      <input type="number" min={1} value={ca.rowCount} onChange={e => setCropAssignments(prev => prev.map((r, j) => j === i ? { ...r, rowCount: Math.max(1, Number(e.target.value)) } : r))} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">Spacing</label>
                      <div className="flex items-center gap-1">
                        <input type="number" min={1} value={ca.spacingInRow} onChange={e => setCropAssignments(prev => prev.map((r, j) => j === i ? { ...r, spacingInRow: Number(e.target.value) } : r))} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                        <span className="text-[10px] text-gray-400">in</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => setCropAssignments(prev => [...prev, { cropName: '', rowCount: 1, spacingInRow: 12 }])} className="text-xs text-blue-600 font-semibold w-full py-1.5 border border-dashed rounded-lg hover:bg-blue-50">
                + Add Another Crop
              </button>
              <textarea placeholder="General notes..." value={farmNotes} onChange={e => setFarmNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { resetPlotForm(); setMode('plots'); }} className="flex-1">Cancel</Button>
                <Button onClick={savePlotDetails} className="flex-1 bg-blue-600 text-white"><Save className="w-4 h-4" /> Save Details</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}