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
}
