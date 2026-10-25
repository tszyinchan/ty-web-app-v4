import { formatDate, registerLocaleData } from '@angular/common';
import localeZhHant from '@angular/common/locales/zh-Hant';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CgLogo } from './cg-logo';
import { CgTextBox } from './cg-text-box';
import { DEFAULT_CLOCK_LAYOUT } from './cg.constants';
import { CgLayerPayload, CgLayout } from './cg.model';
import {
  clockInstantMs,
  defaultBugStyle,
  emptyClockSettings,
  timeZoneOffsetArg,
} from './cg.util';

registerLocaleData(localeZhHant);

@Component({
  selector: 'app-cg-clock',
  standalone: true,
  imports: [CgLogo, CgTextBox],
  template: `
    @if (backgroundUrl()) {
      <app-cg-logo
        [imageUrl]="backgroundUrl()"
        [layout]="backgroundLayout()"
        [outline]="outline()"
      />
    }
    <app-cg-text-box [text]="label()" [layout]="layout()" [style]="textStyle()" />
  `,
})
export class CgClock {
  readonly layout = input<CgLayout>({ ...DEFAULT_CLOCK_LAYOUT });
  readonly payload = input.required<CgLayerPayload>();
  readonly outline = input(false);

  private readonly nowMs = signal(Date.now());

  readonly settings = computed(
    () => this.payload().clock ?? emptyClockSettings(),
  );
  readonly textStyle = computed(() => this.payload().style ?? defaultBugStyle());
  readonly backgroundUrl = computed(
    () => this.payload().background?.imageUrl ?? '',
  );
  readonly backgroundLayout = computed(
    () => this.payload().background?.layout ?? { ...DEFAULT_CLOCK_LAYOUT },
  );

  readonly label = computed(() => {
    const settings = this.settings();
    const instant = clockInstantMs(settings, this.nowMs());
    const date = new Date(instant);
    const offset = timeZoneOffsetArg(settings.timeZone, date);
    try {
      return formatDate(
        date,
        settings.format || 'HH:mm:ss',
        settings.locale || 'zh-Hant',
        offset || undefined,
      );
    } catch {
      return formatDate(date, 'HH:mm:ss', 'en', offset || undefined);
    }
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    const delay = 1000 - (Date.now() % 1000);
    let intervalId = 0;
    const first = window.setTimeout(() => {
      this.nowMs.set(Date.now());
      intervalId = window.setInterval(() => this.nowMs.set(Date.now()), 1000);
    }, delay);
    destroyRef.onDestroy(() => {
      window.clearTimeout(first);
      window.clearInterval(intervalId);
    });
  }
}
