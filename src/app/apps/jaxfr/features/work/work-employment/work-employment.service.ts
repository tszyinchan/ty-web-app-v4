import { Injectable, inject, NgZone, signal } from '@angular/core';
import { NotificationService } from '../../../../../core/services/notification.service';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { WorkEmployment } from './work-employment.model';

@Injectable({ providedIn: 'root' })
export class WorkEmploymentService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  workEmployments = signal<WorkEmployment[]>([]);
  loading = signal(false);

  async fetchAllWorkEmployments(force = false) {
    if (this.workEmployments().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_work_employment')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.zone.run(() => {
        this.workEmployments.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Employments Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchWorkEmploymentById(id: string): Promise<WorkEmployment | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_work_employment')
        .select('*')
        .eq('tb_tyapp_wk_mplm_id', id)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as WorkEmployment;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Employment Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveWorkEmployment(data: Partial<WorkEmployment>): Promise<boolean> {
    const isNew = !data.tb_tyapp_wk_mplm_id;
    const {
      tb_tyweb_wk_mplm_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = data;

    this.loading.set(true);

    const query = isNew
      ? this.supabase
          .from('tyapp_work_employment')
          .insert(payload)
          .select()
          .single()
      : this.supabase
          .from('tyapp_work_employment')
          .update(payload)
          .eq('tb_tyapp_wk_mplm_id', data.tb_tyapp_wk_mplm_id)
          .select()
          .single();

    try {
      const { data: savedData, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = savedData as WorkEmployment;
        this.workEmployments.update((list) =>
          isNew
            ? [saved, ...list]
            : list.map((item) =>
                item.tb_tyapp_wk_mplm_id === saved.tb_tyapp_wk_mplm_id
                  ? saved
                  : item,
              ),
        );
        this.loading.set(false);
        this.notification.showSuccess('Employment record saved successfully');
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

  async deleteWorkEmployment(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_work_employment_soft_delete_single_record',
        { record_id: id },
      );

      if (error) throw error;

      return this.zone.run(() => {
        this.workEmployments.update((list) =>
          list.filter((item) => item.tb_tyapp_wk_mplm_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Employment record deleted');
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
