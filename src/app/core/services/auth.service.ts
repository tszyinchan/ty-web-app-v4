import { Injectable, inject, signal, computed, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { TyappUser, USER_ROLES } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);
  private zone = inject(NgZone);

  private _userProfile = signal<TyappUser | null>(null);
  public userProfile = this._userProfile.asReadonly();

  isSuperAdmin = computed(
    () => (this.userProfile()?.role ?? 0) >= USER_ROLES.SUPER_ADMIN,
  );
  isAdmin = computed(() => (this.userProfile()?.role ?? 0) >= USER_ROLES.ADMIN);
  isAuthenticated = computed(() => !!this.userProfile());

  async init(): Promise<void> {
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    if (session?.user) await this.fetchProfile(session.user.id);

    this.supabase.auth.onAuthStateChange((event, session) => {
      this.zone.run(async () => {
        if (
          (event === 'SIGNED_IN' || event === 'USER_UPDATED') &&
          session?.user
        ) {
          await this.fetchProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          this._userProfile.set(null);
          this.router.navigate(['/login']);
        }
      });
    });
  }

  private async fetchProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('tyapp_user')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Fetch Profile Error:', error.message);
      return;
    }
    this._userProfile.set(data as TyappUser);
  }

  async login(email: string, pass: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) throw error;
    if (data.session?.user) {
      await this.fetchProfile(data.session.user.id);
    }
  }

  async logout() {
    await this.supabase.auth.signOut();
  }

  updateLocalProfile(updatedUser: TyappUser) {
    this._userProfile.set(updatedUser);
  }
}
