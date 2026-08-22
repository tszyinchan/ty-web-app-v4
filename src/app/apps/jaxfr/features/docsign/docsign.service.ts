import { Injectable, NgZone, inject, signal } from '@angular/core';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  DocsignDocument,
  DocsignDocumentDetail,
  DocsignSignature,
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

  async fetchAllDocuments(force = false) {
    if (this.documents().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_docsign')
        .select(DETAIL_SELECT)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

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

  async saveDraft(payload: {
    id: string | null;
    title: string;
    docDate: string | null;
    docDatetime: string | null;
    remarks: string;
    content: string;
    signerUserIds: string[];
  }): Promise<DocsignDocumentDetail | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc('tyapp_docsign_save_draft', {
        p_id: payload.id,
        p_title: payload.title,
        p_doc_date: payload.docDate,
        p_doc_datetime: payload.docDatetime,
        p_remarks: payload.remarks,
        p_draft_content: payload.content,
        p_signer_user_ids: payload.signerUserIds,
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

  async sendDocument(id: string): Promise<DocsignDocumentDetail | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc('tyapp_docsign_send', {
        p_id: id,
      });
      if (error) throw error;

      const saved = await this.reloadAfterMutation(data as DocsignDocument);
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess('Document sent to signers');
      });
      return saved;
    } catch (error: unknown) {
      this.notification.handleError('Send Failed', error);
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
    docDatetime: string | null;
    remarks: string;
    signerUserIds: string[];
  }): Promise<DocsignDocumentDetail | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_docsign_save_header',
        {
          p_id: payload.id,
          p_title: payload.title,
          p_doc_date: payload.docDate,
          p_doc_datetime: payload.docDatetime,
          p_remarks: payload.remarks,
          p_signer_user_ids: payload.signerUserIds,
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

  async saveVersion(
    id: string,
    content: string,
  ): Promise<DocsignDocumentDetail | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_docsign_save_version',
        {
          p_id: id,
          p_content: content,
        },
      );
      if (error) throw error;

      const saved = await this.reloadAfterMutation(data as DocsignDocument);
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess('New version saved');
      });
      return saved;
    } catch (error: unknown) {
      this.notification.handleError('Save Version Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async signDocument(
    id: string,
    signedName: string,
  ): Promise<DocsignDocumentDetail | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc('tyapp_docsign_sign', {
        p_id: id,
        p_signed_name: signedName,
      });
      if (error) throw error;

      const saved = await this.reloadAfterMutation(data as DocsignDocument);
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess(
          saved?.locked_at
            ? 'Signed. Document is now locked.'
            : 'Signed',
        );
      });
      return saved;
    } catch (error: unknown) {
      this.notification.handleError('Sign Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
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
      doc_datetime: row.doc_datetime,
      remarks: row.remarks,
      draft_content: row.draft_content,
      created_by: row.created_by,
      signer_user_ids: row.signer_user_ids,
      sent_at: row.sent_at,
      current_version_no: row.current_version_no,
      locked_at: row.locked_at,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      versions,
      signatures,
    };
  }
}
