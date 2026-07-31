import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { todayLocalIso } from './dates';

const SUN_CACHE_KEY = 'tt-sun-cache';

const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

export function weatherDescFromCode(code) {
  return WEATHER_CODES[code] || 'Unknown conditions';
}

async function fetchWeatherForCoords(latitude, longitude) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude + '&current_weather=true&temperature_unit=celsius&windspeed_unit=kmh';
  const res = await fetch(url);
  const data = await res.json();
  const cw = data.current_weather;
  if (!cw) throw new Error('Could not read weather data — enter manually');
  return Math.round(cw.temperature) + '°C, ' + weatherDescFromCode(cw.weathercode) + ', Wind ' + Math.round(cw.windspeed) + ' km/h';
}

/**
 * Resolves to a human-readable weather string, e.g. "28°C, Partly cloudy, Wind 12 km/h".
 * Rejects with a short user-facing message on permission denial / no support / network failure.
 * Uses the native Geolocation plugin when running as an installed app (more reliable
 * permission prompt than the browser API inside a WebView); falls back to
 * navigator.geolocation when running as a plain web page.
 */
export async function getWeatherString() {
  if (Capacitor.isNativePlatform()) {
    let pos;
    try {
      pos = await Geolocation.getCurrentPosition({ timeout: 10000 });
    } catch (e) {
      throw new Error('Location permission denied — enter weather manually');
    }
    return fetchWeatherForCoords(pos.coords.latitude, pos.coords.longitude);
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location not supported on this device — enter weather manually'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          resolve(await fetchWeatherForCoords(pos.coords.latitude, pos.coords.longitude));
        } catch (e) {
          reject(new Error('Weather lookup failed — check connection'));
        }
      },
      () => reject(new Error('Location permission denied — enter weather manually')),
      { timeout: 10000 },
    );
  });
}

async function getCurrentCoordsSilent() {
  if (Capacitor.isNativePlatform()) {
    const pos = await Geolocation.getCurrentPosition({ timeout: 10000 });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  }
  if (!navigator.geolocation) throw new Error('Location not supported on this device');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => reject(new Error('Location permission denied')),
      { timeout: 10000 },
    );
  });
}

async function fetchSunTimes(latitude, longitude) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude + '&daily=sunrise,sunset&timezone=auto&forecast_days=1';
  const res = await fetch(url);
  const data = await res.json();
  const sunrise = data && data.daily && data.daily.sunrise && data.daily.sunrise[0];
  const sunset = data && data.daily && data.daily.sunset && data.daily.sunset[0];
  if (!sunrise || !sunset) throw new Error('Could not read sun times');
  return { sunrise: new Date(sunrise).getTime(), sunset: new Date(sunset).getTime() };
}

/**
 * Resolves to `{ lat, lon, sunrise, sunset, day }` (sunrise/sunset as epoch-ms)
 * for today, or `null` if location is unavailable, denied, or offline — never
 * throws, since ThemeContext's auto tier falls back to prefers-color-scheme
 * when this comes back empty. Cached in localStorage per calendar day so the
 * 5-minute tier re-check and visibilitychange re-check don't refetch.
 */
export async function getSunTimes() {
  const today = todayLocalIso();
  try {
    const cached = JSON.parse(localStorage.getItem(SUN_CACHE_KEY) || 'null');
    if (cached && cached.day === today && Number.isFinite(cached.sunrise) && Number.isFinite(cached.sunset)) {
      return cached;
    }
  } catch {
    // Corrupt cache entry — fall through and refetch.
  }

  try {
    const { latitude, longitude } = await getCurrentCoordsSilent();
    const { sunrise, sunset } = await fetchSunTimes(latitude, longitude);
    const entry = { lat: latitude, lon: longitude, sunrise, sunset, day: today };
    localStorage.setItem(SUN_CACHE_KEY, JSON.stringify(entry));
    return entry;
  } catch {
    return null;
  }
}
