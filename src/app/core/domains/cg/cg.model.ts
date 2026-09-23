import { RecordStatus } from '../../models/status.enum';
import {
  CgAnchor,
  CgElementType,
  CgLayoutUnit,
  CgOutputKind,
  CgPackageRole,
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

export type CgLayerPayload = CgLogoPayload;

export interface CgPackage {
  tb_tyapp_cgpk_id: string;
  tb_tyapp_cgpk_seq_no?: number;
  name: string;
  role: CgPackageRole;
  public_token: string;
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
  sort_order: number;
  status: RecordStatus;
}

export interface CgPublicOutput {
  kind: CgOutputKind;
  packageName: string;
  packageRole: CgPackageRole;
  layers: CgLayer[];
}
