import { Injectable, inject, NgZone, signal } from '@angular/core';
import { NotificationService } from '../../../../../core/services/notification.service';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { AppLog } from './app-log.model';

@Injectable({ providedIn: 'root' })
export class AppLogService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  logs = signal<AppLog[]>([]);
  loading = signal(false);

  async fetchAllLogs(force = false) {
    if (this.logs().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app_log')
        .select('*')
        .is('deleted_at', null)
        .order('version_date', { ascending: false })
        .order('tb_tyapp_ap_lg_seq_no', { ascending: false });

      if (error) throw error;

      this.zone.run(() => {
        this.logs.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Logs Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchLogById(id: string): Promise<AppLog | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app_log')
        .select('*')
        .eq('tb_tyapp_ap_lg_id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as AppLog;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Log Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveLog(logData: Partial<AppLog>): Promise<boolean> {
    const isNew = !logData.tb_tyapp_ap_lg_id;
    const {
      tb_tyapp_ap_lg_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = logData;

    this.loading.set(true);

    const query = isNew
      ? this.supabase.from('tyapp_app_log').insert(payload).select().single()
      : this.supabase
          .from('tyapp_app_log')
          .update(payload)
          .eq('tb_tyapp_ap_lg_id', logData.tb_tyapp_ap_lg_id)
          .select()
          .single();

    try {
      const { data, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = data as AppLog;
        this.logs.update((list) =>
          isNew
            ? [saved, ...list]
            : list.map((item) =>
                item.tb_tyapp_ap_lg_id === saved.tb_tyapp_ap_lg_id
                  ? saved
                  : item,
              ),
        );
        this.loading.set(false);
        this.notification.showSuccess('Log saved successfully');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Save Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async deleteLog(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_app_log_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      return this.zone.run(() => {
        this.logs.update((list) =>
          list.filter((item) => item.tb_tyapp_ap_lg_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Log deleted');
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
}
