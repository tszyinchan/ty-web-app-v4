import { Injectable, inject, NgZone, signal } from '@angular/core';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { FilelinkItem } from './filelink.model';

@Injectable({ providedIn: 'root' })
export class FilelinkService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  items = signal<FilelinkItem[]>([]);
  loading = signal(false);
  currentExplorerPath = signal<string[]>([]);
  portalExplorerPath = signal<string[]>([]);

  async fetchAllItems(force = false) {
    if (this.items().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_filelink_item')
        .select('*')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_fl_item_seq_no', { ascending: false });

      if (error) throw error;

      this.zone.run(() => {
        this.items.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Filelinks Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchItemById(id: string): Promise<FilelinkItem | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_filelink_item')
        .select('*')
        .eq('tb_tyapp_fl_item_id', id)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as FilelinkItem;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Filelink Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveItem(data: Partial<FilelinkItem>): Promise<boolean> {
    const isNew = !data.tb_tyapp_fl_item_id;
    const {
      tb_tyapp_fl_item_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = data;

    this.loading.set(true);

    const query = isNew
      ? this.supabase
          .from('tyapp_filelink_item')
          .insert(payload)
          .select()
          .single()
      : this.supabase
          .from('tyapp_filelink_item')
          .update(payload)
          .eq('tb_tyapp_fl_item_id', data.tb_tyapp_fl_item_id)
          .select()
          .single();

    try {
      const { data: savedData, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = savedData as FilelinkItem;
        this.items.update((list) =>
          isNew
            ? [saved, ...list]
            : list.map((item) =>
                item.tb_tyapp_fl_item_id === saved.tb_tyapp_fl_item_id
                  ? saved
                  : item,
              ),
        );
        this.loading.set(false);
        this.notification.showSuccess('Filelink saved successfully');
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

  async deleteItem(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_filelink_item_soft_delete_single_record',
        { record_id: id },
      );

      if (error) throw error;

      return this.zone.run(() => {
        this.items.update((list) =>
          list.filter((item) => item.tb_tyapp_fl_item_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Filelink item deleted');
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
