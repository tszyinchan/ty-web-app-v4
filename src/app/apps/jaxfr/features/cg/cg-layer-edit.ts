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
import { CgNewsQueue } from './cg-news-queue';
import {
  CG_ANCHOR_GRID_OPTIONS,
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
  CG_ANCHOR_OPTIONS,
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_LAYER_LOOK_OPTIONS,
  CG_LOGO_ACCEPT,
  CG_LOGO_MAX_BYTES,
  CG_MAX_DURATION_MS,
  CG_SUBTITLE_ALIGN_OPTIONS,
  CG_SUBTITLE_FONT_GROUPS,
  CG_SUBTITLE_FONT_OPTIONS,
  CG_TEXT_GRADIENT_ANGLE,
  CG_TEXT_GRADIENT_TO,
  CG_TEXT_WEIGHT_BOLD,
  CG_TICKER_FADE_WIDTH_MAX,
  CG_TICKER_FADE_WIDTH_MIN,
  CG_TICKER_GAP_MAX,
  CG_TICKER_GAP_MIN,
  CG_TICKER_HEIGHT_DEFAULT,
  CG_TICKER_SPEED_MAX,
  CG_TICKER_SPEED_MIN,
  CG_TICKER_WIDTH_DEFAULT,
  CG_WHEEL_MIN_FADE_MS,
  DEFAULT_BREAKING_BACKGROUND_LAYOUT,
  DEFAULT_TICKER_BACKGROUND_LAYOUT,
  CgAnchor,
  CgElementType,
  CgLayerLook,
  CgLayoutUnit,
  CgSubtitleFontGroup,
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
  clampTickerFadeWidth,
  clampTickerGap,
  clampTickerSpeed,
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
    CgTextStyleEditor,
    CgNewsQueue,
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
  readonly tickerWidthDefault = CG_TICKER_WIDTH_DEFAULT;
  readonly tickerHeightDefault = CG_TICKER_HEIGHT_DEFAULT;
  readonly clockFormats = CG_CLOCK_FORMAT_OPTIONS;
  readonly clockLocales = CG_CLOCK_LOCALE_OPTIONS;
  readonly clockZones = CG_CLOCK_TIMEZONE_OPTIONS;
  readonly weatherUnits = CG_WEATHER_UNIT_OPTIONS;
  readonly clockFormatCustom = CG_CLOCK_FORMAT_CUSTOM;
  readonly clockDraft = signal('');
  readonly placeQuery = signal('');
  readonly placeResults = signal<CgWeatherPlace[]>([]);
  readonly lookOptions = CG_LAYER_LOOK_OPTIONS;
  readonly fontOptions = CG_SUBTITLE_FONT_OPTIONS;
  readonly fontGroups = CG_SUBTITLE_FONT_GROUPS;
  readonly customFontOpen = signal(false);
  readonly PresetNews = CgSubtitlePreset.News;
  readonly PresetShow = CgSubtitlePreset.Show;
  readonly PresetCustom = CgSubtitlePreset.Custom;
  readonly anchorOptions = CG_ANCHOR_OPTIONS;
  readonly anchorGridOptions = CG_ANCHOR_GRID_OPTIONS;
  readonly alignOptions = CG_SUBTITLE_ALIGN_OPTIONS;
  readonly logoAccept = CG_LOGO_ACCEPT;
  readonly scriptAccept = '.txt,.srt,text/plain,application/x-subrip';
  readonly cutMs = CG_CUT_DURATION_MS;
  readonly maxDurationMs = CG_MAX_DURATION_MS;
  readonly wheelMinMs = CG_WHEEL_MIN_FADE_MS;
  readonly textGradientAngle = CG_TEXT_GRADIENT_ANGLE;
  readonly textGradientTo = CG_TEXT_GRADIENT_TO;
  /** Font wheel order = dropdown order; "Other…" is left out on purpose. */
  readonly fontWheelValues: readonly string[] = [
    '',
    ...CG_SUBTITLE_FONT_GROUPS.flatMap((group) =>
      CG_SUBTITLE_FONT_OPTIONS.filter((font) => font.group === group.id).map(
        (font) => font.value,
      ),
    ),
  ];
  readonly layersBackdrop = this.cg.layersBackdrop;
  readonly copyTargetId = signal('');
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

  /** Re-sync the custom font field when the route layer changes. */
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
      this.syncCustomFontOpen(layer);
      this.syncClockDraft(layer);
      this.placeQuery.set('');
      this.placeResults.set([]);
    });
  });

  readonly copyTargets = computed(() => {
    const current = this.packageId;
    return this.cg
      .packages()
      .filter((pkg) => pkg.tb_tyapp_cgpk_id !== current);
  });

  readonly copyWheelValues = computed(() => [
    '',
    ...this.copyTargets().map((pkg) => pkg.tb_tyapp_cgpk_id),
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

  onAnchorToggle(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    const value = event.value as CgAnchor;
    if (!value) {
      if (event.source?.buttonToggleGroup) {
        event.source.buttonToggleGroup.value = layer.layout.anchor;
      }
      return;
    }
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

  /** Label that says which edge X / Y is measured from. */
  placeAxisLabel(layer: CgLayerDraft, axis: 'x' | 'y'): string {
    const unit = layer.layout.unit === CgLayoutUnit.Pixel ? '' : ' (%)';
    if (axis === 'x') {
      const side = anchorSideX(layer.layout.anchor);
      if (side === 'center') return 'X · centered';
      return `From ${side}${unit}`;
    }
    const side = anchorSideY(layer.layout.anchor);
    if (side === 'center') return 'Y · centered';
    return `From ${side}${unit}`;
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

  fontsInGroup(group: CgSubtitleFontGroup) {
    return this.fontOptions.filter((font) => font.group === group);
  }

  selectedFontValue(layer: CgLayerDraft): string {
    if (this.customFontOpen()) return '__custom__';
    const family = layer.payload.style?.fontFamily?.trim();
    if (!family) return '';
    const match = this.fontOptions.find((opt) => opt.value === family);
    return match ? match.value : '__custom__';
  }

  isCustomFont(layer: CgLayerDraft): boolean {
    return this.selectedFontValue(layer) === '__custom__';
  }

  onFontSelectChange(layer: CgLayerDraft, value: string): void {
    if (value === '__custom__') {
      this.customFontOpen.set(true);
      this.ensureCustomPreset(layer);
      this.touchPreview();
      return;
    }
    this.customFontOpen.set(false);
    const style = this.getSubtitleStyle(layer);
    style.fontFamily = value || undefined;
    this.onStyleFieldChange(layer);
  }

  private syncCustomFontOpen(layer: CgLayerDraft | null): void {
    if (!layer || layer.element_type !== this.Subtitle) {
      this.customFontOpen.set(false);
      return;
    }
    const family = layer.payload.style?.fontFamily?.trim() ?? '';
    this.customFontOpen.set(
      !!family && !this.fontOptions.some((opt) => opt.value === family),
    );
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

  textPaintToggles(style: CgSubtitleStyle): string[] {
    const values: string[] = [];
    if (style.fontWeight === CG_TEXT_WEIGHT_BOLD) values.push('bold');
    if (style.italic) values.push('italic');
    if (style.underline) values.push('underline');
    if (style.strike) values.push('strike');
    return values;
  }

  onTextPaintToggle(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    const raw = Array.isArray(event.value)
      ? event.value
      : event.source.buttonToggleGroup?.value;
    const selected = new Set(
      Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === 'string')
        : [],
    );
    const style = this.getSubtitleStyle(layer);
    if (selected.has('bold')) style.fontWeight = CG_TEXT_WEIGHT_BOLD;
    else if (style.fontWeight === CG_TEXT_WEIGHT_BOLD) delete style.fontWeight;
    this.setPaintFlag(style, 'italic', selected.has('italic'));
    this.setPaintFlag(style, 'underline', selected.has('underline'));
    this.setPaintFlag(style, 'strike', selected.has('strike'));
    this.onStyleFieldChange(layer);
  }

  gradientOn(style: CgSubtitleStyle): boolean {
    return style.gradientTo !== undefined;
  }

  onFillToggle(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    const style = this.getSubtitleStyle(layer);
    const value = event.value;
    if (value !== 'solid' && value !== 'gradient') {
      if (event.source?.buttonToggleGroup) {
        event.source.buttonToggleGroup.value =
          style.gradientTo !== undefined ? 'gradient' : 'solid';
      }
      return;
    }
    if (value === 'gradient') {
      if (!style.gradientTo) style.gradientTo = CG_TEXT_GRADIENT_TO;
      if (style.gradientAngle == null) style.gradientAngle = CG_TEXT_GRADIENT_ANGLE;
    } else {
      delete style.gradientTo;
      delete style.gradientAngle;
    }
    this.onStyleFieldChange(layer);
  }

  onGradientToChange(layer: CgLayerDraft, value: string): void {
    const style = this.getSubtitleStyle(layer);
    const next = value.trim();
    style.gradientTo = next || CG_TEXT_GRADIENT_TO;
    this.onStyleFieldChange(layer);
  }

  private setPaintFlag(
    style: CgSubtitleStyle,
    key: 'italic' | 'underline' | 'strike',
    on: boolean,
  ): void {
    if (on) style[key] = true;
    else delete style[key];
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
    return layer.payload.ticker;
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

  onBackgroundAnchor(layer: CgLayerDraft, event: MatButtonToggleChange): void {
    const value = event.value as CgAnchor;
    const layout = this.backgroundLayout(layer);
    if (!value) return;
    layout.anchor = value;
    this.touchPreview();
  }

  backgroundIgnores(layer: CgLayerDraft, axis: 'x' | 'y'): boolean {
    const layout = layer.payload.background?.layout;
    if (!layout) return false;
    return anchorIgnoresAxis(layout.anchor)[axis];
  }

  backgroundAxisLabel(layer: CgLayerDraft, axis: 'x' | 'y'): string {
    const layout = this.backgroundLayout(layer);
    if (axis === 'x') {
      const side = anchorSideX(layout.anchor);
      return side === 'center' ? 'X · centered' : `From ${side}`;
    }
    const side = anchorSideY(layout.anchor);
    return side === 'center' ? 'Y · centered' : `From ${side}`;
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
