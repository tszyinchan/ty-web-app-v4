import { NgStyle } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CgLogo } from './cg-logo';
import { CgWeatherService, weatherIconFile } from './cg-weather.service';
import { DEFAULT_WEATHER_LAYOUT } from './cg.constants';
import { CgLayerPayload, CgLayout } from './cg.model';
import { defaultBugStyle, emptyWeatherSettings, textBoxLayoutToCss } from './cg.util';

@Component({
  selector: 'app-cg-weather',
  standalone: true,
  imports: [NgStyle, CgLogo],
  templateUrl: './cg-weather.html',
  styleUrl: './cg-weather.scss',
})
export class CgWeather {
  readonly layout = input<CgLayout>({ ...DEFAULT_WEATHER_LAYOUT });
  readonly payload = input.required<CgLayerPayload>();
  readonly outline = input(false);

  private readonly weather = inject(CgWeatherService);
  private readonly minute = signal(Math.floor(Date.now() / 60_000));

  readonly settings = computed(
    () => this.payload().weather ?? emptyWeatherSettings(),
  );
  /** Method, not computed: the desk mutates `style` in place. */
  rowCss(): Record<string, string> {
    const css = textBoxLayoutToCss(
      this.layout(),
      this.payload().style ?? defaultBugStyle(),
      { clamp: false },
    );
    const weather = this.payload().weather;
    css['--wx-gap-hum'] = `${weather?.gapHum ?? 0.45}em`;
    css['--wx-gap-icon'] = `${weather?.gapIcon ?? 0.35}em`;
    return css;
  }

  gradientOn(): boolean {
    return this.payload().style?.gradientTo !== undefined;
  }
  readonly backgroundUrl = computed(
    () => this.payload().background?.imageUrl ?? '',
  );
  readonly backgroundLayout = computed(
    () => this.payload().background?.layout ?? { ...DEFAULT_WEATHER_LAYOUT },
  );

  readonly now = computed(() => {
    this.weather.revision();
    const location = this.settings().location;
    if (!location) return null;
    return this.weather.current(location.lat, location.lon);
  });

  readonly showFahrenheit = computed(() => {
    const mode = this.settings().unitMode;
    if (mode === 'f') return true;
    if (mode === 'c') return false;
    return this.minute() % 2 === 1;
  });

  readonly tempText = computed(() => {
    const now = this.now();
    if (!now) return '--';
    if (this.showFahrenheit()) {
      const f = Math.round((now.tempC * 9) / 5 + 32);
      return `${f}°F`;
    }
    return `${Math.round(now.tempC)}°C`;
  });

  readonly humidityText = computed(() => {
    const now = this.now();
    return now ? `${now.humidity}%` : '--';
  });

  readonly iconUrl = computed(() => {
    const now = this.now();
    const file = now ? weatherIconFile(now.code, now.isDay) : 'cloudy.png';
    return `/icons/cg-weather/${file}`;
  });

  constructor() {
    const wait = 60_000 - (Date.now() % 60_000);
    const destroyRef = inject(DestroyRef);
    let intervalId = 0;
    const first = window.setTimeout(() => {
      this.minute.set(Math.floor(Date.now() / 60_000));
      intervalId = window.setInterval(
        () => this.minute.set(Math.floor(Date.now() / 60_000)),
        60_000,
      );
    }, wait);
    destroyRef.onDestroy(() => {
      window.clearTimeout(first);
      window.clearInterval(intervalId);
    });
  }
}
