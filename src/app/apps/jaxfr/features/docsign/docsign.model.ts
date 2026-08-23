import { RecordStatus } from '../../../../core/models/status.enum';

export type DocsignLifecycle = 'draft' | 'pending' | 'locked';

export type DocsignSignerTitles = Record<string, string>;

export interface DocsignPrintLog {
  tb_tyapp_dsgn_prn_id: string;
  document_id: string;
  printed_by: string;
  printed_at: string;
}

export enum DocsignSignatureKind {
  Name = 'name',
  Draw = 'draw',
}

export interface DocsignDocument {
  tb_tyapp_dsgn_id: string;
  tb_tyapp_dsgn_seq_no?: number;
  title: string;
  doc_date?: string | null;
  remarks?: string | null;
  draft_content: string;
  created_by: string;
  signer_user_ids: string[];
  signer_titles?: DocsignSignerTitles;
  sent_at?: string | null;
  current_version_no: number;
  locked_at?: string | null;
  editing_by?: string | null;
  editing_heartbeat?: string | null;
  status: RecordStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface DocsignVersion {
  tb_tyapp_dsgn_ver_id: string;
  tb_tyapp_dsgn_ver_seq_no?: number;
  document_id: string;
  version_no: number;
  content: string;
  created_by: string;
  created_at: string;
}

export interface DocsignSignature {
  tb_tyapp_dsgn_sig_id: string;
  tb_tyapp_dsgn_sig_seq_no?: number;
  document_id: string;
  version_id: string;
  user_id: string;
  signed_at: string;
  signed_name: string;
  signed_mark?: string | null;
  signed_svg?: string | null;
  signature_id?: string | null;
}

export interface DocsignUserSignature {
  tb_tyapp_usig_id: string;
  tb_tyapp_usig_seq_no?: number;
  user_id: string;
  kind: DocsignSignatureKind;
  signed_name: string;
  signed_mark?: string | null;
  svg_markup?: string | null;
  created_at: string;
}

export interface DocsignDocumentDetail extends DocsignDocument {
  versions: DocsignVersion[];
  signatures: DocsignSignature[];
}

export interface DocsignEditVm {
  tb_tyapp_dsgn_id?: string;
  title: string;
  doc_date: string;
  remarks: string;
  content: string;
  created_by: string;
  signer_user_ids: string[];
  signer_titles: DocsignSignerTitles;
  sent_at: string | null;
  current_version_no: number;
  locked_at: string | null;
  status: RecordStatus;
}

export type DocsignContentBlock =
  | { kind: 'html'; html: string }
  | { kind: 'drive'; fileId: string };

export type DiffLineKind = 'added' | 'removed' | 'unchanged' | 'empty';

export interface DiffLineVm {
  kind: DiffLineKind;
  text: string;
}
