import { Injectable, inject, signal, computed, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { NotificationService } from './notification.service';
import { TyappUser, USER_ROLES } from '../models/user.model';
import { clearActiveUserPreferenceCache } from '../utils/user-preference-cache.util';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);
  private zone = inject(NgZone);
  private notification = inject(NotificationService);

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
          clearActiveUserPreferenceCache();
          this._userProfile.set(null);
          if (
            !window.location.pathname.includes('/login') &&
            !window.location.pathname.includes('/register')
          ) {
            window.location.href = '/login';
          }
        }
      });
    });
  }

  private async fetchProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('tyapp_user')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (error) {
      this._userProfile.set(null);
      this.notification.handleError('Fetch Profile Error', error);
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

  async register(input: {
    code: string;
    email: string;
    password: string;
    legal_first_name: string;
    legal_last_name: string;
  }): Promise<void> {
    const { data, error } = await this.supabase.functions.invoke(
      'register-with-invite',
      { body: input },
    );

    if (error) {
      throw new Error(await messageFromRegisterFailure(error, data));
    }
    if (data && typeof data === 'object' && 'error' in data) {
      throw new Error(
        mapRegisterErrorCode(String((data as { error: unknown }).error)),
      );
    }

    await this.login(input.email, input.password);
  }

  async logout() {
    clearActiveUserPreferenceCache();
    await this.supabase.auth.signOut();
  }

  updateLocalProfile(updatedUser: TyappUser) {
    this._userProfile.set(updatedUser);
  }
}

const GENERIC_REGISTER_ERROR =
  'Registration failed. Check your invitation code and try again.';
const EMAIL_TAKEN_ERROR =
  'This email is already registered. Try signing in.';

function mapRegisterErrorCode(code: string): string {
  if (code === 'email_taken') return EMAIL_TAKEN_ERROR;
  return GENERIC_REGISTER_ERROR;
}

async function messageFromRegisterFailure(
  error: unknown,
  data: unknown,
): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data) {
    return mapRegisterErrorCode(String((data as { error: unknown }).error));
  }

  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context: unknown }).context;
    if (ctx && typeof ctx === 'object' && 'json' in ctx) {
      const json = (ctx as { json: unknown }).json;
      if (typeof json === 'function') {
        try {
          const body = (await json.call(ctx)) as { error?: unknown };
          if (body?.error) return mapRegisterErrorCode(String(body.error));
        } catch {
          return GENERIC_REGISTER_ERROR;
        }
      }
    }
  }

  return GENERIC_REGISTER_ERROR;
}
