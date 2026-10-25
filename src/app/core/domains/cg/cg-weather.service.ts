import { Injectable, signal } from '@angular/core';
import { CG_WEATHER_CACHE_MS } from './cg.constants';

export interface CgWeatherNow {
  tempC: number;
  humidity: number;
  code: number;
  isDay: boolean;
}

export interface CgWeatherPlace {
  name: string;
  label: string;
  lat: number;
  lon: number;
}

interface CacheEntry {
  at: number;
  data: CgWeatherNow;
}

@Injectable({ providedIn: 'root' })
export class CgWeatherService {
  /** Bumped when a fetch lands so every Stage redraws from the same cache. */
  readonly revision = signal(0);

  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<CgWeatherNow | null>>();

  current(lat: number, lon: number): CgWeatherNow | null {
    const hit = this.cache.get(this.key(lat, lon));
    if (!hit) {
      void this.refresh(lat, lon);
      return null;
    }
    if (Date.now() - hit.at > CG_WEATHER_CACHE_MS) {
      void this.refresh(lat, lon);
    }
    return hit.data;
  }

  private key(lat: number, lon: number): string {
    return `${lat.toFixed(3)},${lon.toFixed(3)}`;
  }

  private refresh(lat: number, lon: number): Promise<CgWeatherNow | null> {
    const key = this.key(lat, lon);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const task = this.fetchCurrent(lat, lon)
      .then((data) => {
        if (data) {
          this.cache.set(key, { at: Date.now(), data });
          this.revision.update((value) => value + 1);
        }
        return data;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return task;
  }

  private async fetchCurrent(
    lat: number,
    lon: number,
  ): Promise<CgWeatherNow | null> {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,relative_humidity_2m,weather_code,is_day';
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const body = (await response.json()) as {
        current?: {
          temperature_2m?: number;
          relative_humidity_2m?: number;
          weather_code?: number;
          is_day?: number;
        };
      };
      const current = body.current;
      if (
        !current ||
        typeof current.temperature_2m !== 'number' ||
        typeof current.relative_humidity_2m !== 'number' ||
        typeof current.weather_code !== 'number'
      ) {
        return null;
      }
      return {
        tempC: current.temperature_2m,
        humidity: Math.round(current.relative_humidity_2m),
        code: current.weather_code,
        isDay: current.is_day !== 0,
      };
    } catch {
      return null;
    }
  }

  async search(query: string): Promise<CgWeatherPlace[]> {
    const name = query.trim();
    if (name.length < 2) return [];
    const url =
      'https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=' +
      encodeURIComponent(name);
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const body = (await response.json()) as {
        results?: Array<{
          name?: string;
          country?: string;
          admin1?: string;
          latitude?: number;
          longitude?: number;
        }>;
      };
      return (body.results ?? [])
        .filter(
          (row) =>
            typeof row.name === 'string' &&
            typeof row.latitude === 'number' &&
            typeof row.longitude === 'number',
        )
        .map((row) => ({
          name: row.name as string,
          label: [row.name, row.admin1, row.country].filter(Boolean).join(', '),
          lat: row.latitude as number,
          lon: row.longitude as number,
        }));
    } catch {
      return [];
    }
  }
}

/** WMO weather code → icon file under /icons/cg-weather/. */
export function weatherIconFile(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? 'clear-day.png' : 'clear-night.png';
  if (code === 1 || code === 2) return isDay ? 'partly.png' : 'partly-night.png';
  if (code === 3) return 'cloudy.png';
  if (code === 45 || code === 48) return 'fog.png';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow.png';
  if (code >= 95) return 'thunder.png';
  if (code >= 51) return 'rain.png';
  return 'cloudy.png';
}
