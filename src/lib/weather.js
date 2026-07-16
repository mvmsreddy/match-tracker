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

/**
 * Resolves to a human-readable weather string, e.g. "28°C, Partly cloudy, Wind 12 km/h".
 * Rejects with a short user-facing message on permission denial / no support / network failure.
 */
export function getWeatherString() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location not supported on this device — enter weather manually'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude + '&current_weather=true&temperature_unit=celsius&windspeed_unit=kmh';
          const res = await fetch(url);
          const data = await res.json();
          const cw = data.current_weather;
          if (cw) {
            resolve(Math.round(cw.temperature) + '\u00b0C, ' + weatherDescFromCode(cw.weathercode) + ', Wind ' + Math.round(cw.windspeed) + ' km/h');
          } else {
            reject(new Error('Could not read weather data — enter manually'));
          }
        } catch (e) {
          reject(new Error('Weather lookup failed — check connection'));
        }
      },
      () => reject(new Error('Location permission denied — enter weather manually')),
      { timeout: 10000 },
    );
  });
}
