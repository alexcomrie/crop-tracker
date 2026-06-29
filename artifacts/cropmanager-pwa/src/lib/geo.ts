import type { GeoPoint } from '../types';

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2));
}

export function calcArea(points: GeoPoint[] | undefined | null): { sqM: number; display: string } {
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

export function projectPoints(
  points: GeoPoint[],
  allRefPoints: (GeoPoint[] | undefined | null)[],
  w: number,
  h: number,
  pad: number
): { x: number; y: number }[] {
  const valid = allRefPoints.filter((p): p is GeoPoint[] => !!p && p.length > 0);
  if (valid.length === 0) return [];
  const flat = valid.flat();
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
  return points.filter(p => p.lat !== 0 || p.lng !== 0).map(p => ({
    x: pad + ((p.lng - minLng) / lngRange) * uw,
    y: pad + ((maxLat - p.lat) / latRange) * uh,
  }));
}

export function formatAreaShort(sqm: number): string {
  if (sqm >= 10000) return `${(sqm / 10000).toFixed(2)} ha`;
  if (sqm >= 1) return `${sqm.toFixed(1)} m²`;
  return `${(sqm * 10000).toFixed(0)} cm²`;
}
