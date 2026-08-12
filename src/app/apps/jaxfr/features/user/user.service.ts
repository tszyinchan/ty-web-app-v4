import { Injectable, inject, NgZone, signal } from "@angular/core";
import { AuthService } from "../../../../core/services/auth.service";
import { NotificationService } from "../../../../core/services/notification.service";
import { SupabaseService } from "../../../../core/services/supabase.service";
import { TyappUser } from "../../../../core/models/user.model";

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
}
