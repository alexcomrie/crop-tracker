import React from 'react';
import { MapContainer, TileLayer, Polygon, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FarmLand, FarmArea } from '../../types';
import { landsToGeoJson, plotsToGeoJson, exportGeoJson } from '../../lib/geoJson';
import { Layers, Maximize2, Download } from 'lucide-react';

// Fix Leaflet default marker icon issue with bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapEntry {
  land: FarmLand;
  plots: FarmArea[];
}

interface LeafletMapViewProps {
  mapData: MapEntry[];
  height?: number;
  selectedPlotId?: string;
  selectedLandId?: string;
  onSelectPlot?: (plot: FarmArea | null) => void;
  onSelectLand?: (land: FarmLand | null) => void;
  tileLayer?: 'street' | 'satellite';
  showGps?: boolean;
}

const STREET_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const STREET_ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';
const SATELLITE_ATTR = '&copy; <a href="https://esri.com">Esri</a>';

const PLOT_COLORS = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#795548', '#607D8B'];

function getPlotColor(index: number): string {
  return PLOT_COLORS[index % PLOT_COLORS.length];
}

function GpsMarker() {
  const map = useMap();
  const [position, setPosition] = React.useState<[number, number] | null>(null);

  React.useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPosition(p);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  if (!position) return null;

  return (
    <Marker position={position} icon={L.divIcon({
      className: 'gps-marker',
      html: '<div style="width:16px;height:16px;background:#3B82F6;border:3px solid white;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,0.4);" />',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })}>
      <Popup>You are here</Popup>
    </Marker>
  );
}

function FitBounds({ mapData }: { mapData: MapEntry[] }) {
  const map = useMap();
  React.useEffect(() => {
    const allPoints: [number, number][] = [];
    for (const entry of mapData) {
      for (const p of entry.land.points) allPoints.push([p.lat, p.lng]);
      for (const plot of entry.plots) {
        for (const p of plot.points) allPoints.push([p.lat, p.lng]);
      }
    }
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    }
  }, [map, mapData]);
  return null;
}

export function LeafletMapView({
  mapData,
  height = 400,
  selectedPlotId,
  selectedLandId,
  onSelectPlot,
  onSelectLand,
  tileLayer: initialTileLayer = 'street',
  showGps = false,
}: LeafletMapViewProps) {
  const [tileLayer, setTileLayer] = React.useState<'street' | 'satellite'>(initialTileLayer);
  const [fullscreen, setFullscreen] = React.useState(false);
  const mapRef = React.useRef<HTMLDivElement>(null);

  const defaultCenter: [number, number] = mapData.length > 0 && mapData[0].land.points.length > 0
    ? [mapData[0].land.points[0].lat, mapData[0].land.points[0].lng]
    : [18.4358, -77.2010];

  const toggleFullscreen = () => {
    if (!fullscreen) {
      mapRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setFullscreen(!fullscreen);
  };

  const handleExportGeoJson = () => {
    const lands = mapData.map(e => e.land);
    const plots = mapData.flatMap(e => e.plots);
    const allFeatures = [...landsToGeoJson(lands).features, ...plotsToGeoJson(plots).features];
    exportGeoJson({ type: 'FeatureCollection', features: allFeatures }, 'farm-areas.geojson');
  };

  const handlePolygonClick = (entry: MapEntry, type: 'land' | 'plot', id: string) => {
    if (type === 'land' && onSelectLand) {
      onSelectLand(entry.land);
    } else if (type === 'plot' && onSelectPlot) {
      const plot = entry.plots.find(p => p.id === id);
      if (plot) onSelectPlot(plot);
    }
  };

  return (
    <div className="relative" style={{ height }}>
      {/* Controls overlay */}
      <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
        <button
          onClick={() => setTileLayer(t => t === 'street' ? 'satellite' : 'street')}
          className="w-9 h-9 bg-white rounded-lg shadow flex items-center justify-center hover:bg-gray-50 text-xs font-medium"
          title={`Switch to ${tileLayer === 'street' ? 'satellite' : 'street'}`}
        >
          <Layers className="w-4 h-4 text-gray-600" />
        </button>
        <button
          onClick={handleExportGeoJson}
          className="w-9 h-9 bg-white rounded-lg shadow flex items-center justify-center hover:bg-gray-50"
          title="Export GeoJSON"
        >
          <Download className="w-4 h-4 text-gray-600" />
        </button>
        <button
          onClick={toggleFullscreen}
          className="w-9 h-9 bg-white rounded-lg shadow flex items-center justify-center hover:bg-gray-50"
          title="Fullscreen"
        >
          <Maximize2 className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden">
        <MapContainer
          center={defaultCenter}
          zoom={15}
          className="w-full h-full"
          zoomControl={true}
        >
          <TileLayer
            url={tileLayer === 'street' ? STREET_TILES : SATELLITE_TILES}
            attribution={tileLayer === 'street' ? STREET_ATTR : SATELLITE_ATTR}
            maxZoom={20}
          />

          <FitBounds mapData={mapData} />

          {mapData.map((entry) => (
            <React.Fragment key={entry.land.id}>
              {/* Land polygon */}
              {entry.land.points.length >= 3 && (
                <Polygon
                  positions={entry.land.points.map(p => [p.lat, p.lng])}
                  pathOptions={{
                    color: entry.land.color || '#666',
                    weight: 2,
                    fillColor: entry.land.color || '#666',
                    fillOpacity: 0.08,
                    dashArray: '8 4',
                  }}
                  eventHandlers={{
                    click: () => handlePolygonClick(entry, 'land', entry.land.id),
                  }}
                />
              )}
              {/* Plot polygons */}
              {entry.plots.map((plot, idx) => (
                plot.points.length >= 3 && (
                  <Polygon
                    key={plot.id}
                    positions={plot.points.map(p => [p.lat, p.lng])}
                    pathOptions={{
                      color: plot.color || getPlotColor(idx),
                      weight: 2,
                      fillColor: plot.color || getPlotColor(idx),
                      fillOpacity: selectedPlotId === plot.id ? 0.35 : 0.15,
                    }}
                    eventHandlers={{
                      click: () => handlePolygonClick(entry, 'plot', plot.id),
                    }}
                  >
                    <Popup>
                      <div className="text-xs">
                        <p className="font-bold">{plot.tag || plot.name}</p>
                        <p className="text-gray-500">{plot.areaDisplay}</p>
                        {plot.cropAssignments.length > 0 && (
                          <p className="mt-1">{plot.cropAssignments.map(c => c.cropName).join(', ')}</p>
                        )}
                      </div>
                    </Popup>
                  </Polygon>
                )
              ))}
            </React.Fragment>
          ))}

          {showGps && <GpsMarker />}
        </MapContainer>
      </div>

      {/* Tile layer label */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-white/80 rounded px-2 py-0.5 text-[10px] text-gray-500">
        {tileLayer === 'street' ? 'OpenStreetMap' : 'Satellite'}
      </div>
    </div>
  );
}
