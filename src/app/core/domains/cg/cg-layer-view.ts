import { Component, input } from '@angular/core';
import { CgLogo } from './cg-logo';
import { CgSubtitle } from './cg-subtitle';
import {
  CG_DEFAULT_DURATION_MS,
  CgElementType,
} from './cg.constants';
import { CgLayerPayload, CgLayout } from './cg.model';
import { subtitleLine, subtitlePresetOf, innerDurationMs } from './cg.util';

@Component({
  selector: 'app-cg-layer-view',
  standalone: true,
  imports: [CgLogo, CgSubtitle],
  template: `
    @switch (elementType()) {
      @case (Logo) {
        <app-cg-logo
          [imageUrl]="payload().imageUrl"
          [layout]="layout()"
          [visible]="true"
        />
      }
      @case (Subtitle) {
        <app-cg-subtitle
          [text]="subtitleLine(payload())"
          [layout]="layout()"
          [durationMs]="innerDurationMs(payload())"
          [preset]="subtitlePresetOf(payload())"
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
      transition:
        opacity var(--cg-duration-ms, 400ms) ease,
        filter var(--cg-duration-ms, 400ms) ease;
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
  readonly Subtitle = CgElementType.Subtitle;
  readonly subtitleLine = subtitleLine;
  readonly subtitlePresetOf = subtitlePresetOf;
  readonly innerDurationMs = innerDurationMs;
  readonly elementType = input.required<CgElementType>();
  readonly layout = input.required<CgLayout>();
  readonly payload = input.required<CgLayerPayload>();
  readonly visible = input(true);
  readonly durationMs = input(CG_DEFAULT_DURATION_MS);
  readonly sortOrder = input(0);
  readonly mono = input(false);
}
