import { Component, input } from '@angular/core';
import { CgBreaking } from './cg-breaking';
import { CgClock } from './cg-clock';
import { CgLogo } from './cg-logo';
import { CgSubtitle } from './cg-subtitle';
import { CgTicker } from './cg-ticker';
import { CgTitle } from './cg-title';
import { CgWeather } from './cg-weather';
import {
  CG_DEFAULT_DURATION_MS,
  CgElementType,
} from './cg.constants';
import { CgLayerPayload, CgLayout } from './cg.model';
import { subtitleLine, subtitlePresetOf, subtitleStyleOf, innerDurationMs } from './cg.util';

@Component({
  selector: 'app-cg-layer-view',
  standalone: true,
  imports: [CgLogo, CgSubtitle, CgClock, CgWeather, CgBreaking, CgTicker, CgTitle],
  template: `
    @switch (elementType()) {
      @case (Logo) {
        <app-cg-logo
          [imageUrl]="payload().imageUrl"
          [layout]="layout()"
          [visible]="true"
          [outline]="outline()"
        />
      }
      @case (Clock) {
        <app-cg-clock
          [payload]="payload()"
          [layout]="layout()"
          [outline]="outline()"
        />
      }
      @case (Weather) {
        <app-cg-weather
          [payload]="payload()"
          [layout]="layout()"
          [outline]="outline()"
        />
      }
      @case (Breaking) {
        <app-cg-breaking
          [payload]="payload()"
          [layout]="layout()"
          [visible]="visible()"
          [outline]="outline()"
        />
      }
      @case (Ticker) {
        <app-cg-ticker
          [payload]="payload()"
          [layout]="layout()"
          [visible]="visible()"
          [outline]="outline()"
        />
      }
      @case (Title) {
        <app-cg-title [payload]="payload()" [outline]="outline()" />
      }
      @case (Subtitle) {
        <app-cg-subtitle
          [text]="subtitleLine(payload())"
          [layout]="layout()"
          [durationMs]="innerDurationMs(payload())"
          [preset]="subtitlePresetOf(payload())"
          [style]="subtitleStyleOf(payload())"
        />
      }
    }
  `,
  styles: `
    :host {
      display: block;
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 1;
      filter: none;
      /* Opacity = Package Appear. Look Color/B&W is always cut (Layer content). */
      transition: opacity var(--cg-duration-ms, 400ms) ease;
    }

    :host.off {
      opacity: 0;
    }

    :host.mono {
      filter: grayscale(1);
    }
  `,
  host: {
    '[class.off]': '!visible()',
    '[class.mono]': 'mono()',
    '[style.--cg-duration-ms]': 'durationMs() + "ms"',
    '[style.z-index]': 'sortOrder()',
  },
})
export class CgLayerView {
  readonly Logo = CgElementType.Logo;
  readonly Clock = CgElementType.Clock;
  readonly Weather = CgElementType.Weather;
  readonly Breaking = CgElementType.Breaking;
  readonly Ticker = CgElementType.Ticker;
  readonly Title = CgElementType.Title;
  readonly Subtitle = CgElementType.Subtitle;
  readonly subtitleLine = subtitleLine;
  readonly subtitlePresetOf = subtitlePresetOf;
  readonly subtitleStyleOf = subtitleStyleOf;
  readonly innerDurationMs = innerDurationMs;
  readonly elementType = input.required<CgElementType>();
  readonly layout = input.required<CgLayout>();
  readonly payload = input.required<CgLayerPayload>();
  readonly visible = input(true);
  readonly durationMs = input(CG_DEFAULT_DURATION_MS);
  readonly sortOrder = input(0);
  readonly mono = input(false);
  readonly outline = input(false);
}
