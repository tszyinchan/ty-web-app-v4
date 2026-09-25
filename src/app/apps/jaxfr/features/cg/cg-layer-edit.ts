import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { CgMixPreview } from '../../../../core/domains/cg/cg-mix-preview';
import {
  CG_ANCHOR_OPTIONS,
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_LAYER_LOOK_OPTIONS,
  CG_LAYOUT_UNIT_OPTIONS,
  CG_LOGO_ACCEPT,
  CG_LOGO_MAX_BYTES,
  CG_MAX_DURATION_MS,
  CG_SAMPLE_LOGO_URL,
  CG_SUBTITLE_PRESET_OPTIONS,
  CgElementType,
  CgLayerLook,
  CgPackageLook,
  CgPreviewBackdrop,
  CgSubtitlePreset,
} from '../../../../core/domains/cg/cg.constants';
import { CgLayerDraft } from '../../../../core/domains/cg/cg.model';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  buildCgOverlayUrl,
  cueSubtitleIndex,
  elementLabel,
  innerDurationMs,
  isCgCut,
  isCgMono,
  isEmbeddedImageUrl,
  isLocalFilesystemPath,
  normalizeDurationMs,
  parseSubtitleScript,
  readImageFileAsDataUrl,
  subtitlePresetOf,
} from '../../../../core/domains/cg/cg.util';
import { NotificationService } from '../../../../core/services/notification.service';
import { copyTextToClipboard } from '../../../../core/utils/copy-text.util';

@Component({
  selector: 'app-cg-layer-edit',
  standalone: true,
  imports: [FormsModule, MatButtonModule, CgMixPreview],
  templateUrl: './cg-layer-edit.html',
  styleUrl: './cg-layer-edit.scss',
})
export class CgLayerEdit implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notification = inject(NotificationService);
  readonly cg = inject(CgService);

  readonly Logo = CgElementType.Logo;
  readonly Subtitle = CgElementType.Subtitle;
  readonly lookOptions = CG_LAYER_LOOK_OPTIONS;
  readonly presetOptions = CG_SUBTITLE_PRESET_OPTIONS;
  readonly anchorOptions = CG_ANCHOR_OPTIONS;
  readonly unitOptions = CG_LAYOUT_UNIT_OPTIONS;
  readonly logoAccept = CG_LOGO_ACCEPT;
  readonly scriptAccept = '.txt,.srt,text/plain,application/x-subrip';
  readonly cutMs = CG_CUT_DURATION_MS;
  readonly maxDurationMs = CG_MAX_DURATION_MS;
  readonly backdrops = CgPreviewBackdrop;
  readonly copyTargetId = signal('');
  readonly backdrop = signal(CgPreviewBackdrop.Studio);
  private lastCueFadeMs = CG_DEFAULT_DURATION_MS;

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });

  readonly layer = computed(() => {
    const id = this.params().get('layerId') ?? '';
    return this.cg.draftLayers().find((row) => row.clientId === id) ?? null;
  });

  readonly copyTargets = computed(() => {
    const current = this.packageId;
    return this.cg
      .packages()
      .filter((pkg) => pkg.tb_tyapp_cgpk_id !== current);
  });

  private readonly queueRows =
    viewChildren<ElementRef<HTMLButtonElement>>('queueRow');

  private readonly _keepCueVisible = effect(() => {
    const rows = this.queueRows();
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Subtitle) return;
    const i = layer.payload.index ?? layer.payload.cursor ?? 0;
    const node = rows[i]?.nativeElement;
    if (!node) return;
    requestAnimationFrame(() => this.scrollCueIntoView(node));
  });

  private scrollCueIntoView(node: HTMLButtonElement): void {
    const scroller = node.parentElement;
    if (!scroller) return;
    const scrollerBox = scroller.getBoundingClientRect();
    const nodeBox = node.getBoundingClientRect();
    const delta =
      nodeBox.top +
      nodeBox.height / 2 -
      (scrollerBox.top + scrollerBox.height / 2);
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = Math.min(
      max,
      Math.max(0, scroller.scrollTop + delta),
    );
  }

  get packageId(): string | null {
    const key = this.cg.draftKey();
    return typeof key === 'string' ? key : null;
  }

  @HostListener('window:keydown', ['$event'])
  onCueKeys(event: KeyboardEvent): void {
    if (this.layer()?.element_type !== this.Subtitle) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target.isContentEditable) return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      void this.cue(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      void this.cue(-1);
    }
  }

  ngOnInit(): void {
    void this.cg.fetchAllPackages();
  }

  elementLabel = elementLabel;

  toggleVisible(layer: CgLayerDraft): void {
    void this.cg.setLayerVisible(layer.clientId, !layer.visible);
  }

  useSampleLogo(layer: CgLayerDraft): void {
    layer.payload.imageUrl = CG_SAMPLE_LOGO_URL;
    delete layer.payload.fileName;
    this.cg.touchPreview();
  }

  isEmbeddedLogo(layer: CgLayerDraft): boolean {
    return isEmbeddedImageUrl(layer.payload.imageUrl);
  }

  onImageUrlChange(layer: CgLayerDraft): void {
    if (isLocalFilesystemPath(layer.payload.imageUrl)) {
      this.notification.handleError(
        'Local path',
        'The browser cannot open a disk path. Use Choose local image.',
      );
      layer.payload.imageUrl = '';
    }
    delete layer.payload.fileName;
    this.cg.touchPreview();
  }

  async onLogoFile(layer: CgLayerDraft, event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) {
      return;
    }
    const file = input.files[0];
    input.value = '';
    if (!/^image\/(png|webp)$/.test(file.type)) {
      this.notification.handleError(
        'Logo',
        'Use a PNG or WebP with transparency.',
      );
      return;
    }
    if (file.size > CG_LOGO_MAX_BYTES) {
      this.notification.handleError('Logo', 'Keep the file under 1.5 MB for now.');
      return;
    }
    try {
      layer.payload.imageUrl = await readImageFileAsDataUrl(file);
      layer.payload.fileName = file.name;
      this.cg.touchPreview();
    } catch (error: unknown) {
      this.notification.handleError('Logo', error);
    }
  }

  touchPreview(): void {
    this.cg.touchPreview();
  }

  cue(direction: 1 | -1): void {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Subtitle) return;
    const next = cueSubtitleIndex(
      layer.payload.lines,
      layer.payload.index,
      direction,
      layer.payload.cursor,
    );
    void this.applySubtitlePayload(
      layer,
      layer.payload.lines,
      next.index,
      next.cursor,
    );
  }

  cueAt(index: number): void {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Subtitle) return;
    if (index < 0 || index >= layer.payload.lines.length) return;
    void this.applySubtitlePayload(layer, layer.payload.lines, index, index);
  }

  blankAir(): void {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Subtitle) return;
    void this.applySubtitlePayload(
      layer,
      layer.payload.lines,
      null,
      layer.payload.cursor,
    );
  }

  async pasteScript(): Promise<void> {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Subtitle) return;
    try {
      const raw = await navigator.clipboard.readText();
      this.replaceScript(layer, raw);
    } catch (error: unknown) {
      this.notification.handleError('Clipboard', error);
    }
  }

  onScriptFile(layer: CgLayerDraft, event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) {
      return;
    }
    const file = input.files[0];
    input.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        this.notification.handleError('Script', 'Could not read that file.');
        return;
      }
      this.replaceScript(layer, reader.result);
    };
    reader.onerror = () =>
      this.notification.handleError('Script', 'Could not read that file.');
    reader.readAsText(file);
  }

  private replaceScript(layer: CgLayerDraft, raw: string): void {
    const lines = parseSubtitleScript(raw);
    if (lines.length === 0) {
      this.notification.handleError(
        'Script',
        'No sentences. Use one line per caption, or an .srt file.',
      );
      return;
    }
    void this.applySubtitlePayload(layer, lines, 0, 0);
  }

  private applySubtitlePayload(
    layer: CgLayerDraft,
    lines: string[],
    index: number | null,
    cursor: number,
  ): void {
    void this.cg.patchLayerPayload(layer.clientId, {
      ...layer.payload,
      lines: [...lines],
      index,
      cursor,
    });
  }

  packageIsMono(): boolean {
    return isCgMono(this.cg.draftItem()?.look);
  }

  pendingLook(): CgPackageLook {
    return this.cg.draftItem()?.look ?? CgPackageLook.Color;
  }

  onAirLook(): CgPackageLook {
    return this.cg.onAirItem()?.look ?? CgPackageLook.Color;
  }

  packageDurationMs(): number {
    return normalizeDurationMs(this.cg.draftItem()?.duration_ms);
  }

  onAirDurationMs(): number {
    return normalizeDurationMs(this.cg.onAirItem()?.duration_ms);
  }

  /** This one Layer's last-saved state, wrapped as a 1-item array for
   * CgMixPreview — empty until the Layer itself has been saved once. */
  onAirLayerOf(clientId: string): CgLayerDraft[] {
    const found = this.cg
      .onAirLayers()
      .find((row) => row.clientId === clientId);
    return found ? [found] : [];
  }

  cueDurationMs(layer: CgLayerDraft): number {
    return innerDurationMs(layer.payload);
  }

  isCueCut(layer: CgLayerDraft): boolean {
    return isCgCut(this.cueDurationMs(layer));
  }

  setCueCut(layer: CgLayerDraft): void {
    const current = this.cueDurationMs(layer);
    if (current > this.cutMs) {
      this.lastCueFadeMs = current;
    }
    void this.cg.patchLayerTransition(layer.clientId, this.cutMs);
  }

  setCueFade(layer: CgLayerDraft): void {
    if (!this.isCueCut(layer)) return;
    void this.cg.patchLayerTransition(layer.clientId, this.lastCueFadeMs);
  }

  onCueDurationMsChange(layer: CgLayerDraft, value: number | string): void {
    void this.cg.patchLayerTransition(layer.clientId, value);
  }

  setLayerLook(look: CgLayerLook): void {
    const layer = this.layer();
    if (!layer) return;
    layer.look = look;
  }

  setPreset(preset: CgSubtitlePreset): void {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Subtitle) return;
    layer.payload = {
      ...layer.payload,
      style: { preset },
    };
    this.touchPreview();
  }

  isPreset(preset: CgSubtitlePreset): boolean {
    const layer = this.layer();
    return !!layer && subtitlePresetOf(layer.payload) === preset;
  }

  async copyToPackage(): Promise<void> {
    const layer = this.layer();
    const targetId = this.copyTargetId();
    if (!layer || !targetId) return;
    await this.cg.copyLayerToPackage(layer, targetId);
  }

  layerOutputUrl(layer: CgLayerDraft): string {
    if (!this.packageId) return '';
    return buildCgOverlayUrl(layer.public_token, window.location);
  }

  async copyLayerOutput(layer: CgLayerDraft): Promise<void> {
    const url = this.layerOutputUrl(layer);
    if (!url) {
      this.notification.handleError(
        'Layer Output',
        'Save the package first to get the OBS URL.',
      );
      return;
    }
    try {
      await copyTextToClipboard(url);
      this.notification.showSuccess('Layer Output copied');
    } catch (error: unknown) {
      this.notification.handleError('Copy failed', error);
    }
  }

  removeLayer(layer: CgLayerDraft): void {
    if (!confirm('Remove this layer from the package?')) return;
    this.cg.draftLayers.update((list) =>
      list.filter((row) => row.clientId !== layer.clientId),
    );
    void this.router.navigate(['..'], { relativeTo: this.route });
  }
}
