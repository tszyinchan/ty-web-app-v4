import { Injectable, inject, signal } from '@angular/core';
import { TyWebIntroUserProfile } from './tyweb.model';
import { SupabaseService } from '../../../../../core/services/supabase.service';

@Injectable({
  providedIn: 'root',
})
export class TywebService {
  private supabaseService = inject(SupabaseService);

  loading = signal(false);

  async getProfile(userId: string): Promise<TyWebIntroUserProfile | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('tyweb_intro_user_profile')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data as TyWebIntroUserProfile;
    } finally {
      this.loading.set(false);
    }
  }

  async updateProfileField<K extends keyof TyWebIntroUserProfile>(
    userId: string,
    fieldName: K,
    newValue: TyWebIntroUserProfile[K],
  ): Promise<void> {
    this.loading.set(true);
    try {
      const { error } = await this.supabaseService.client
        .from('tyweb_intro_user_profile')
        .update({
          [fieldName]: newValue,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) {
        throw error;
      }
    } finally {
      this.loading.set(false);
    }
  }
}
