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
import { CgProgram } from '../../core/domains/cg/cg-program';
import { CG_OVERLAY_SAFETY_POLL_MS } from '../../core/domains/cg/cg.constants';
import {
  CgOverlayCueMessage,
  CgPublicOutput,
} from '../../core/domains/cg/cg.model';
import { CgService } from '../../core/domains/cg/cg.service';

const OVERLAY_HTML_CLASS = 'cg-overlay-on';

/** Public OBS page. Fetch / Realtime only; staging lives in CgProgram. */
@Component({
  selector: 'app-cg-overlay',
  standalone: true,
  imports: [CgProgram],
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
  readonly cue = signal<CgOverlayCueMessage | null>(null);

  private safetyPollId = 0;
  private token = '';
  private lastVersion = '';
  private firstPaint = true;

  ngOnInit(): void {
    this.document.documentElement.classList.add(OVERLAY_HTML_CLASS);
    this.title.setTitle('');
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.cg.subscribeOverlayOutput(
      this.token,
      (output) => this.output.set(output),
      (cue) => this.cue.set(cue),
    );
    void this.refresh();
    this.safetyPollId = window.setInterval(() => {
      void this.refresh();
    }, CG_OVERLAY_SAFETY_POLL_MS);
  }

  ngOnDestroy(): void {
    window.clearInterval(this.safetyPollId);
    void this.cg.unsubscribeOverlayOutput();
    this.document.documentElement.classList.remove(OVERLAY_HTML_CLASS);
  }

  private async refresh(): Promise<void> {
    if (!this.token) {
      this.output.set(null);
      return;
    }
    if (!this.firstPaint) {
      const version = await this.cg.fetchPublicOutputVersion(this.token);
      if (version != null && version === this.lastVersion) return;
      if (version != null) this.lastVersion = version;
    }
    const live = await this.cg.fetchPublicOutput(this.token);
    if (this.firstPaint) {
      const version = await this.cg.fetchPublicOutputVersion(this.token);
      if (version != null) this.lastVersion = version;
    }
    this.output.set(live);
    this.firstPaint = false;
  }
}
