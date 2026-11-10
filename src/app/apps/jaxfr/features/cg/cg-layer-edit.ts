import { NgTemplateOutlet } from '@angular/common';
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
import { CgWeatherPlace, CgWeatherService } from '../../../../core/domains/cg/cg-weather.service';
import { CgMixPreview } from '../../../../core/domains/cg/cg-mix-preview';
import { CgWheelSelect, CgWheelStep } from '../../../../core/domains/cg/cg-wheel.directive';
import {
  CgLayoutLengthKey,
  layoutLengthFromDisplayPx,
  layoutLengthToDisplayPx,
} from '../../../../core/domains/cg/cg-title-units.util';
import { CgAnchorGrid } from './cg-anchor-grid';
import { CgNewsQueue } from './cg-news-queue';
import { CgTitleDesk, TitleDeskTab } from './cg-title-desk';
import {
  CG_BREAKING_HEIGHT_DEFAULT,
  CG_BREAKING_MAX_CHARS,
  CG_BREAKING_SECONDS_MAX,
  CG_BREAKING_SECONDS_MIN,
  CG_CLOCK_FORMAT_CUSTOM,
  CG_CLOCK_FORMAT_OPTIONS,
  CG_CLOCK_LOCALE_OPTIONS,
  CG_CLOCK_TIMEZONE_OPTIONS,
  CG_WEATHER_UNIT_OPTIONS,
  DEFAULT_BUG_BACKGROUND_LAYOUT,
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_LAYER_LOOK_OPTIONS,
  CG_LOGO_ACCEPT,
  CG_LOGO_MAX_BYTES,
  CG_MAX_DURATION_MS,
  CG_SUBTITLE_ALIGN_OPTIONS,
  CG_STAGE_REFERENCE_HEIGHT_PX,
  CG_STAGE_REFERENCE_WIDTH_PX,
  CG_TICKER_BOX_MIN,
  CG_TICKER_FADE_WIDTH_MAX,
  CG_TICKER_FADE_WIDTH_MIN,
  CG_TICKER_GAP_MAX,
  CG_TICKER_GAP_MIN,
  CG_TICKER_SPEED_MAX,
  CG_TICKER_SPEED_MIN,
  CG_WHEEL_MIN_FADE_MS,
  DEFAULT_BREAKING_BACKGROUND_LAYOUT,
  DEFAULT_TICKER_BACKGROUND_LAYOUT,
  CgAnchor,
  CgElementType,
  CgLayerLook,
  CgSubtitlePreset,
} from '../../../../core/domains/cg/cg.constants';
import {
  CgBreakingSettings,
  CgClockSettings,
  CgLayerDraft,
  CgLayout,
  CgNewsItem,
  CgSubtitleAlign,
  CgSubtitleStyle,
  CgTickerSettings,
  CgWeatherSettings,
} from '../../../../core/domains/cg/cg.model';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  clampBreakingSeconds,
  clampTickerBox,
  clampTickerFadeWidth,
  clampTickerGap,
  clampTickerSpeed,
  tickerLayoutPixels,
  clockFormatIsKnown,
  defaultBreakingStyle,
  defaultBugStyle,
  defaultTickerStyle,
  emptyBreakingSettings,
  emptyClockSettings,
  emptyTickerSettings,
  emptyWeatherSettings,
  wallClockToUtcMs,
  anchorIgnoresAxis,
  anchorSideX,
  anchorSideY,
  buildCgOverlayUrl,
  cueSubtitleIndex,
  elementLabel,
  innerDurationMs,
  isCgCut,
  isEmbeddedImageUrl,
  isLocalFilesystemPath,
  parseSubtitleScript,
  resolveSubtitleAlign,
  subtitlePresetOf,
  subtitleStyleOf,
} from '../../../../core/domains/cg/cg.util';
import { NotificationService } from '../../../../core/services/notification.service';
import { CgTextStyleEditor } from './cg-text-style-editor';
import { copyTextToClipboard } from '../../../../core/utils/copy-text.util';

interface CgCopyTargetOption {
  id: string;
  label: string;
}

/** Big tabs for every Layer except Title (Title owns its four in `cg-title-desk`). */
const LAYER_DESK_TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'content', label: '內容' },
  { value: 'style', label: '樣式' },
  { value: 'settings', label: '設定' },
];

const TITLE_DESK_TABS: ReadonlyArray<TitleDeskTab> = ['content', 'text', 'item', 'settings'];

/**
 * What a Subtitle shows when a style field is absent (News / Show). Same numbers
 * the overlay falls back to, so the shared Style editor shows the effective value.
 */
const SUBTITLE_NEWS_DEFAULTS: Partial<CgSubtitleStyle> = {
  fontSize: 5.6,
  letterSpacing: 0.104,
  lineHeight: 1.15,
  scaleX: 1,
  scaleY: 1.11,
  color: '#ffffff',
  borderWidth: 0.12,
  borderColor: '#000000',
  shadowAngle: 135,
  shadowDistance: 0,
  shadowRadius: 2,
  shadowColor: '#000000',
};

const SUBTITLE_SHOW_DEFAULTS: Partial<CgSubtitleStyle> = {
  ...SUBTITLE_NEWS_DEFAULTS,
  fontSize: 7.2,
  letterSpacing: 0.06,
  scaleY: 1,
  color: '#fff6d8',
  borderWidth: 0.16,
  shadowDistance: 2,
};

@Component({
  selector: 'app-cg-layer-edit',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    CgMixPreview,
    CgWheelSelect,
    CgWheelStep,
    CgAnchorGrid,
    CgTextStyleEditor,
    CgNewsQueue,
    CgTitleDesk,
    NgTemplateOutlet,
  ],
  templateUrl: './cg-layer-edit.html',
  styleUrl: './cg-layer-edit.scss',
})
export class CgLayerEdit implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notification = inject(NotificationService);
  private readonly weatherApi = inject(CgWeatherService);
  readonly cg = inject(CgService);

  readonly Logo = CgElementType.Logo;
  readonly Clock = CgElementType.Clock;
  readonly Weather = CgElementType.Weather;
  readonly Breaking = CgElementType.Breaking;
  readonly Ticker = CgElementType.Ticker;
  readonly Subtitle = CgElementType.Subtitle;
  readonly Title = CgElementType.Title;
  readonly breakingMaxChars = CG_BREAKING_MAX_CHARS;
  readonly breakingSecondsMin = CG_BREAKING_SECONDS_MIN;
  readonly breakingSecondsMax = CG_BREAKING_SECONDS_MAX;
  readonly breakingHeightDefault = CG_BREAKING_HEIGHT_DEFAULT;
  readonly tickerSpeedMin = CG_TICKER_SPEED_MIN;
  readonly tickerSpeedMax = CG_TICKER_SPEED_MAX;
  readonly tickerGapMin = CG_TICKER_GAP_MIN;
  readonly tickerGapMax = CG_TICKER_GAP_MAX;
  readonly tickerFadeMin = CG_TICKER_FADE_WIDTH_MIN;
  readonly tickerFadeMax = CG_TICKER_FADE_WIDTH_MAX;
  readonly tickerBoxMin = CG_TICKER_BOX_MIN;
  readonly tickerBoxXMin = -CG_STAGE_REFERENCE_WIDTH_PX;
  readonly tickerBoxYMin = -CG_STAGE_REFERENCE_HEIGHT_PX;
  readonly tickerBoxXMax = CG_STAGE_REFERENCE_WIDTH_PX;
  readonly tickerBoxYMax = CG_STAGE_REFERENCE_HEIGHT_PX;
  readonly clockFormats = CG_CLOCK_FORMAT_OPTIONS;
  readonly clockLocales = CG_CLOCK_LOCALE_OPTIONS;
  readonly clockZones = CG_CLOCK_TIMEZONE_OPTIONS;
  readonly weatherUnits = CG_WEATHER_UNIT_OPTIONS;
  readonly clockFormatCustom = CG_CLOCK_FORMAT_CUSTOM;
  readonly clockDraft = signal('');
  readonly placeQuery = signal('');
  readonly placeResults = signal<CgWeatherPlace[]>([]);
  readonly lookOptions = CG_LAYER_LOOK_OPTIONS;
  readonly alignOptions = CG_SUBTITLE_ALIGN_OPTIONS;
  readonly logoAccept = CG_LOGO_ACCEPT;
  readonly scriptAccept = '.txt,.srt,text/plain,application/x-subrip';
  readonly cutMs = CG_CUT_DURATION_MS;
  readonly maxDurationMs = CG_MAX_DURATION_MS;
  readonly wheelMinMs = CG_WHEEL_MIN_FADE_MS;
  /** Cue crossfade presets (Subtitle). */
  readonly cuePresets: readonly number[] = [200, 400, 800];
  readonly deskTabs = LAYER_DESK_TABS;
  readonly packageBackdrop = this.cg.packageBackdrop;
  /** Big tab (内容 / 樣式 / 設定). Title uses its own four; the Layer card "…" opens 設定. */
  readonly deskTab = signal<string>('content');
  /** 960 screens: hide the big monitor to save height. */
  readonly monitorCollapsed = signal(false);
  readonly copyTargetId = signal('');
  /** Unsaved package has no id yet; the dropdown still offers it. */
  private readonly copySelfId = 'self';
  quickInputText = '';
  /** Desk-only Logo placement guide (not saved / not on OBS). */
  readonly logoOutline = signal(false);
  private boundLayerKey = '';
  private lastCueFadeMs = CG_DEFAULT_DURATION_MS;

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });

  readonly layer = computed(() => {
    const id = this.params().get('layerId') ?? '';
    return this.cg.draftLayers().find((row) => row.clientId === id) ?? null;
  });

  /**
   * True when OBS really has this layer (Package output lists only visible
   * layers). Content edits on this desk are Live, so warn the operator.
   */
  readonly isLiveOnAir = computed(() => {
    const layer = this.layer();
    const id = layer?.tb_tyapp_cgly_id;
    if (!id) return false;
    const output = this.cg.onAirOutput();
    return !!output?.layers.some((row) => row.tb_tyapp_cgly_id === id);
  });

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    requireSync: true,
  });
  private tabLayerId = '';

  /**
   * New layer → 內容 page. `?tab=settings` opens 設定 once and is then cleared.
   * One effect so the reset and the request cannot race.
   */
  private readonly _syncTab = effect(() => {
    const clientId = this.params().get('layerId') ?? '';
    const wantsSettings = this.queryParams().get('tab') === 'settings';
    untracked(() => {
      if (clientId !== this.tabLayerId) {
        this.tabLayerId = clientId;
        this.deskTab.set('content');
      }
      if (!wantsSettings) return;
      this.deskTab.set('settings');
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  });

  /** Re-sync the Clock draft / place search when the route layer changes. */
  private readonly _bindDesk = effect(() => {
    const clientId = this.params().get('layerId') ?? '';
    const layer =
      this.cg.draftLayers().find((row) => row.clientId === clientId) ?? null;
    const bindKey = layer
      ? `${layer.clientId}|${layer.tb_tyapp_cgly_id ?? ''}|${layer.element_type}`
      : `missing:${clientId}`;
    untracked(() => {
      if (bindKey === this.boundLayerKey) return;
      this.boundLayerKey = bindKey;
      this.syncClockDraft(layer);
      this.placeQuery.set('');
      this.placeResults.set([]);
    });
  });

  readonly copyTargets = computed((): CgCopyTargetOption[] => {
    const currentId = this.packageId;
    const selfId = currentId ?? this.copySelfId;
    const listed = this.cg
      .packages()
      .find((pkg) => pkg.tb_tyapp_cgpk_id === currentId);
    const draftName = this.cg.draftItem()?.name?.trim() ?? '';
    const selfName = (listed?.name ?? draftName).trim() || 'This package';
    const others = this.cg
      .packages()
      .filter((pkg) => pkg.tb_tyapp_cgpk_id !== currentId);
    return [
      { id: selfId, label: `${selfName} (this package)` },
      ...others.map((pkg) => ({
        id: pkg.tb_tyapp_cgpk_id,
        label: pkg.name,
      })),
    ];
  });

  readonly copyWheelValues = computed(() => [
    '',
    ...this.copyTargets().map((pkg) => pkg.id),
  ]);

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

  /** Layer content is always Live: preview now, debounced DB write + publish. */
  touchPreview(): void {
    this.cg.touchPreview();
    const layer = this.layer();
    if (!layer) return;
    this.cg.schedulePersistLayerContent(layer.clientId);
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
    void this.cg.cueLayer(layer.clientId, next.index, next.cursor);
  }

  cueAt(index: number): void {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Subtitle) return;
    if (index < 0 || index >= layer.payload.lines.length) return;
    void this.cg.cueLayer(layer.clientId, index, index);
  }

  blankAir(): void {
    const layer = this.layer();
    if (!layer || layer.element_type !== this.Subtitle) return;
    void this.cg.cueLayer(layer.clientId, null, layer.payload.cursor);
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

  clearQueue(layer: CgLayerDraft): void {
    if (layer.element_type !== this.Subtitle) return;
    if (layer.payload.lines.length === 0) return;
    if (!confirm('Clear all captions in the queue?')) return;
    void this.applySubtitlePayload(layer, [], null, 0);
    this.notification.showSuccess('Queue cleared');
  }

  onQuickInputEnter(event: Event, layer: CgLayerDraft): void {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.ctrlKey || keyEvent.metaKey) {
      event.preventDefault();
      this.airNowQuickText(layer);
    } else {
      event.preventDefault();
      this.appendQuickText(layer);
    }
  }

  appendQuickText(layer: CgLayerDraft): void {
    const text = this.quickInputText.trim();
    if (!text || layer.element_type !== this.Subtitle) return;
    const newLines = parseSubtitleScript(text);
    if (newLines.length === 0) return;
    const nextLines = [...layer.payload.lines, ...newLines];
    const currentIndex = layer.payload.index;
    const currentCursor =
      layer.payload.lines.length === 0 ? 0 : layer.payload.cursor;
    void this.applySubtitlePayload(
      layer,
      nextLines,
      currentIndex,
      currentCursor,
    );
    this.quickInputText = '';
  }

  insertQuickText(layer: CgLayerDraft): void {
    const text = this.quickInputText.trim();
    if (!text || layer.element_type !== this.Subtitle) return;
    const newLines = parseSubtitleScript(text);
    if (newLines.length === 0) return;
    if (layer.payload.lines.length === 0) {
      void this.applySubtitlePayload(layer, newLines, null, 0);
      this.quickInputText = '';
      return;
    }
    const currentActive =
      layer.payload.index ?? layer.payload.cursor ?? (layer.payload.lines.length - 1);
    const insertAt = Math.min(
      layer.payload.lines.length,
      Math.max(0, currentActive + 1),
    );
    const nextLines = [
      ...layer.payload.lines.slice(0, insertAt),
      ...newLines,
      ...layer.payload.lines.slice(insertAt),
    ];
    let nextIndex = layer.payload.index;
    if (nextIndex != null && nextIndex >= insertAt) {
      nextIndex += newLines.length;
    }
    void this.applySubtitlePayload(layer, nextLines, nextIndex, insertAt);
    this.quickInputText = '';
  }

  airNowQuickText(layer: CgLayerDraft): void {
    const text = this.quickInputText.trim();
    if (!text || layer.element_type !== this.Subtitle) return;
    const newLines = parseSubtitleScript(text);
    if (newLines.length === 0) return;
    if (layer.payload.lines.length === 0) {
      void this.applySubtitlePayload(layer, newLines, 0, 0);
      this.quickInputText = '';
      return;
    }
    const currentActive =
      layer.payload.index ?? layer.payload.cursor ?? (layer.payload.lines.length - 1);
    const insertAt = Math.min(
      layer.payload.lines.length,
      Math.max(0, currentActive + 1),
    );
    const nextLines = [
      ...layer.payload.lines.slice(0, insertAt),
      ...newLines,
      ...layer.payload.lines.slice(insertAt),
    ];
    void this.applySubtitlePayload(layer, nextLines, insertAt, insertAt);
    this.quickInputText = '';
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

  /** Anchor 3×3 grid (the cell position is the Stage position). */
  setAnchor(layer: CgLayerDraft, value: CgAnchor): void {
    layer.layout.anchor = value;
    // X / Y keep their meaning (inset from the Anchor edge), so nothing is
    // rewritten here. Subtitle Alignment follows the Anchor's side once; the
    // operator can still pick any other combination afterwards.
    if (layer.element_type === this.Subtitle || this.isBug(layer)) {
      this.getSubtitleStyle(layer).textAlign = anchorSideX(value);
    }
    this.touchPreview();
  }

  /** True when the Anchor centres this axis and X / Y is ignored. */
  ignoresAxis(layer: CgLayerDraft, axis: 'x' | 'y'): boolean {
    return anchorIgnoresAxis(layer.layout.anchor)[axis];
  }

  /** Label that says which edge X / Y is measured from (always px). */
  placeAxisLabel(layer: CgLayerDraft, axis: 'x' | 'y'): string {
    return this.axisLabel(layer.layout, axis);
  }

  private axisLabel(layout: CgLayout, axis: 'x' | 'y'): string {
    if (axis === 'x') {
      const side = anchorSideX(layout.anchor);
      if (side === 'center') return 'X · centered (px)';
      return `From ${side} (px)`;
    }
    const side = anchorSideY(layout.anchor);
    if (side === 'center') return 'Y · centered (px)';
    return `From ${side} (px)`;
  }

  // ---- Place in px: stored % / px stays as is; the display converts, writes happen on edit only ----

  /** Layout length shown in px (X and width use the Stage width, Y and height its height). */
  placePx(layout: CgLayout, key: CgLayoutLengthKey, fallback = 0): number {
    return layoutLengthToDisplayPx(layout, key, layout[key] ?? fallback);
  }

  setPlacePx(layout: CgLayout, key: CgLayoutLengthKey, px: number | null): void {
    if (px === null || !Number.isFinite(px)) return;
    layout[key] = layoutLengthFromDisplayPx(layout, key, px);
    this.touchPreview();
  }

  /** Breaking text-box height: stored default is 54 (% of Stage height). */
  breakingHeightPx(layer: CgLayerDraft): number {
    return this.placePx(layer.layout, 'height', this.breakingHeightDefault);
  }

  /** Stored clamp 8–90 expressed in px for this layout's unit. */
  breakingHeightLimitPx(layer: CgLayerDraft, edge: 'min' | 'max'): number {
    return layoutLengthToDisplayPx(
      layer.layout,
      'height',
      edge === 'min' ? 8 : 90,
    );
  }

  /** Background layout without creating one while rendering. */
  backgroundView(layer: CgLayerDraft): CgLayout {
    return layer.payload.background?.layout ?? this.backgroundDefault(layer);
  }

  backgroundPx(layer: CgLayerDraft, key: 'x' | 'y'): number {
    return this.placePx(this.backgroundView(layer), key);
  }

  setBackgroundPx(layer: CgLayerDraft, key: 'x' | 'y', px: number | null): void {
    if (px === null || !Number.isFinite(px)) return;
    this.setPlacePx(this.backgroundLayout(layer), key, px);
  }

  setBackgroundScale(layer: CgLayerDraft, value: number | null): void {
    if (value === null || !Number.isFinite(value)) return;
    this.backgroundLayout(layer).scale = value;
    this.touchPreview();
  }

  setLayoutScale(layer: CgLayerDraft, value: number | null): void {
    if (value === null || !Number.isFinite(value)) return;
    layer.layout.scale = value;
    this.touchPreview();
  }

  subtitleAlign(layer: CgLayerDraft): CgSubtitleAlign {
    return resolveSubtitleAlign(
      this.getSubtitleStyle(layer),
      layer.layout.anchor,
    );
  }

  onAlignToggle(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    const value = event.value as CgSubtitleAlign | undefined;
    if (!value) {
      if (event.source?.buttonToggleGroup) {
        event.source.buttonToggleGroup.value = this.subtitleAlign(layer);
      }
      return;
    }
    // Placement, not style: do not flip News / Show to Custom.
    this.getSubtitleStyle(layer).textAlign = value;
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

  ensureCustomPreset(layer: CgLayerDraft): void {
    if (layer.element_type !== this.Subtitle) return;
    if (layer.payload.style?.preset !== CgSubtitlePreset.Custom) {
      layer.payload.style = {
        ...subtitleStyleOf(layer.payload),
        preset: CgSubtitlePreset.Custom,
      };
    }
  }

  onStyleFieldChange(layer: CgLayerDraft): void {
    this.ensureCustomPreset(layer);
    this.touchPreview();
  }

  getSubtitleStyle(layer: CgLayerDraft): CgSubtitleStyle {
    if (!layer.payload.style) {
      layer.payload.style = { preset: CgSubtitlePreset.News };
    }
    return layer.payload.style;
  }

  isPreset(preset: CgSubtitlePreset | 'news' | 'show' | 'custom'): boolean {
    const layer = this.layer();
    return !!layer && subtitlePresetOf(layer.payload) === preset;
  }

  /** Effective Subtitle values behind absent fields, so the shared editor shows what airs. */
  subtitleDefaults(): Partial<CgSubtitleStyle> {
    return this.isPreset(CgSubtitlePreset.Show)
      ? SUBTITLE_SHOW_DEFAULTS
      : SUBTITLE_NEWS_DEFAULTS;
  }

  /** The shared Style editor changed a Subtitle field (flips News / Show to Custom). */
  onSubtitleStyleChanged(layer: CgLayerDraft): void {
    this.onStyleFieldChange(layer);
  }

  // ---- Big tabs ----

  /** 內容 / 樣式 / 設定 for every Layer except Title. */
  genericTab = computed(() => {
    const tab = this.deskTab();
    return tab === 'style' || tab === 'settings' ? tab : 'content';
  });

  /** Title's own four tabs. */
  titleTab = computed((): TitleDeskTab => {
    const tab = this.deskTab();
    return TITLE_DESK_TABS.find((value) => value === tab) ?? 'content';
  });

  setDeskTab(value: string): void {
    this.deskTab.set(value);
  }

  toggleMonitor(): void {
    this.monitorCollapsed.update((value) => !value);
  }

  /** Subtitle (Cue list), Breaking and Ticker (Queue). Logo / Clock / Weather have none. */
  hasQueue(layer: CgLayerDraft): boolean {
    return layer.element_type === this.Subtitle || this.isNews(layer);
  }

  onClockLocale(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    if (event.value !== 'zh-Hant' && event.value !== 'en') return;
    this.clockOf(layer).locale = event.value;
    this.touchPreview();
  }

  onWeatherUnit(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    if (
      event.value !== 'alternate' &&
      event.value !== 'c' &&
      event.value !== 'f'
    ) {
      return;
    }
    this.weatherOf(layer).unitMode = event.value;
    this.touchPreview();
  }

  async copyToPackage(): Promise<void> {
    const layer = this.layer();
    const targetId = this.copyTargetId();
    if (!layer || !targetId) return;
    if (targetId === (this.packageId ?? this.copySelfId)) {
      const copy = this.cg.duplicateLayerInDraft(layer);
      if (!copy) return;
      const id = this.packageId;
      await this.router.navigate(
        id
          ? ['/cg/edit', id, 'layer', copy.clientId]
          : ['/cg/new', 'layer', copy.clientId],
      );
      return;
    }
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

  isBug(layer: CgLayerDraft): boolean {
    return layer.element_type === this.Clock || layer.element_type === this.Weather;
  }

  isNews(layer: CgLayerDraft): boolean {
    return layer.element_type === this.Breaking || layer.element_type === this.Ticker;
  }

  newsItems(layer: CgLayerDraft): CgNewsItem[] {
    return layer.payload.items ?? [];
  }

  onNewsItems(layer: CgLayerDraft, items: CgNewsItem[]): void {
    layer.payload.items = items;
    this.touchPreview();
  }

  breakingOf(layer: CgLayerDraft): CgBreakingSettings {
    layer.payload.breaking ??= emptyBreakingSettings();
    return layer.payload.breaking;
  }

  tickerOf(layer: CgLayerDraft): CgTickerSettings {
    layer.payload.ticker ??= emptyTickerSettings();
    if (
      layer.payload.ticker.direction !== 'horizontal' &&
      layer.payload.ticker.direction !== 'vertical'
    ) {
      layer.payload.ticker.direction = 'horizontal';
    }
    return layer.payload.ticker;
  }

  tickerPx(layer: CgLayerDraft): CgLayout {
    return tickerLayoutPixels(layer.layout);
  }

  onTickerDirection(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    const value = event.value;
    if (value !== 'horizontal' && value !== 'vertical') return;
    this.tickerOf(layer).direction = value;
    this.touchPreview();
  }

  onTickerBox(
    layer: CgLayerDraft,
    axis: 'x' | 'y' | 'width' | 'height',
    value: number,
  ): void {
    const box = tickerLayoutPixels(layer.layout);
    layer.layout = { ...box, [axis]: clampTickerBox(axis, value) };
    this.touchPreview();
  }

  newsStyle(layer: CgLayerDraft): CgSubtitleStyle {
    if (!layer.payload.style) {
      layer.payload.style =
        layer.element_type === this.Ticker ? defaultTickerStyle() : defaultBreakingStyle();
    }
    return layer.payload.style;
  }

  onBreakingSeconds(layer: CgLayerDraft, value: number): void {
    this.breakingOf(layer).secondsPerItem = clampBreakingSeconds(value);
    this.touchPreview();
  }

  onTickerSpeed(layer: CgLayerDraft, value: number): void {
    this.tickerOf(layer).speed = clampTickerSpeed(value);
    this.touchPreview();
  }

  onTickerGap(layer: CgLayerDraft, value: number): void {
    this.tickerOf(layer).gap = clampTickerGap(value);
    this.touchPreview();
  }

  onTickerFadeWidth(layer: CgLayerDraft, value: number): void {
    this.tickerOf(layer).fadeWidth = clampTickerFadeWidth(value);
    this.touchPreview();
  }

  toggleTickerFade(layer: CgLayerDraft, side: 'left' | 'right'): void {
    const ticker = this.tickerOf(layer);
    if (side === 'left') ticker.fadeLeft = !ticker.fadeLeft;
    else ticker.fadeRight = !ticker.fadeRight;
    this.touchPreview();
  }

  bugStyle(layer: CgLayerDraft): CgSubtitleStyle {
    layer.payload.style ??= defaultBugStyle();
    return layer.payload.style;
  }

  clockOf(layer: CgLayerDraft): CgClockSettings {
    layer.payload.clock ??= emptyClockSettings();
    return layer.payload.clock;
  }

  weatherOf(layer: CgLayerDraft): CgWeatherSettings {
    layer.payload.weather ??= emptyWeatherSettings();
    const weather = layer.payload.weather;
    if (weather.gapHum == null) weather.gapHum = 0.45;
    if (weather.gapIcon == null) weather.gapIcon = 0.35;
    return weather;
  }

  backgroundLayout(layer: CgLayerDraft): CgLayout {
    if (!layer.payload.background) {
      layer.payload.background = {
        imageUrl: '',
        layout: { ...this.backgroundDefault(layer) },
      };
    }
    return layer.payload.background.layout;
  }

  private backgroundDefault(layer: CgLayerDraft): CgLayout {
    if (layer.element_type === this.Breaking) {
      return { ...DEFAULT_BREAKING_BACKGROUND_LAYOUT };
    }
    if (layer.element_type === this.Ticker) {
      return { ...DEFAULT_TICKER_BACKGROUND_LAYOUT };
    }
    return { ...DEFAULT_BUG_BACKGROUND_LAYOUT };
  }

  hasBackground(layer: CgLayerDraft): boolean {
    return !!layer.payload.background?.imageUrl;
  }

  clearBackground(layer: CgLayerDraft): void {
    layer.payload.background = undefined;
    this.touchPreview();
  }

  onBackgroundUrl(layer: CgLayerDraft, url: string): void {
    const layout = this.backgroundLayout(layer);
    if (!layer.payload.background) return;
    if (isLocalFilesystemPath(url) || isEmbeddedImageUrl(url)) {
      this.notification.handleError(
        'Image',
        'Use Choose local image or an http(s) URL.',
      );
      layer.payload.background.imageUrl = '';
      return;
    }
    layer.payload.background.imageUrl = url.trim();
    layer.payload.background.layout = layout;
    if (!layer.payload.background.imageUrl) layer.payload.background = undefined;
    this.touchPreview();
  }

  async onBackgroundFile(layer: CgLayerDraft, event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > CG_LOGO_MAX_BYTES) {
      this.notification.handleError('Image', 'File is larger than 1.5 MB.');
      return;
    }
    const url = await this.cg.uploadLogoImage(layer.public_token, file);
    if (!url) return;
    layer.payload.background = {
      imageUrl: url,
      fileName: file.name,
      layout: layer.payload.background?.layout ?? { ...this.backgroundDefault(layer) },
    };
    this.touchPreview();
  }

  onBackgroundAnchor(layer: CgLayerDraft, value: CgAnchor): void {
    this.backgroundLayout(layer).anchor = value;
    this.touchPreview();
  }

  backgroundIgnores(layer: CgLayerDraft, axis: 'x' | 'y'): boolean {
    return anchorIgnoresAxis(this.backgroundView(layer).anchor)[axis];
  }

  backgroundAxisLabel(layer: CgLayerDraft, axis: 'x' | 'y'): string {
    return this.axisLabel(this.backgroundView(layer), axis);
  }

  clockFormatValue(layer: CgLayerDraft): string {
    const format = this.clockOf(layer).format;
    return clockFormatIsKnown(format) ? format : this.clockFormatCustom;
  }

  onClockFormat(layer: CgLayerDraft, value: string): void {
    if (value === this.clockFormatCustom) {
      if (clockFormatIsKnown(this.clockOf(layer).format)) {
        this.clockOf(layer).format = '';
      }
      this.touchPreview();
      return;
    }
    this.clockOf(layer).format = value;
    this.touchPreview();
  }

  onClockMode(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    if (event.value !== 'live' && event.value !== 'custom') return;
    this.clockOf(layer).mode = event.value;
    this.touchPreview();
  }

  useClockNow(layer: CgLayerDraft): void {
    this.clockDraft.set(this.formatWallClock(Date.now(), this.clockOf(layer).timeZone));
  }

  async pushClock(layer: CgLayerDraft): Promise<void> {
    const settings = this.clockOf(layer);
    const ms = wallClockToUtcMs(this.clockDraft(), settings.timeZone);
    if (ms == null) {
      this.notification.handleError('Clock', 'Enter a full date and time.');
      return;
    }
    settings.mode = 'custom';
    settings.customBaseMs = ms;
    settings.customPushedAtMs = Date.now();
    this.touchPreview();
    await this.cg.flushPendingLayerContent();
  }

  async searchPlaces(): Promise<void> {
    const results = await this.weatherApi.search(this.placeQuery());
    this.placeResults.set(results);
  }

  pickPlace(layer: CgLayerDraft, place: CgWeatherPlace): void {
    this.weatherOf(layer).location = {
      name: place.name,
      lat: place.lat,
      lon: place.lon,
    };
    this.placeQuery.set(place.label);
    this.placeResults.set([]);
    this.touchPreview();
  }

  private syncClockDraft(layer: CgLayerDraft | null): void {
    if (!layer || layer.element_type !== this.Clock) {
      this.clockDraft.set('');
      return;
    }
    const settings = layer.payload.clock ?? emptyClockSettings();
    const ms = settings.customBaseMs ?? Date.now();
    this.clockDraft.set(this.formatWallClock(ms, settings.timeZone));
  }

  private formatWallClock(ms: number, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '00';
    return `${read('year')}-${read('month')}-${read('day')}T${read('hour')}:${read('minute')}:${read('second')}`;
  }

  removeLayer(layer: CgLayerDraft): void {
    if (!confirm('Remove this layer from the package?')) return;
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
