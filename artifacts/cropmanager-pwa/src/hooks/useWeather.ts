import { useState, useEffect } from 'react';
import { fetchWeather, getCachedWeather, getWeatherCacheAge } from '../lib/weather';
import type { DayForecast } from '../types';
import { useAppStore } from '../store/useAppStore';

export function useWeather() {
  const { settings } = useAppStore();
  const lat = settings.weatherLat;
  const lon = settings.weatherLon;
  const [forecasts, setForecasts] = useState<DayForecast[]>(() => getCachedWeather(lat, lon) ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheAge, setCacheAge] = useState<number | null>(() => getWeatherCacheAge(lat, lon));

  useEffect(() => {
    let alive = true;
    // Show whatever is cached for this location straight away so a stale
    // forecast from a previous position never appears after moving.
    setForecasts(getCachedWeather(lat, lon) ?? []);
    setCacheAge(getWeatherCacheAge(lat, lon));
    setError(null);
    setLoading(true);
    fetchWeather(lat, lon, 7)
      .then(data => { if (alive) { setForecasts(data); setCacheAge(0); setError(null); } })
      .catch(err => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [lat, lon]);

  return { forecasts, loading, error, cacheAge };
}
