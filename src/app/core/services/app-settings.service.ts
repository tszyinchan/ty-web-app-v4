import { Injectable, NgZone, effect, inject, signal, untracked } from '@angular/core';
import { AppSettings } from '../models/app-settings.model';
import { RecordStatus } from '../models/status.enum';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private auth = inject(AuthService);
  private zone = inject(NgZone);

  settings = signal<AppSettings | null>(null);

  constructor() {
    effect(() => {
      const profile = this.auth.userProfile();
      untracked(() => {
        if (profile) {
          void this.fetch();
        } else {
          this.settings.set(null);
        }
      });
    });
  }

  async fetch(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app_settings')
        .select('*')
        .eq('singleton_key', 1)
        .eq('status', RecordStatus.Active)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw error;

      this.zone.run(() => {
        this.settings.set(this.normalize((data as AppSettings | null) ?? null));
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch App Settings Failed', error);
      this.zone.run(() => {
        this.settings.set(null);
      });
    }
  }

  private normalize(row: AppSettings | null): AppSettings | null {
    if (
      !row ||
      typeof row.chat_edit_window_ms !== 'number' ||
      row.chat_edit_window_ms <= 0 ||
      typeof row.chat_delete_window_ms !== 'number' ||
      row.chat_delete_window_ms <= 0
    ) {
      return null;
    }
    return row;
  }
}
