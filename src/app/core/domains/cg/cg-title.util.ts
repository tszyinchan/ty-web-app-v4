import {
  CG_STAGE_REFERENCE_WIDTH_PX,
  CG_TEXT_WEIGHT_BOLD,
  CG_TEXT_WEIGHT_MEDIUM,
  CG_TITLE_FONT_A,
  CG_TITLE_FONT_B,
  CG_TITLE_FONT_C,
  CG_TITLE_FONT_STACK,
  CG_TITLE_PX_W_MAX,
  CG_TITLE_PX_W_MIN,
  CG_TITLE_PX_X_MAX,
  CG_TITLE_PX_X_MIN,
  CG_TITLE_PX_Y_MAX,
  CG_TITLE_PX_Y_MIN,
  CG_TITLE_RUN_PAD_X_EM,
  CG_TITLE_VARIANTS,
  CgAnchor,
  CgLayoutUnit,
  CgSubtitlePreset,
  CgTitleField,
  CgTitleStyleKey,
  CgTitleVariant,
} from './cg.constants';
import {
  CgLayout,
  CgSubtitleStyle,
  CgTextPaint,
  CgTitleAlign,
  CgTitleFieldMap,
  CgTitleItem,
  CgTitleLive,
  CgTitleSettings,
  CgTitleSlot,
  CgTitleSlots,
  CgTitleVariantLayout,
} from './cg.model';

/** One word before it is placed inside the text box. */
export interface CgTitleElementModel {
  field: CgTitleField;
  text: string;
  styleKey: CgTitleStyleKey;
  slot: CgTitleSlot;
}

/** One word placed in its own box on the Stage. */
export interface CgTitlePlacedElement {
  field: CgTitleField;
  text: string;
  styleKey: CgTitleStyleKey;
  anchor: CgAnchor;
  x: number;
  y: number;
  width: number;
  align: CgTitleAlign;
  /** Horizontal squash so the ink fits this box. 1 = no squash. */
  fit: number;
}

export interface CgTitlePlace {
  elements: CgTitlePlacedElement[];
}

/** What the renderer holds for one on-screen Title, before fade phase. */
export interface CgTitleCardModel {
  key: string;
  elements: CgTitleElementModel[];
  backgroundUrl: string;
  backgroundLayout: CgLayout;
}

/** 1vh on a 1080-tall 16:9 stage, in 1920-wide design pixels. */
const TITLE_VH_PX = (CG_STAGE_REFERENCE_WIDTH_PX * 9) / 16 / 100;

const LEGACY_LAYOUT_KEY: Partial<Record<CgTitleVariant, string>> = {
  [CgTitleVariant.Strap]: 'headline',
  [CgTitleVariant.NameSuper]: 'name-tag',
  [CgTitleVariant.Credit]: 'small-tag',
  [CgTitleVariant.Locator]: 'live',
  [CgTitleVariant.Banner]: 'special',
  [CgTitleVariant.StoryLocator]: 'two-line',
};

export function emptyTitleLive(): CgTitleLive {
  return { a: '', b: '', source: '', on: false };
}

export function emptyTitleFields(): CgTitleFieldMap {
  return {
    [CgTitleField.Index]: '',
    [CgTitleField.A]: '',
    [CgTitleField.B]: '',
    [CgTitleField.C]: '',
    [CgTitleField.Source]: '',
  };
}

export function isTitleVariant(raw: unknown): raw is CgTitleVariant {
  return CG_TITLE_VARIANTS.some((variant) => variant.value === raw);
}

/** Stored layout key from the six grouped templates, when this template inherited it. */
export function legacyTitleLayoutKey(variant: CgTitleVariant): string | undefined {
  return LEGACY_LAYOUT_KEY[variant];
}

/**
 * Read a template id. Grouped keys map forward.
 * `two-line` with a source becomes Story + locator; without one, Name stack.
 */
export function migrateTitleVariant(raw: unknown, source: string): CgTitleVariant | null {
  if (isTitleVariant(raw)) return raw;
  if (raw === 'two-line') {
    return source.trim()
      ? CgTitleVariant.StoryLocator
      : CgTitleVariant.NameStack;
  }
  switch (raw) {
    case 'headline':
      return CgTitleVariant.Strap;
    case 'name-tag':
      return CgTitleVariant.NameSuper;
    case 'small-tag':
      return CgTitleVariant.Credit;
    case 'live':
      return CgTitleVariant.Locator;
    case 'special':
      return CgTitleVariant.Banner;
    default:
      return null;
  }
}

export function titleVariantDef(variant: CgTitleVariant) {
  return (
    CG_TITLE_VARIANTS.find((row) => row.value === variant) ?? CG_TITLE_VARIANTS[0]
  );
}

function isTitleAnchor(raw: unknown): raw is CgAnchor {
  return (
    raw === CgAnchor.TopLeft ||
    raw === CgAnchor.TopCenter ||
    raw === CgAnchor.TopRight ||
    raw === CgAnchor.CenterLeft ||
    raw === CgAnchor.Center ||
    raw === CgAnchor.CenterRight ||
    raw === CgAnchor.BottomLeft ||
    raw === CgAnchor.BottomCenter ||
    raw === CgAnchor.BottomRight
  );
}

export function clampTitleSlot(raw: unknown, fallback: CgTitleSlot): CgTitleSlot {
  const value =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  if (!isTitleAnchor(value['anchor'])) return { ...fallback };
  const storedAlign = value['align'];
  const align: CgTitleAlign =
    storedAlign === 'left' || storedAlign === 'center' || storedAlign === 'right'
      ? storedAlign
      : fallback.align;
  return {
    anchor: value['anchor'],
    x: clampRange(value['x'], CG_TITLE_PX_X_MIN, CG_TITLE_PX_X_MAX, fallback.x),
    y: clampRange(value['y'], CG_TITLE_PX_Y_MIN, CG_TITLE_PX_Y_MAX, fallback.y),
    width: clampRange(value['width'], CG_TITLE_PX_W_MIN, CG_TITLE_PX_W_MAX, fallback.width),
    align,
  };
}

function clampRange(raw: unknown, min: number, max: number, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Left inset, right inset, one-line row, and the two rows of a stack. Design px from the anchor edge. */
const TITLE_INSET = 64;
const TITLE_FROM_RIGHT = 64;
const TITLE_LINE_Y = 64;
const TITLE_HIGH_Y = 148;
const TITLE_LOW_Y = 56;

function at(
  anchor: CgAnchor,
  x: number,
  y: number,
  width: number,
  align: CgTitleAlign = 'left',
): CgTitleSlot {
  return { anchor, x, y, width, align };
}

function slotsFor(variant: CgTitleVariant): CgTitleSlots {
  const left = CgAnchor.BottomLeft;
  const right = CgAnchor.BottomRight;
  switch (variant) {
    case CgTitleVariant.Strap:
      return {
        [CgTitleField.Index]: at(left, TITLE_INSET, TITLE_LINE_Y, 200),
        [CgTitleField.A]: at(left, 280, TITLE_LINE_Y, 1540),
      };
    case CgTitleVariant.NameSuper:
      return {
        [CgTitleField.A]: at(left, TITLE_INSET, TITLE_LINE_Y, 360),
        [CgTitleField.B]: at(left, 450, TITLE_LINE_Y, 680),
      };
    case CgTitleVariant.Credit:
      return {
        [CgTitleField.B]: at(left, TITLE_INSET, TITLE_LINE_Y, 160),
        [CgTitleField.A]: at(left, 250, TITLE_LINE_Y, 420),
      };
    case CgTitleVariant.NameSource:
      return {
        [CgTitleField.A]: at(left, TITLE_INSET, TITLE_HIGH_Y, 460),
        [CgTitleField.B]: at(left, TITLE_INSET, TITLE_LOW_Y, 1400),
        [CgTitleField.Source]: at(right, TITLE_FROM_RIGHT, TITLE_HIGH_Y, 340, 'right'),
      };
    case CgTitleVariant.NameStack:
      return {
        [CgTitleField.A]: at(left, TITLE_INSET, TITLE_HIGH_Y, 460),
        [CgTitleField.B]: at(left, TITLE_INSET, TITLE_LOW_Y, 1600),
      };
    case CgTitleVariant.Banner:
      return { [CgTitleField.C]: at(left, TITLE_INSET, TITLE_LINE_Y, 1760) };
    case CgTitleVariant.Locator:
      return { [CgTitleField.A]: at(left, TITLE_INSET, TITLE_LINE_Y, 320) };
    case CgTitleVariant.StoryLocator:
      return {
        [CgTitleField.A]: at(left, TITLE_INSET, TITLE_HIGH_Y, 1180),
        [CgTitleField.B]: at(left, TITLE_INSET, TITLE_LOW_Y, 1760),
        [CgTitleField.Source]: at(right, TITLE_FROM_RIGHT, TITLE_HIGH_Y, 320, 'right'),
      };
    default:
      return { [CgTitleField.A]: at(left, TITLE_INSET, TITLE_LINE_Y, 1760) };
  }
}

function variantLayout(variant: CgTitleVariant): CgTitleVariantLayout {
  return { slots: slotsFor(variant) };
}

export function defaultTitleBackgroundLayout(variant: CgTitleVariant): CgLayout {
  const high =
    variant === CgTitleVariant.Credit || variant === CgTitleVariant.Locator;
  return {
    x: 0,
    y: high ? 8 : 4,
    unit: CgLayoutUnit.Percent,
    anchor: CgAnchor.BottomLeft,
    scale: 1,
  };
}

export function defaultTitleVariantLayouts(): Record<
  CgTitleVariant,
  CgTitleVariantLayout
> {
  return {
    [CgTitleVariant.Strap]: variantLayout(CgTitleVariant.Strap),
    [CgTitleVariant.NameSuper]: variantLayout(CgTitleVariant.NameSuper),
    [CgTitleVariant.Credit]: variantLayout(CgTitleVariant.Credit),
    [CgTitleVariant.NameSource]: variantLayout(CgTitleVariant.NameSource),
    [CgTitleVariant.NameStack]: variantLayout(CgTitleVariant.NameStack),
    [CgTitleVariant.Banner]: variantLayout(CgTitleVariant.Banner),
    [CgTitleVariant.Locator]: variantLayout(CgTitleVariant.Locator),
    [CgTitleVariant.StoryLocator]: variantLayout(CgTitleVariant.StoryLocator),
  };
}

function paintBase(
  fontSize: number,
  fontWeight: CgSubtitleStyle['fontWeight'],
  color: string,
): CgSubtitleStyle {
  return {
    preset: CgSubtitlePreset.Custom,
    fontFamily: CG_TITLE_FONT_STACK,
    fontSize,
    fontWeight,
    color,
    letterSpacing: 0.04,
    lineHeight: 1.15,
    scaleX: 1,
    scaleY: 1,
    borderWidth: 0,
    borderColor: '#000000',
    shadowDistance: 0,
    shadowRadius: 0,
    shadowAngle: 135,
    shadowColor: '#000000',
  };
}

export function defaultTitleStyles(): Record<CgTitleStyleKey, CgSubtitleStyle> {
  return {
    [CgTitleStyleKey.A]: paintBase(CG_TITLE_FONT_A, CG_TEXT_WEIGHT_BOLD, '#ffffff'),
    [CgTitleStyleKey.B]: paintBase(CG_TITLE_FONT_B, CG_TEXT_WEIGHT_MEDIUM, '#ffffff'),
    [CgTitleStyleKey.C]: {
      ...paintBase(CG_TITLE_FONT_C, CG_TEXT_WEIGHT_BOLD, '#ff2d2d'),
      letterSpacing: 0.02,
      borderWidth: 0.06,
      borderColor: '#ffffff',
    },
  };
}

export function cloneTitleVariantLayout(
  layout: CgTitleVariantLayout,
): CgTitleVariantLayout {
  return structuredClone(layout);
}

export function emptyTitleSettings(): CgTitleSettings {
  const variants = defaultTitleVariantLayouts();
  return {
    items: [
      {
        id: 'title-sample',
        variant: CgTitleVariant.Strap,
        index: '',
        a: '標題範例',
        b: '',
        c: '',
        source: '',
      },
    ],
    onAir: [],
    live: emptyTitleLive(),
    liveLayout: cloneTitleVariantLayout(variants[CgTitleVariant.StoryLocator]),
    styles: defaultTitleStyles(),
    variants,
  };
}

/** Drop Story + locator queue items while the Live bar is on. Places stay separate. */
export function titleAirAfterLive(
  settings: CgTitleSettings,
  live: CgTitleLive,
): { onAir: string[]; live: CgTitleLive } {
  if (!live.on) return { onAir: [...settings.onAir], live };
  const story = new Set(
    settings.items
      .filter((item) => item.variant === CgTitleVariant.StoryLocator)
      .map((item) => item.id),
  );
  return {
    onAir: settings.onAir.filter((id) => !story.has(id)),
    live,
  };
}

/** Same-template overlap is allowed. A Story + locator item turns the Live bar off. */
export function titleAirAfterItem(
  settings: CgTitleSettings,
  item: CgTitleItem,
  on: boolean,
): { onAir: string[]; live: CgTitleLive } {
  const without = settings.onAir.filter((id) => id !== item.id);
  if (!on) return { onAir: without, live: { ...settings.live } };
  const live =
    item.variant === CgTitleVariant.StoryLocator
      ? { ...settings.live, on: false }
      : { ...settings.live };
  return { onAir: [...without, item.id], live };
}

export function titleItemSummary(item: CgTitleItem): string {
  const variant = titleVariantDef(item.variant).label;
  const text = [item.index, item.a, item.b, item.c, item.source]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' · ');
  return text ? `${variant} — ${text}` : variant;
}

export function titleFieldsOf(item: CgTitleItem): CgTitleFieldMap {
  return {
    [CgTitleField.Index]: item.index,
    [CgTitleField.A]: item.a,
    [CgTitleField.B]: item.b,
    [CgTitleField.C]: item.c,
    [CgTitleField.Source]: item.source,
  };
}

export function titleItemFromFields(
  id: string,
  variant: CgTitleVariant,
  fields: CgTitleFieldMap,
): CgTitleItem | null {
  const allowed = new Set(titleVariantDef(variant).fields.map((field) => field.key));
  const pick = (key: CgTitleField): string =>
    allowed.has(key) ? fields[key].trim() : '';
  const item: CgTitleItem = {
    id,
    variant,
    index: pick(CgTitleField.Index),
    a: pick(CgTitleField.A),
    b: pick(CgTitleField.B),
    c: pick(CgTitleField.C),
    source: pick(CgTitleField.Source),
  };
  if (!item.index && !item.a && !item.b && !item.c && !item.source) return null;
  return item;
}

function elementsFor(
  item: Pick<CgTitleItem, 'variant' | 'index' | 'a' | 'b' | 'c' | 'source'>,
  slots: CgTitleSlots,
): CgTitleElementModel[] {
  const defaults = slotsFor(item.variant);
  const fields = titleFieldsOf({ ...item, id: '' });
  const elements: CgTitleElementModel[] = [];
  for (const field of titleVariantDef(item.variant).fields) {
    const text = fields[field.key].trim();
    if (!text) continue;
    const fallback =
      defaults[field.key] ??
      at(CgAnchor.BottomLeft, TITLE_INSET, TITLE_LINE_Y, 640);
    elements.push({
      field: field.key,
      text,
      styleKey: field.styleKey,
      slot: slots[field.key] ?? fallback,
    });
  }
  return elements;
}

function cardFor(
  key: string,
  variant: CgTitleVariant,
  settings: CgTitleSettings,
  item: Pick<CgTitleItem, 'variant' | 'index' | 'a' | 'b' | 'c' | 'source'>,
  placeOverride?: CgTitleVariantLayout,
): CgTitleCardModel | null {
  const place =
    placeOverride ??
    settings.variants[variant] ??
    defaultTitleVariantLayouts()[variant];
  const elements = elementsFor(item, place.slots);
  if (elements.length === 0) return null;
  const background = place.background;
  return {
    key,
    elements,
    backgroundUrl: background?.imageUrl?.trim() ?? '',
    backgroundLayout: background?.layout ?? defaultTitleBackgroundLayout(variant),
  };
}

/** Cards that should be on screen, before the fade hold. */
export function titleCards(settings: CgTitleSettings): CgTitleCardModel[] {
  const cards: CgTitleCardModel[] = [];
  if (settings.live.on) {
    const live = cardFor(
      'live',
      CgTitleVariant.StoryLocator,
      settings,
      {
        variant: CgTitleVariant.StoryLocator,
        index: '',
        a: settings.live.a,
        b: settings.live.b,
        c: '',
        source: settings.live.source,
      },
      settings.liveLayout,
    );
    if (live) cards.push(live);
  }
  for (const id of settings.onAir) {
    const item = settings.items.find((row) => row.id === id);
    if (!item) continue;
    if (settings.live.on && item.variant === CgTitleVariant.StoryLocator) continue;
    const card = cardFor(item.id, item.variant, settings, item);
    if (card) cards.push(card);
  }
  return cards;
}

function fontVh(style: CgTextPaint, key: CgTitleStyleKey): number {
  if (style.fontSize != null && style.fontSize > 0) return style.fontSize;
  if (key === CgTitleStyleKey.B) return CG_TITLE_FONT_B;
  if (key === CgTitleStyleKey.C) return CG_TITLE_FONT_C;
  return CG_TITLE_FONT_A;
}

/** One em of this style, in 1920-wide design pixels. */
function emPx(style: CgTextPaint, key: CgTitleStyleKey): number {
  const scaleX = style.scaleX != null && style.scaleX > 0 ? style.scaleX : 1;
  return fontVh(style, key) * TITLE_VH_PX * scaleX;
}

function inkPx(text: string, style: CgTextPaint, key: CgTitleStyleKey): number {
  const chars = [...text].length;
  if (chars === 0) return 0;
  const em = emPx(style, key);
  const tracking = style.letterSpacing ?? 0;
  const glyphs = chars * em + Math.max(0, chars - 1) * em * tracking;
  return glyphs + em * CG_TITLE_RUN_PAD_X_EM;
}

/**
 * Place each word in its own box. A long word squashes to that box only.
 */
export function titlePlace(
  elements: readonly CgTitleElementModel[],
  styles: Record<CgTitleStyleKey, CgTextPaint>,
): CgTitlePlace {
  if (elements.length === 0) return { elements: [] };
  const placed: CgTitlePlacedElement[] = elements.map((element) => {
    const style = styles[element.styleKey];
    const ink = inkPx(element.text, style, element.styleKey);
    const fit = ink > 0 ? Math.min(1, element.slot.width / ink) : 1;
    return {
      field: element.field,
      text: element.text,
      styleKey: element.styleKey,
      anchor: element.slot.anchor,
      x: element.slot.x,
      y: element.slot.y,
      width: element.slot.width,
      align: element.slot.align,
      fit,
    };
  });
  return { elements: placed };
}

/** Copy starts off air. The queue itself is kept. */
export function blankTitleAir(settings: CgTitleSettings): CgTitleSettings {
  return {
    ...settings,
    onAir: [],
    live: { ...settings.live, on: false },
  };
}
