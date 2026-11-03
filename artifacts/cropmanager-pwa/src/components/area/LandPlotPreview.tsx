import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { InteractiveMap } from './InteractiveMap';
import type { FarmArea, FarmLand, FarmPoint } from '../../types';

export function LandPlotPreview() {
  const lands = useLiveQuery(() => db.farmLands.toArray(), []);
  const allPlots = useLiveQuery(() => db.farmAreas.toArray(), []);
  const allPoints = useLiveQuery(() => db.farmPoints.toArray().catch((): FarmPoint[] => []), []);
  const isLoading = lands === undefined || allPlots === undefined || allPoints === undefined;

  const mappedLands = (lands ?? []).filter(l => l.points?.length >= 3);
  const mapData: { land: FarmLand; plots: FarmArea[] }[] = mappedLands
    .map(land => ({
      land,
      plots: (allPlots ?? []).filter(p => p.landId === land.id && p.points?.length >= 3),
    }));
  const visiblePoints = (allPoints ?? []).filter(pt => mappedLands.some(l => l.id === pt.landId));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[300px] bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="w-8 h-8 border-2 border-[#2d6a2d] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (mapData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] bg-white rounded-2xl border border-gray-200 shadow-sm text-gray-400">
        <p className="text-3xl mb-2">🗺️</p>
        <p className="text-sm font-medium">No lands mapped yet</p>
        <p className="text-xs mt-1">Go to Area Mapper to add your first land</p>
      </div>
    );
  }

  return <InteractiveMap mapData={mapData} points={visiblePoints} />;
}
