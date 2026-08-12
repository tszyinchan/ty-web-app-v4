import { Injectable, inject, NgZone, signal } from "@angular/core";
import { NotificationService } from "../../../../../core/services/notification.service";
import { SupabaseService } from "../../../../../core/services/supabase.service";
import { AppCategory } from "./app-category.model";

@Injectable({ providedIn: 'root' })
export class AppCategoryService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  categories = signal<AppCategory[]>([]);
  loading = signal(false);

  async fetchAllCategories(force = false) {
    if (this.categories().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app_category')
        .select('*')
        .is('deleted_at', null)
        .order('tb_tyapp_ap_ctgy_seq_no', { ascending: true });

      if (error) throw error;

      this.zone.run(() => {
        this.categories.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Categories Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchCategoryById(id: string): Promise<AppCategory | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_app_category')
        .select('*')
        .eq('tb_tyapp_ap_ctgy_id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as AppCategory;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Category Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveCategory(category: Partial<AppCategory>): Promise<boolean> {
    const isNew = !category.tb_tyapp_ap_ctgy_id;

    const {
      tb_tyapp_ap_ctgy_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = category;

    this.loading.set(true);

    const query = isNew
      ? this.supabase
          .from('tyapp_app_category')
          .insert(payload)
          .select()
          .single()
      : this.supabase
          .from('tyapp_app_category')
          .update(payload)
          .eq('tb_tyapp_ap_ctgy_id', category.tb_tyapp_ap_ctgy_id)
          .select()
          .single();

    try {
      const { data, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = data as AppCategory;
        this.categories.update((list) =>
          isNew
            ? [...list, saved]
            : list.map((item) =>
                item.tb_tyapp_ap_ctgy_id === saved.tb_tyapp_ap_ctgy_id
                  ? saved
                  : item,
              ),
        );

        this.loading.set(false);
        this.notification.showSuccess('Saved successfully');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Save Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async deleteCategory(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_app_category_soft_delete_single_record',
        { record_id: id },
      );

      if (error) throw error;

      return this.zone.run(() => {
        this.categories.update((list) =>
          list.filter((item) => item.tb_tyapp_ap_ctgy_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Category deleted');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Delete Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }
}
