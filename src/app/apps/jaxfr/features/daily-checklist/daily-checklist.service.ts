import { Injectable, NgZone, inject, signal } from '@angular/core';
import { RecordStatus } from '../../../../core/models/status.enum';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  DailyChecklistDayItem,
  DailyChecklistDayRow,
  DailyChecklistItem,
  DailyChecklistStandardItem,
  DailyChecklistStandardRow,
  DclColourPresetKey,
} from './daily-checklist.model';
import {
  findCatalogByName,
  isColourPresetKey,
  nextSortOrder,
} from './daily-checklist.util';

@Injectable({ providedIn: 'root' })
export class DailyChecklistService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  catalogItems = signal<DailyChecklistItem[]>([]);
  weekItems = signal<DailyChecklistDayRow[]>([]);
  standardItems = signal<DailyChecklistStandardRow[]>([]);
  historyItems = signal<DailyChecklistDayRow[]>([]);
  catalogDayCounts = signal<ReadonlyMap<string, number>>(new Map());
  catalogDayCountsReady = signal(false);

  loading = signal(false);
  catalogLoading = signal(false);
  standardLoading = signal(false);
  busy = signal(false);

  private weekStart = '';
  private weekEnd = '';
  private keptDate = '';
  private weekFetchedRange = '';
  private catalogFetched = false;
  private standardFetched = false;
  private historyFetched = false;
  private catalogDayCountsFetched = false;

  private currentUserId(): string | null {
    return this.authService.userProfile()?.user_id ?? null;
  }

  private asCatalog(row: unknown): DailyChecklistItem | null {
    const item = row as DailyChecklistItem;
    if (!item?.tb_tyapp_dcl_itm_id) return null;
    const key = item.colour_preset_key;
    return {
      ...item,
      colour_preset_key: isColourPresetKey(key) ? key : 'slate',
    };
  }

  private asDayItems(data: unknown): DailyChecklistDayItem[] {
    if (data == null) return [];
    return (Array.isArray(data) ? data : [data]) as DailyChecklistDayItem[];
  }

  private withCatalog(
    day: DailyChecklistDayItem,
    catalog: DailyChecklistItem[],
  ): DailyChecklistDayRow | null {
    const item =
      catalog.find((row) => row.tb_tyapp_dcl_itm_id === day.item_id) ?? null;
    if (!item) return null;
    return { ...day, catalog: item };
  }

  private withStandardCatalog(
    row: DailyChecklistStandardItem,
    catalog: DailyChecklistItem[],
  ): DailyChecklistStandardRow | null {
    const item =
      catalog.find((c) => c.tb_tyapp_dcl_itm_id === row.item_id) ?? null;
    if (!item) return null;
    return { ...row, catalog: item };
  }

  async fetchCatalogItems(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.catalogFetched && !force) return;

    this.catalogLoading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('item_text', { ascending: true });

      if (error) throw error;

      const rows = (data || [])
        .map((row) => this.asCatalog(row))
        .filter((row): row is DailyChecklistItem => row !== null);

      this.zone.run(() => {
        this.catalogItems.set(rows);
        this.catalogFetched = true;
        this.catalogLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Checklist Items Failed', error);
      this.zone.run(() => this.catalogLoading.set(false));
    }
  }

  async fetchCatalogDayCounts(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (!force && this.catalogDayCountsFetched) return;

    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_day_item')
        .select('item_id')
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (error) throw error;

      const counts = new Map<string, number>();
      for (const row of data || []) {
        const id = (row as { item_id: string }).item_id;
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }

      this.zone.run(() => {
        this.catalogDayCounts.set(counts);
        this.catalogDayCountsFetched = true;
        this.catalogDayCountsReady.set(true);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Item Usage Failed', error);
    }
  }

  async fetchItemsForRange(
    startDate: string,
    endDate: string,
    selectedDate: string,
    options?: { force?: boolean; merge?: boolean },
  ) {
    const userId = this.currentUserId();
    if (!userId) return;

    const force = options?.force ?? false;
    const merge = options?.merge ?? false;
    const rangeKey = `${startDate}:${endDate}:${selectedDate}`;
    this.keptDate = selectedDate;

    if (merge) {
      if (
        !force &&
        this.weekStart &&
        this.weekEnd &&
        startDate >= this.weekStart &&
        endDate <= this.weekEnd
      ) {
        return;
      }
    } else if (!force && this.weekFetchedRange === rangeKey) {
      return;
    }

    if (!merge) {
      this.weekStart = startDate;
      this.weekEnd = endDate;
      this.weekItems.update((list) =>
        list.filter((item) => this.isLoadedDate(item.checklist_date)),
      );
    }

    const keepList = this.weekItems().some(
      (item) => item.checklist_date === selectedDate,
    );
    if (!keepList && !merge) this.loading.set(true);

    try {
      await this.fetchCatalogItems();

      const selectedOutside =
        !merge && (selectedDate < startDate || selectedDate > endDate);

      let query = this.supabase
        .from('tyapp_daily_checklist_day_item')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (selectedOutside) {
        query = query.or(
          `and(checklist_date.gte.${startDate},checklist_date.lte.${endDate}),checklist_date.eq.${selectedDate}`,
        );
      } else {
        query = query
          .gte('checklist_date', startDate)
          .lte('checklist_date', endDate);
      }

      const { data, error } = await query
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dcl_day_seq_no', { ascending: true });

      if (error) throw error;

      const catalog = this.catalogItems();
      const rows = this.asDayItems(data)
        .map((day) => this.withCatalog(day, catalog))
        .filter((row): row is DailyChecklistDayRow => row !== null);

      this.zone.run(() => {
        if (merge) {
          this.weekStart = this.weekStart
            ? startDate < this.weekStart
              ? startDate
              : this.weekStart
            : startDate;
          this.weekEnd = this.weekEnd
            ? endDate > this.weekEnd
              ? endDate
              : this.weekEnd
            : endDate;
          this.weekItems.update((list) => {
            const existing = new Set(
              list.map((item) => item.tb_tyapp_dcl_day_id),
            );
            const added = rows.filter(
              (row) => !existing.has(row.tb_tyapp_dcl_day_id),
            );
            return added.length === 0 ? list : [...list, ...added];
          });
        } else {
          this.weekItems.set(rows);
          this.weekFetchedRange = rangeKey;
        }
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Daily Checklist Failed', error);
      this.zone.run(() => {
        if (!merge) {
          this.weekItems.set([]);
          this.weekFetchedRange = '';
        }
        this.loading.set(false);
      });
    }
  }

  async fetchStandardItems(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.standardFetched && !force) return;

    this.standardLoading.set(true);
    try {
      await this.fetchCatalogItems();

      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_standard_item')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dcl_std_seq_no', { ascending: true });

      if (error) throw error;

      const catalog = this.catalogItems();
      const rows = ((data || []) as DailyChecklistStandardItem[])
        .map((row) => this.withStandardCatalog(row, catalog))
        .filter((row): row is DailyChecklistStandardRow => row !== null);

      this.zone.run(() => {
        this.standardItems.set(rows);
        this.standardFetched = true;
        this.standardLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Standard Checklist Failed', error);
      this.zone.run(() => this.standardLoading.set(false));
    }
  }

  async fetchHistoryItems(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.historyFetched && !force) return;

    this.loading.set(true);
    try {
      await this.fetchCatalogItems();

      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_day_item')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('checklist_date', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dcl_day_seq_no', { ascending: true });

      if (error) throw error;

      const catalog = this.catalogItems();
      const rows = this.asDayItems(data)
        .map((day) => this.withCatalog(day, catalog))
        .filter((row): row is DailyChecklistDayRow => row !== null);

      this.zone.run(() => {
        this.historyItems.set(rows);
        this.historyFetched = true;
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Checklist History Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  itemsForDate(date: string): DailyChecklistDayRow[] {
    return this.weekItems().filter((item) => item.checklist_date === date);
  }

  catalogDayCount(itemId: string): number {
    return this.catalogDayCounts().get(itemId) ?? 0;
  }

  canDeleteCatalogItem(itemId: string): boolean {
    return (
      this.catalogDayCountsReady() && this.catalogDayCount(itemId) === 0
    );
  }

  private isLoadedDate(date: string): boolean {
    if (date >= this.weekStart && date <= this.weekEnd) return true;
    return date === this.keptDate;
  }

  private mergeWeekRow(saved: DailyChecklistDayItem) {
    const catalog = this.catalogItems();
    const row = this.withCatalog(saved, catalog);
    if (!row) return;
    if (!this.isLoadedDate(row.checklist_date)) {
      return;
    }
    this.weekItems.update((list) => {
      const without = list.filter(
        (item) => item.tb_tyapp_dcl_day_id !== row.tb_tyapp_dcl_day_id,
      );
      return [...without, row];
    });
  }

  async addExistingItemToDate(
    checklistDate: string,
    itemId: string,
    remarks: string | null = null,
  ): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    if (
      this.itemsForDate(checklistDate).some((item) => item.item_id === itemId)
    ) {
      this.notification.handleError(
        'Add Item Failed',
        'That item is already on this date.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_day_item')
        .insert({
          user_id: userId,
          item_id: itemId,
          checklist_date: checklistDate,
          sort_order: nextSortOrder(this.itemsForDate(checklistDate)),
          status: RecordStatus.Active,
          completed_at: null,
          remarks: remarks?.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      this.zone.run(() => {
        this.mergeWeekRow(data as DailyChecklistDayItem);
        this.busy.set(false);
        this.notification.showSuccess('Item added');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Add Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async createCatalogAndAddToDate(
    checklistDate: string,
    input: {
      itemText: string;
      emoji: string | null;
      colourPresetKey: DclColourPresetKey;
      remarks: string | null;
    },
  ): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    const text = input.itemText.trim();
    if (!text) {
      this.notification.handleError(
        'Add Item Failed',
        'Item text cannot be blank.',
      );
      return false;
    }

    const existing = findCatalogByName(this.catalogItems(), text);
    if (existing) {
      return this.addExistingItemToDate(
        checklistDate,
        existing.tb_tyapp_dcl_itm_id,
        input.remarks,
      );
    }

    this.busy.set(true);
    try {
      const { data: catalogData, error: catalogError } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .insert({
          user_id: userId,
          item_text: text,
          emoji: input.emoji?.trim() || null,
          colour_preset_key: input.colourPresetKey,
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (catalogError) throw catalogError;

      const catalog = this.asCatalog(catalogData);
      if (!catalog) throw new Error('Created item was missing');

      this.zone.run(() => {
        this.catalogItems.update((list) => [...list, catalog]);
      });

      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_day_item')
        .insert({
          user_id: userId,
          item_id: catalog.tb_tyapp_dcl_itm_id,
          checklist_date: checklistDate,
          sort_order: nextSortOrder(this.itemsForDate(checklistDate)),
          status: RecordStatus.Active,
          completed_at: null,
          remarks: input.remarks?.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      this.zone.run(() => {
        this.mergeWeekRow(data as DailyChecklistDayItem);
        this.busy.set(false);
        this.notification.showSuccess('Item added');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Add Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async updateDayRemarks(
    id: string,
    remarks: string | null,
    notify = true,
  ): Promise<boolean> {
    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_day_item')
        .update({ remarks: remarks?.trim() || null })
        .eq('tb_tyapp_dcl_day_id', id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw error;

      this.zone.run(() => {
        this.mergeWeekRow(data as DailyChecklistDayItem);
        this.busy.set(false);
        if (notify) this.notification.showSuccess('Remarks saved');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Update Remarks Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async toggleDayItemCompletion(item: DailyChecklistDayRow): Promise<boolean> {
    const nextCompletedAt = item.completed_at ? null : new Date().toISOString();

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_day_item')
        .update({ completed_at: nextCompletedAt })
        .eq('tb_tyapp_dcl_day_id', item.tb_tyapp_dcl_day_id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw error;

      this.zone.run(() => {
        this.mergeWeekRow(data as DailyChecklistDayItem);
        this.busy.set(false);
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Update Completion Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async deleteDayItem(id: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_daily_checklist_day_item_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.weekItems.update((list) =>
          list.filter((item) => item.tb_tyapp_dcl_day_id !== id),
        );
        this.busy.set(false);
        this.notification.showSuccess('Item removed from this date');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Delete Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  private mergeInsertedDayRows(rows: DailyChecklistDayRow[]) {
    if (rows.length === 0) return;
    this.weekItems.update((list) => {
      const existing = new Set(list.map((item) => item.tb_tyapp_dcl_day_id));
      const added = rows.filter(
        (row) =>
          !existing.has(row.tb_tyapp_dcl_day_id) &&
          this.isLoadedDate(row.checklist_date),
      );
      return added.length === 0 ? list : [...list, ...added];
    });
  }

  async createFromStandard(targetDate: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await this.fetchCatalogItems();
      const { data, error } = await this.supabase.rpc(
        'tyapp_daily_checklist_create_from_standard',
        { target_date: targetDate },
      );
      if (error) throw error;

      const catalog = this.catalogItems();
      const rows = this.asDayItems(data)
        .map((day) => this.withCatalog(day, catalog))
        .filter((row): row is DailyChecklistDayRow => row !== null);

      this.zone.run(() => {
        this.mergeInsertedDayRows(rows);
        this.busy.set(false);
        this.notification.showSuccess('Standard items added');
      });
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
      await this.fetchCatalogItems();
      const { data, error } = await this.supabase.rpc(
        'tyapp_daily_checklist_copy_previous_day',
        { target_date: targetDate },
      );
      if (error) throw error;

      const catalog = this.catalogItems();
      const rows = this.asDayItems(data)
        .map((day) => this.withCatalog(day, catalog))
        .filter((row): row is DailyChecklistDayRow => row !== null);

      this.zone.run(() => {
        this.mergeInsertedDayRows(rows);
        this.busy.set(false);
        this.notification.showSuccess("Yesterday's items added");
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Copy Yesterday Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async addStandardItem(itemId: string): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    if (this.standardItems().some((row) => row.item_id === itemId)) {
      this.notification.handleError(
        'Add Standard Item Failed',
        'That item is already in the Standard Checklist.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_standard_item')
        .insert({
          user_id: userId,
          item_id: itemId,
          sort_order: nextSortOrder(this.standardItems()),
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (error) throw error;

      const row = this.withStandardCatalog(
        data as DailyChecklistStandardItem,
        this.catalogItems(),
      );
      this.zone.run(() => {
        if (row) {
          this.standardItems.update((list) => [...list, row]);
        }
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

  async createCatalogAndAddToStandard(input: {
    itemText: string;
    emoji: string | null;
    colourPresetKey: DclColourPresetKey;
  }): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    const text = input.itemText.trim();
    if (!text) {
      this.notification.handleError(
        'Add Standard Item Failed',
        'Item text cannot be blank.',
      );
      return false;
    }

    const existing = findCatalogByName(this.catalogItems(), text);
    if (existing) {
      return this.addStandardItem(existing.tb_tyapp_dcl_itm_id);
    }

    this.busy.set(true);
    try {
      const { data: catalogData, error: catalogError } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .insert({
          user_id: userId,
          item_text: text,
          emoji: input.emoji?.trim() || null,
          colour_preset_key: input.colourPresetKey,
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (catalogError) throw catalogError;
      const catalog = this.asCatalog(catalogData);
      if (!catalog) throw new Error('Created item was missing');

      this.zone.run(() => {
        this.catalogItems.update((list) => [...list, catalog]);
      });

      return this.addStandardItem(catalog.tb_tyapp_dcl_itm_id);
    } catch (error: unknown) {
      this.notification.handleError('Add Standard Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async updateCatalogItem(
    id: string,
    input: {
      itemText: string;
      emoji: string | null;
      colourPresetKey: DclColourPresetKey;
    },
  ): Promise<boolean> {
    const text = input.itemText.trim();
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
          emoji: input.emoji?.trim() || null,
          colour_preset_key: input.colourPresetKey,
        })
        .eq('tb_tyapp_dcl_itm_id', id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw error;
      const catalog = this.asCatalog(data);
      if (!catalog) throw new Error('Updated item was missing');

      this.zone.run(() => {
        this.catalogItems.update((list) =>
          list.map((item) =>
            item.tb_tyapp_dcl_itm_id === id ? catalog : item,
          ),
        );
        this.weekItems.update((list) =>
          list.map((row) =>
            row.item_id === id ? { ...row, catalog } : row,
          ),
        );
        this.standardItems.update((list) =>
          list.map((row) =>
            row.item_id === id ? { ...row, catalog } : row,
          ),
        );
        this.historyItems.update((list) =>
          list.map((row) =>
            row.item_id === id ? { ...row, catalog } : row,
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

  async createCatalogItem(input: {
    itemText: string;
    emoji: string | null;
    colourPresetKey: DclColourPresetKey;
  }): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    const text = input.itemText.trim();
    if (!text) {
      this.notification.handleError(
        'Add Item Failed',
        'Item text cannot be blank.',
      );
      return false;
    }

    if (findCatalogByName(this.catalogItems(), text)) {
      this.notification.handleError(
        'Add Item Failed',
        'An item with that name already exists.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .insert({
          user_id: userId,
          item_text: text,
          emoji: input.emoji?.trim() || null,
          colour_preset_key: input.colourPresetKey,
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (error) throw error;
      const catalog = this.asCatalog(data);
      if (!catalog) throw new Error('Created item was missing');

      this.zone.run(() => {
        this.catalogItems.update((list) =>
          [...list, catalog].sort((a, b) =>
            a.item_text.localeCompare(b.item_text),
          ),
        );
        this.busy.set(false);
        this.notification.showSuccess('Item added');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Add Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async deleteCatalogItem(id: string): Promise<boolean> {
    if (!this.canDeleteCatalogItem(id)) {
      this.notification.handleError(
        'Delete Item Failed',
        'This item is still on at least one date. Remove those day entries first.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_daily_checklist_item_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.catalogItems.update((list) =>
          list.filter((item) => item.tb_tyapp_dcl_itm_id !== id),
        );
        this.standardItems.update((list) =>
          list.filter((row) => row.item_id !== id),
        );
        this.weekItems.update((list) =>
          list.filter((row) => row.item_id !== id),
        );
        this.historyItems.update((list) =>
          list.filter((row) => row.item_id !== id),
        );
        const nextCounts = new Map(this.catalogDayCounts());
        nextCounts.delete(id);
        this.catalogDayCounts.set(nextCounts);
        this.busy.set(false);
        this.notification.showSuccess('Item deleted');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Delete Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async deleteStandardItem(id: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_daily_checklist_standard_item_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.standardItems.update((list) =>
          list.filter((item) => item.tb_tyapp_dcl_std_id !== id),
        );
        this.busy.set(false);
        this.notification.showSuccess('Removed from Standard Checklist');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Delete Standard Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async moveStandardItem(id: string, direction: -1 | 1): Promise<boolean> {
    const list = this.standardItems();
    const index = list.findIndex((item) => item.tb_tyapp_dcl_std_id === id);
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
        .from('tyapp_daily_checklist_standard_item')
        .update({ sort_order: neighborOrder })
        .eq('tb_tyapp_dcl_std_id', current.tb_tyapp_dcl_std_id)
        .is('deleted_at', null);
      if (firstError) throw firstError;

      const { error: secondError } = await this.supabase
        .from('tyapp_daily_checklist_standard_item')
        .update({ sort_order: currentOrder })
        .eq('tb_tyapp_dcl_std_id', neighbor.tb_tyapp_dcl_std_id)
        .is('deleted_at', null);
      if (secondError) throw secondError;

      await this.fetchStandardItems(true);
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
