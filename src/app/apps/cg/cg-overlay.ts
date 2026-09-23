import { DOCUMENT } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { CgLayerView } from '../../core/domains/cg/cg-layer-view';
import { CgStage } from '../../core/domains/cg/cg-stage';
import {
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_OVERLAY_POLL_MS,
  CgPackageLook,
} from '../../core/domains/cg/cg.constants';
import { CgLayer } from '../../core/domains/cg/cg.model';
import { CgService } from '../../core/domains/cg/cg.service';
import { normalizeDurationMs, normalizeLook } from '../../core/domains/cg/cg.util';

const OVERLAY_HTML_CLASS = 'cg-overlay-on';

@Component({
  selector: 'app-cg-overlay',
  standalone: true,
  imports: [CgStage, CgLayerView],
  templateUrl: './cg-overlay.html',
  styleUrl: './cg-overlay.scss',
  encapsulation: ViewEncapsulation.None,
})
export class CgOverlay implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private cg = inject(CgService);
  private title = inject(Title);
  private document = inject(DOCUMENT);

  readonly stagedLayers = signal<CgLayer[]>([]);
  readonly durationMs = signal(CG_DEFAULT_DURATION_MS);
  readonly look = signal(CgPackageLook.Color);
  readonly Mono = CgPackageLook.Mono;

  private pollId = 0;
  private fadeId = 0;
  private token = '';
  private lastHash = '';
  private firstPaint = true;

  ngOnInit(): void {
    this.document.documentElement.classList.add(OVERLAY_HTML_CLASS);
    this.title.setTitle('');
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    void this.refresh();
    this.pollId = window.setInterval(() => {
      void this.refresh();
    }, CG_OVERLAY_POLL_MS);
  }

  ngOnDestroy(): void {
    window.clearInterval(this.pollId);
    window.clearTimeout(this.fadeId);
    this.document.documentElement.classList.remove(OVERLAY_HTML_CLASS);
  }

  private async refresh(): Promise<void> {
    if (!this.token) {
      this.durationMs.set(CG_DEFAULT_DURATION_MS);
      this.setLook(CgPackageLook.Color);
      this.applyIncoming([], true, CG_DEFAULT_DURATION_MS);
      return;
    }
    const live = await this.cg.fetchPublicOutput(this.token);
    const durationMs = normalizeDurationMs(live?.durationMs);
    this.durationMs.set(durationMs);
    this.setLook(normalizeLook(live?.look));
    this.applyIncoming(live?.layers ?? [], this.firstPaint, durationMs);
    this.firstPaint = false;
  }

  private setLook(look: CgPackageLook): void {
    this.look.set(look);
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
      sort: layer.sort_order,
    })),
  );
}
