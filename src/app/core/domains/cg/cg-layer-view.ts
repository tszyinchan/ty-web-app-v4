import { Component, input } from '@angular/core';
import { CgLogo } from './cg-logo';
import { CG_DEFAULT_DURATION_MS, CgElementType } from './cg.constants';
import { CgLayerPayload, CgLayout } from './cg.model';

@Component({
  selector: 'app-cg-layer-view',
  standalone: true,
  imports: [CgLogo],
  template: `
    @switch (elementType()) {
      @case (Logo) {
        <app-cg-logo
          [imageUrl]="payload().imageUrl"
          [layout]="layout()"
          [visible]="true"
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
      transition: opacity var(--cg-duration-ms, 400ms) ease;
    }

    :host.off {
      opacity: 0;
    }
  `,
  host: {
    '[class.off]': '!visible()',
    '[style.--cg-duration-ms]': 'durationMs() + "ms"',
  },
})
export class CgLayerView {
  readonly Logo = CgElementType.Logo;
  readonly elementType = input.required<CgElementType>();
  readonly layout = input.required<CgLayout>();
  readonly payload = input.required<CgLayerPayload>();
  readonly visible = input(true);
  readonly durationMs = input(CG_DEFAULT_DURATION_MS);
}
