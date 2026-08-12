import { Injectable, inject, NgZone, signal } from "@angular/core";
import { NotificationService } from "../../../../../core/services/notification.service";
import { SupabaseService } from "../../../../../core/services/supabase.service";
import { AppFunction } from "./app-function.model";

@Injectable({ providedIn: 'root' })
export class AppFunctionService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  functions = signal<AppFunction[]>([]);
  loading = signal(false);

  async fetchAllFunctions(force = false) {
    if (this.functions().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app_function')
        .select('*')
        .is('deleted_at', null)
        .order('tb_tyweb_ap_func_seq_no', { ascending: true });

      if (error) throw error;

      this.zone.run(() => {
        this.functions.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Functions Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchFunctionById(id: string): Promise<AppFunction | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app_function')
        .select('*')
        .eq('tb_tyapp_ap_func_id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as AppFunction;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Function Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveFunction(funcData: Partial<AppFunction>): Promise<boolean> {
    const isNew = !funcData.tb_tyapp_ap_func_id;

    const {
      tb_tyweb_ap_func_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = funcData;

    this.loading.set(true);

    const query = isNew
      ? this.supabase
          .from('tyapp_app_function')
          .insert(payload)
          .select()
          .single()
      : this.supabase
          .from('tyapp_app_function')
          .update(payload)
          .eq('tb_tyapp_ap_func_id', funcData.tb_tyapp_ap_func_id)
          .select()
          .single();

    try {
      const { data, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = data as AppFunction;
        this.functions.update((list) =>
          isNew
            ? [...list, saved]
            : list.map((item) =>
                item.tb_tyapp_ap_func_id === saved.tb_tyapp_ap_func_id
                  ? saved
                  : item,
              ),
        );

        this.loading.set(false);
        this.notification.showSuccess('Function saved successfully');
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

  async deleteFunction(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_app_function_soft_delete_single_record',
        { record_id: id },
      );

      if (error) throw error;

      return this.zone.run(() => {
        this.functions.update((list) =>
          list.filter((item) => item.tb_tyapp_ap_func_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Function deleted');
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
