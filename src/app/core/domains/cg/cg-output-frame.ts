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
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  CG_STAGE_REFERENCE_HEIGHT_PX,
  CG_STAGE_REFERENCE_WIDTH_PX,
  CgPreviewBackdrop,
} from './cg.constants';
import { buildCgOverlayUrl } from './cg.util';

/**
 * Panel On air monitor: the real public overlay (`/o/:token`) in an iframe at
 * OBS size (1920×1080), scaled down. Same page, same viewport as the OBS
 * Browser Source, so layout matches what airs.
 */
@Component({
  selector: 'app-cg-output-frame',
  standalone: true,
  templateUrl: './cg-output-frame.html',
  styleUrl: './cg-output-frame.scss',
  host: {
    '[class.wide]': 'wide()',
  },
})
export class CgOutputFrame implements OnDestroy {
  private sanitizer = inject(DomSanitizer);
  private zone = inject(NgZone);

  /** Package or Layer `public_token`. Empty = nothing on air yet. */
  readonly token = input('');
  readonly label = input('');
  readonly backdrop = input(CgPreviewBackdrop.Dim);
  /** Fill the parent width instead of the 176px Panel monitor. */
  readonly wide = input(false);

  readonly backdrops = CgPreviewBackdrop;
  readonly frameWidth = CG_STAGE_REFERENCE_WIDTH_PX;
  readonly frameHeight = CG_STAGE_REFERENCE_HEIGHT_PX;

  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  readonly scale = signal(0);
  readonly frameTransform = computed(() => `scale(${this.scale()})`);

  readonly src = computed<SafeResourceUrl | null>(() => {
    const token = this.token();
    if (!token) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      buildCgOverlayUrl(token, window.location),
    );
  });

  private observer: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      this.observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 0;
        this.zone.run(() =>
          this.scale.set(width / CG_STAGE_REFERENCE_WIDTH_PX),
        );
      });
      this.observer.observe(this.box().nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
