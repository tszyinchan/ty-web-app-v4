import { Component, input } from '@angular/core';
import { CgLayerView } from './cg-layer-view';
import { CgStage } from './cg-stage';
import {
  CG_DEFAULT_DURATION_MS,
  CgPackageLook,
  CgPreviewBackdrop,
} from './cg.constants';
import { CgLayerDraft } from './cg.model';
import { innerDurationMs, layerIsMono, subtitleStyleOf } from './cg.util';

@Component({
  selector: 'app-cg-mix-preview',
  standalone: true,
  imports: [CgStage, CgLayerView],
  templateUrl: './cg-mix-preview.html',
  styleUrl: './cg-mix-preview.scss',
  host: {
    '[class.wide]': 'wide()',
  },
})
export class CgMixPreview {
  readonly label = input('');
  readonly layers = input<CgLayerDraft[]>([]);
  readonly packageLook = input(CgPackageLook.Color);
  readonly durationMs = input(CG_DEFAULT_DURATION_MS);
  readonly backdrop = input(CgPreviewBackdrop.Dim);
  /** Layer desk hero — wider than Package's 176px pair. */
  readonly wide = input(false);
  /**
   * Desk preview: show the layer even when Package On/Off is Off,
   * so you can still edit while it's hidden from the mix / OBS.
   */
  readonly forceVisible = input(false);
  /**
   * Desk editing monitor: Color/B&W from Layer Look only.
   * Package Look still greys tiles, Package monitors, and OBS.
   */
  readonly layerLookOnly = input(false);
  /** Desk-only Logo placement outline. */
  readonly outline = input(false);
  readonly layerIsMono = layerIsMono;

  isMono(layer: CgLayerDraft): boolean {
    if (this.layerLookOnly()) {
      return layerIsMono(layer.look, CgPackageLook.Color);
    }
    return layerIsMono(layer.look, this.packageLook());
  }

  layoutSnapshot(layer: CgLayerDraft): CgLayerDraft['layout'] {
    return { ...layer.layout };
  }

  payloadSnapshot(layer: CgLayerDraft): CgLayerDraft['payload'] {
    return {
      ...layer.payload,
      lines: [...layer.payload.lines],
      style: subtitleStyleOf(layer.payload),
      transition: {
        duration_ms: innerDurationMs(layer.payload),
      },
    };
  }
}
