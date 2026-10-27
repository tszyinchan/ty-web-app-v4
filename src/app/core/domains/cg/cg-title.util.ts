import {
  CG_TEXT_WEIGHT_BOLD,
  CG_TEXT_WEIGHT_MEDIUM,
  CG_TITLE_FONT_A,
  CG_TITLE_FONT_B,
  CG_TITLE_FONT_C,
  CG_TITLE_FONT_STACK,
  CG_TITLE_VARIANTS,
  CG_TITLE_WIDTH_LIVE,
  CG_TITLE_WIDTH_MAX,
  CG_TITLE_WIDTH_MIN,
  CG_TITLE_WIDTH_NAME,
  CG_TITLE_WIDTH_SMALL,
  CG_TITLE_WIDTH_WIDE,
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
  CgTitleFieldMap,
  CgTitleItem,
  CgTitleLive,
  CgTitleSettings,
  CgTitleVariantLayout,
} from './cg.model';

/** One painted run inside a Title line. */
export interface CgTitleRunModel {
  text: string;
  styleKey: CgTitleStyleKey;
}

/** One row. `fit` is applied later from the current Style and width. */
export interface CgTitleLineModel {
  align: 'left' | 'right';
  runs: CgTitleRunModel[];
}

/** What the renderer holds for one on-screen Title, before fade phase. */
export interface CgTitleCardModel {
  key: string;
  lines: CgTitleLineModel[];
  textLayout: CgLayout;
  width: number;
  backgroundUrl: string;
  backgroundLayout: CgLayout;
}

const STAGE_ASPECT = 16 / 9;

export function emptyTitleLive(): CgTitleLive {
  return { a: '', b: '', source: '', on: false };
}

export function emptyTitleFields(): CgTitleFieldMap {
  return {
    [CgTitleField.A]: '',
    [CgTitleField.B]: '',
    [CgTitleField.C]: '',
    [CgTitleField.Source]: '',
  };
}

export function isTitleVariant(raw: unknown): raw is CgTitleVariant {
  return CG_TITLE_VARIANTS.some((variant) => variant.value === raw);
}

export function titleVariantDef(variant: CgTitleVariant) {
  return (
    CG_TITLE_VARIANTS.find((row) => row.value === variant) ?? CG_TITLE_VARIANTS[0]
  );
}

function textLayout(y: number): CgLayout {
  return {
    x: 2,
    y,
    unit: CgLayoutUnit.Percent,
    anchor: CgAnchor.BottomLeft,
    scale: 1,
  };
}

function backgroundLayout(y: number): CgLayout {
  return {
    x: 0,
    y: Math.max(0, y - 1.5),
    unit: CgLayoutUnit.Percent,
    anchor: CgAnchor.BottomLeft,
    scale: 1,
  };
}

function variantLayout(y: number, width: number): CgTitleVariantLayout {
  return { text: textLayout(y), width };
}

export function defaultTitleBackgroundLayout(variant: CgTitleVariant): CgLayout {
  const text = defaultTitleVariantLayouts()[variant].text;
  return backgroundLayout(text.y);
}

export function defaultTitleVariantLayouts(): Record<
  CgTitleVariant,
  CgTitleVariantLayout
> {
  return {
    [CgTitleVariant.Headline]: variantLayout(11, CG_TITLE_WIDTH_WIDE),
    [CgTitleVariant.NameTag]: variantLayout(11, CG_TITLE_WIDTH_NAME),
    [CgTitleVariant.SmallTag]: variantLayout(18, CG_TITLE_WIDTH_SMALL),
    [CgTitleVariant.Live]: variantLayout(18, CG_TITLE_WIDTH_LIVE),
    [CgTitleVariant.TwoLine]: variantLayout(11, CG_TITLE_WIDTH_WIDE),
    [CgTitleVariant.Special]: variantLayout(11, CG_TITLE_WIDTH_WIDE),
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

export function emptyTitleSettings(): CgTitleSettings {
  return {
    items: [
      {
        id: 'title-sample',
        variant: CgTitleVariant.Headline,
        a: '標題範例',
        b: '',
        c: '',
        source: '',
      },
    ],
    onAir: [],
    live: emptyTitleLive(),
    styles: defaultTitleStyles(),
    variants: defaultTitleVariantLayouts(),
  };
}

export function clampTitleWidth(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(CG_TITLE_WIDTH_MAX, Math.max(CG_TITLE_WIDTH_MIN, value));
}

/** Drop Two-line queue items while the Live bar is on. They share one place. */
export function titleAirAfterLive(
  settings: CgTitleSettings,
  live: CgTitleLive,
): { onAir: string[]; live: CgTitleLive } {
  if (!live.on) return { onAir: [...settings.onAir], live };
  const twoLine = new Set(
    settings.items
      .filter((item) => item.variant === CgTitleVariant.TwoLine)
      .map((item) => item.id),
  );
  return {
    onAir: settings.onAir.filter((id) => !twoLine.has(id)),
    live,
  };
}

/** Same-variant overlap is allowed. A Two-line item turns the Live bar off. */
export function titleAirAfterItem(
  settings: CgTitleSettings,
  item: CgTitleItem,
  on: boolean,
): { onAir: string[]; live: CgTitleLive } {
  const without = settings.onAir.filter((id) => id !== item.id);
  if (!on) return { onAir: without, live: { ...settings.live } };
  const live =
    item.variant === CgTitleVariant.TwoLine
      ? { ...settings.live, on: false }
      : { ...settings.live };
  return { onAir: [...without, item.id], live };
}

export function titleItemSummary(item: CgTitleItem): string {
  const variant = titleVariantDef(item.variant).label;
  const text = [item.a, item.b, item.c, item.source]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' · ');
  return text ? `${variant} — ${text}` : variant;
}

export function titleFieldsOf(item: CgTitleItem): CgTitleFieldMap {
  return {
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
    a: pick(CgTitleField.A),
    b: pick(CgTitleField.B),
    c: pick(CgTitleField.C),
    source: pick(CgTitleField.Source),
  };
  if (!item.a && !item.b && !item.c && !item.source) return null;
  return item;
}

function runsOf(
  parts: ReadonlyArray<{ text: string; styleKey: CgTitleStyleKey }>,
): CgTitleRunModel[] {
  return parts
    .map((part) => ({ text: part.text.trim(), styleKey: part.styleKey }))
    .filter((part) => part.text.length > 0);
}

function linesFor(item: Pick<CgTitleItem, 'variant' | 'a' | 'b' | 'c' | 'source'>): CgTitleLineModel[] {
  const a = item.a.trim();
  const b = item.b.trim();
  const c = item.c.trim();
  const source = item.source.trim();
  switch (item.variant) {
    case CgTitleVariant.Headline:
      return a ? [{ align: 'left', runs: [{ text: a, styleKey: CgTitleStyleKey.A }] }] : [];
    case CgTitleVariant.NameTag: {
      const runs = runsOf([
        { text: a, styleKey: CgTitleStyleKey.A },
        { text: b, styleKey: CgTitleStyleKey.B },
      ]);
      return runs.length ? [{ align: 'left', runs }] : [];
    }
    case CgTitleVariant.SmallTag: {
      const runs = runsOf([
        { text: b, styleKey: CgTitleStyleKey.B },
        { text: a, styleKey: CgTitleStyleKey.A },
      ]);
      return runs.length ? [{ align: 'left', runs }] : [];
    }
    case CgTitleVariant.Live:
      return a ? [{ align: 'left', runs: [{ text: a, styleKey: CgTitleStyleKey.A }] }] : [];
    case CgTitleVariant.TwoLine: {
      const lines: CgTitleLineModel[] = [];
      if (source) {
        lines.push({
          align: 'right',
          runs: [{ text: source, styleKey: CgTitleStyleKey.B }],
        });
      }
      if (a) {
        lines.push({ align: 'left', runs: [{ text: a, styleKey: CgTitleStyleKey.A }] });
      }
      if (b) {
        lines.push({ align: 'left', runs: [{ text: b, styleKey: CgTitleStyleKey.B }] });
      }
      return lines;
    }
    case CgTitleVariant.Special:
      return c ? [{ align: 'left', runs: [{ text: c, styleKey: CgTitleStyleKey.C }] }] : [];
    default:
      return [];
  }
}

function cardFor(
  key: string,
  variant: CgTitleVariant,
  settings: CgTitleSettings,
  item: Pick<CgTitleItem, 'variant' | 'a' | 'b' | 'c' | 'source'>,
): CgTitleCardModel | null {
  const lines = linesFor(item);
  if (lines.length === 0) return null;
  const place =
    settings.variants[variant] ?? defaultTitleVariantLayouts()[variant];
  const background = place.background;
  return {
    key,
    lines,
    textLayout: place.text,
    width: place.width,
    backgroundUrl: background?.imageUrl?.trim() ?? '',
    backgroundLayout: background?.layout ?? place.text,
  };
}

/** Cards that should be on screen, before the fade hold. */
export function titleCards(settings: CgTitleSettings): CgTitleCardModel[] {
  const cards: CgTitleCardModel[] = [];
  if (settings.live.on) {
    const live = cardFor('live', CgTitleVariant.TwoLine, settings, {
      variant: CgTitleVariant.TwoLine,
      a: settings.live.a,
      b: settings.live.b,
      c: '',
      source: settings.live.source,
    });
    if (live) cards.push(live);
  }
  for (const id of settings.onAir) {
    const item = settings.items.find((row) => row.id === id);
    if (!item) continue;
    if (settings.live.on && item.variant === CgTitleVariant.TwoLine) continue;
    const card = cardFor(item.id, item.variant, settings, item);
    if (card) cards.push(card);
  }
  return cards;
}

function emWidthPercent(style: CgTextPaint, layoutScale: number): number {
  const font =
    (style.fontSize != null && style.fontSize > 0 ? style.fontSize : CG_TITLE_FONT_A) *
    (Number.isFinite(layoutScale) && layoutScale > 0 ? layoutScale : 1);
  const scaleX = style.scaleX != null && style.scaleX > 0 ? style.scaleX : 1;
  return (font / STAGE_ASPECT) * scaleX;
}

function naturalWidthPercent(
  charCount: number,
  style: CgTextPaint,
  layoutScale: number,
): number {
  const chars = Math.max(0, charCount);
  if (chars === 0) return 0;
  const em = emWidthPercent(style, layoutScale);
  const tracking = style.letterSpacing ?? 0;
  return chars * em + Math.max(0, chars - 1) * em * tracking;
}

/** Horizontal squash so the line's ink fits the text box. 1 = no squash. */
export function titleLineFit(
  widthPercent: number,
  line: CgTitleLineModel,
  styles: Record<CgTitleStyleKey, CgTextPaint>,
  layoutScale: number,
): number {
  let natural = 0;
  line.runs.forEach((run, index) => {
    const style = styles[run.styleKey];
    natural += naturalWidthPercent([...run.text].length, style, layoutScale);
    if (index > 0) natural += emWidthPercent(style, layoutScale) * 0.5;
  });
  natural += emWidthPercent(styles[line.runs[0]?.styleKey ?? CgTitleStyleKey.A], layoutScale) * 0.8;
  if (!(natural > 0) || !(widthPercent > 0)) return 1;
  return Math.min(1, widthPercent / natural);
}

/** Copy starts off air. The queue itself is kept. */
export function blankTitleAir(settings: CgTitleSettings): CgTitleSettings {
  return {
    ...settings,
    onAir: [],
    live: { ...settings.live, on: false },
  };
}
