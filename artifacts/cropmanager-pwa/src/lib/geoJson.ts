import type { FarmLand, FarmArea, GeoPoint } from '../types';

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

function fromGeoJsonCoords(coords: number[][][]): GeoPoint[] {
  return coords[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
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
      const points = fromGeoJsonCoords(f.geometry.coordinates);
      return {
        name: (f.properties?.name as string) || 'Imported Land',
        points,
        areaSqM: 0,
        areaDisplay: '',
        color: (f.properties?.color as string) || '#4CAF50',
      };
    });
}

export function geoJsonToPlots(fc: GeoJsonFeatureCollection, landId: string): Omit<FarmArea, 'id' | 'createdAt' | 'updatedAt'>[] {
  return fc.features
    .filter(f => f.properties?.type === 'plot' || f.properties?.type === undefined)
    .map(f => {
      const points = fromGeoJsonCoords(f.geometry.coordinates);
      return {
        landId,
        tag: (f.properties?.tag as string) || '',
        name: (f.properties?.name as string) || '',
        points,
        areaSqM: 0,
        areaDisplay: '',
        color: (f.properties?.color as string) || '#2196F3',
        status: 'unmapped' as const,
        rowCount: 0,
        rowSpacing: 12,
        rowDetails: [],
        cropAssignments: [],
        plantingMethod: '',
        notes: '',
      };
    });
}
