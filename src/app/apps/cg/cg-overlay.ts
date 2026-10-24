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
import {
  CG_OVERLAY_CUE_KIND,
  CG_OVERLAY_SAFETY_POLL_MS,
} from '../../core/domains/cg/cg.constants';
import {
  CgOutputState,
  CgOutputStateCue,
  CgOverlayCueMessage,
  CgPublicOutput,
} from '../../core/domains/cg/cg.model';
import { CgService } from '../../core/domains/cg/cg.service';

const OVERLAY_HTML_CLASS = 'cg-overlay-on';

/** A cue that arrived over Realtime, with when (performance.now) it did. */
interface BroadcastCue {
  index: number | null;
  cursor: number;
  at: number;
}

/** The cue a subtitle Layer is showing right now. */
interface ShownCue {
  index: number | null;
  cursor: number;
}

/** First time the DB cue disagreed with what is on screen (see checkCueDrift). */
interface CueDrift {
  key: string;
  at: number;
}

/**
 * Public OBS page. Fetch / Realtime only; staging lives in CgProgram.
 *
 * Realtime delivers everything live. The 30s safety poll is cheap: it asks
 * for a tiny state (content `rev` + stored cues) and only downloads the full
 * output when `rev` changed. Firing cues never changes `rev`.
 */
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
  private firstPaint = true;
  private refreshing = false;
  /** Content signature of the output on screen ('' = unknown → next poll downloads). */
  private lastRev = '';
  private broadcastCues = new Map<string, BroadcastCue>();
  private shownCues = new Map<string, ShownCue>();
  private cueSeq = new Map<string, number>();
  private drift = new Map<string, CueDrift>();

  ngOnInit(): void {
    this.document.documentElement.classList.add(OVERLAY_HTML_CLASS);
    this.title.setTitle('');
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.cg.subscribeOverlayOutput(
      this.token,
      (output) => this.applySnapshot(output),
      (cue) => this.applyBroadcastCue(cue),
      // Channel rejoined after a drop: catch up on whatever was missed.
      () => void this.refresh(true),
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

  private async refresh(force = false): Promise<void> {
    if (!this.token) {
      this.output.set(null);
      return;
    }
    if (this.refreshing && !force) return;
    this.refreshing = true;
    try {
      if (!force && !this.firstPaint) {
        const startedAt = performance.now();
        const state = await this.cg.fetchPublicOutputState(this.token);
        // Request failed: keep what is on air and try again next tick.
        if (state === undefined && this.lastRev) return;
        if (state && state.rev === this.lastRev) {
          this.checkCueDrift(state, startedAt);
          return;
        }
        // Token gone (null), content changed, or no `rev` known yet.
      }
      await this.fetchFull();
    } finally {
      this.refreshing = false;
    }
  }

  private async fetchFull(): Promise<void> {
    const startedAt = performance.now();
    const { ok, output } = await this.cg.fetchPublicOutputResult(this.token);
    // A failed request is not "nothing on air": keep the current picture.
    if (!ok && !this.firstPaint) return;
    this.applySnapshot(this.keepNewerCues(output, startedAt));
    this.firstPaint = false;
  }

  private applySnapshot(output: CgPublicOutput | null): void {
    this.lastRev = output?.rev ?? '';
    this.shownCues.clear();
    this.drift.clear();
    for (const layer of output?.layers ?? []) {
      if (typeof layer.payload.cursor !== 'number') continue;
      this.shownCues.set(layer.tb_tyapp_cgly_id, {
        index: layer.payload.index ?? null,
        cursor: layer.payload.cursor,
      });
    }
    this.output.set(output);
  }

  private applyBroadcastCue(cue: CgOverlayCueMessage): void {
    if (cue.seq > (this.cueSeq.get(cue.layerId) ?? 0)) {
      this.cueSeq.set(cue.layerId, cue.seq);
      this.broadcastCues.set(cue.layerId, {
        index: cue.index,
        cursor: cue.cursor,
        at: performance.now(),
      });
      this.shownCues.set(cue.layerId, { index: cue.index, cursor: cue.cursor });
      this.drift.delete(cue.layerId);
    }
    // CgProgram still de-dupes by seq, so a stale cue is harmless there.
    this.cue.set(cue);
  }

  /**
   * A full download can be older than a cue that arrived while it was in
   * flight. Keep the newer broadcast cue so the caption never steps back.
   */
  private keepNewerCues(
    output: CgPublicOutput | null,
    startedAt: number,
  ): CgPublicOutput | null {
    if (!output) return output;
    let changed = false;
    const layers = output.layers.map((layer) => {
      const seen = this.broadcastCues.get(layer.tb_tyapp_cgly_id);
      if (!seen || seen.at <= startedAt) return layer;
      changed = true;
      return {
        ...layer,
        payload: { ...layer.payload, index: seen.index, cursor: seen.cursor },
      };
    });
    return changed ? { ...output, layers } : output;
  }

  /**
   * Recover a cue whose broadcast was lost. The Panel broadcasts first and
   * writes the DB a moment later, so one poll can legitimately read an older
   * cue. Only a disagreement seen on two polls in a row, with no newer
   * broadcast cue in between, is treated as real and applied.
   */
  private checkCueDrift(state: CgOutputState, startedAt: number): void {
    for (const stored of state.cues) {
      const shown = this.shownCues.get(stored.id);
      if (!shown) continue;
      if (shown.index === stored.index && shown.cursor === stored.cursor) {
        this.drift.delete(stored.id);
        continue;
      }
      const seenAt = this.broadcastCues.get(stored.id)?.at ?? 0;
      if (seenAt > startedAt) {
        // A newer cue arrived during this poll: the DB write is just behind.
        this.drift.delete(stored.id);
        continue;
      }
      const key = `${stored.index}|${stored.cursor}`;
      const first = this.drift.get(stored.id);
      if (first && first.key === key && seenAt <= first.at) {
        this.drift.delete(stored.id);
        this.applyDriftCue(stored);
        continue;
      }
      this.drift.set(stored.id, { key, at: startedAt });
    }
  }

  private applyDriftCue(stored: CgOutputStateCue): void {
    // Just above anything seen, so CgProgram accepts it but the Panel's next
    // real cue (always higher) still wins.
    const seq = (this.cueSeq.get(stored.id) ?? 0) + 1;
    this.cueSeq.set(stored.id, seq);
    this.shownCues.set(stored.id, {
      index: stored.index,
      cursor: stored.cursor,
    });
    this.cue.set({
      kind: CG_OVERLAY_CUE_KIND,
      layerId: stored.id,
      index: stored.index,
      cursor: stored.cursor,
      seq,
    });
  }
}
