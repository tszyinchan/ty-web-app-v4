import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { CgMixPreview } from '../../../../core/domains/cg/cg-mix-preview';
import {
  CG_ANCHOR_GRID_OPTIONS,
  CG_ANCHOR_OPTIONS,
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_LAYER_LOOK_OPTIONS,
  CG_LOGO_ACCEPT,
  CG_LOGO_MAX_BYTES,
  CG_MAX_DURATION_MS,
  CG_SUBTITLE_PRESET_OPTIONS,
  CgAnchor,
  CgElementType,
  CgLayerEditMode,
  CgLayerLook,
  CgSubtitlePreset,
} from '../../../../core/domains/cg/cg.constants';
import { CgLayerDraft, CgLayout } from '../../../../core/domains/cg/cg.model';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  buildCgOverlayUrl,
  cueSubtitleIndex,
  elementLabel,
  innerDurationMs,
  isCgCut,
  isEmbeddedImageUrl,
  isLocalFilesystemPath,
  layerStudioStorageKey,
  parseSubtitleScript,
  readLayerEditMode,
  subtitlePresetOf,
  writeLayerEditMode,
} from '../../../../core/domains/cg/cg.util';
import { HasUnsavedChanges } from '../../../../core/guards/unsaved-changes.guard';
import { NotificationService } from '../../../../core/services/notification.service';
import { copyTextToClipboard } from '../../../../core/utils/copy-text.util';

interface LogoContentSnapshot {
  name: string;
  look: CgLayerLook;
  layout: CgLayout;
  imageUrl: string;
  fileName: string;
}

@Component({
  selector: 'app-cg-layer-edit',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    CgMixPreview,
  ],
  templateUrl: './cg-layer-edit.html',
  styleUrl: './cg-layer-edit.scss',
})
export class CgLayerEdit implements OnInit, HasUnsavedChanges {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notification = inject(NotificationService);
  readonly cg = inject(CgService);

  readonly Logo = CgElementType.Logo;
  readonly Subtitle = CgElementType.Subtitle;
  readonly lookOptions = CG_LAYER_LOOK_OPTIONS;
  readonly presetOptions = CG_SUBTITLE_PRESET_OPTIONS;
  readonly anchorOptions = CG_ANCHOR_OPTIONS;
  readonly anchorGridOptions = CG_ANCHOR_GRID_OPTIONS;
  readonly logoAccept = CG_LOGO_ACCEPT;
  readonly scriptAccept = '.txt,.srt,text/plain,application/x-subrip';
  readonly cutMs = CG_CUT_DURATION_MS;
  readonly maxDurationMs = CG_MAX_DURATION_MS;
  readonly layersBackdrop = this.cg.layersBackdrop;
  readonly copyTargetId = signal('');
  /** Desk-only Logo placement guide (not saved / not on OBS). */
  readonly logoOutline = signal(false);
  /** Operator preference for Logo Studio mode (when not forced on air). */
  readonly layerStudioPreference = signal(false);

  /**
   * True when this layer is defined to be on air in the package (layer.visible === true).
   */
  readonly isLayerOnAir = computed(() => {
    const l = this.layer();
    return !!l && l.visible;
  });

  /**
   * Logo Studio mode:
   * - When layer is on air: ALWAYS OFF (live / direct) and toggle is disabled.
   * - When layer is not on air: user can toggle on (draft) or off (live).
   */
  readonly isLayerStudio = computed(() => {
    if (this.isLayerOnAir()) return false;
    return this.layerStudioPreference();
  });

  readonly layerContentDirty = signal(false);
  private contentBaseline = '';
  private boundLayerKey = '';
  private lastCueFadeMs = CG_DEFAULT_DURATION_MS;

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });

  readonly layer = computed(() => {
    const id = this.params().get('layerId') ?? '';
    return this.cg.draftLayers().find((row) => row.clientId === id) ?? null;
  });

  /** Re-bind when route layer or its DB id appears — not on every content edit. */
  private readonly _bindLogoStudio = effect(() => {
    const clientId = this.params().get('layerId') ?? '';
    const layer =
      this.cg.draftLayers().find((row) => row.clientId === clientId) ?? null;
    const bindKey = layer
      ? `${layer.clientId}|${layer.tb_tyapp_cgly_id ?? ''}|${layer.element_type}`
      : `missing:${clientId}`;
    untracked(() => {
      if (bindKey === this.boundLayerKey) return;
      this.boundLayerKey = bindKey;
      this.bindLogoDesk(layer);
    });
  });

  /** When this layer goes on air in the package, flush any unapplied draft changes to live. */
  private readonly _autoApplyWhenOnAir = effect(() => {
    const onAir = this.isLayerOnAir();
    if (onAir) {
      untracked(() => {
        if (this.layerContentDirty()) {
          void this.applyLayerContent();
        }
      });
    }
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
  subtitlePresetOf = subtitlePresetOf;

  /** Guard + beforeunload — Logo Studio Draft with unapplied edits. */
  isDirty(): boolean {
    return this.isLogoStudioDraftDirty();
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): string | true {
    if (!this.isDirty()) return true;
    event.preventDefault();
    return '';
  }

  toggleLayerStudio(): void {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Logo) return;
    // When layer is on air, toggle is disabled and always on.
    if (this.isLayerOnAir()) return;

    if (this.isLayerStudio()) {
      this.setLayerStudio(false);
      return;
    }
    this.setLayerStudio(true);
  }

  private setLayerStudio(on: boolean): void {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Logo) return;
    const key = layerStudioStorageKey(layer);
    if (on) {
      this.cg.cancelPersistLayerContent(layer.clientId);
      this.layerStudioPreference.set(true);
      writeLayerEditMode(key, CgLayerEditMode.Studio);
      this.captureContentBaseline(layer);
      this.layerContentDirty.set(false);
      return;
    }
    // Turning Studio mode off: do NOT save. Discard dirty changes so top right bar stays clean.
    if (this.layerContentDirty()) {
      this.discardLayerContent();
    }
    this.layerStudioPreference.set(false);
    writeLayerEditMode(key, CgLayerEditMode.Direct);
  }

  async applyLayerContent(): Promise<void> {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Logo) return;
    await this.cg.applyLayerContent(layer.clientId);
    this.captureContentBaseline(layer);
    this.layerContentDirty.set(false);
    this.notification.showSuccess('Layer applied');
  }

  discardLayerContent(): void {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Logo || !this.contentBaseline) {
      return;
    }
    const snap = JSON.parse(this.contentBaseline) as LogoContentSnapshot;
    layer.name = snap.name;
    layer.look = snap.look;
    layer.layout = structuredClone(snap.layout);
    layer.payload = {
      ...layer.payload,
      imageUrl: snap.imageUrl,
      ...(snap.fileName ? { fileName: snap.fileName } : {}),
    };
    if (!snap.fileName) delete layer.payload.fileName;
    this.cg.cancelPersistLayerContent(layer.clientId);
    this.cg.touchPreview();
    this.layerContentDirty.set(false);
  }

  touchPreview(): void {
    this.cg.touchPreview();
    const layer = this.layer();
    if (!layer) return;
    if (
      layer.element_type === this.Logo &&
      this.isLayerStudio()
    ) {
      this.layerContentDirty.set(
        this.logoContentSnapshot(layer) !== this.contentBaseline,
      );
      return;
    }
    this.cg.schedulePersistLayerContent(layer.clientId);
  }

  onPlaceWheel(
    event: WheelEvent,
    layer: CgLayerDraft,
    field: 'x' | 'y' | 'scale',
  ): void {
    if (layer.element_type !== this.Logo) return;
    event.preventDefault();
    const dir = event.deltaY < 0 ? 1 : -1;
    if (field === 'scale') {
      const next = Math.round((layer.layout.scale + dir * 0.05) * 100) / 100;
      layer.layout.scale = Math.max(0.05, next);
    } else {
      layer.layout[field] = Math.round((layer.layout[field] + dir) * 10) / 10;
    }
    this.touchPreview();
  }

  private bindLogoDesk(layer: CgLayerDraft | null): void {
    if (!layer || layer.element_type !== this.Logo) {
      this.layerStudioPreference.set(false);
      this.layerContentDirty.set(false);
      this.contentBaseline = '';
      return;
    }
    const studio =
      readLayerEditMode(layerStudioStorageKey(layer)) === CgLayerEditMode.Studio;
    this.layerStudioPreference.set(studio);
    this.captureContentBaseline(layer);
    this.layerContentDirty.set(false);
    if (this.isLayerStudio()) {
      this.cg.cancelPersistLayerContent(layer.clientId);
    }
  }

  private isLogoStudioDraftDirty(): boolean {
    const layer = this.layer();
    return (
      !!layer &&
      layer.element_type === this.Logo &&
      this.isLayerStudio() &&
      this.layerContentDirty()
    );
  }

  private captureContentBaseline(layer: CgLayerDraft): void {
    this.contentBaseline = this.logoContentSnapshot(layer);
  }

  private logoContentSnapshot(layer: CgLayerDraft): string {
    const snap: LogoContentSnapshot = {
      name: layer.name?.trim() ?? '',
      look: layer.look,
      layout: structuredClone(layer.layout),
      imageUrl: layer.payload.imageUrl ?? '',
      fileName: layer.payload.fileName ?? '',
    };
    return JSON.stringify(snap);
  }

  toggleVisible(layer: CgLayerDraft): void {
    void this.cg.setLayerVisible(layer.clientId, !layer.visible);
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
    } else if (isEmbeddedImageUrl(layer.payload.imageUrl)) {
      // Never allow a pasted data: URL — payload is sent to OBS on Save/cue
      // (and a 30s safety RPC). Use "Choose local image" (Storage URL).
      this.notification.handleError(
        'Embedded image',
        'Pasting an embedded image here would put the file in payload. Use Choose local image instead.',
      );
      layer.payload.imageUrl = '';
    }
    delete layer.payload.fileName;
    this.touchPreview();
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
    const url = await this.cg.uploadLogoImage(layer.public_token, file);
    if (!url) return; // cg.service already reported the error
    layer.payload.imageUrl = url;
    layer.payload.fileName = file.name;
    this.touchPreview();
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
    this.touchPreview();
  }

  onAnchorToggle(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    const value = event.value as CgAnchor;
    if (!value) {
      if (event.source?.buttonToggleGroup) {
        event.source.buttonToggleGroup.value = layer.layout.anchor;
      }
      return;
    }
    layer.layout.anchor = value;
    this.touchPreview();
  }

  onLayerLookToggle(event: MatButtonToggleChange): void {
    const value = event.value;
    if (value === CgLayerLook.Color || value === CgLayerLook.Mono) {
      this.setLayerLook(value);
    }
  }

  onCueAppearToggle(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    if (event.value === 'cut') this.setCueCut(layer);
    else this.setCueFade(layer);
  }

  onPresetToggle(event: MatButtonToggleChange): void {
    const value = event.value;
    if (value === CgSubtitlePreset.News || value === CgSubtitlePreset.Show) {
      this.setPreset(value);
    }
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
    this.layerContentDirty.set(false);
    this.cg.cancelPersistLayerContent(layer.clientId);
    this.cg.draftLayers.update((list) =>
      list.filter((row) => row.clientId !== layer.clientId),
    );
    // Absolute path — relative `..` under /cg lazy routes can miss the
    // package URL and hit app `**` → /login.
    const id = this.packageId;
    void this.router.navigate(id ? ['/cg/edit', id] : ['/cg/new']);
  }
}
