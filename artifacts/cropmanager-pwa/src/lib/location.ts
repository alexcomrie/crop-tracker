export interface DeviceLocation {
  lat: number;
  lon: number;
  accuracy: number;
}

export interface ResolvedLocation {
  lat: number;
  lon: number;
  accuracy: number | null;
  name: string;
}

/** Best-effort readable place name for a coordinate pair. */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`);
    const data = await res.json();
    const candidates = [
      data.locality,
      data.city,
      data.principalSubdivision,
      data.countryName,
    ].filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0);
    const unique = candidates.filter((v, i) => candidates.indexOf(v) === i);
    return unique.slice(0, 2).join(', ') || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

/** Ask the device for a GPS fix. Rejects with a friendly message. */
export function getDeviceLocation(): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location is not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: Number(pos.coords.latitude.toFixed(6)),
        lon: Number(pos.coords.longitude.toFixed(6)),
        accuracy: Math.round(pos.coords.accuracy),
      }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Enable it in your browser settings, or enter coordinates manually.'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'Location is unavailable right now. Move outdoors or enter coordinates manually.'
              : 'Getting your location timed out. Try again or enter coordinates manually.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/** GPS fix plus a readable name, used by Settings and first-run setup. */
export async function resolveCurrentLocation(): Promise<ResolvedLocation> {
  const loc = await getDeviceLocation();
  const name = await reverseGeocode(loc.lat, loc.lon);
  return { ...loc, name };
}
