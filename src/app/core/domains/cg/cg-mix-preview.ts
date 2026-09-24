import { Component, input } from '@angular/core';
import { CgLayerView } from './cg-layer-view';
import { CgStage } from './cg-stage';
import {
  CG_DEFAULT_DURATION_MS,
  CgPackageLook,
  CgPreviewBackdrop,
} from './cg.constants';
import { CgLayerDraft } from './cg.model';
import { innerDurationMs, layerIsMono, subtitlePresetOf } from './cg.util';

@Component({
  selector: 'app-cg-mix-preview',
  standalone: true,
  imports: [CgStage, CgLayerView],
  templateUrl: './cg-mix-preview.html',
  styleUrl: './cg-mix-preview.scss',
})
export class CgMixPreview {
  readonly label = input.required<string>();
  readonly layers = input<CgLayerDraft[]>([]);
  readonly packageLook = input(CgPackageLook.Color);
  readonly durationMs = input(CG_DEFAULT_DURATION_MS);
  readonly backdrop = input(CgPreviewBackdrop.Studio);
  readonly layerIsMono = layerIsMono;

  layoutSnapshot(layer: CgLayerDraft): CgLayerDraft['layout'] {
    return { ...layer.layout };
  }

  payloadSnapshot(layer: CgLayerDraft): CgLayerDraft['payload'] {
    return {
      ...layer.payload,
      lines: [...layer.payload.lines],
      style: { preset: subtitlePresetOf(layer.payload) },
      transition: {
        duration_ms: innerDurationMs(layer.payload),
      },
    };
  }
}
