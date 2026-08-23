import { Injectable, NgZone, inject, signal } from '@angular/core';
import { RecordStatus } from '../../../../core/models/status.enum';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  DailyChecklistItem,
  DailyChecklistSuggestion,
  DailyChecklistTemplateItem,
} from './daily-checklist.model';
import { buildItemSuggestions, nextSortOrder } from './daily-checklist.util';

@Injectable({ providedIn: 'root' })
export class DailyChecklistService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  items = signal<DailyChecklistItem[]>([]);
  templateItems = signal<DailyChecklistTemplateItem[]>([]);
  historyItems = signal<DailyChecklistItem[]>([]);
  suggestions = signal<DailyChecklistSuggestion[]>([]);

  loading = signal(false);
  templateLoading = signal(false);
  busy = signal(false);

  private currentUserId(): string | null {
    return this.authService.userProfile()?.user_id ?? null;
  }

  async fetchItemsForDate(checklistDate: string) {
    const userId = this.currentUserId();
    if (!userId) return;

    if (
      this.items().some((item) => item.checklist_date !== checklistDate)
    ) {
      this.items.set([]);
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .select('*')
        .eq('user_id', userId)
        .eq('checklist_date', checklistDate)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dcl_itm_seq_no', { ascending: true });

      if (error) throw error;

      this.zone.run(() => {
        this.items.set((data || []) as DailyChecklistItem[]);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Daily Checklist Failed', error);
      this.zone.run(() => {
        this.items.set([]);
        this.loading.set(false);
      });
    }
  }

  async fetchTemplateItems(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.templateItems().length > 0 && !force) return;

    this.templateLoading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_template_item')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dcl_tpl_itm_seq_no', { ascending: true });

      if (error) throw error;

      this.zone.run(() => {
        this.templateItems.set((data || []) as DailyChecklistTemplateItem[]);
        this.templateLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Standard Checklist Failed', error);
      this.zone.run(() => this.templateLoading.set(false));
    }
  }

  async fetchHistoryItems(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.historyItems().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('checklist_date', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dcl_itm_seq_no', { ascending: true });

      if (error) throw error;

      this.zone.run(() => {
        this.historyItems.set((data || []) as DailyChecklistItem[]);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Checklist History Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchSuggestions(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.suggestions().length > 0 && !force) return;

    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .select('item_text, completed_at, checklist_date')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('checklist_date', { ascending: false });

      if (error) throw error;

      const rows = (data || []) as Array<
        Pick<DailyChecklistItem, 'item_text' | 'completed_at' | 'checklist_date'>
      >;

      this.zone.run(() => {
        this.suggestions.set(buildItemSuggestions(rows));
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Checklist Suggestions Failed', error);
    }
  }

  async addDailyItem(
    checklistDate: string,
    itemText: string,
    remarks: string | null = null,
  ): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    const text = itemText.trim();
    if (!text) {
      this.notification.handleError(
        'Add Item Failed',
        'Item text cannot be blank.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .insert({
          user_id: userId,
          checklist_date: checklistDate,
          item_text: text,
          remarks: remarks?.trim() || null,
          sort_order: nextSortOrder(this.items()),
          status: RecordStatus.Active,
          completed_at: null,
        })
        .select()
        .single();

      if (error) throw error;

      const saved = data as DailyChecklistItem;
      this.zone.run(() => {
        this.items.update((list) => [...list, saved]);
        this.busy.set(false);
        this.notification.showSuccess('Item added');
      });
      void this.fetchSuggestions(true);
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Add Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async updateDailyItem(
    id: string,
    itemText: string,
    remarks: string | null,
  ): Promise<boolean> {
    const text = itemText.trim();
    if (!text) {
      this.notification.handleError(
        'Update Item Failed',
        'Item text cannot be blank.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .update({
          item_text: text,
          remarks: remarks?.trim() || null,
        })
        .eq('tb_tyapp_dcl_itm_id', id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw error;

      const saved = data as DailyChecklistItem;
      this.zone.run(() => {
        this.items.update((list) =>
          list.map((item) =>
            item.tb_tyapp_dcl_itm_id === id ? saved : item,
          ),
        );
        this.busy.set(false);
        this.notification.showSuccess('Item updated');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Update Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async toggleDailyItemCompletion(item: DailyChecklistItem): Promise<boolean> {
    const nextCompletedAt = item.completed_at ? null : new Date().toISOString();

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .update({ completed_at: nextCompletedAt })
        .eq('tb_tyapp_dcl_itm_id', item.tb_tyapp_dcl_itm_id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw error;

      const saved = data as DailyChecklistItem;
      this.zone.run(() => {
        this.items.update((list) =>
          list.map((row) =>
            row.tb_tyapp_dcl_itm_id === saved.tb_tyapp_dcl_itm_id ? saved : row,
          ),
        );
        this.busy.set(false);
      });
      void this.fetchSuggestions(true);
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Update Completion Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async deleteDailyItem(id: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_daily_checklist_item_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.items.update((list) =>
          list.filter((item) => item.tb_tyapp_dcl_itm_id !== id),
        );
        this.busy.set(false);
        this.notification.showSuccess('Item deleted');
      });
      void this.fetchSuggestions(true);
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Delete Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async createFromTemplate(targetDate: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_daily_checklist_create_from_template',
        { target_date: targetDate },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.items.set((data || []) as DailyChecklistItem[]);
        this.busy.set(false);
        this.notification.showSuccess('Checklist created from Standard Checklist');
      });
      void this.fetchSuggestions(true);
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Use Standard Checklist Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async copyPreviousDay(targetDate: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_daily_checklist_copy_previous_day',
        { target_date: targetDate },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.items.set((data || []) as DailyChecklistItem[]);
        this.busy.set(false);
        this.notification.showSuccess("Checklist copied from yesterday");
      });
      void this.fetchSuggestions(true);
      return true;
    } catch (error: unknown) {
      this.notification.handleError("Copy Yesterday Failed", error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async addTemplateItem(
    itemText: string,
    remarks: string | null = null,
  ): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    const text = itemText.trim();
    if (!text) {
      this.notification.handleError(
        'Add Standard Item Failed',
        'Item text cannot be blank.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_template_item')
        .insert({
          user_id: userId,
          item_text: text,
          remarks: remarks?.trim() || null,
          sort_order: nextSortOrder(this.templateItems()),
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (error) throw error;

      const saved = data as DailyChecklistTemplateItem;
      this.zone.run(() => {
        this.templateItems.update((list) => [...list, saved]);
        this.busy.set(false);
        this.notification.showSuccess('Standard item added');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Add Standard Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async updateTemplateItem(
    id: string,
    itemText: string,
    remarks: string | null,
  ): Promise<boolean> {
    const text = itemText.trim();
    if (!text) {
      this.notification.handleError(
        'Update Standard Item Failed',
        'Item text cannot be blank.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_template_item')
        .update({
          item_text: text,
          remarks: remarks?.trim() || null,
        })
        .eq('tb_tyapp_dcl_tpl_itm_id', id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw error;

      const saved = data as DailyChecklistTemplateItem;
      this.zone.run(() => {
        this.templateItems.update((list) =>
          list.map((item) =>
            item.tb_tyapp_dcl_tpl_itm_id === id ? saved : item,
          ),
        );
        this.busy.set(false);
        this.notification.showSuccess('Standard item updated');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Update Standard Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async deleteTemplateItem(id: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_daily_checklist_template_item_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.templateItems.update((list) =>
          list.filter((item) => item.tb_tyapp_dcl_tpl_itm_id !== id),
        );
        this.busy.set(false);
        this.notification.showSuccess('Standard item deleted');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Delete Standard Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async moveTemplateItem(id: string, direction: -1 | 1): Promise<boolean> {
    const list = this.templateItems();
    const index = list.findIndex((item) => item.tb_tyapp_dcl_tpl_itm_id === id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= list.length) return false;

    const current = list[index];
    const neighbor = list[swapIndex];
    let currentOrder = current.sort_order;
    let neighborOrder = neighbor.sort_order;
    if (currentOrder === neighborOrder) {
      currentOrder = index;
      neighborOrder = swapIndex;
    }

    this.busy.set(true);
    try {
      const { error: firstError } = await this.supabase
        .from('tyapp_daily_checklist_template_item')
        .update({ sort_order: neighborOrder })
        .eq('tb_tyapp_dcl_tpl_itm_id', current.tb_tyapp_dcl_tpl_itm_id)
        .is('deleted_at', null);
      if (firstError) throw firstError;

      const { error: secondError } = await this.supabase
        .from('tyapp_daily_checklist_template_item')
        .update({ sort_order: currentOrder })
        .eq('tb_tyapp_dcl_tpl_itm_id', neighbor.tb_tyapp_dcl_tpl_itm_id)
        .is('deleted_at', null);
      if (secondError) throw secondError;

      await this.fetchTemplateItems(true);
      this.zone.run(() => {
        this.busy.set(false);
        this.notification.showSuccess('Standard checklist order updated');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Reorder Standard Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }
}
