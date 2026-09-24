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

export interface CgSubtitleStyle {
  preset: CgSubtitlePreset;
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

export type CgLayerPayload = CgLogoPayload & CgSubtitlePayload;

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
}
