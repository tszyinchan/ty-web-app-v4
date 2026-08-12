import { Injectable, inject, NgZone, signal } from '@angular/core';
import { NotificationService } from '../../../../../core/services/notification.service';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { WorkSchedule } from './work-schedule.model';

@Injectable({ providedIn: 'root' })
export class WorkScheduleService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  workSchedules = signal<WorkSchedule[]>([]);
  loading = signal(false);

  async fetchAllWorkSchedules(force = false) {
    if (this.workSchedules().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_work_schedule')
        .select('*')
        .is('deleted_at', null)
        .order('work_date', { ascending: false });

      if (error) throw error;

      this.zone.run(() => {
        this.workSchedules.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Schedules Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchWorkScheduleById(id: string): Promise<WorkSchedule | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_work_schedule')
        .select('*')
        .eq('tb_tyapp_wk_scdl_id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as WorkSchedule;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Schedule Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveWorkSchedule(data: Partial<WorkSchedule>): Promise<boolean> {
    const isNew = !data.tb_tyapp_wk_scdl_id;
    const {
      tb_tyapp_wk_scdl_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = data;

    this.loading.set(true);

    const query = isNew
      ? this.supabase
          .from('tyapp_work_schedule')
          .insert(payload)
          .select()
          .single()
      : this.supabase
          .from('tyapp_work_schedule')
          .update(payload)
          .eq('tb_tyapp_wk_scdl_id', data.tb_tyapp_wk_scdl_id)
          .select()
          .single();

    try {
      const { data: savedData, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = savedData as WorkSchedule;
        this.workSchedules.update((list) => {
          let newList = isNew
            ? [saved, ...list]
            : list.map((item) =>
                item.tb_tyapp_wk_scdl_id === saved.tb_tyapp_wk_scdl_id
                  ? saved
                  : item,
              );
          return newList.sort(
            (a, b) =>
              new Date(b.work_date).getTime() - new Date(a.work_date).getTime(),
          );
        });
        this.loading.set(false);
        this.notification.showSuccess('Schedule saved successfully');
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

  async deleteWorkSchedule(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_work_schedule_soft_delete_single_record',
        { record_id: id },
      );

      if (error) throw error;

      return this.zone.run(() => {
        this.workSchedules.update((list) =>
          list.filter((item) => item.tb_tyapp_wk_scdl_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Schedule record deleted');
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

  async bulkInsertWorkSchedules(
    records: Partial<WorkSchedule>[],
  ): Promise<boolean> {
    this.loading.set(true);
    try {
      const { data: savedData, error } = await this.supabase
        .from('tyapp_work_schedule')
        .insert(records)
        .select();

      if (error) throw error;

      return this.zone.run(() => {
        this.workSchedules.update((list) => {
          const newList = [...(savedData as WorkSchedule[]), ...list];
          return newList.sort(
            (a, b) =>
              new Date(b.work_date).getTime() - new Date(a.work_date).getTime(),
          );
        });
        this.loading.set(false);
        this.notification.showSuccess(
          'Successfully generated next week schedule!',
        );
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Bulk Insert Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }
}
