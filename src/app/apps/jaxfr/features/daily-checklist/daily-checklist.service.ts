import { Injectable, NgZone, inject, signal } from '@angular/core';
import { RecordStatus } from '../../../../core/models/status.enum';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  DailyChecklistDayItem,
  DailyChecklistDayLog,
  DailyChecklistDayRow,
  DailyChecklistItem,
  DailyChecklistShareGrant,
  DailyChecklistStandardItem,
  DailyChecklistStandardRow,
  DclColourPresetKey,
  DclMoodKey,
} from './daily-checklist.model';
import {
  findCatalogByName,
  isColourPresetKey,
  isMoodKey,
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
  myDayLogs = signal<DailyChecklistDayLog[]>([]);
  standardItems = signal<DailyChecklistStandardRow[]>([]);
  historyItems = signal<DailyChecklistDayRow[]>([]);
  catalogDayCounts = signal<ReadonlyMap<string, number>>(new Map());
  catalogDayCountsReady = signal(false);
  outgoingGrants = signal<DailyChecklistShareGrant[]>([]);
  incomingGrants = signal<DailyChecklistShareGrant[]>([]);
  sharedCatalog = signal<DailyChecklistItem[]>([]);
  sharedDayLogs = signal<DailyChecklistDayLog[]>([]);
  sharedDayItems = signal<DailyChecklistDayRow[]>([]);

  loading = signal(false);
  catalogLoading = signal(false);
  standardLoading = signal(false);
  busy = signal(false);
  shareLoading = signal(false);
  sharedLoading = signal(false);

  private weekStart = '';
  private weekEnd = '';
  private keptDate = '';
  private weekFetchedRange = '';
  private catalogFetched = false;
  private standardFetched = false;
  private historyFetched = false;
  private catalogDayCountsFetched = false;
  private shareGrantsFetched = false;

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

  private asDayLog(row: unknown): DailyChecklistDayLog | null {
    const log = row as DailyChecklistDayLog;
    if (!log?.tb_tyapp_dcl_dly_id) return null;
    const mood = log.mood_key;
    return {
      ...log,
      mood_key: isMoodKey(mood) ? mood : null,
    };
  }

  private asDayLogs(data: unknown): DailyChecklistDayLog[] {
    if (data == null) return [];
    return (Array.isArray(data) ? data : [data])
      .map((row) => this.asDayLog(row))
      .filter((row): row is DailyChecklistDayLog => row !== null);
  }

  private asShareGrants(data: unknown): DailyChecklistShareGrant[] {
    if (data == null) return [];
    return (Array.isArray(data) ? data : [data]) as DailyChecklistShareGrant[];
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
      this.myDayLogs.update((list) =>
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

      let logQuery = this.supabase
        .from('tyapp_daily_checklist_day')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (selectedOutside) {
        logQuery = logQuery.or(
          `and(checklist_date.gte.${startDate},checklist_date.lte.${endDate}),checklist_date.eq.${selectedDate}`,
        );
      } else {
        logQuery = logQuery
          .gte('checklist_date', startDate)
          .lte('checklist_date', endDate);
      }

      const { data: logData, error: logError } = await logQuery;
      if (logError) throw logError;

      const catalog = this.catalogItems();
      const rows = this.asDayItems(data)
        .map((day) => this.withCatalog(day, catalog))
        .filter((row): row is DailyChecklistDayRow => row !== null);
      const logs = this.asDayLogs(logData);

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
          this.myDayLogs.update((list) => {
            const existing = new Set(
              list.map((item) => item.tb_tyapp_dcl_dly_id),
            );
            const added = logs.filter(
              (row) => !existing.has(row.tb_tyapp_dcl_dly_id),
            );
            return added.length === 0 ? list : [...list, ...added];
          });
        } else {
          this.weekItems.set(rows);
          this.myDayLogs.set(logs);
          this.weekFetchedRange = rangeKey;
        }
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Daily Checklist Failed', error);
      this.zone.run(() => {
        if (!merge) {
          this.weekItems.set([]);
          this.myDayLogs.set([]);
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
      this.notification.handleError('Fetch Template Failed', error);
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

  dayLogForDate(date: string): DailyChecklistDayLog | null {
    return (
      this.myDayLogs().find((row) => row.checklist_date === date) ?? null
    );
  }

  sharedOwnerIds(): string[] {
    const me = this.currentUserId();
    if (!me) return [];
    const owners = this.incomingGrants().map((row) => row.owner_user_id);
    return [me, ...owners.filter((id, index) => owners.indexOf(id) === index)];
  }

  private mergeDayLog(saved: DailyChecklistDayLog) {
    const row = this.asDayLog(saved);
    if (!row) return;
    if (!this.isLoadedDate(row.checklist_date)) {
      this.myDayLogs.update((list) => {
        const without = list.filter(
          (item) => item.tb_tyapp_dcl_dly_id !== row.tb_tyapp_dcl_dly_id,
        );
        return [...without, row];
      });
      return;
    }
    this.myDayLogs.update((list) => {
      const without = list.filter(
        (item) => item.tb_tyapp_dcl_dly_id !== row.tb_tyapp_dcl_dly_id,
      );
      return [...without, row];
    });
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

  async reorderDayItems(date: string, orderedIds: string[]): Promise<boolean> {
    if (orderedIds.length === 0) return true;

    this.weekItems.update((list) =>
      list.map((row) => {
        const index = orderedIds.indexOf(row.tb_tyapp_dcl_day_id);
        return index >= 0 ? { ...row, sort_order: index } : row;
      }),
    );

    try {
      const results = await Promise.all(
        orderedIds.map((id, index) =>
          this.supabase
            .from('tyapp_daily_checklist_day_item')
            .update({ sort_order: index })
            .eq('tb_tyapp_dcl_day_id', id)
            .is('deleted_at', null),
        ),
      );
      const failed = results.find((row) => row.error);
      if (failed?.error) throw failed.error;
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Reorder Items Failed', error);
      if (this.weekStart && this.weekEnd) {
        await this.fetchItemsForRange(this.weekStart, this.weekEnd, date, {
          force: true,
        });
      }
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
        this.notification.showSuccess('Template items added');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Apply Template Failed', error);
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
        'Add Template Item Failed',
        'That item is already in the Template.',
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
        this.notification.showSuccess('Template item added');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Add Template Item Failed', error);
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
        'Add Template Item Failed',
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
      this.notification.handleError('Add Template Item Failed', error);
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
        this.notification.showSuccess('Removed from Template');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Delete Template Item Failed', error);
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
        this.notification.showSuccess('Template order updated');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Reorder Template Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async upsertDayLog(
    checklistDate: string,
    input: { moodKey: DclMoodKey | null; title: string | null },
  ): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    const title = input.title?.trim() || null;
    const existing = this.dayLogForDate(checklistDate);
    this.busy.set(true);
    try {
      if (existing) {
        const { data, error } = await this.supabase
          .from('tyapp_daily_checklist_day')
          .update({ mood_key: input.moodKey, title })
          .eq('tb_tyapp_dcl_dly_id', existing.tb_tyapp_dcl_dly_id)
          .is('deleted_at', null)
          .select()
          .single();
        if (error) throw error;
        this.zone.run(() => {
          this.mergeDayLog(data as DailyChecklistDayLog);
          this.busy.set(false);
          this.notification.showSuccess('Day updated');
        });
        return true;
      }

      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_day')
        .insert({
          user_id: userId,
          checklist_date: checklistDate,
          mood_key: input.moodKey,
          title,
          status: RecordStatus.Active,
        })
        .select()
        .single();
      if (error) throw error;
      this.zone.run(() => {
        this.mergeDayLog(data as DailyChecklistDayLog);
        this.busy.set(false);
        this.notification.showSuccess('Day updated');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Save Day Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async fetchShareGrants(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.shareGrantsFetched && !force) return;

    this.shareLoading.set(true);
    try {
      const { data: outgoing, error: outError } = await this.supabase
        .from('tyapp_daily_checklist_share')
        .select('*')
        .eq('owner_user_id', userId)
        .is('deleted_at', null)
        .order('tb_tyapp_dcl_shr_seq_no', { ascending: true });
      if (outError) throw outError;

      const { data: incoming, error: inError } = await this.supabase
        .from('tyapp_daily_checklist_share')
        .select('*')
        .eq('viewer_user_id', userId)
        .is('deleted_at', null)
        .order('tb_tyapp_dcl_shr_seq_no', { ascending: true });
      if (inError) throw inError;

      this.zone.run(() => {
        this.outgoingGrants.set(this.asShareGrants(outgoing));
        this.incomingGrants.set(this.asShareGrants(incoming));
        this.shareGrantsFetched = true;
        this.shareLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Share List Failed', error);
      this.zone.run(() => this.shareLoading.set(false));
    }
  }

  async addShareGrant(viewerUserId: string): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;
    if (viewerUserId === userId) return false;
    if (this.outgoingGrants().some((row) => row.viewer_user_id === viewerUserId)) {
      return true;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_checklist_share')
        .insert({
          owner_user_id: userId,
          viewer_user_id: viewerUserId,
          status: RecordStatus.Active,
        })
        .select()
        .single();
      if (error) throw error;

      this.zone.run(() => {
        this.outgoingGrants.update((list) => [
          ...list,
          data as DailyChecklistShareGrant,
        ]);
        this.busy.set(false);
        this.notification.showSuccess('Viewer added');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Add Viewer Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async removeShareGrant(grantId: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_daily_checklist_share_soft_delete_single_record',
        { record_id: grantId },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.outgoingGrants.update((list) =>
          list.filter((row) => row.tb_tyapp_dcl_shr_id !== grantId),
        );
        this.busy.set(false);
        this.notification.showSuccess('Viewer removed');
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Remove Viewer Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async fetchSharedRange(startDate: string, endDate: string, force = false) {
    const userId = this.currentUserId();
    if (!userId) return;

    this.sharedLoading.set(true);
    try {
      await this.fetchShareGrants(force);
      const ownerIds = this.sharedOwnerIds();
      if (ownerIds.length === 0) {
        this.zone.run(() => {
          this.sharedCatalog.set([]);
          this.sharedDayLogs.set([]);
          this.sharedDayItems.set([]);
          this.sharedLoading.set(false);
        });
        return;
      }

      const { data: catalogData, error: catalogError } = await this.supabase
        .from('tyapp_daily_checklist_item')
        .select('*')
        .in('user_id', ownerIds)
        .is('deleted_at', null);
      if (catalogError) throw catalogError;

      const catalog = (catalogData || [])
        .map((row) => this.asCatalog(row))
        .filter((row): row is DailyChecklistItem => row !== null);

      const { data: logData, error: logError } = await this.supabase
        .from('tyapp_daily_checklist_day')
        .select('*')
        .in('user_id', ownerIds)
        .is('deleted_at', null)
        .gte('checklist_date', startDate)
        .lte('checklist_date', endDate);
      if (logError) throw logError;

      const { data: itemData, error: itemError } = await this.supabase
        .from('tyapp_daily_checklist_day_item')
        .select('*')
        .in('user_id', ownerIds)
        .is('deleted_at', null)
        .gte('checklist_date', startDate)
        .lte('checklist_date', endDate)
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dcl_day_seq_no', { ascending: true });
      if (itemError) throw itemError;

      const rows = this.asDayItems(itemData)
        .map((day) => this.withCatalog(day, catalog))
        .filter((row): row is DailyChecklistDayRow => row !== null);

      this.zone.run(() => {
        this.sharedCatalog.set(catalog);
        this.sharedDayLogs.set(this.asDayLogs(logData));
        this.sharedDayItems.set(rows);
        this.sharedLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Others Failed', error);
      this.zone.run(() => this.sharedLoading.set(false));
    }
  }
}

