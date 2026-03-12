import { useState, useEffect } from 'react';
import { fetchWeather, getCachedWeather, getWeatherCacheAge } from '../lib/weather';
import type { DayForecast } from '../types';
import { useAppStore } from '../store/useAppStore';

export function useWeather() {
  const { settings } = useAppStore();
  const [forecasts, setForecasts] = useState<DayForecast[]>(() => getCachedWeather() ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheAge, setCacheAge] = useState<number | null>(getWeatherCacheAge());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchWeather(settings.weatherLat, settings.weatherLon, 7)
      .then(data => { if (alive) { setForecasts(data); setCacheAge(0); setError(null); } })
      .catch(err => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [settings.weatherLat, settings.weatherLon]);

  return { forecasts, loading, error, cacheAge };
}
