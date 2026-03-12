import React from 'react';
import { useWeather } from '../../hooks/useWeather';
import { getSprayWeatherWarnings } from '../../lib/weather';
import { useAppStore } from '../../store/useAppStore';

export function WeatherWidget() {
  const { forecasts, loading, error, cacheAge } = useWeather();
  const { settings } = useAppStore();

  if (loading && forecasts.length === 0) {
    return (
      <div className="bg-blue-50 rounded-xl p-3 animate-pulse">
        <div className="h-4 bg-blue-200 rounded w-3/4 mb-2" />
        <div className="h-6 bg-blue-200 rounded w-1/2" />
      </div>
    );
  }

  if (error && forecasts.length === 0) {
    return <div className="bg-gray-100 rounded-xl p-3 text-sm text-gray-500">Weather unavailable</div>;
  }

  const today = forecasts[0];
  if (!today) return null;

  const warnings = getSprayWeatherWarnings(forecasts, settings.rainThresholdMm);

  return (
    <div className="space-y-2">
      <div className="bg-blue-50 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{settings.weatherLocation}</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{today.emoji}</span>
              <div>
                <p className="font-semibold">{today.tempMax}° / {today.tempMin}°C</p>
                <p className="text-xs text-muted-foreground">{today.label}{today.precipMm > 0 ? ` · ${today.precipMm}mm rain` : ''}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            {forecasts.slice(1, 5).map(f => (
              <div key={f.date} className="text-center px-1">
                <p className="text-xs">{f.emoji}</p>
                <p className="text-xs font-medium">{f.tempMax}°</p>
                <p className="text-xs text-muted-foreground">{f.date.slice(5)}</p>
              </div>
            ))}
          </div>
        </div>
        {cacheAge !== null && cacheAge > 0 && (
          <p className="text-xs text-muted-foreground mt-1">Updated {cacheAge}m ago</p>
        )}
      </div>
      {warnings.map((w, i) => (
        <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-sm text-amber-800">{w}</div>
      ))}
    </div>
  );
}
