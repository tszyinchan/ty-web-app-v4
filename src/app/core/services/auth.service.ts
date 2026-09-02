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
  private _authEmail = signal<string | null>(null);
  readonly authEmail = this._authEmail.asReadonly();

  isSuperAdmin = computed(
    () => (this.userProfile()?.role ?? 0) >= USER_ROLES.SUPER_ADMIN,
  );
  isAdmin = computed(() => (this.userProfile()?.role ?? 0) >= USER_ROLES.ADMIN);
  isAuthenticated = computed(() => !!this.userProfile());
  private recoveryPending = signal(false);
  readonly isPasswordRecovery = this.recoveryPending.asReadonly();

  canManageUserRole(role: number): boolean {
    if (this.isSuperAdmin()) return true;
    if (!this.isAdmin()) return false;
    return role < USER_ROLES.SUPER_ADMIN;
  }

  async init(): Promise<void> {
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    if (session?.user) {
      this.setAuthEmail(session.user.email);
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
          (event === 'SIGNED_IN' ||
            event === 'USER_UPDATED' ||
            event === 'PASSWORD_RECOVERY') &&
          session?.user
        ) {
          this.setAuthEmail(session.user.email);
          await this.loadActiveProfile(session.user.id);
          if (event === 'PASSWORD_RECOVERY') {
            this.recoveryPending.set(true);
          }
        } else if (event === 'SIGNED_OUT') {
          clearActiveUserPreferenceCache();
          this._userProfile.set(null);
          this._authEmail.set(null);
          this.recoveryPending.set(false);
          if (!isPublicAuthPath(window.location.pathname)) {
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

  private setAuthEmail(email: string | undefined | null): void {
    const trimmed = email?.trim() ?? '';
    this._authEmail.set(trimmed || null);
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
    if (state === 'ok') {
      this.setAuthEmail(data.session?.user.email);
      return;
    }

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

  async changeOwnPassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const { data: sessionData, error: sessionError } =
      await this.supabase.auth.getUser();
    const email = sessionData.user?.email;
    if (sessionError || !email) {
      throw new Error('You are not signed in');
    }

    const { error: checkError } = await this.supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (checkError) {
      throw new Error('Current password is incorrect');
    }

    const { error } = await this.supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw mapAuthPasswordError(error);
  }

  async setUserPassword(userId: string, newPassword: string): Promise<void> {
    const { data, error } = await this.supabase.functions.invoke(
      'set-user-password',
      { body: { user_id: userId, password: newPassword } },
    );

    if (error) {
      throw new Error(await messageFromPasswordFailure(error, data));
    }
    if (data && typeof data === 'object' && 'error' in data) {
      throw new Error(
        mapPasswordErrorCode(String((data as { error: unknown }).error)),
      );
    }
  }

  async sendPasswordReset(userId: string): Promise<void> {
    const { data, error } = await this.supabase.functions.invoke(
      'send-password-reset',
      {
        body: {
          user_id: userId,
          redirect_to: `${window.location.origin}/reset-password`,
        },
      },
    );

    if (error) {
      throw new Error(await messageFromPasswordFailure(error, data));
    }
    if (data && typeof data === 'object' && 'error' in data) {
      throw new Error(
        mapPasswordErrorCode(String((data as { error: unknown }).error)),
      );
    }
  }

  async completePasswordReset(newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw mapAuthPasswordError(error);
    this.recoveryPending.set(false);
  }

  async waitForRecoverySession(timeoutMs = 4000): Promise<boolean> {
    if (isRecoveryUrl()) this.recoveryPending.set(true);
    if (this.recoveryPending()) {
      const existing = await this.supabase.auth.getSession();
      if (existing.data.session?.user) return true;
    }

    const existing = await this.supabase.auth.getSession();
    if (existing.data.session?.user && this.recoveryPending()) return true;

    return new Promise((resolve) => {
      const { data: sub } = this.supabase.auth.onAuthStateChange(
        (event, session) => {
          if (event === 'PASSWORD_RECOVERY') {
            this.recoveryPending.set(true);
          }
          if (session?.user && (event === 'PASSWORD_RECOVERY' || this.recoveryPending())) {
            window.clearTimeout(timer);
            sub.subscription.unsubscribe();
            resolve(true);
          }
        },
      );
      const timer = window.setTimeout(() => {
        sub.subscription.unsubscribe();
        void this.supabase.auth.getSession().then(({ data }) => {
          resolve(!!data.session?.user && this.recoveryPending());
        });
      }, timeoutMs);
    });
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
const WEAK_PASSWORD_ERROR =
  'That password is too easy to guess. Choose a longer, unique password.';
const GENERIC_PASSWORD_ERROR = 'Could not update the password. Try again.';

function mapRegisterErrorCode(code: string): string {
  if (code === 'email_taken') return EMAIL_TAKEN_ERROR;
  if (code === 'weak_password') return WEAK_PASSWORD_ERROR;
  return GENERIC_REGISTER_ERROR;
}

function isPublicAuthPath(pathname: string): boolean {
  return (
    pathname.includes('/login') ||
    pathname.includes('/register') ||
    pathname.includes('/reset-password')
  );
}

function isRecoveryUrl(): boolean {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return (
    hash.get('type') === 'recovery' ||
    query.get('type') === 'recovery' ||
    !!query.get('code')
  );
}

function mapPasswordErrorCode(code: string): string {
  if (code === 'weak_password') return WEAK_PASSWORD_ERROR;
  if (code === 'forbidden' || code === 'unauthorized') {
    return 'You do not have permission to change this password';
  }
  if (code === 'user_unavailable') {
    return 'This account cannot have its password changed';
  }
  return GENERIC_PASSWORD_ERROR;
}

function mapAuthPasswordError(error: { message?: string }): Error {
  const message = (error.message ?? '').toLowerCase();
  if (
    message.includes('leaked') ||
    message.includes('pwned') ||
    message.includes('weak')
  ) {
    return new Error(WEAK_PASSWORD_ERROR);
  }
  return new Error(error.message || GENERIC_PASSWORD_ERROR);
}

async function messageFromPasswordFailure(
  error: unknown,
  data: unknown,
): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data) {
    return mapPasswordErrorCode(String((data as { error: unknown }).error));
  }

  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context: unknown }).context;
    if (ctx && typeof ctx === 'object' && 'json' in ctx) {
      const json = (ctx as { json: unknown }).json;
      if (typeof json === 'function') {
        try {
          const body = (await json.call(ctx)) as { error?: unknown };
          if (body?.error) return mapPasswordErrorCode(String(body.error));
        } catch {
          return GENERIC_PASSWORD_ERROR;
        }
      }
    }
  }

  return GENERIC_PASSWORD_ERROR;
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
