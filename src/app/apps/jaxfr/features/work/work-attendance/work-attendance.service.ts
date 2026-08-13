import { Injectable, inject, NgZone, signal } from '@angular/core';
import { NotificationService } from '../../../../../core/services/notification.service';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { WorkAttendance } from './work-attendance.model';

@Injectable({ providedIn: 'root' })
export class WorkAttendanceService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  workAttendances = signal<WorkAttendance[]>([]);
  loading = signal(false);

  async fetchAllWorkAttendances(force = false) {
    if (this.workAttendances().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_work_attendance')
        .select('*')
        .is('deleted_at', null)
        .order('work_date', { ascending: false })
        .order('start_time', { ascending: false });

      if (error) throw error;

      this.zone.run(() => {
        this.workAttendances.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Attendances Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchWorkAttendanceById(id: string): Promise<WorkAttendance | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_work_attendance')
        .select('*')
        .eq('tb_tyapp_wk_attn_id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as WorkAttendance;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Attendance Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveWorkAttendance(data: Partial<WorkAttendance>): Promise<boolean> {
    const isNew = !data.tb_tyapp_wk_attn_id;
    const {
      tb_tyapp_wk_attn_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = data;

    this.loading.set(true);

    const query = isNew
      ? this.supabase
          .from('tyapp_work_attendance')
          .insert(payload)
          .select()
          .single()
      : this.supabase
          .from('tyapp_work_attendance')
          .update(payload)
          .eq('tb_tyapp_wk_attn_id', data.tb_tyapp_wk_attn_id)
          .select()
          .single();

    try {
      const { data: savedData, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = savedData as WorkAttendance;
        this.workAttendances.update((list) => {
          const newList = isNew
            ? [saved, ...list]
            : list.map((item) =>
                item.tb_tyapp_wk_attn_id === saved.tb_tyapp_wk_attn_id
                  ? saved
                  : item,
              );
          return newList.sort(
            (a, b) =>
              new Date(b.work_date).getTime() - new Date(a.work_date).getTime(),
          );
        });
        this.loading.set(false);
        this.notification.showSuccess('Attendance record saved successfully');
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

  async deleteWorkAttendance(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_work_attendance_soft_delete_single_record',
        { record_id: id },
      );

      if (error) throw error;

      return this.zone.run(() => {
        this.workAttendances.update((list) =>
          list.filter((item) => item.tb_tyapp_wk_attn_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Attendance record deleted');
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
