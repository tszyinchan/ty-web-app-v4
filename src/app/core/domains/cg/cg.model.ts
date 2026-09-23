import { RecordStatus } from '../../models/status.enum';
import {
  CgAnchor,
  CgComponentType,
  CgLayoutUnit,
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

export type CgSlotPayload = CgLogoPayload;

export interface CgPackage {
  tb_tyapp_cgpk_id: string;
  tb_tyapp_cgpk_seq_no?: number;
  name: string;
  role: CgPackageRole;
  status: RecordStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CgSlot {
  tb_tyapp_cgsl_id: string;
  tb_tyapp_cgsl_seq_no?: number;
  package_id: string;
  component_type: CgComponentType;
  public_token: string;
  layout: CgLayout;
  payload: CgSlotPayload;
  visible: boolean;
  sort_order: number;
  status: RecordStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CgSlotDraft {
  clientId: string;
  tb_tyapp_cgsl_id?: string;
  component_type: CgComponentType;
  public_token: string;
  layout: CgLayout;
  payload: CgSlotPayload;
  visible: boolean;
  sort_order: number;
  status: RecordStatus;
}

export interface CgPublicSlot {
  slot: CgSlot;
  packageName: string;
  packageRole: CgPackageRole;
}
