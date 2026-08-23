import { Injectable, NgZone, inject, signal } from '@angular/core';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  DocsignDocument,
  DocsignDocumentDetail,
  DocsignPrintLog,
  DocsignSignature,
  DocsignSignatureKind,
  DocsignUserSignature,
  DocsignVersion,
} from './docsign.model';

interface DocsignRow extends DocsignDocument {
  tyapp_docsign_version?: DocsignVersion[];
  tyapp_docsign_signature?: DocsignSignature[];
}

const DETAIL_SELECT = `
  *,
  tyapp_docsign_version (*),
  tyapp_docsign_signature (*)
`;

@Injectable({ providedIn: 'root' })
export class DocsignService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  documents = signal<DocsignDocumentDetail[]>([]);
  loading = signal(false);
  mySignature = signal<DocsignUserSignature | null>(null);
  mySignatures = signal<DocsignUserSignature[]>([]);

  async fetchAllDocuments(force = false) {
    if (this.documents().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_docsign')
        .select(DETAIL_SELECT)
        .is('deleted_at', null)
        .order('doc_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.zone.run(() => {
        this.documents.set((data ?? []).map((row) => this.mapRow(row)));
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Documents Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchDocumentById(id: string): Promise<DocsignDocumentDetail | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_docsign')
        .select(DETAIL_SELECT)
        .eq('tb_tyapp_dsgn_id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        const mapped = this.mapRow(data);
        this.upsertLocal(mapped);
        this.loading.set(false);
        return mapped;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Document Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async fetchMySignatures(force = false) {
    if (this.mySignatures().length > 0 && !force) return;
    try {
      const { data, error } = await this.supabase
        .from('tyapp_user_signature')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.zone.run(() => {
        const rows = (data ?? []) as DocsignUserSignature[];
        this.mySignatures.set(rows);
        this.mySignature.set(rows[0] ?? null);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Signature Failed', error);
    }
  }

  async saveDraft(payload: {
    id: string | null;
    title: string;
    docDate: string | null;
    remarks: string;
    content: string;
    signerUserIds: string[];
    signerTitles: Record<string, string>;
  }): Promise<DocsignDocumentDetail | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc('tyapp_docsign_save_draft', {
        p_id: payload.id,
        p_title: payload.title,
        p_doc_date: payload.docDate,
        p_remarks: payload.remarks,
        p_draft_content: payload.content,
        p_signer_user_ids: payload.signerUserIds,
        p_signer_titles: payload.signerTitles,
      });
      if (error) throw error;

      const saved = await this.reloadAfterMutation(data as DocsignDocument);
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess(
          payload.id ? 'Draft saved' : 'Draft created',
        );
      });
      return saved;
    } catch (error: unknown) {
      this.notification.handleError('Save Draft Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveHeader(payload: {
    id: string;
    title: string;
    docDate: string | null;
    remarks: string;
    signerUserIds: string[];
    signerTitles: Record<string, string>;
  }): Promise<DocsignDocumentDetail | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_docsign_save_header',
        {
          p_id: payload.id,
          p_title: payload.title,
          p_doc_date: payload.docDate,
          p_remarks: payload.remarks,
          p_signer_user_ids: payload.signerUserIds,
          p_signer_titles: payload.signerTitles,
        },
      );
      if (error) throw error;

      const saved = await this.reloadAfterMutation(data as DocsignDocument);
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess('Document details saved');
      });
      return saved;
    } catch (error: unknown) {
      this.notification.handleError('Save Details Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async signAndSend(
    id: string,
    content: string,
  ): Promise<DocsignDocumentDetail | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_docsign_sign_and_send',
        {
          p_id: id,
          p_content: content,
        },
      );
      if (error) throw error;

      const saved = await this.reloadAfterMutation(data as DocsignDocument);
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess(
          saved?.locked_at
            ? 'Signed. Document is now locked.'
            : saved?.current_version_no === 1 && saved.sent_at
              ? 'Signed and sent'
              : 'Signed',
        );
      });
      return saved;
    } catch (error: unknown) {
      this.notification.handleError('Sign & Send Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveUserSignature(payload: {
    kind: DocsignSignatureKind;
    signedName: string;
    signedMark: string | null;
    svgMarkup: string | null;
  }): Promise<DocsignUserSignature | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_docsign_save_user_signature',
        {
          p_kind: payload.kind,
          p_signed_name: payload.signedName,
          p_signed_mark: payload.signedMark,
          p_svg_markup: payload.svgMarkup,
        },
      );
      if (error) throw error;
      const saved = data as DocsignUserSignature;
      this.zone.run(() => {
        this.mySignatures.update((list) => [saved, ...list]);
        this.mySignature.set(saved);
        this.loading.set(false);
        this.notification.showSuccess('Signature saved');
      });
      return saved;
    } catch (error: unknown) {
      this.notification.handleError('Save Signature Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async claimEdit(id: string): Promise<DocsignDocumentDetail | null> {
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_docsign_claim_edit',
        { p_id: id },
      );
      if (error) throw error;
      return this.zone.run(() => {
        const mapped = this.mergeLease(data as DocsignDocument);
        return mapped;
      });
    } catch (error: unknown) {
      this.notification.handleError('Open Document Failed', error);
      return null;
    }
  }

  async heartbeatEdit(id: string): Promise<DocsignDocumentDetail | null> {
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_docsign_heartbeat_edit',
        { p_id: id },
      );
      if (error) throw error;
      return this.zone.run(() => this.mergeLease(data as DocsignDocument));
    } catch {
      return null;
    }
  }

  async reorderSigners(
    id: string,
    signerUserIds: string[],
  ): Promise<DocsignDocumentDetail | null> {
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_docsign_reorder_signers',
        {
          p_id: id,
          p_signer_user_ids: signerUserIds,
        },
      );
      if (error) throw error;
      return this.zone.run(() => {
        const mapped = this.mergeLease(data as DocsignDocument);
        return mapped;
      });
    } catch (error: unknown) {
      this.notification.handleError('Reorder Signers Failed', error);
      return null;
    }
  }

  async logPrint(id: string): Promise<DocsignPrintLog | null> {
    try {
      const { data, error } = await this.supabase.rpc('tyapp_docsign_log_print', {
        p_id: id,
      });
      if (error) throw error;
      return data as DocsignPrintLog;
    } catch (error: unknown) {
      this.notification.handleError('Start Print Failed', error);
      return null;
    }
  }

  async fetchPrintLog(id: string): Promise<DocsignPrintLog | null> {
    try {
      const { data, error } = await this.supabase
        .from('tyapp_docsign_print_log')
        .select('*')
        .eq('tb_tyapp_dsgn_prn_id', id)
        .single();
      if (error) throw error;
      return data as DocsignPrintLog;
    } catch (error: unknown) {
      this.notification.handleError('Load Print Record Failed', error);
      return null;
    }
  }

  async releaseEdit(id: string): Promise<void> {
    try {
      await this.supabase.rpc('tyapp_docsign_release_edit', { p_id: id });
    } catch {
      return;
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_docsign_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      return this.zone.run(() => {
        this.documents.update((list) =>
          list.filter((item) => item.tb_tyapp_dsgn_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Document deleted');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Delete Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  private async reloadAfterMutation(
    row: DocsignDocument | null,
  ): Promise<DocsignDocumentDetail | null> {
    if (!row?.tb_tyapp_dsgn_id) return null;
    const { data, error } = await this.supabase
      .from('tyapp_docsign')
      .select(DETAIL_SELECT)
      .eq('tb_tyapp_dsgn_id', row.tb_tyapp_dsgn_id)
      .is('deleted_at', null)
      .single();
    if (error) throw error;
    const mapped = this.mapRow(data);
    this.zone.run(() => this.upsertLocal(mapped));
    return mapped;
  }

  private mergeLease(row: DocsignDocument): DocsignDocumentDetail {
    const existing = this.documents().find(
      (item) => item.tb_tyapp_dsgn_id === row.tb_tyapp_dsgn_id,
    );
    const mapped: DocsignDocumentDetail = {
      ...row,
      versions: existing?.versions ?? [],
      signatures: existing?.signatures ?? [],
    };
    this.upsertLocal(mapped);
    return mapped;
  }

  private upsertLocal(doc: DocsignDocumentDetail) {
    this.documents.update((list) => {
      const index = list.findIndex(
        (item) => item.tb_tyapp_dsgn_id === doc.tb_tyapp_dsgn_id,
      );
      if (index === -1) return [doc, ...list];
      const next = [...list];
      next[index] = doc;
      return next;
    });
  }

  private mapRow(row: DocsignRow): DocsignDocumentDetail {
    const versions = [...(row.tyapp_docsign_version ?? [])].sort(
      (a, b) => a.version_no - b.version_no,
    );
    const signatures = row.tyapp_docsign_signature ?? [];
    return {
      tb_tyapp_dsgn_id: row.tb_tyapp_dsgn_id,
      tb_tyapp_dsgn_seq_no: row.tb_tyapp_dsgn_seq_no,
      title: row.title,
      doc_date: row.doc_date,
      remarks: row.remarks,
      draft_content: row.draft_content,
      created_by: row.created_by,
      signer_user_ids: row.signer_user_ids,
      signer_titles: row.signer_titles ?? {},
      sent_at: row.sent_at,
      current_version_no: row.current_version_no,
      locked_at: row.locked_at,
      editing_by: row.editing_by,
      editing_heartbeat: row.editing_heartbeat,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      versions,
      signatures,
    };
  }
}
