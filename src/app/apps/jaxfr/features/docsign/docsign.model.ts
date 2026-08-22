import { RecordStatus } from '../../../../core/models/status.enum';

export type DocsignLifecycle = 'draft' | 'pending' | 'locked';

export interface DocsignDocument {
  tb_tyapp_dsgn_id: string;
  tb_tyapp_dsgn_seq_no?: number;
  title: string;
  doc_date?: string | null;
  doc_datetime?: string | null;
  remarks?: string | null;
  draft_content: string;
  created_by: string;
  signer_user_ids: string[];
  sent_at?: string | null;
  current_version_no: number;
  locked_at?: string | null;
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
}

export interface DocsignDocumentDetail extends DocsignDocument {
  versions: DocsignVersion[];
  signatures: DocsignSignature[];
}

export interface DocsignEditVm {
  tb_tyapp_dsgn_id?: string;
  title: string;
  doc_date: string;
  doc_datetime: string;
  remarks: string;
  content: string;
  created_by: string;
  signer_user_ids: string[];
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
