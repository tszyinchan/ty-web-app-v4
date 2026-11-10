import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { CgAnchorGrid } from './cg-anchor-grid';
import { CgTextStyleEditor } from './cg-text-style-editor';
import { CgWheelStep } from '../../../../core/domains/cg/cg-wheel.directive';
import {
  CG_ANCHOR_GRID_OPTIONS,
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_LOGO_ACCEPT,
  CG_LOGO_MAX_BYTES,
  CG_MAX_DURATION_MS,
  CG_SUBTITLE_FONT_OPTIONS,
  CG_TEXT_WEIGHT_BOLD,
  CG_TITLE_PX_W_MAX,
  CG_TITLE_PX_W_MIN,
  CG_TITLE_PX_X_MAX,
  CG_TITLE_PX_X_MIN,
  CG_TITLE_PX_Y_MAX,
  CG_TITLE_PX_Y_MIN,
  CG_TITLE_LIVE_PLACE,
  CG_TITLE_STYLE_OPTIONS,
  CG_TITLE_VARIANTS,
  CG_WHEEL_MIN_FADE_MS,
  CgAnchor,
  CgTitleField,
  CgTitleStyleKey,
  CgTitleVariant,
} from '../../../../core/domains/cg/cg.constants';
import {
  CgLayerDraft,
  CgLayout,
  CgSubtitleStyle,
  CgTitleAlign,
  CgTitleFieldMap,
  CgTitleItem,
  CgTitleSettings,
  CgTitleSlot,
  CgTitleVariantLayout,
} from '../../../../core/domains/cg/cg.model';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  clampTitleSlot,
  defaultTitleBackgroundLayout,
  defaultTitleVariantLayouts,
  emptyTitleFields,
  emptyTitleSettings,
  isTitleVariant,
  titleAirAfterItem,
  titleAirAfterLive,
  titleFieldsOf,
  titleItemFromFields,
  titleItemSummary,
  titleVariantDef,
} from '../../../../core/domains/cg/cg-title.util';
import {
  fontVhToDisplayPx,
  layoutAxisFromDisplayPx,
  layoutAxisToDisplayPx,
} from '../../../../core/domains/cg/cg-title-units.util';
import {
  anchorIgnoresAxis,
  anchorSideX,
  anchorSideY,
  isEmbeddedImageUrl,
  isLocalFilesystemPath,
} from '../../../../core/domains/cg/cg.util';
import { NotificationService } from '../../../../core/services/notification.service';

export type TitleDeskTab = 'content' | 'text' | 'item' | 'settings';
type TitlePlaceKey = CgTitleVariant | typeof CG_TITLE_LIVE_PLACE;

const BIG_TABS: ReadonlyArray<{ value: TitleDeskTab; label: string }> = [
  { value: 'content', label: '內容' },
  { value: 'text', label: '文字樣式' },
  { value: 'item', label: '項目樣式' },
  { value: 'settings', label: '設定' },
];

/** What each text slot paints. Shown on the Text style page; do not guess new words here. */
const STYLE_MAPPING: ReadonlyArray<{
  key: CgTitleStyleKey;
  label: string;
  hint: string;
  uses: string;
}> = [
  {
    key: CgTitleStyleKey.A,
    label: 'Primary',
    hint: 'Headline',
    uses: 'Strap／Name super／Credit／Name + source／Name stack／Story + locator／Live 嘅 Headline',
  },
  {
    key: CgTitleStyleKey.B,
    label: 'Secondary',
    hint: 'Subhead',
    uses: 'Subhead／Locator',
  },
  {
    key: CgTitleStyleKey.C,
    label: 'Accent',
    hint: 'Banner headline',
    uses: 'Banner Headline',
  },
];

const STYLE_COMPARE_ROWS = [
  'Font',
  'Size',
  'Color',
  '字距 (em)',
  '行距',
  'Stroke (em)',
  'Shadow (angle / distance / radius)',
] as const;

type StyleCompareRow = (typeof STYLE_COMPARE_ROWS)[number];

export interface TitleOverviewWord {
  label: string;
  anchor: string;
  x: string;
  y: string;
  width: number;
  align: string;
}

export interface TitleOverviewCard {
  value: TitlePlaceKey;
  label: string;
  bgAnchor: string;
  bgX: string;
  bgY: string;
  bgScale: number;
  words: TitleOverviewWord[];
}

@Component({
  selector: 'app-cg-title-desk',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CgWheelStep,
    CgAnchorGrid,
    CgTextStyleEditor,
  ],
  templateUrl: './cg-title-desk.html',
  styleUrl: './cg-title-desk.scss',
  host: { class: 'cg-title-desk' },
})
export class CgTitleDesk {
  private readonly cg = inject(CgService);
  private readonly notification = inject(NotificationService);
  private readonly layoutDefaults = defaultTitleVariantLayouts();

  readonly layer = input.required<CgLayerDraft>();
  readonly outline = input(false);
  /** True while the Panel really lists this layer on air (`CgService.onAirOutput`). */
  readonly onAir = input(false);
  readonly outlineChange = output<boolean>();
  /** Big tab is owned by the Layer desk so the Layer card "…" can open Settings. */
  readonly tab = input<TitleDeskTab>('content');
  readonly tabChange = output<TitleDeskTab>();

  readonly bigTabs = BIG_TABS;
  readonly variants = CG_TITLE_VARIANTS;
  readonly placeOptions: ReadonlyArray<{ value: TitlePlaceKey; label: string }> = [
    ...CG_TITLE_VARIANTS.map((row) => ({ value: row.value, label: row.label })),
    { value: CG_TITLE_LIVE_PLACE, label: 'Live' },
  ];
  readonly styleOptions = CG_TITLE_STYLE_OPTIONS;
  readonly styleMapping = STYLE_MAPPING;
  readonly styleCompareRows = STYLE_COMPARE_ROWS;
  readonly anchors = CG_ANCHOR_GRID_OPTIONS;
  readonly logoAccept = CG_LOGO_ACCEPT;
  readonly slotXMin = CG_TITLE_PX_X_MIN;
  readonly slotXMax = CG_TITLE_PX_X_MAX;
  readonly slotYMin = CG_TITLE_PX_Y_MIN;
  readonly slotYMax = CG_TITLE_PX_Y_MAX;
  readonly slotWidthMin = CG_TITLE_PX_W_MIN;
  readonly slotWidthMax = CG_TITLE_PX_W_MAX;
  readonly cutMs = CG_CUT_DURATION_MS;
  readonly maxDurationMs = CG_MAX_DURATION_MS;
  readonly wheelMinMs = CG_WHEEL_MIN_FADE_MS;
  readonly summary = titleItemSummary;
  readonly liveKey = CG_TITLE_LIVE_PLACE;
  readonly storyKey = CgTitleVariant.StoryLocator;
  readonly monitorCollapsed = signal(false);

  variant: CgTitleVariant = CgTitleVariant.Strap;
  fields: CgTitleFieldMap = emptyTitleFields();
  editingId: string | null = null;
  styleTab: CgTitleStyleKey = CgTitleStyleKey.A;
  placeVariant: TitlePlaceKey = CgTitleVariant.Strap;
  liveA = '';
  liveB = '';
  liveSource = '';

  private boundId = '';

  constructor() {
    effect(() => {
      const layer = this.layer();
      untracked(() => {
        if (layer.clientId === this.boundId) return;
        this.boundId = layer.clientId;
        this.resetComposer();
        this.placeVariant = CgTitleVariant.Strap;
        this.styleTab = CgTitleStyleKey.A;
        const live = layer.payload.title?.live;
        this.liveA = live?.a ?? '';
        this.liveB = live?.b ?? '';
        this.liveSource = live?.source ?? '';
      });
    });
  }

  title(): CgTitleSettings {
    const layer = this.layer();
    layer.payload.title ??= emptyTitleSettings();
    return layer.payload.title;
  }

  setTab(value: TitleDeskTab): void {
    this.tabChange.emit(value);
  }

  toggleMonitor(): void {
    this.monitorCollapsed.update((value) => !value);
  }

  // ---- Content: Queue + composer ----

  onComposerVariant(value: string): void {
    if (isTitleVariant(value)) this.variant = value;
  }

  composerFields() {
    return titleVariantDef(this.variant).fields;
  }

  isOn(item: CgTitleItem): boolean {
    return this.title().onAir.includes(item.id);
  }

  pushItem(event?: Event): void {
    event?.preventDefault();
    const title = this.title();
    const item = titleItemFromFields(
      this.editingId ?? crypto.randomUUID(),
      this.variant,
      this.fields,
    );
    if (!item) return;
    title.items = this.editingId
      ? title.items.map((row) => (row.id === item.id ? item : row))
      : [...title.items, item];
    this.resetComposer();
    this.saveContent();
  }

  beginEdit(item: CgTitleItem, event: Event): void {
    event.stopPropagation();
    this.editingId = item.id;
    this.variant = item.variant;
    this.fields = titleFieldsOf(item);
  }

  cancelEdit(): void {
    this.resetComposer();
  }

  toggleItem(item: CgTitleItem): void {
    const title = this.title();
    const next = titleAirAfterItem(title, item, !this.isOn(item));
    void this.cg.setTitleAir(this.layer().clientId, next.onAir, next.live);
  }

  removeItem(item: CgTitleItem, event: Event): void {
    event.stopPropagation();
    const title = this.title();
    title.items = title.items.filter((row) => row.id !== item.id);
    if (this.editingId === item.id) this.resetComposer();
    if (title.onAir.includes(item.id)) {
      const next = titleAirAfterItem(title, item, false);
      void this.cg.setTitleAir(this.layer().clientId, next.onAir, next.live);
    }
    this.saveContent();
  }

  clearAll(): void {
    const title = this.title();
    if (title.items.length === 0) return;
    if (!confirm('Clear all title items?')) return;
    title.items = [];
    this.resetComposer();
    void this.cg.setTitleAir(this.layer().clientId, [], title.live);
    this.saveContent();
  }

  onDrop(event: CdkDragDrop<CgTitleItem[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const title = this.title();
    const items = [...title.items];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    title.items = items;
    this.saveContent();
  }

  // ---- Content: Live bar ----

  pushLive(field: 'a' | 'b' | 'source', event?: Event): void {
    event?.preventDefault();
    const title = this.title();
    const value =
      field === 'a' ? this.liveA : field === 'b' ? this.liveB : this.liveSource;
    const live = { ...title.live, [field]: value.trim() };
    const next = titleAirAfterLive(title, live);
    void this.cg.setTitleAir(this.layer().clientId, next.onAir, next.live);
  }

  toggleLive(): void {
    const title = this.title();
    const next = titleAirAfterLive(title, { ...title.live, on: !title.live.on });
    void this.cg.setTitleAir(this.layer().clientId, next.onAir, next.live);
  }

  // ---- Text style ----

  onStyleTab(value: CgTitleStyleKey): void {
    this.styleTab = value;
  }

  styleOf(key: CgTitleStyleKey): CgSubtitleStyle {
    return this.title().styles[key];
  }

  styleMap(key: CgTitleStyleKey) {
    return this.styleMapping.find((row) => row.key === key) ?? this.styleMapping[0];
  }

  /** The two slots that are not being edited, e.g. "Secondary 32.4px #ffffff／Accent 60.5px #ff2d2d". */
  otherStylesBrief(): string {
    return this.styleMapping
      .filter((row) => row.key !== this.styleTab)
      .map((row) => {
        const style = this.styleOf(row.key);
        return `${row.label} ${this.sizeLabel(style)} ${this.colorLabel(style)}`;
      })
      .join('／');
  }

  styleCell(key: CgTitleStyleKey, row: StyleCompareRow): string {
    const style = this.styleOf(key);
    switch (row) {
      case 'Font':
        return this.fontLabel(style);
      case 'Size':
        return `${this.sizeLabel(style)}${style.fontWeight === CG_TEXT_WEIGHT_BOLD ? ' Bold' : ''}`;
      case 'Color':
        return this.colorLabel(style);
      case '字距 (em)':
        return String(style.letterSpacing ?? 0.02);
      case '行距':
        return String(style.lineHeight ?? 1.1);
      case 'Stroke (em)':
        if (style.borderWidth === undefined) return '—';
        return style.borderWidth > 0
          ? `${style.borderWidth} ${style.borderColor ?? '#000000'}`
          : '0';
      default:
        if (style.shadowDistance === undefined && style.shadowRadius === undefined) {
          return '—';
        }
        return `${style.shadowAngle ?? 135} / ${style.shadowDistance ?? 0} / ${style.shadowRadius ?? 2}`;
    }
  }

  // ---- Item style ----

  onPlaceVariant(value: TitlePlaceKey): void {
    this.placeVariant = value;
  }

  placeFields() {
    return titleVariantDef(this.layoutVariant()).fields;
  }

  placeLabel(): string {
    return this.placeOptions.find((row) => row.value === this.placeVariant)?.label ?? '';
  }

  /** "Primary" / "Secondary" / "Accent" for the style slot a word paints with. */
  fieldStyleLabel(styleKey: CgTitleStyleKey): string {
    return this.styleMap(styleKey).label;
  }

  place(): CgTitleVariantLayout {
    return this.layoutOf(this.placeVariant);
  }

  elementSlot(field: CgTitleField): CgTitleSlot {
    const slots = this.place().slots;
    const found = slots[field];
    if (found) return found;
    const slot: CgTitleSlot = { ...this.fallbackSlot(this.layoutVariant(), field) };
    slots[field] = slot;
    return slot;
  }

  setSlotNumber(field: CgTitleField, key: 'x' | 'y' | 'width', value: number | null): void {
    if (value === null || !Number.isFinite(value)) return;
    const current = this.elementSlot(field);
    this.place().slots[field] = clampTitleSlot({ ...current, [key]: value }, current);
    this.saveContent();
  }

  onSlotAnchor(field: CgTitleField, anchor: CgAnchor): void {
    const current = this.elementSlot(field);
    this.place().slots[field] = { ...current, anchor };
    this.saveContent();
  }

  slotIgnores(field: CgTitleField, axis: 'x' | 'y'): boolean {
    return anchorIgnoresAxis(this.elementSlot(field).anchor)[axis];
  }

  slotAxisLabel(field: CgTitleField, axis: 'x' | 'y'): string {
    return this.axisLabel(this.elementSlot(field).anchor, axis);
  }

  setSlotAlign(field: CgTitleField, value: unknown): void {
    if (value !== 'left' && value !== 'center' && value !== 'right') return;
    const align: CgTitleAlign = value;
    const current = this.elementSlot(field);
    this.place().slots[field] = { ...current, align };
    this.saveContent();
  }

  // Background (display px, stored % or px in the layout's own unit)

  bgLayout(): CgLayout {
    return (
      this.place().background?.layout ??
      defaultTitleBackgroundLayout(this.layoutVariant())
    );
  }

  hasBackground(): boolean {
    return !!this.place().background?.imageUrl;
  }

  bgIgnores(axis: 'x' | 'y'): boolean {
    return anchorIgnoresAxis(this.bgLayout().anchor)[axis];
  }

  bgAxisLabel(axis: 'x' | 'y'): string {
    return this.axisLabel(this.bgLayout().anchor, axis);
  }

  bgPx(axis: 'x' | 'y'): number {
    return layoutAxisToDisplayPx(this.bgLayout(), axis);
  }

  setBgPx(axis: 'x' | 'y', px: number | null): void {
    if (px === null || !Number.isFinite(px)) return;
    const layout = this.ensureBackground();
    layout[axis] = layoutAxisFromDisplayPx(layout, axis, px);
    this.saveContent();
  }

  setBgScale(value: number | null): void {
    if (value === null || !Number.isFinite(value)) return;
    this.ensureBackground().scale = value;
    this.saveContent();
  }

  onBgAnchor(anchor: CgAnchor): void {
    this.ensureBackground().anchor = anchor;
    this.saveContent();
  }

  onBackgroundUrl(url: string): void {
    if (isLocalFilesystemPath(url) || isEmbeddedImageUrl(url)) {
      this.notification.handleError(
        'Image',
        'Use Choose local image or an http(s) URL.',
      );
      return;
    }
    const trimmed = url.trim();
    const place = this.place();
    if (!trimmed) {
      place.background = undefined;
      this.saveContent();
      return;
    }
    const layout = this.ensureBackground();
    place.background = {
      imageUrl: trimmed,
      ...(place.background?.fileName ? { fileName: place.background.fileName } : {}),
      layout,
    };
    this.saveContent();
  }

  async onBackgroundFile(event: Event): Promise<void> {
    const inputEl = event.target;
    if (!(inputEl instanceof HTMLInputElement)) return;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    if (file.size > CG_LOGO_MAX_BYTES) {
      this.notification.handleError('Image', 'File is larger than 1.5 MB.');
      return;
    }
    const url = await this.cg.uploadLogoImage(this.layer().public_token, file);
    if (!url) return;
    const layout = { ...this.bgLayout() };
    this.place().background = { imageUrl: url, fileName: file.name, layout };
    this.saveContent();
  }

  clearBackground(): void {
    this.place().background = undefined;
    this.saveContent();
  }

  // Outline + Fade

  isCut(): boolean {
    return (this.layer().payload.transition?.duration_ms ?? CG_DEFAULT_DURATION_MS) === 0;
  }

  cueMs(): number {
    return this.layer().payload.transition?.duration_ms ?? CG_DEFAULT_DURATION_MS;
  }

  onAppear(event: MatButtonToggleChange): void {
    const cut = event.value === 'cut';
    const current = this.cueMs();
    this.layer().payload.transition = {
      duration_ms: cut ? 0 : current === 0 ? CG_DEFAULT_DURATION_MS : current,
    };
    this.saveContent();
  }

  onCueMs(value: number): void {
    this.layer().payload.transition = { duration_ms: value };
    this.saveContent();
  }

  toggleOutline(): void {
    this.outlineChange.emit(!this.outline());
  }

  // Read-only overview of all nine places (does not create missing slots).

  overview(): TitleOverviewCard[] {
    return this.placeOptions.map((option) => {
      const layout = this.layoutOf(option.value);
      const variant = this.layoutVariantOf(option.value);
      const bg = layout.background?.layout ?? defaultTitleBackgroundLayout(variant);
      const bgIgnoresX = anchorIgnoresAxis(bg.anchor).x;
      const bgIgnoresY = anchorIgnoresAxis(bg.anchor).y;
      return {
        value: option.value,
        label: option.label,
        bgAnchor: this.anchorLabel(bg.anchor),
        bgX: bgIgnoresX ? '—' : String(layoutAxisToDisplayPx(bg, 'x')),
        bgY: bgIgnoresY ? '—' : String(layoutAxisToDisplayPx(bg, 'y')),
        bgScale: bg.scale,
        words: titleVariantDef(variant).fields.map((field) => {
          const slot = layout.slots[field.key] ?? this.fallbackSlot(variant, field.key);
          const ignores = anchorIgnoresAxis(slot.anchor);
          return {
            label: field.label,
            anchor: this.anchorLabel(slot.anchor),
            x: ignores.x ? '—' : String(slot.x),
            y: ignores.y ? '—' : String(slot.y),
            width: slot.width,
            align: slot.align,
          };
        }),
      };
    });
  }

  saveContent(): void {
    this.cg.touchPreview();
    this.cg.schedulePersistLayerContent(this.layer().clientId);
  }

  private layoutOf(key: TitlePlaceKey): CgTitleVariantLayout {
    if (key === CG_TITLE_LIVE_PLACE) return this.title().liveLayout;
    return this.title().variants[key];
  }

  private layoutVariantOf(key: TitlePlaceKey): CgTitleVariant {
    return key === CG_TITLE_LIVE_PLACE ? CgTitleVariant.StoryLocator : key;
  }

  private layoutVariant(): CgTitleVariant {
    return this.layoutVariantOf(this.placeVariant);
  }

  private fallbackSlot(variant: CgTitleVariant, field: CgTitleField): CgTitleSlot {
    return (
      this.layoutDefaults[variant].slots[field] ?? {
        anchor: CgAnchor.BottomLeft,
        x: 64,
        y: 64,
        width: 640,
        align: 'left' as const,
      }
    );
  }

  private ensureBackground(): CgLayout {
    const place = this.place();
    if (!place.background) {
      place.background = {
        imageUrl: '',
        layout: defaultTitleBackgroundLayout(this.layoutVariant()),
      };
    }
    return place.background.layout;
  }

  private resetComposer(): void {
    this.editingId = null;
    this.variant = CgTitleVariant.Strap;
    this.fields = emptyTitleFields();
  }

  private axisLabel(anchor: CgAnchor, axis: 'x' | 'y'): string {
    if (axis === 'x') {
      const side = anchorSideX(anchor);
      return side === 'center' ? 'X · centered' : `From ${side} (px)`;
    }
    const side = anchorSideY(anchor);
    return side === 'center' ? 'Y · centered' : `From ${side} (px)`;
  }

  private anchorLabel(anchor: CgAnchor): string {
    return this.anchors.find((row) => row.value === anchor)?.label ?? anchor;
  }

  private sizeLabel(style: CgSubtitleStyle): string {
    return `${fontVhToDisplayPx(style.fontSize ?? 3.5)}px`;
  }

  private colorLabel(style: CgSubtitleStyle): string {
    const color = style.color ?? '#ffffff';
    return style.gradientTo ? `${color} → ${style.gradientTo}` : color;
  }

  private fontLabel(style: CgSubtitleStyle): string {
    const family = style.fontFamily?.trim();
    if (!family) return 'Default (DFHei / JhengHei)';
    return CG_SUBTITLE_FONT_OPTIONS.find((font) => font.value === family)?.label ?? family;
  }
}
