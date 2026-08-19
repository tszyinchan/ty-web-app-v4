import { Injectable, NgZone, inject, signal } from '@angular/core';
import { TyappApp } from '../models/app.model';
import { NotificationService } from './notification.service';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AppRegistryService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  apps = signal<TyappApp[]>([]);
  loading = signal(false);

  async fetchAllApps(force = false) {
    if (this.apps().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app')
        .select('*')
        .is('deleted_at', null)
        .order('customized_order', { ascending: true })
        .order('tb_tyapp_app_seq_no', { ascending: true });

      if (error) throw error;

      this.zone.run(() => {
        this.apps.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Apps Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchAppById(id: string): Promise<TyappApp | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app')
        .select('*')
        .eq('tb_tyapp_app_id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as TyappApp;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch App Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveApp(app: Partial<TyappApp>): Promise<boolean> {
    const isNew = !app.tb_tyapp_app_id;

    const {
      created_at,
      updated_at,
      deleted_at,
      tb_tyapp_app_seq_no,
      ...payload
    } = app;

    if (isNew) {
      delete payload.tb_tyapp_app_id;
    }

    const savePayload = {
      ...payload,
      name: payload.name?.trim() ?? '',
      remarks: payload.remarks?.trim() || null,
      customized_order: Number.isFinite(Number(payload.customized_order))
        ? Number(payload.customized_order)
        : 0,
    };

    this.loading.set(true);

    const query = isNew
      ? this.supabase.from('tyapp_app').insert(savePayload).select().single()
      : this.supabase
          .from('tyapp_app')
          .update(savePayload)
          .eq('tb_tyapp_app_id', app.tb_tyapp_app_id)
          .select()
          .single();

    try {
      const { data, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = data as TyappApp;
        this.apps.update((list) => {
          const next = isNew
            ? [...list, saved]
            : list.map((item) =>
                item.tb_tyapp_app_id === saved.tb_tyapp_app_id ? saved : item,
              );
          return [...next].sort(
            (a, b) => a.customized_order - b.customized_order,
          );
        });
        this.loading.set(false);
        this.notification.showSuccess('Saved successfully');
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

  async deleteApp(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { count, error: countError } = await this.supabase
        .from('tyapp_app_feature')
        .select('tb_tyapp_ap_ftr_id', { count: 'exact', head: true })
        .eq('app_id', id)
        .is('deleted_at', null);

      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error('Move or delete its features first.');
      }

      const { error } = await this.supabase.rpc(
        'tyapp_app_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      return this.zone.run(() => {
        this.apps.update((list) =>
          list.filter((item) => item.tb_tyapp_app_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('App deleted');
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
