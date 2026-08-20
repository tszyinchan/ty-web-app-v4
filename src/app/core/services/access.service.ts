import { Injectable, NgZone, effect, inject, signal, untracked } from '@angular/core';
import { RecordStatus } from '../models/status.enum';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { SupabaseService } from './supabase.service';
import { AppRegistryService } from './app-registry.service';

@Injectable({ providedIn: 'root' })
export class AccessService {
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);
  private apps = inject(AppRegistryService);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  myAppIds = signal<ReadonlySet<string>>(new Set());
  myFeatureIds = signal<ReadonlySet<string>>(new Set());

  private loadedForUserId: string | null = null;

  constructor() {
    effect(() => {
      const profile = this.auth.userProfile();
      untracked(() => {
        if (profile) {
          void this.fetchMyAccess();
        } else {
          this.myAppIds.set(new Set());
          this.myFeatureIds.set(new Set());
          this.loadedForUserId = null;
        }
      });
    });
  }

  hasAppBySubdomain(subdomain: string): boolean {
    if (this.auth.isSuperAdmin()) return true;
    const app = this.apps
      .apps()
      .find((a) => a.name.toLowerCase() === subdomain.toLowerCase());
    if (!app || app.status !== RecordStatus.Active) return false;
    return this.myAppIds().has(app.tb_tyapp_app_id);
  }

  isAppActive(appId: string): boolean {
    const app = this.apps.apps().find((a) => a.tb_tyapp_app_id === appId);
    return app?.status === RecordStatus.Active;
  }

  hasFeature(featureId: string): boolean {
    if (this.auth.isSuperAdmin()) return true;
    return this.myFeatureIds().has(featureId);
  }

  async fetchMyAccess(force = false): Promise<void> {
    const userId = this.auth.userProfile()?.user_id;
    if (!userId) {
      this.myAppIds.set(new Set());
      this.myFeatureIds.set(new Set());
      this.loadedForUserId = null;
      return;
    }
    if (!force && this.loadedForUserId === userId) return;

    try {
      const [appRes, featureRes] = await Promise.all([
        this.supabase
          .from('tyapp_user_app_access')
          .select('app_id')
          .eq('user_id', userId),
        this.supabase
          .from('tyapp_user_feature_access')
          .select('feature_id')
          .eq('user_id', userId),
      ]);

      if (appRes.error) throw appRes.error;
      if (featureRes.error) throw featureRes.error;

      this.zone.run(() => {
        this.myAppIds.set(
          new Set((appRes.data ?? []).map((row) => row.app_id as string)),
        );
        this.myFeatureIds.set(
          new Set(
            (featureRes.data ?? []).map((row) => row.feature_id as string),
          ),
        );
        this.loadedForUserId = userId;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Access Failed', error);
      this.zone.run(() => {
        this.myAppIds.set(new Set());
        this.myFeatureIds.set(new Set());
        this.loadedForUserId = null;
      });
    }
  }

  async fetchAccessForUser(
    userId: string,
  ): Promise<{ appIds: string[]; featureIds: string[] }> {
    if (
      !this.auth.isSuperAdmin() &&
      userId !== this.auth.userProfile()?.user_id
    ) {
      return { appIds: [], featureIds: [] };
    }

    try {
      const [appRes, featureRes] = await Promise.all([
        this.supabase
          .from('tyapp_user_app_access')
          .select('app_id')
          .eq('user_id', userId),
        this.supabase
          .from('tyapp_user_feature_access')
          .select('feature_id')
          .eq('user_id', userId),
      ]);

      if (appRes.error) throw appRes.error;
      if (featureRes.error) throw featureRes.error;

      return {
        appIds: (appRes.data ?? []).map((row) => row.app_id as string),
        featureIds: (featureRes.data ?? []).map(
          (row) => row.feature_id as string,
        ),
      };
    } catch (error: unknown) {
      this.notification.handleError('Fetch Access Failed', error);
      return { appIds: [], featureIds: [] };
    }
  }

  async replaceAppAccess(userId: string, appIds: string[]): Promise<boolean> {
    if (!this.auth.isSuperAdmin()) {
      this.notification.handleError(
        'Save App Access Failed',
        'Only a super admin can change app access',
      );
      return false;
    }

    try {
      const { error: delError } = await this.supabase
        .from('tyapp_user_app_access')
        .delete()
        .eq('user_id', userId);
      if (delError) throw delError;

      if (appIds.length > 0) {
        const { error: insError } = await this.supabase
          .from('tyapp_user_app_access')
          .insert(appIds.map((app_id) => ({ user_id: userId, app_id })));
        if (insError) throw insError;
      }

      if (userId === this.auth.userProfile()?.user_id) {
        await this.fetchMyAccess(true);
      }
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Save App Access Failed', error);
      return false;
    }
  }

  async replaceFeatureAccess(
    userId: string,
    featureIds: string[],
  ): Promise<boolean> {
    if (!this.auth.isSuperAdmin()) {
      this.notification.handleError(
        'Save Feature Access Failed',
        'Only a super admin can change feature access',
      );
      return false;
    }

    try {
      const { error: delError } = await this.supabase
        .from('tyapp_user_feature_access')
        .delete()
        .eq('user_id', userId);
      if (delError) throw delError;

      if (featureIds.length > 0) {
        const { error: insError } = await this.supabase
          .from('tyapp_user_feature_access')
          .insert(
            featureIds.map((feature_id) => ({ user_id: userId, feature_id })),
          );
        if (insError) throw insError;
      }

      if (userId === this.auth.userProfile()?.user_id) {
        await this.fetchMyAccess(true);
      }
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Save Feature Access Failed', error);
      return false;
    }
  }
}
