import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, effect, inject, input, output, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { CgTextStyleEditor } from './cg-text-style-editor';
import { CgWheelSelect, CgWheelStep } from '../../../../core/domains/cg/cg-wheel.directive';
import {
  CG_ANCHOR_GRID_OPTIONS,
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_LOGO_ACCEPT,
  CG_LOGO_MAX_BYTES,
  CG_MAX_DURATION_MS,
  CG_TITLE_STYLE_OPTIONS,
  CG_TITLE_VARIANTS,
  CG_TITLE_WIDTH_MAX,
  CG_TITLE_WIDTH_MIN,
  CG_WHEEL_MIN_FADE_MS,
  CgAnchor,
  CgTitleStyleKey,
  CgTitleVariant,
} from '../../../../core/domains/cg/cg.constants';
import {
  CgLayerDraft,
  CgLayout,
  CgSubtitleStyle,
  CgTitleFieldMap,
  CgTitleItem,
  CgTitleSettings,
  CgTitleVariantLayout,
} from '../../../../core/domains/cg/cg.model';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  defaultTitleBackgroundLayout,
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
  anchorIgnoresAxis,
  anchorSideX,
  anchorSideY,
  isEmbeddedImageUrl,
  isLocalFilesystemPath,
} from '../../../../core/domains/cg/cg.util';
import { NotificationService } from '../../../../core/services/notification.service';

type TitleDeskTab = 'queue' | 'live' | 'look';

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
    CgWheelSelect,
    CgWheelStep,
    CgTextStyleEditor,
  ],
  templateUrl: './cg-title-desk.html',
  styleUrl: './cg-title-desk.scss',
  host: { class: 'cg-title-desk' },
})
export class CgTitleDesk {
  private readonly cg = inject(CgService);
  private readonly notification = inject(NotificationService);

  readonly layer = input.required<CgLayerDraft>();
  readonly outline = input(false);
  readonly outlineChange = output<boolean>();

  readonly variants = CG_TITLE_VARIANTS;
  readonly variantValues = CG_TITLE_VARIANTS.map((row) => row.value);
  readonly styleOptions = CG_TITLE_STYLE_OPTIONS;
  readonly anchors = CG_ANCHOR_GRID_OPTIONS;
  readonly logoAccept = CG_LOGO_ACCEPT;
  readonly widthMin = CG_TITLE_WIDTH_MIN;
  readonly widthMax = CG_TITLE_WIDTH_MAX;
  readonly cutMs = CG_CUT_DURATION_MS;
  readonly maxDurationMs = CG_MAX_DURATION_MS;
  readonly wheelMinMs = CG_WHEEL_MIN_FADE_MS;
  readonly summary = titleItemSummary;
  readonly variantLabel = (variant: CgTitleVariant) => titleVariantDef(variant).label;

  tab: TitleDeskTab = 'queue';
  variant: CgTitleVariant = CgTitleVariant.Headline;
  fields: CgTitleFieldMap = emptyTitleFields();
  editingId: string | null = null;
  placeVariant: CgTitleVariant = CgTitleVariant.Headline;
  styleKey: CgTitleStyleKey = CgTitleStyleKey.A;
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
        this.placeVariant = CgTitleVariant.Headline;
        this.styleKey = CgTitleStyleKey.A;
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

  onTab(event: MatButtonToggleChange): void {
    const value = event.value;
    if (value === 'queue' || value === 'live' || value === 'look') this.tab = value;
  }

  onComposerVariant(value: string): void {
    if (isTitleVariant(value)) this.variant = value;
  }

  onPlaceVariant(value: string): void {
    if (isTitleVariant(value)) this.placeVariant = value;
  }

  onStyleKey(event: MatButtonToggleChange): void {
    const value = event.value;
    if (
      value === CgTitleStyleKey.A ||
      value === CgTitleStyleKey.B ||
      value === CgTitleStyleKey.C
    ) {
      this.styleKey = value;
    }
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

  stylePaint(): CgSubtitleStyle {
    return this.title().styles[this.styleKey];
  }

  place(): CgTitleVariantLayout {
    return this.title().variants[this.placeVariant];
  }

  textLayout(): CgLayout {
    return this.place().text;
  }

  bgLayout(): CgLayout {
    return (
      this.place().background?.layout ??
      defaultTitleBackgroundLayout(this.placeVariant)
    );
  }

  hasBackground(): boolean {
    return !!this.place().background?.imageUrl;
  }

  textIgnores(axis: 'x' | 'y'): boolean {
    return anchorIgnoresAxis(this.textLayout().anchor)[axis];
  }

  bgIgnores(axis: 'x' | 'y'): boolean {
    return anchorIgnoresAxis(this.bgLayout().anchor)[axis];
  }

  axisLabel(layout: CgLayout, axis: 'x' | 'y'): string {
    if (axis === 'x') {
      const side = anchorSideX(layout.anchor);
      return side === 'center' ? 'X · centered' : `From ${side}`;
    }
    const side = anchorSideY(layout.anchor);
    return side === 'center' ? 'Y · centered' : `From ${side}`;
  }

  onTextAnchor(event: MatButtonToggleChange): void {
    const value = event.value as CgAnchor;
    if (!value) return;
    this.textLayout().anchor = value;
    this.saveContent();
  }

  onBgAnchor(event: MatButtonToggleChange): void {
    const value = event.value as CgAnchor;
    if (!value) return;
    this.ensureBackground().anchor = value;
    this.saveContent();
  }

  setTextNumber(key: 'x' | 'y' | 'scale', value: number): void {
    this.textLayout()[key] = value;
    this.saveContent();
  }

  setWidth(value: number): void {
    this.place().width = value;
    this.saveContent();
  }

  setBgNumber(key: 'x' | 'y' | 'scale', value: number): void {
    this.ensureBackground()[key] = value;
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

  private ensureBackground(): CgLayout {
    const place = this.place();
    if (!place.background) {
      place.background = {
        imageUrl: '',
        layout: defaultTitleBackgroundLayout(this.placeVariant),
      };
    }
    return place.background.layout;
  }

  private resetComposer(): void {
    this.editingId = null;
    this.variant = CgTitleVariant.Headline;
    this.fields = emptyTitleFields();
  }

  saveContent(): void {
    this.cg.touchPreview();
    this.cg.schedulePersistLayerContent(this.layer().clientId);
  }
}
