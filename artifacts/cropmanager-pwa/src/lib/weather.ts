import type { DayForecast } from '../types';

const CACHE_PREFIX = 'cropmanager_weather_cache';
const CACHE_TTL = 3600 * 1000; // 1 hour

/** Cache key rounded to ~100m so tiny GPS jitter does not miss the cache. */
function cacheKey(lat: number, lon: number): string {
  return `${CACHE_PREFIX}:${lat.toFixed(3)}:${lon.toFixed(3)}`;
}

export function weatherCodeLabel(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 49) return 'Foggy';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

export function weatherCodeEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 49) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  if (code <= 99) return '⛈️';
  return '🌡️';
}

export async function fetchWeather(lat: number, lon: number, days = 7): Promise<DayForecast[]> {
  const cached = getCachedWeather(lat, lon);
  if (cached) return cached;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=America%2FJamaica&forecast_days=${days}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  const data = await res.json();

  const forecasts: DayForecast[] = data.daily.time.map((date: string, i: number) => ({
    date,
    tempMax: Math.round(data.daily.temperature_2m_max[i]),
    tempMin: Math.round(data.daily.temperature_2m_min[i]),
    precipMm: Math.round((data.daily.precipitation_sum[i] || 0) * 10) / 10,
    weatherCode: data.daily.weathercode[i],
    label: weatherCodeLabel(data.daily.weathercode[i]),
    emoji: weatherCodeEmoji(data.daily.weathercode[i]),
  }));

  localStorage.setItem(cacheKey(lat, lon), JSON.stringify({ data: forecasts, ts: Date.now() }));
  return forecasts;
}

export function getCachedWeather(lat: number, lon: number): DayForecast[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(lat, lon));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

export function getWeatherCacheAge(lat: number, lon: number): number | null {
  try {
    const raw = localStorage.getItem(cacheKey(lat, lon));
    if (!raw) return null;
    const { ts } = JSON.parse(raw);
    return Math.round((Date.now() - ts) / 60000);
  } catch { return null; }
}

export function getSprayWeatherWarnings(
  forecasts: DayForecast[],
  rainThresholdMm: number
): string[] {
  const warnings: string[] = [];
  const next48 = forecasts.slice(0, 2);
  next48.forEach(f => {
    if (f.precipMm > rainThresholdMm) {
      warnings.push(`⚠️ Rain expected on ${f.date}: ${f.precipMm}mm — consider postponing sprays`);
    }
  });
  return warnings;
}
