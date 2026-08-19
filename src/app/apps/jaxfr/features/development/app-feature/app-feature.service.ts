import { Injectable, NgZone, inject, signal } from '@angular/core';
import { NotificationService } from '../../../../../core/services/notification.service';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { AppFeature } from './app-feature.model';

@Injectable({ providedIn: 'root' })
export class AppFeatureService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  features = signal<AppFeature[]>([]);
  loading = signal(false);

  async fetchAllFeatures(force = false) {
    if (this.features().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app_feature')
        .select('*')
        .is('deleted_at', null)
        .order('customized_order', { ascending: true })
        .order('tb_tyapp_ap_ftr_seq_no', { ascending: true });

      if (error) throw error;

      this.zone.run(() => {
        this.features.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Features Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchFeatureById(id: string): Promise<AppFeature | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app_feature')
        .select('*')
        .eq('tb_tyapp_ap_ftr_id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as AppFeature;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Feature Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveFeature(feature: Partial<AppFeature>): Promise<boolean> {
    const isNew = !feature.tb_tyapp_ap_ftr_id;

    const {
      created_at,
      updated_at,
      deleted_at,
      tb_tyapp_ap_ftr_seq_no,
      ...payload
    } = feature;

    if (isNew) {
      delete payload.tb_tyapp_ap_ftr_id;
    }

    const savePayload = {
      ...payload,
      customized_order: Number.isFinite(Number(payload.customized_order))
        ? Number(payload.customized_order)
        : 0,
      icon: payload.icon?.trim() || null,
      route: payload.route?.trim() || null,
    };

    this.loading.set(true);

    const query = isNew
      ? this.supabase
          .from('tyapp_app_feature')
          .insert(savePayload)
          .select()
          .single()
      : this.supabase
          .from('tyapp_app_feature')
          .update(savePayload)
          .eq('tb_tyapp_ap_ftr_id', feature.tb_tyapp_ap_ftr_id)
          .select()
          .single();

    try {
      const { data, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = data as AppFeature;
        this.features.update((list) => {
          const next = isNew
            ? [...list, saved]
            : list.map((item) =>
                item.tb_tyapp_ap_ftr_id === saved.tb_tyapp_ap_ftr_id
                  ? saved
                  : item,
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

  async deleteFeature(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_app_feature_soft_delete_single_record',
        { record_id: id },
      );

      if (error) throw error;

      return this.zone.run(() => {
        this.features.update((list) =>
          list.filter((item) => item.tb_tyapp_ap_ftr_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Feature deleted');
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
