import type { FarmLand, FarmArea, GeoPoint, RowDetail, CropAssignment } from '../types';

interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

function toGeoJsonCoords(points: GeoPoint[]): number[][][] {
  return [[...points.map(p => [p.lng, p.lat] as number[]), [points[0].lng, points[0].lat]]];
}

function isFinitePair(pair: unknown): pair is [number, number] {
  return Array.isArray(pair) && pair.length >= 2
    && typeof pair[0] === 'number' && Number.isFinite(pair[0])
    && typeof pair[1] === 'number' && Number.isFinite(pair[1]);
}

// Validated Polygon exterior-ring → points. Returns [] for anything else
// (LineString, MultiPolygon, empty rings, non-finite coords) instead of
// crashing or persisting garbage (M8).
function fromGeoJsonCoords(geometry: unknown): GeoPoint[] {
  if (typeof geometry !== 'object' || geometry === null) return [];
  const g = geometry as { type?: unknown; coordinates?: unknown };
  if (g.type !== 'Polygon' || !Array.isArray(g.coordinates) || g.coordinates.length === 0) return [];
  const ring = g.coordinates[0];
  if (!Array.isArray(ring)) return [];
  const pts = ring
    .filter(isFinitePair)
    .map(([lng, lat]) => ({ lat, lng }));
  // Drop duplicated closing vertex if present
  if (pts.length > 1) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) pts.pop();
  }
  return pts.length >= 3 ? pts : [];
}

export function landsToGeoJson(lands: FarmLand[]): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lands.filter(l => l.points.length >= 3).map(l => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: toGeoJsonCoords(l.points),
      },
      properties: {
        type: 'land',
        id: l.id,
        name: l.name,
        color: l.color,
        areaSqM: l.areaSqM,
        createdAt: l.createdAt,
      },
    })),
  };
}

export function plotsToGeoJson(plots: FarmArea[]): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: plots.filter(p => p.points.length >= 3).map(p => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: toGeoJsonCoords(p.points),
      },
      properties: {
        type: 'plot',
        id: p.id,
        landId: p.landId,
        tag: p.tag,
        name: p.name,
        color: p.color,
        status: p.status,
        areaSqM: p.areaSqM,
        rowCount: p.rowCount,
        rowSpacing: p.rowSpacing,
        plantingMethod: p.plantingMethod,
        notes: p.notes,
        cropAssignments: p.cropAssignments,
        createdAt: p.createdAt,
      },
    })),
  };
}

export function exportGeoJson(data: GeoJsonFeatureCollection, filename = 'farm-areas.geojson') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseGeoJsonFile(file: File): Promise<GeoJsonFeatureCollection> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
          reject(new Error('Invalid GeoJSON: must be a FeatureCollection'));
          return;
        }
        resolve(data as GeoJsonFeatureCollection);
      } catch {
        reject(new Error('Invalid GeoJSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function geoJsonToLands(fc: GeoJsonFeatureCollection): Omit<FarmLand, 'id' | 'createdAt' | 'updatedAt'>[] {
  return fc.features
    .filter(f => f.properties?.type === 'land' || f.properties?.name)
    .map(f => {
      const points = fromGeoJsonCoords(f.geometry as unknown);
      if (points.length < 3) return null;
      return {
        name: (f.properties?.name as string) || 'Imported Land',
        points,
        areaSqM: 0,
        areaDisplay: '',
        color: (f.properties?.color as string) || '#4CAF50',
      };
    })
    .filter((l): l is Omit<FarmLand, 'id' | 'createdAt' | 'updatedAt'> => l !== null);
}

const PLOT_STATUSES = ['unmapped', 'mapped', 'cultivated'] as const;

export function geoJsonToPlots(fc: GeoJsonFeatureCollection, landId: string): Omit<FarmArea, 'id' | 'createdAt' | 'updatedAt'>[] {
  return fc.features
    .filter(f => f.properties?.type === 'plot' || f.properties?.type === undefined)
    .map(f => {
      const points = fromGeoJsonCoords(f.geometry as unknown);
      if (points.length < 3) return null;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const status = PLOT_STATUSES.includes(props['status'] as (typeof PLOT_STATUSES)[number])
        ? (props['status'] as (typeof PLOT_STATUSES)[number])
        : 'unmapped';
      return {
        landId,
        tag: typeof props['tag'] === 'string' ? props['tag'] : '',
        name: typeof props['name'] === 'string' ? props['name'] : '',
        points,
        areaSqM: 0,
        areaDisplay: '',
        color: typeof props['color'] === 'string' ? props['color'] : '#2196F3',
        status,
        rowCount: typeof props['rowCount'] === 'number' ? props['rowCount'] : 0,
        rowSpacing: typeof props['rowSpacing'] === 'number' ? props['rowSpacing'] : 30,
        rowDetails: [] as RowDetail[],
        cropAssignments: [] as CropAssignment[],
        plantingMethod: typeof props['plantingMethod'] === 'string' ? props['plantingMethod'] : '',
        notes: typeof props['notes'] === 'string' ? props['notes'] : '',
      };
    })
    .filter((p): p is Omit<FarmArea, 'id' | 'createdAt' | 'updatedAt'> => p !== null);
}
