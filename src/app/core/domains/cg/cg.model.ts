import { RecordStatus } from '../../models/status.enum';
import {
  CgAnchor,
  CgElementType,
  CgLayerLook,
  CgLayoutUnit,
  CgOutputKind,
  CgPackageLook,
  CgPackageRole,
  CgSubtitlePreset,
  CgTextWeight,
} from './cg.constants';

export interface CgLayout {
  x: number;
  y: number;
  unit: CgLayoutUnit;
  anchor: CgAnchor;
  scale: number;
  width?: number | null;
  height?: number | null;
}

export interface CgLogoPayload {
  imageUrl: string;
  fileName?: string;
}

/** Text alignment inside the Subtitle box; independent of Anchor. */
export type CgSubtitleAlign = 'left' | 'center' | 'right';

/**
 * Shared text paint for Subtitle and later text Elements.
 * Every field is optional so a missing value keeps the previous look.
 */
export interface CgTextPaint {
  fontFamily?: string;
  fontSize?: number;
  /** `700` = bold. Absent = preset default (News 400, Show 500). */
  fontWeight?: CgTextWeight;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  /** Second stop. Present = linear gradient from `color`; absent = solid fill. */
  gradientTo?: string;
  /** CSS `linear-gradient` angle. `90` = left to right. */
  gradientAngle?: number;
  letterSpacing?: number;
  lineHeight?: number;
  scaleX?: number;
  scaleY?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowAngle?: number;
  shadowDistance?: number;
  shadowRadius?: number;
  shadowColor?: string;
}

export interface CgSubtitleStyle extends CgTextPaint {
  preset: CgSubtitlePreset;
  textAlign?: CgSubtitleAlign;
}

/** Optional image behind Clock / Weather text. Place is independent of the text box. */
export interface CgBackground {
  imageUrl: string;
  fileName?: string;
  layout: CgLayout;
}

export type CgClockLocale = 'en' | 'zh-Hant';
export type CgClockMode = 'live' | 'custom';

export interface CgClockSettings {
  /** Angular `DatePipe` name or pattern. */
  format: string;
  locale: CgClockLocale;
  /** IANA zone. Empty = the viewer's local zone. */
  timeZone: string;
  mode: CgClockMode;
  /** UTC instant of the wall-clock time the operator pushed. */
  customBaseMs: number | null;
  /** `Date.now()` on the Panel when Push was clicked. */
  customPushedAtMs: number | null;
}

export interface CgWeatherLocation {
  name: string;
  lat: number;
  lon: number;
}

export type CgWeatherUnitMode = 'alternate' | 'c' | 'f';

export interface CgWeatherSettings {
  location: CgWeatherLocation | null;
  unitMode: CgWeatherUnitMode;
  /** Space between temperature and humidity, in em. */
  gapHum: number;
  /** Space between humidity and the condition icon, in em. */
  gapIcon: number;
}

/** Inner cue / future Layer animation. Not Package Appear. */
export interface CgLayerTransition {
  duration_ms: number;
}

export interface CgSubtitlePayload {
  lines: string[];
  /** On-air cue. `null` = blank air. */
  index: number | null;
  /** Last clicked / last on-air row. Kept when Blank. */
  cursor: number;
  style: CgSubtitleStyle;
  transition: CgLayerTransition;
}

export type CgLayerPayload = CgLogoPayload &
  CgSubtitlePayload & {
    background?: CgBackground;
    clock?: CgClockSettings;
    weather?: CgWeatherSettings;
  };

export interface CgPackage {
  tb_tyapp_cgpk_id: string;
  tb_tyapp_cgpk_seq_no?: number;
  name: string;
  role: CgPackageRole;
  public_token: string;
  /** `0` = cut. Default fade is `CG_DEFAULT_DURATION_MS`. */
  duration_ms: number;
  look: CgPackageLook;
  status: RecordStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CgLayer {
  tb_tyapp_cgly_id: string;
  tb_tyapp_cgly_seq_no?: number;
  package_id: string;
  element_type: CgElementType;
  public_token: string;
  name: string;
  layout: CgLayout;
  payload: CgLayerPayload;
  visible: boolean;
  look: CgLayerLook;
  sort_order: number;
  status: RecordStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CgLayerDraft {
  clientId: string;
  tb_tyapp_cgly_id?: string;
  element_type: CgElementType;
  public_token: string;
  name: string;
  layout: CgLayout;
  payload: CgLayerPayload;
  visible: boolean;
  look: CgLayerLook;
  sort_order: number;
  status: RecordStatus;
}

export interface CgPublicOutput {
  kind: CgOutputKind;
  packageName: string;
  packageRole: CgPackageRole;
  durationMs: number;
  look: CgPackageLook;
  layers: CgLayer[];
  /** Content signature from the DB (excludes the live cue). */
  rev?: string;
}

/** One Layer's live cue as stored in the DB (safety-poll drift check only). */
export interface CgOutputStateCue {
  id: string;
  index: number | null;
  cursor: number;
}

/** Tiny safety-poll response: content `rev` + stored cues. */
export interface CgOutputState {
  rev: string;
  cues: CgOutputStateCue[];
}

/** Live cue on the overlay broadcast — not a full output snapshot. */
export interface CgOverlayCueMessage {
  kind: 'cue';
  layerId: string;
  index: number | null;
  cursor: number;
  seq: number;
}
