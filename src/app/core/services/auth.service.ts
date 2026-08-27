import { Injectable, inject, signal, computed, NgZone } from '@angular/core';
import { RecordStatus } from '../models/status.enum';
import { TyappUser, USER_ROLES } from '../models/user.model';
import { SupabaseService } from './supabase.service';
import { clearActiveUserPreferenceCache } from '../utils/user-preference-cache.util';

export const AUTH_ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE';
export const AUTH_ACCOUNT_REJECTED = 'ACCOUNT_REJECTED';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService).client;
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
    if (session?.user) {
      const state = await this.loadActiveProfile(session.user.id);
      if (state === 'inactive') {
        await this.requestReactivationBestEffort();
      }
      if (state !== 'ok') {
        await this.supabase.auth.signOut();
      }
    }

    this.supabase.auth.onAuthStateChange((event, session) => {
      this.zone.run(async () => {
        if (
          (event === 'SIGNED_IN' || event === 'USER_UPDATED') &&
          session?.user
        ) {
          await this.loadActiveProfile(session.user.id);
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

  private async loadActiveProfile(
    userId: string,
  ): Promise<'ok' | 'inactive' | 'rejected'> {
    const { data, error } = await this.supabase
      .from('tyapp_user')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data || data.deleted_at) {
      this._userProfile.set(null);
      return 'rejected';
    }

    const profile = data as TyappUser;
    if (profile.status === RecordStatus.Inactive) {
      this._userProfile.set(null);
      return 'inactive';
    }

    this._userProfile.set(profile);
    return 'ok';
  }

  async login(email: string, pass: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) throw error;

    const userId = data.session?.user.id;
    if (!userId) throw new Error(AUTH_ACCOUNT_REJECTED);

    const state = await this.loadActiveProfile(userId);
    if (state === 'ok') return;

    if (state === 'inactive') {
      await this.requestReactivationBestEffort();
      await this.supabase.auth.signOut();
      throw new Error(AUTH_ACCOUNT_INACTIVE);
    }

    await this.supabase.auth.signOut();
    throw new Error(AUTH_ACCOUNT_REJECTED);
  }

  async register(input: {
    code: string;
    email: string;
    password: string;
    display_name: string;
    legal_first_name: string | null;
    legal_last_name: string | null;
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

  private async requestReactivationBestEffort(): Promise<void> {
    try {
      await this.supabase.rpc('tyapp_user_request_reactivation');
    } catch {
      // Login still tells the user; Super Admin just may not see a ping yet.
    }
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
