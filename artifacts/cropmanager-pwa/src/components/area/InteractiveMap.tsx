import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FarmArea, FarmLand, GeoPoint } from '../../types';

const CANVAS_W = 400;
const CANVAS_H = 400;
const COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#FF5722', '#607D8B'];

function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2));
}

export function gpsToSvgAll(
  allPoints: (GeoPoint[] | undefined | null)[],
  w: number,
  h: number,
  pad = 20
): { x: number; y: number }[][] {
  const valid = allPoints.filter((p): p is GeoPoint[] => !!p);
  if (valid.length === 0 || valid.every(p => p.length === 0)) return [];
  const flat = valid.filter(p => p.length > 0).flat();
  const lats = flat.map(p => p.lat);
  const lngs = flat.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = (maxLat - minLat) || 0.0001;
  const lngRange = (maxLng - minLng) || 0.0001;
  const uw = w - pad * 2;
  const uh = h - pad * 2;
  return valid.map(pts =>
    pts.filter(p => p.lat !== 0 || p.lng !== 0).map(p => ({
      x: pad + ((p.lng - minLng) / lngRange) * uw,
      y: pad + ((maxLat - p.lat) / latRange) * uh,
    }))
  );
}

function calcArea(points: GeoPoint[] | undefined | null): { sqM: number; display: string } {
  if (!points || points.length < 3) return { sqM: 0, display: '0 m²' };
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

interface MapEntry {
  land: FarmLand;
  plots: FarmArea[];
}

interface TooltipInfo {
  type: 'land' | 'plot';
  name: string;
  area: string;
  tag?: string;
  color: string;
  x: number;
  y: number;
}

interface DistMeasure {
  a: { x: number; y: number; latlng: GeoPoint } | null;
  b: { x: number; y: number; latlng: GeoPoint } | null;
}

interface InteractiveMapProps {
  mapData: MapEntry[];
  height?: number;
  selectedPlotId?: string;
  selectedLandId?: string;
  onSelectPlot?: (plot: FarmArea | null) => void;
  onSelectLand?: (land: FarmLand | null) => void;
  readOnly?: boolean;
}

export function InteractiveMap({
  mapData,
  height = CANVAS_H,
  selectedPlotId,
  selectedLandId,
  onSelectPlot,
  onSelectLand,
}: InteractiveMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [layers, setLayers] = useState({
    landPerimeters: true,
    plotFills: true,
    plotLabels: true,
    grid: true,
  });
  const [distTool, setDistTool] = useState<DistMeasure>({ a: null, b: null });
  const [showDist, setShowDist] = useState(false);

  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const lastTouchDist = useRef(0);

  const filteredMapData = searchTerm
    ? mapData
        .map(m => ({
          land: m.land,
          plots: m.plots.filter(p =>
            p.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.rowDetails || []).some(r => r.cropName.toLowerCase().includes(searchTerm.toLowerCase()))
          ),
        }))
        .filter(m => m.plots.length > 0 || m.land.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : mapData;

  const allPolys = gpsToSvgAll(
    filteredMapData.flatMap(m => [m.land.points, ...m.plots.map(p => p.points)]),
    CANVAS_W, CANVAS_H, 15
  );

  const svgToGps = useCallback((svgX: number, svgY: number): GeoPoint | null => {
    const valid = filteredMapData.flatMap(m => [m.land.points, ...m.plots.map(p => p.points)]).filter((p): p is GeoPoint[] => !!p && p.length > 0);
    if (valid.length === 0) return null;
    const flat = valid.flat();
    const lats = flat.map(p => p.lat);
    const lngs = flat.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = (maxLat - minLat) || 0.0001;
    const lngRange = (maxLng - minLng) || 0.0001;
    const uw = CANVAS_W - 30;
    const uh = CANVAS_H - 30;
    const lng = minLng + ((svgX - 15) / uw) * lngRange;
    const lat = maxLat - ((svgY - 15) / uh) * latRange;
    return { lat, lng };
  }, [filteredMapData]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setZoom(z => Math.max(0.3, Math.min(10, z * factor)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragging.current = true;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && dragging.current) {
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist.current > 0) {
        const factor = dist / lastTouchDist.current;
        setZoom(z => Math.max(0.3, Math.min(10, z * factor)));
      }
      lastTouchDist.current = dist;
    }
  }, []);

  const handleTouchEnd = useCallback(() => { dragging.current = false; lastTouchDist.current = 0; }, []);

  function resetView() { setZoom(1); setPan({ x: 0, y: 0 }); setDistTool({ a: null, b: null }); setShowDist(false); setSelectedId(null); }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (dragging.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const svgY = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    const unX = (svgX - pan.x) / zoom;
    const unY = (svgY - pan.y) / zoom;

    if (showDist) {
      const gps = svgToGps(unX, unY);
      if (gps) {
        if (!distTool.a) {
          setDistTool({ a: { x: unX, y: unY, latlng: gps }, b: null });
        } else if (!distTool.b) {
          setDistTool(prev => ({ ...prev, b: { x: unX, y: unY, latlng: gps } }));
        } else {
          setDistTool({ a: { x: unX, y: unY, latlng: gps }, b: null });
        }
      }
      return;
    }

    // Hit-test plots (reverse order so topmost is checked first)
    let polyOffset = 0;
    for (const m of filteredMapData) {
      polyOffset += 1; // skip land
      for (let pi = 0; pi < m.plots.length; pi++) {
        const svgPts = allPolys[polyOffset + pi];
        if (svgPts && pointInPolygon(unX, unY, svgPts)) {
          setSelectedId(m.plots[pi].id);
          onSelectPlot?.(m.plots[pi]);
          return;
        }
      }
      polyOffset += m.plots.length;
    }
    // Hit-test lands
    polyOffset = 0;
    for (const m of filteredMapData) {
      const landSvg = allPolys[polyOffset];
      if (landSvg && pointInPolygon(unX, unY, landSvg)) {
        setSelectedId(m.land.id);
        onSelectLand?.(m.land);
        return;
      }
      polyOffset += 1 + m.plots.length;
    }
    setSelectedId(null);
    onSelectPlot?.(null);
    onSelectLand?.(null);
  }

  function pointInPolygon(px: number, py: number, pts: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function handlePolyHover(e: React.MouseEvent, entry: MapEntry, type: 'land' | 'plot', plotIdx?: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const svgY = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    const info: TooltipInfo = {
      type,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
      color: '',
      name: '',
      area: '',
    };
    if (type === 'land') {
      info.name = entry.land.name;
      info.area = entry.land.areaDisplay || calcArea(entry.land.points).display;
      info.color = entry.land.color || '#333';
    } else if (plotIdx !== undefined && entry.plots[plotIdx]) {
      const p = entry.plots[plotIdx];
      info.name = p.name || p.tag;
      info.area = p.areaDisplay || calcArea(p.points).display;
      info.color = p.color || COLORS[plotIdx % COLORS.length];
      info.tag = p.tag;
    }
    setTooltip(info);
  }

  function clearTooltip() { setTooltip(null); }

  async function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(CANVAS_W * 2));
    clone.setAttribute('height', String(CANVAS_H * 2));
    clone.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);
    const svgStr = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_W * 2;
      canvas.height = CANVAS_H * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#fafaf5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(pngBlob => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = 'farm-map.png';
        a.click();
        URL.revokeObjectURL(pngUrl);
        URL.revokeObjectURL(url);
      });
    };
    img.src = url;
  }

  const distMeters = (distTool.a && distTool.b)
    ? haversineMeters(distTool.a.latlng, distTool.b.latlng).toFixed(1)
    : null;

  // Collect legend entries
  const legendEntries: { tag: string; color: string; name: string }[] = [];
  for (const m of mapData) {
    for (const p of m.plots) {
      legendEntries.push({ tag: p.tag, color: p.color || COLORS[legendEntries.length % COLORS.length], name: p.name });
    }
  }

  const activeHeight = fullscreen ? 'calc(100dvh - 100px)' : height;

  // ─── RENDER ───
  const mapSvg = (
    <svg
      ref={svgRef}
      width="100%"
      height={activeHeight}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      className="bg-[#fafaf5] cursor-grab active:cursor-grabbing"
      style={{ minHeight: 250 }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { handleMouseUp(); clearTooltip(); }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleSvgClick}
    >
      {layers.grid && (
        <defs>
          <pattern id="ig-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e5e0" strokeWidth="0.5" />
          </pattern>
        </defs>
      )}
      {layers.grid && <rect width={CANVAS_W} height={CANVAS_H} fill="url(#ig-grid)" />}

      <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: '0 0' }}>
        {(() => {
          let polyOffset = 0;
          return filteredMapData.map((m) => {
            const landSvg = allPolys[polyOffset] || [];
            polyOffset += 1;
            const plotSvgs = allPolys.slice(polyOffset, polyOffset + m.plots.length);
            polyOffset += m.plots.length;
            if (!landSvg.length) return null;
            const landPolyStr = landSvg.map(p => `${p.x},${p.y}`).join(' ');
            const landCx = landSvg.reduce((a, p) => a + p.x, 0) / landSvg.length;
            const landCy = landSvg.reduce((a, p) => a + p.y, 0) / landSvg.length;
            const landHighlight = selectedId === m.land.id || selectedLandId === m.land.id;

            return (
              <g key={m.land.id}>
                {layers.landPerimeters && (
                  <polygon
                    points={landPolyStr}
                    fill="rgba(0,0,0,0.04)"
                    stroke={landHighlight ? '#2d6a2d' : '#333'}
                    strokeWidth={landHighlight ? 3 : 2}
                    strokeDasharray="6,3"
                    onMouseMove={e => handlePolyHover(e, m, 'land')}
                    onMouseLeave={clearTooltip}
                  />
                )}
                <text x={landCx} y={landCy - 8} textAnchor="middle" fontSize="10" fill="#666" fontStyle="italic">
                  {m.land.name} ({m.land.areaDisplay || calcArea(m.land.points).display})
                </text>
                {plotSvgs.map((svgPts, i) => {
                  if (!svgPts.length) return null;
                  const polyStr = svgPts.map(p => `${p.x},${p.y}`).join(' ');
                  const centroid = svgPts.reduce(
                    (a, p) => ({ x: a.x + p.x / svgPts.length, y: a.y + p.y / svgPts.length }),
                    { x: 0, y: 0 }
                  );
                  const plot = m.plots[i];
                  const color = plot?.color || COLORS[i % COLORS.length];
                  const highlight = selectedId === plot?.id || selectedPlotId === plot?.id;
                  return (
                    <g key={plot?.id || `plot-${i}`}>
                      {layers.plotFills && (
                        <polygon
                          points={polyStr}
                          fill={color + (highlight ? '70' : '40')}
                          stroke={highlight ? '#2d6a2d' : color}
                          strokeWidth={highlight ? 3 : 1.5}
                          onMouseMove={e => handlePolyHover(e, m, 'plot', i)}
                          onMouseLeave={clearTooltip}
                        />
                      )}
                      {layers.plotLabels && (
                        <text
                          x={centroid.x}
                          y={centroid.y}
                          textAnchor="middle"
                          fontSize="8"
                          fill="#333"
                          fontWeight="bold"
                        >
                          {plot?.tag || ''}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          });
        })()}

        {/* Distance measurement line */}
        {showDist && distTool.a && (
          <line
            x1={distTool.a.x}
            y1={distTool.a.y}
            x2={distTool.b ? distTool.b.x : distTool.a.x}
            y2={distTool.b ? distTool.b.y : distTool.a.y}
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5,3"
          />
        )}
        {showDist && distTool.a && (
          <circle cx={distTool.a.x} cy={distTool.a.y} r={5} fill="#f59e0b" stroke="white" strokeWidth={2} />
        )}
        {showDist && distTool.b && (
          <circle cx={distTool.b.x} cy={distTool.b.y} r={5} fill="#f59e0b" stroke="white" strokeWidth={2} />
        )}
      </g>
    </svg>
  );

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={resetView} className="text-[10px] px-2 py-1 rounded border bg-white text-gray-500 hover:bg-gray-50" title="Reset view">Reset</button>
        <button onClick={() => setFullscreen(f => !f)} className="text-[10px] px-2 py-1 rounded border bg-white text-gray-500 hover:bg-gray-50">
          {fullscreen ? 'Exit Full' : 'Fullscreen'}
        </button>
        <button onClick={() => setShowSearch(s => !s)} className={`text-[10px] px-2 py-1 rounded border ${showSearch ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-500'}`}>
          Search
        </button>
        <button onClick={() => setShowLegend(s => !s)} className={`text-[10px] px-2 py-1 rounded border ${showLegend ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-500'}`}>
          Legend
        </button>
        <button onClick={() => setShowLayers(s => !s)} className={`text-[10px] px-2 py-1 rounded border ${showLayers ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-500'}`}>
          Layers
        </button>
        <button onClick={() => { setShowDist(d => !d); if (!showDist) setDistTool({ a: null, b: null }); }} className={`text-[10px] px-2 py-1 rounded border ${showDist ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-gray-500'}`}>
          {showDist ? 'Dist: ON' : 'Measure'}
        </button>
        <button onClick={exportPng} className="text-[10px] px-2 py-1 rounded border bg-white text-gray-500 hover:bg-gray-50" title="Export as PNG">
          Export PNG
        </button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="relative">
          <input
            type="text"
            placeholder="Search plot tag, name or crop..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full border rounded-lg px-3 py-1.5 text-sm pl-8"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">✕</button>
          )}
        </div>
      )}

      {/* Legend */}
      {showLegend && legendEntries.length > 0 && (
        <div className="bg-white border rounded-lg p-2 max-h-32 overflow-y-auto text-xs space-y-1">
          {legendEntries.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: e.color }} />
              <span className="font-medium">{e.tag}</span>
              {e.name && <span className="text-gray-500">— {e.name}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Layer toggles */}
      {showLayers && (
        <div className="bg-white border rounded-lg p-2 text-xs space-y-1">
          {(['landPerimeters', 'grid', 'plotFills', 'plotLabels'] as const).map(key => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={layers[key]} onChange={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))} className="accent-green-600" />
              <span>{key === 'landPerimeters' ? 'Land perimeters' : key === 'plotFills' ? 'Plot fills' : key === 'plotLabels' ? 'Plot labels' : 'Grid'}</span>
            </label>
          ))}
        </div>
      )}

      {/* Distance info */}
      {showDist && distMeters && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs flex items-center justify-between">
          <span className="font-semibold text-amber-800">Distance: {distMeters} m</span>
          <button onClick={() => setDistTool({ a: null, b: null })} className="text-amber-600 hover:underline">Clear</button>
        </div>
      )}

      {/* Map area */}
      <div
        className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden select-none"
        style={{ touchAction: 'none' }}
      >
        {mapSvg}

        {/* Footer with zoom slider */}
        <div className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100 flex items-center gap-3">
          <span className="shrink-0">🖱️ Drag · Scroll</span>
          <div className="flex items-center gap-2 flex-1 max-w-[200px]">
            <span className="shrink-0">−</span>
            <input
              type="range"
              min="0.3"
              max="10"
              step="0.1"
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="w-full h-1 accent-green-600 cursor-pointer"
            />
            <span className="shrink-0">+</span>
          </div>
          <span className="ml-auto font-mono">{zoom.toFixed(1)}x</span>
        </div>
      </div>

      {/* Tooltip overlay */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 4 }}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tooltip.color }} />
            <span className="font-semibold">{tooltip.name}</span>
          </div>
          <p className="text-gray-300">{tooltip.type === 'plot' ? `${tooltip.tag} · ` : ''}{tooltip.area}</p>
        </div>
      )}

      {!fullscreen && (
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          {legendEntries.length > 0 && <span>{legendEntries.length} plot{legendEntries.length !== 1 ? 's' : ''}</span>}
          <span>{mapData.length} land{mapData.length !== 1 ? 's' : ''}</span>
          {selectedId && <span className="text-green-700 font-semibold">Selected: {selectedId}</span>}
        </div>
      )}
    </div>
  );
}
