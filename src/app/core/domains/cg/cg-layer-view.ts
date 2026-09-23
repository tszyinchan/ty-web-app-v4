import { Component, input } from '@angular/core';
import { CgLogo } from './cg-logo';
import { CgElementType } from './cg.constants';
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
          [visible]="visible()"
        />
      }
    }
  `,
})
export class CgLayerView {
  readonly Logo = CgElementType.Logo;
  readonly elementType = input.required<CgElementType>();
  readonly layout = input.required<CgLayout>();
  readonly payload = input.required<CgLayerPayload>();
  readonly visible = input(true);
}
