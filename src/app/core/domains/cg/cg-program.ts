import {
  Component,
  OnDestroy,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CgLayerView } from './cg-layer-view';
import { CgStage } from './cg-stage';
import {
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CgPackageLook,
  CgPreviewBackdrop,
} from './cg.constants';
import { CgLayer, CgOverlayCueMessage, CgPublicOutput } from './cg.model';
import { layerIsMono, normalizeDurationMs, normalizeLook } from './cg.util';

/**
 * What OBS has on air. Used by the public overlay (`/o/:token`) and by the
 * Panel's On air monitor, so both render the same data with the same
 * staging (fade in / out, cue patches, Look).
 */
@Component({
  selector: 'app-cg-program',
  standalone: true,
  imports: [CgStage, CgLayerView],
  templateUrl: './cg-program.html',
  styleUrl: './cg-program.scss',
  host: {
    '[class.preview]': 'preview()',
  },
})
export class CgProgram implements OnDestroy {
  readonly output = input<CgPublicOutput | null>(null);
  readonly cue = input<CgOverlayCueMessage | null>(null);
  readonly preview = input(false);
  readonly backdrop = input(CgPreviewBackdrop.Dim);
  readonly label = input('');

  readonly stagedLayers = signal<CgLayer[]>([]);
  readonly durationMs = signal(CG_DEFAULT_DURATION_MS);
  readonly look = signal(CgPackageLook.Color);
  readonly layerIsMono = layerIsMono;

  private fadeId = 0;
  private lastHash = '';
  private hadOutput = false;
  private lastCueSeq = new Map<string, number>();

  constructor() {
    effect(() => {
      const output = this.output();
      untracked(() => {
        // First real output after nothing paints instantly (no fade-in).
        const instant = !this.hadOutput;
        this.hadOutput = output !== null;
        this.applyOutput(output, instant);
      });
    });
    effect(() => {
      const cue = this.cue();
      if (!cue) return;
      untracked(() => this.applyCue(cue));
    });
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.fadeId);
  }

  private applyCue(cue: CgOverlayCueMessage): void {
    const applied = this.lastCueSeq.get(cue.layerId) ?? 0;
    if (cue.seq <= applied) return;
    this.lastCueSeq.set(cue.layerId, cue.seq);

    const current = this.stagedLayers();
    const at = current.findIndex(
      (layer) => layer.tb_tyapp_cgly_id === cue.layerId,
    );
    if (at < 0) return;

    const layer = current[at];
    if (
      layer.payload.index === cue.index &&
      layer.payload.cursor === cue.cursor
    ) {
      return;
    }

    const next = [...current];
    next[at] = {
      ...layer,
      payload: {
        ...layer.payload,
        index: cue.index,
        cursor: cue.cursor,
      },
    };
    this.stagedLayers.set(next);
    this.lastHash = outputHash(next.filter((row) => row.visible));
  }

  private applyOutput(live: CgPublicOutput | null, instant: boolean): void {
    const durationMs = normalizeDurationMs(live?.durationMs);
    this.durationMs.set(durationMs);
    this.look.set(normalizeLook(live?.look));
    this.applyIncoming(live?.layers ?? [], instant, durationMs);
  }

  private applyIncoming(
    incoming: CgLayer[],
    instant: boolean,
    durationMs: number,
  ): void {
    const hash = outputHash(incoming);
    if (hash === this.lastHash) return;
    this.lastHash = hash;

    const incomingById = new Map(
      incoming.map((layer) => [layer.tb_tyapp_cgly_id, layer]),
    );
    const current = this.stagedLayers();
    const currentById = new Map(
      current.map((layer) => [layer.tb_tyapp_cgly_id, layer]),
    );
    const fadeInIds = new Set<string>();
    const fadeOutIds = new Set<string>();
    const next: CgLayer[] = [];
    const cut = durationMs <= CG_CUT_DURATION_MS;

    for (const layer of incoming) {
      const previous = currentById.get(layer.tb_tyapp_cgly_id);
      const stayOn = !!previous?.visible;
      if (instant || stayOn || cut) {
        next.push({ ...layer, visible: true });
      } else {
        next.push({ ...layer, visible: false });
        fadeInIds.add(layer.tb_tyapp_cgly_id);
      }
    }

    for (const staged of current) {
      if (incomingById.has(staged.tb_tyapp_cgly_id)) continue;
      if (cut) continue;
      next.push({ ...staged, visible: false });
      fadeOutIds.add(staged.tb_tyapp_cgly_id);
    }

    this.stagedLayers.set(next);

    if (fadeInIds.size > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.stagedLayers.update((list) =>
            list.map((layer) =>
              fadeInIds.has(layer.tb_tyapp_cgly_id)
                ? { ...layer, visible: true }
                : layer,
            ),
          );
        });
      });
    }

    window.clearTimeout(this.fadeId);
    if (fadeOutIds.size === 0) return;
    this.fadeId = window.setTimeout(() => {
      this.stagedLayers.update((list) =>
        list.filter((layer) => !fadeOutIds.has(layer.tb_tyapp_cgly_id)),
      );
    }, durationMs);
  }
}

function outputHash(layers: CgLayer[]): string {
  return JSON.stringify(
    layers.map((layer) => ({
      id: layer.tb_tyapp_cgly_id,
      type: layer.element_type,
      layout: layer.layout,
      payload: layer.payload,
      look: layer.look,
      sort: layer.sort_order,
    })),
  );
}
