import { Injectable, NgZone, computed, effect, inject, signal, untracked } from '@angular/core';
import { RecordStatus } from '../../../../core/models/status.enum';
import {
  DEFAULT_USER_PREFERENCE,
  UserPreference,
  UserPreferenceValues,
  isColorMode,
  isVisualTheme,
  isWelcomeLauncherMode,
} from '../../../../core/models/user-preference.model';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  cacheOrDefault,
  clearActiveUserPreferenceCache,
  writeUserPreferenceCache,
} from '../../../../core/utils/user-preference-cache.util';

@Injectable({ providedIn: 'root' })
export class UserPreferenceService {
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  private _preference = signal<UserPreferenceValues>({
    ...DEFAULT_USER_PREFERENCE,
  });
  private committed = signal<UserPreferenceValues>({
    ...DEFAULT_USER_PREFERENCE,
  });

  readonly preference = this._preference.asReadonly();
  readonly visualTheme = computed(() => this._preference().visual_theme);
  readonly colorMode = computed(() => this._preference().color_mode);
  readonly welcomeLauncherMode = computed(
    () => this._preference().welcome_launcher_mode,
  );

  readonly loading = signal(false);
  readonly saving = signal(false);

  private loadedForUserId: string | null = null;
  private pending: UserPreferenceValues | null = null;
  private inFlight = false;
  private mutatedSinceLoad = false;

  constructor() {
    effect(() => {
      const profile = this.auth.userProfile();
      untracked(() => {
        if (profile) {
          void this.loadForUser(profile.user_id);
        } else {
          this.resetLoggedOut();
        }
      });
    });
  }

  syncWithAuth(): void {
    const profile = this.auth.userProfile();
    if (profile) {
      void this.loadForUser(profile.user_id);
    } else {
      this.resetLoggedOut();
    }
  }

  async updatePreference(
    patch: Partial<UserPreferenceValues>,
  ): Promise<boolean> {
    const userId = this.auth.userProfile()?.user_id;
    if (!userId) return false;

    const next: UserPreferenceValues = { ...this._preference(), ...patch };
    this._preference.set(next);
    this.pending = next;
    this.mutatedSinceLoad = true;
    return this.flush(userId);
  }

  private loadForUser(userId: string): void {
    if (this.loadedForUserId === userId) return;

    const cached = cacheOrDefault(userId);
    this._preference.set(cached);
    this.committed.set(cached);
    writeUserPreferenceCache(userId, cached);
    this.loadedForUserId = userId;
    this.mutatedSinceLoad = false;
    void this.fetchFromServer(userId);
  }

  private resetLoggedOut(): void {
    this.loadedForUserId = null;
    this.pending = null;
    this.mutatedSinceLoad = false;
    this.loading.set(false);
    this.saving.set(false);
    this._preference.set({ ...DEFAULT_USER_PREFERENCE });
    this.committed.set({ ...DEFAULT_USER_PREFERENCE });
    clearActiveUserPreferenceCache();
  }

  private async fetchFromServer(userId: string): Promise<void> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_user_preference')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw error;

      const row = data ? this.parseRow(data) : null;
      if (this.shouldSkipServerApply()) {
        this.zone.run(() => this.loading.set(false));
        return;
      }

      const values = row ?? { ...this._preference() };

      if (!row) {
        const created = await this.upsertRow(userId, values);
        if (this.shouldSkipServerApply()) {
          this.zone.run(() => this.loading.set(false));
          return;
        }
        if (!created) {
          this.applyServerValues(userId, values);
          return;
        }
        this.applyServerValues(userId, this.toValues(created));
        return;
      }

      this.applyServerValues(userId, values);
    } catch (error: unknown) {
      this.notification.handleError('Fetch Preferences Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  private shouldSkipServerApply(): boolean {
    return this.pending !== null || this.inFlight || this.mutatedSinceLoad;
  }

  private applyServerValues(
    userId: string,
    values: UserPreferenceValues,
  ): void {
    this.zone.run(() => {
      this._preference.set(values);
      this.committed.set(values);
      this.loading.set(false);
      writeUserPreferenceCache(userId, values);
    });
  }

  private async flush(userId: string): Promise<boolean> {
    if (this.inFlight) {
      return new Promise((resolve) => {
        const wait = async () => {
          while (this.inFlight) {
            await new Promise((r) => setTimeout(r, 40));
          }
          resolve(this.pending ? this.flush(userId) : true);
        };
        void wait();
      });
    }

    this.inFlight = true;
    this.saving.set(true);
    let ok = true;

    try {
      while (this.pending) {
        const toSave = this.pending;
        this.pending = null;
        const saved = await this.upsertRow(userId, toSave);
        if (!saved) {
          ok = false;
          this.zone.run(() => {
            this._preference.set(this.committed());
          });
          break;
        }
        const values = this.toValues(saved);
        this.zone.run(() => {
          this.committed.set(values);
          writeUserPreferenceCache(userId, values);
        });
      }
    } finally {
      this.zone.run(() => {
        this.inFlight = false;
        this.saving.set(false);
      });
    }

    return ok;
  }

  private async upsertRow(
    userId: string,
    values: UserPreferenceValues,
  ): Promise<UserPreference | null> {
    try {
      const { data, error } = await this.supabase
        .from('tyapp_user_preference')
        .upsert(
          {
            user_id: userId,
            visual_theme: values.visual_theme,
            color_mode: values.color_mode,
            welcome_launcher_mode: values.welcome_launcher_mode,
            status: RecordStatus.Active,
            deleted_at: null,
          },
          { onConflict: 'user_id' },
        )
        .select()
        .single();

      if (error) throw error;
      const row = this.parseRow(data);
      if (!row) throw new Error('Saved preference was invalid');
      return row;
    } catch (error: unknown) {
      this.notification.handleError('Save Preferences Failed', error);
      return null;
    }
  }

  private toValues(row: UserPreference): UserPreferenceValues {
    return {
      visual_theme: row.visual_theme,
      color_mode: row.color_mode,
      welcome_launcher_mode: row.welcome_launcher_mode,
    };
  }

  private parseRow(raw: unknown): UserPreference | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    if (typeof row['tb_tyapp_usr_prf_id'] !== 'string') return null;
    if (typeof row['user_id'] !== 'string') return null;
    if (!isVisualTheme(row['visual_theme'])) return null;
    if (!isColorMode(row['color_mode'])) return null;
    if (!isWelcomeLauncherMode(row['welcome_launcher_mode'])) return null;

    return {
      tb_tyapp_usr_prf_id: row['tb_tyapp_usr_prf_id'],
      tb_tyapp_usr_prf_seq_no:
        typeof row['tb_tyapp_usr_prf_seq_no'] === 'number'
          ? row['tb_tyapp_usr_prf_seq_no']
          : 0,
      user_id: row['user_id'],
      visual_theme: row['visual_theme'],
      color_mode: row['color_mode'],
      welcome_launcher_mode: row['welcome_launcher_mode'],
      remarks: typeof row['remarks'] === 'string' ? row['remarks'] : null,
      status:
        row['status'] === RecordStatus.Inactive
          ? RecordStatus.Inactive
          : RecordStatus.Active,
      created_at:
        typeof row['created_at'] === 'string' ? row['created_at'] : '',
      updated_at:
        typeof row['updated_at'] === 'string' ? row['updated_at'] : '',
      deleted_at:
        typeof row['deleted_at'] === 'string' ? row['deleted_at'] : null,
    };
  }
}
