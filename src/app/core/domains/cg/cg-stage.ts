import {
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  CG_STAGE_REFERENCE_HEIGHT_PX,
  CG_STAGE_REFERENCE_WIDTH_PX,
  CgPreviewBackdrop,
} from './cg.constants';

interface StageFit {
  scale: number;
  x: number;
  y: number;
}

/**
 * Fixed 1920×1080 artboard scaled to fit the host (contain, centred). Every
 * Element lays out in OBS pixels, so tile / desk / Panel / OBS only differ
 * by the final scale.
 */
@Component({
  selector: 'app-cg-stage',
  standalone: true,
  templateUrl: './cg-stage.html',
  styleUrl: './cg-stage.scss',
  host: {
    '[class.preview]': 'preview()',
  },
})
export class CgStage implements OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);

  readonly preview = input(false);
  readonly backdrop = input<CgPreviewBackdrop>(CgPreviewBackdrop.Checkerboard);

  readonly fit = signal<StageFit>({ scale: 0, x: 0, y: 0 });
  readonly stageTransform = computed(() => {
    const { scale, x, y } = this.fit();
    return `translate(${x}px, ${y}px) scale(${scale})`;
  });

  private observer: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      this.observer = new ResizeObserver((entries) => {
        const box = entries[0]?.contentRect;
        if (!box) return;
        const next = stageFit(box.width, box.height);
        const current = this.fit();
        if (
          next.scale === current.scale &&
          next.x === current.x &&
          next.y === current.y
        ) {
          return;
        }
        this.zone.run(() => this.fit.set(next));
      });
      this.observer.observe(this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}

function stageFit(width: number, height: number): StageFit {
  if (!(width > 0) || !(height > 0)) return { scale: 0, x: 0, y: 0 };
  const scale = Math.min(
    width / CG_STAGE_REFERENCE_WIDTH_PX,
    height / CG_STAGE_REFERENCE_HEIGHT_PX,
  );
  return {
    scale,
    x: (width - CG_STAGE_REFERENCE_WIDTH_PX * scale) / 2,
    y: (height - CG_STAGE_REFERENCE_HEIGHT_PX * scale) / 2,
  };
}
