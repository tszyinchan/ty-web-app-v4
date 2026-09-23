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
  CG_OVERLAY_POLL_MS,
  CG_VISIBLE_FADE_MS,
} from '../../core/domains/cg/cg.constants';
import { CgLayer } from '../../core/domains/cg/cg.model';
import { CgService } from '../../core/domains/cg/cg.service';

const OVERLAY_HTML_CLASS = 'cg-overlay-on';

interface CgTake {
  key: number;
  layers: CgLayer[];
  on: boolean;
  out: boolean;
}

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

  readonly takes = signal<CgTake[]>([]);

  private pollId = 0;
  private fadeId = 0;
  private token = '';
  private takeSeq = 0;
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
      this.applyTake([], true);
      return;
    }
    const live = await this.cg.fetchPublicOutput(this.token);
    this.applyTake(live?.layers ?? [], this.firstPaint);
    this.firstPaint = false;
  }

  private applyTake(layers: CgLayer[], instant: boolean): void {
    const hash = takeHash(layers);
    if (hash === this.lastHash) return;
    this.lastHash = hash;
    const key = ++this.takeSeq;
    window.clearTimeout(this.fadeId);

    if (instant || this.takes().length === 0) {
      this.takes.set([{ key, layers, on: true, out: false }]);
      return;
    }

    this.takes.update((list) => [
      ...list.map((take) => ({ ...take, on: false, out: true })),
      { key, layers, on: false, out: false },
    ]);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.takes.update((list) =>
          list.map((take) => (take.key === key ? { ...take, on: true } : take)),
        );
      });
    });

    this.fadeId = window.setTimeout(() => {
      this.takes.update((list) => list.filter((take) => !take.out));
    }, CG_VISIBLE_FADE_MS);
  }
}

function takeHash(layers: CgLayer[]): string {
  return JSON.stringify(
    layers.map((layer) => ({
      id: layer.tb_tyapp_cgly_id,
      type: layer.element_type,
      visible: layer.visible,
      layout: layer.layout,
      payload: layer.payload,
      sort: layer.sort_order,
    })),
  );
}
