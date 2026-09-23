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
import { CG_OVERLAY_POLL_MS } from '../../core/domains/cg/cg.constants';
import { CgPublicOutput } from '../../core/domains/cg/cg.model';
import { CgService } from '../../core/domains/cg/cg.service';

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

  readonly output = signal<CgPublicOutput | null>(null);

  private pollId = 0;
  private token = '';

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
    this.document.documentElement.classList.remove(OVERLAY_HTML_CLASS);
  }

  private async refresh(): Promise<void> {
    if (!this.token) {
      this.output.set(null);
      return;
    }
    this.output.set(await this.cg.fetchPublicOutput(this.token));
  }
}
