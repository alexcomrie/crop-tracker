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
      <div className="bg-gradient-to-br from-[#2d6a2d] to-[#3d7a3d] rounded-2xl p-4 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="weather-left">
            <h2 className="text-3xl font-bold leading-none">
              {today.tempMax}° · {today.precipMm}mm
            </h2>
            <p className="text-sm opacity-80 mt-1">{settings.weatherLocation} · Today</p>
          </div>
          <div className="weather-right text-right">
            <div className="text-3xl mb-1">{today.emoji}</div>
            <p className="text-xs opacity-75">{today.label}</p>
          </div>
        </div>
        
        <div className="flex justify-between mt-4 pt-4 border-t border-white/10">
          {forecasts.slice(1, 5).map(f => (
            <div key={f.date} className="text-center">
              <p className="text-lg mb-1">{f.emoji}</p>
              <p className="text-xs font-bold">{f.tempMax}°</p>
              <p className="text-[10px] opacity-60 uppercase">{f.date.split('-').slice(1).join('/')}</p>
            </div>
          ))}
        </div>
      </div>
      {warnings.map((w, i) => (
        <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 shadow-sm">{w}</div>
      ))}
    </div>
  );
}
