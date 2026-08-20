import { Injectable, NgZone, effect, inject, signal, untracked } from "@angular/core";
import {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { AuthService } from "../../../../core/services/auth.service";
import { NotificationService } from "../../../../core/services/notification.service";
import { SupabaseService } from "../../../../core/services/supabase.service";
import { TyappUser } from "../../../../core/models/user.model";

/**
 * Shared, app-wide user directory. Other sessions may keep this cached list
 * on screen for a long time (e.g. an open Chat room), so a Realtime
 * subscription keeps display names/roles fresh without a manual refresh.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  users = signal<TyappUser[]>([]);
  loading = signal(false);

  private initialized = false;
  private fetchPromise: Promise<void> | null = null;
  private directoryChannel: RealtimeChannel | null = null;

  constructor() {
    effect(() => {
      const profile = this.authService.userProfile();
      untracked(() => {
        if (profile) {
          this.subscribeToDirectory();
        } else {
          void this.unsubscribeFromDirectory();
        }
      });
    });
  }

  fetchAllUsers(forceRefresh = false): Promise<void> {
    if (this.initialized && !forceRefresh) return Promise.resolve();
    if (this.fetchPromise) return this.fetchPromise;

    this.loading.set(true);

    const request = (async () => {
      try {
        const { data, error } = await this.supabase
          .from('tyapp_user')
          .select('*')
          .is('deleted_at', null)
          .order('tb_tyapp_pofl_seq_no', { ascending: true });

        if (error) throw error;

        this.zone.run(() => {
          this.users.set(data || []);
          this.initialized = true;
          this.loading.set(false);
        });
      } catch (error: unknown) {
        this.notification.handleError('Fetch Failed', error);
        this.zone.run(() => this.loading.set(false));
      } finally {
        this.fetchPromise = null;
      }
    })();

    this.fetchPromise = request;
    return request;
  }

  async fetchUserById(userId: string): Promise<TyappUser | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_user')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as TyappUser;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch User Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async updateUser(
    userId: string,
    updates: Partial<TyappUser>,
  ): Promise<boolean> {
    if (!this.authService.isSuperAdmin()) {
      if (userId !== this.authService.userProfile()?.user_id) {
        this.notification.handleError(
          'Update Error',
          'You can only edit your own profile',
        );
        return false;
      }
      updates = this.selfProfileUpdates(updates);
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_user')
        .update(updates)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        const updatedUser = data as TyappUser;
        if (!updatedUser) return false;

        this.users.update((list) =>
          list.map((u) => (u.user_id === userId ? updatedUser : u)),
        );

        if (userId === this.authService.userProfile()?.user_id) {
          this.authService.updateLocalProfile(updatedUser);
        }

        this.loading.set(false);
        this.notification.showSuccess('Updated successfully');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Update Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  private selfProfileUpdates(updates: Partial<TyappUser>): Partial<TyappUser> {
    const next: Partial<TyappUser> = {};
    if (updates.legal_first_name !== undefined) {
      next.legal_first_name = updates.legal_first_name;
    }
    if (updates.legal_middle_name !== undefined) {
      next.legal_middle_name = updates.legal_middle_name;
    }
    if (updates.legal_last_name !== undefined) {
      next.legal_last_name = updates.legal_last_name;
    }
    if (updates.preferred_first_name !== undefined) {
      next.preferred_first_name = updates.preferred_first_name;
    }
    if (updates.customized_display_name !== undefined) {
      next.customized_display_name = updates.customized_display_name;
    }
    if (updates.name_display_mode !== undefined) {
      next.name_display_mode = updates.name_display_mode;
    }
    return next;
  }

  private subscribeToDirectory(): void {
    if (this.directoryChannel) return;

    this.directoryChannel = this.supabase
      .channel('jaxfr-user-directory')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tyapp_user' },
        (payload) => {
          this.zone.run(() => this.applyUserChange(payload));
        },
      )
      .subscribe();
  }

  private async unsubscribeFromDirectory(): Promise<void> {
    if (this.directoryChannel) {
      await this.supabase.removeChannel(this.directoryChannel);
      this.directoryChannel = null;
    }
  }

  private applyUserChange(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = payload.new as unknown as TyappUser;
      if (!row?.user_id) return;

      if (row.deleted_at) {
        this.removeUserFromList(row.user_id);
      } else {
        this.upsertUser(row);
      }

      if (row.user_id === this.authService.userProfile()?.user_id) {
        this.authService.updateLocalProfile(row);
      }
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldRow = payload.old as { user_id?: string };
      if (oldRow.user_id) this.removeUserFromList(oldRow.user_id);
    }
  }

  private upsertUser(row: TyappUser): void {
    this.users.update((list) => {
      const index = list.findIndex((item) => item.user_id === row.user_id);
      if (index === -1) {
        return [...list, row].sort(
          (a, b) => a.tb_tyapp_pofl_seq_no - b.tb_tyapp_pofl_seq_no,
        );
      }
      const next = [...list];
      next[index] = row;
      return next;
    });
  }

  private removeUserFromList(userId: string): void {
    this.users.update((list) =>
      list.filter((item) => item.user_id !== userId),
    );
  }
}
