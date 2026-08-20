import { Injectable, NgZone, inject, signal } from '@angular/core';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { TyWebSettings } from './tyweb.model';

@Injectable({ providedIn: 'root' })
export class TywebService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  settings = signal<TyWebSettings | null>(null);
  loading = signal(false);

  async fetch(): Promise<TyWebSettings | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyweb_v5_settings')
        .select('*')
        .eq('singleton_key', 1)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw error;

      return this.zone.run(() => {
        const row = (data as TyWebSettings | null) ?? null;
        this.settings.set(row);
        this.loading.set(false);
        return row;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch TyWeb Settings Failed', error);
      return this.zone.run(() => {
        this.settings.set(null);
        this.loading.set(false);
        return null;
      });
    }
  }

  async save(settingsData: Partial<TyWebSettings>): Promise<boolean> {
    if (!settingsData.tb_tyweb_v5_stng_id) {
      this.notification.handleError(
        'Save Failed',
        'TyWeb settings row is missing',
      );
      return false;
    }

    const {
      tb_tyweb_v5_stng_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = settingsData;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyweb_v5_settings')
        .update(payload)
        .eq('tb_tyweb_v5_stng_id', settingsData.tb_tyweb_v5_stng_id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.settings.set(data as TyWebSettings);
        this.loading.set(false);
        this.notification.showSuccess('TyWeb settings saved');
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
}
