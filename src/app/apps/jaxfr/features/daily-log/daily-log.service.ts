import { Injectable, NgZone, inject, signal } from '@angular/core';
import { RecordStatus } from '../../../../core/models/status.enum';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  DailyLogDayItem,
  DailyLogDay,
  DailyLogDayRow,
  DailyLogLibraryItem,
  DailyLogViewerGrant,
  DailyLogTemplateItem,
  DailyLogTemplateRow,
  DlColourPresetKey,
  DlMoodKey,
} from './daily-log.model';
import {
  findLibraryItemByName,
  isColourPresetKey,
  isMoodKey,
  nextSortOrder,
} from './daily-log.util';

@Injectable({ providedIn: 'root' })
export class DailyLogService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  libraryItems = signal<DailyLogLibraryItem[]>([]);
  weekItems = signal<DailyLogDayRow[]>([]);
  myDayLogs = signal<DailyLogDay[]>([]);
  templateItems = signal<DailyLogTemplateRow[]>([]);
  historyItems = signal<DailyLogDayRow[]>([]);
  libraryDayCounts = signal<ReadonlyMap<string, number>>(new Map());
  libraryDayCountsReady = signal(false);
  outgoingGrants = signal<DailyLogViewerGrant[]>([]);
  incomingGrants = signal<DailyLogViewerGrant[]>([]);
  othersLibraryItems = signal<DailyLogLibraryItem[]>([]);
  othersDayLogs = signal<DailyLogDay[]>([]);
  othersDayItems = signal<DailyLogDayRow[]>([]);

  loading = signal(false);
  libraryLoading = signal(false);
  templateLoading = signal(false);
  busy = signal(false);
  viewersLoading = signal(false);
  othersLoading = signal(false);

  private weekStart = '';
  private weekEnd = '';
  private keptDate = '';
  private weekFetchedRange = '';
  private libraryFetched = false;
  private templateFetched = false;
  private historyFetched = false;
  private libraryDayCountsFetched = false;
  private viewerGrantsFetched = false;

  private currentUserId(): string | null {
    return this.authService.userProfile()?.user_id ?? null;
  }

  private asLibraryItem(row: unknown): DailyLogLibraryItem | null {
    const item = row as DailyLogLibraryItem;
    if (!item?.tb_tyapp_dl_itm_id) return null;
    const key = item.colour_preset_key;
    return {
      ...item,
      colour_preset_key: isColourPresetKey(key) ? key : 'slate',
    };
  }

  private asDayItems(data: unknown): DailyLogDayItem[] {
    if (data == null) return [];
    return (Array.isArray(data) ? data : [data]) as DailyLogDayItem[];
  }

  private asDayLog(row: unknown): DailyLogDay | null {
    const log = row as DailyLogDay;
    if (!log?.tb_tyapp_dl_log_id) return null;
    const mood = log.mood_key;
    return {
      ...log,
      mood_key: isMoodKey(mood) ? mood : null,
    };
  }

  private asDayLogs(data: unknown): DailyLogDay[] {
    if (data == null) return [];
    return (Array.isArray(data) ? data : [data])
      .map((row) => this.asDayLog(row))
      .filter((row): row is DailyLogDay => row !== null);
  }

  private asViewerGrants(data: unknown): DailyLogViewerGrant[] {
    if (data == null) return [];
    return (Array.isArray(data) ? data : [data]) as DailyLogViewerGrant[];
  }

  private withLibrary(
    day: DailyLogDayItem,
    library: DailyLogLibraryItem[],
  ): DailyLogDayRow | null {
    const item =
      library.find((row) => row.tb_tyapp_dl_itm_id === day.item_id) ?? null;
    if (!item) return null;
    return { ...day, library: item };
  }

  private withTemplateLibrary(
    row: DailyLogTemplateItem,
    library: DailyLogLibraryItem[],
  ): DailyLogTemplateRow | null {
    const item =
      library.find((c) => c.tb_tyapp_dl_itm_id === row.item_id) ?? null;
    if (!item) return null;
    return { ...row, library: item };
  }

  async fetchLibraryItems(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.libraryFetched && !force) return;

    this.libraryLoading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_log_item')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('item_text', { ascending: true });

      if (error) throw error;

      const rows = (data || [])
        .map((row) => this.asLibraryItem(row))
        .filter((row): row is DailyLogLibraryItem => row !== null);

      this.zone.run(() => {
        this.libraryItems.set(rows);
        this.libraryFetched = true;
        this.libraryLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Library Failed', error);
      this.zone.run(() => this.libraryLoading.set(false));
    }
  }

  async fetchLibraryDayCounts(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (!force && this.libraryDayCountsFetched) return;

    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_log_day_item')
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
        this.libraryDayCounts.set(counts);
        this.libraryDayCountsFetched = true;
        this.libraryDayCountsReady.set(true);
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
        list.filter((item) => this.isLoadedDate(item.log_date)),
      );
      this.myDayLogs.update((list) =>
        list.filter((item) => this.isLoadedDate(item.log_date)),
      );
    }

    const keepList = this.weekItems().some(
      (item) => item.log_date === selectedDate,
    );
    if (!keepList && !merge) this.loading.set(true);

    try {
      await this.fetchLibraryItems();

      const selectedOutside =
        !merge && (selectedDate < startDate || selectedDate > endDate);

      let query = this.supabase
        .from('tyapp_daily_log_day_item')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (selectedOutside) {
        query = query.or(
          `and(log_date.gte.${startDate},log_date.lte.${endDate}),log_date.eq.${selectedDate}`,
        );
      } else {
        query = query
          .gte('log_date', startDate)
          .lte('log_date', endDate);
      }

      const { data, error } = await query
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dl_day_seq_no', { ascending: true });

      if (error) throw error;

      let logQuery = this.supabase
        .from('tyapp_daily_log_day')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (selectedOutside) {
        logQuery = logQuery.or(
          `and(log_date.gte.${startDate},log_date.lte.${endDate}),log_date.eq.${selectedDate}`,
        );
      } else {
        logQuery = logQuery
          .gte('log_date', startDate)
          .lte('log_date', endDate);
      }

      const { data: logData, error: logError } = await logQuery;
      if (logError) throw logError;

      const library = this.libraryItems();
      const rows = this.asDayItems(data)
        .map((day) => this.withLibrary(day, library))
        .filter((row): row is DailyLogDayRow => row !== null);
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
              list.map((item) => item.tb_tyapp_dl_day_id),
            );
            const added = rows.filter(
              (row) => !existing.has(row.tb_tyapp_dl_day_id),
            );
            return added.length === 0 ? list : [...list, ...added];
          });
          this.myDayLogs.update((list) => {
            const existing = new Set(
              list.map((item) => item.tb_tyapp_dl_log_id),
            );
            const added = logs.filter(
              (row) => !existing.has(row.tb_tyapp_dl_log_id),
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
      this.notification.handleError('Fetch Log Failed', error);
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

  async fetchTemplateItems(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.templateFetched && !force) return;

    this.templateLoading.set(true);
    try {
      await this.fetchLibraryItems();

      const { data, error } = await this.supabase
        .from('tyapp_daily_log_template_item')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dl_tpl_seq_no', { ascending: true });

      if (error) throw error;

      const library = this.libraryItems();
      const rows = ((data || []) as DailyLogTemplateItem[])
        .map((row) => this.withTemplateLibrary(row, library))
        .filter((row): row is DailyLogTemplateRow => row !== null);

      this.zone.run(() => {
        this.templateItems.set(rows);
        this.templateFetched = true;
        this.templateLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Template Failed', error);
      this.zone.run(() => this.templateLoading.set(false));
    }
  }

  async fetchHistoryItems(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.historyFetched && !force) return;

    this.loading.set(true);
    try {
      await this.fetchLibraryItems();

      const { data, error } = await this.supabase
        .from('tyapp_daily_log_day_item')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('log_date', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dl_day_seq_no', { ascending: true });

      if (error) throw error;

      const library = this.libraryItems();
      const rows = this.asDayItems(data)
        .map((day) => this.withLibrary(day, library))
        .filter((row): row is DailyLogDayRow => row !== null);

      this.zone.run(() => {
        this.historyItems.set(rows);
        this.historyFetched = true;
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch History Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  itemsForDate(date: string): DailyLogDayRow[] {
    return this.weekItems().filter((item) => item.log_date === date);
  }

  dayLogForDate(date: string): DailyLogDay | null {
    return (
      this.myDayLogs().find((row) => row.log_date === date) ?? null
    );
  }

  othersOwnerIds(): string[] {
    const me = this.currentUserId();
    if (!me) return [];
    const owners = this.incomingGrants().map((row) => row.owner_user_id);
    return [me, ...owners.filter((id, index) => owners.indexOf(id) === index)];
  }

  private mergeDayLog(saved: DailyLogDay) {
    const row = this.asDayLog(saved);
    if (!row) return;
    if (!this.isLoadedDate(row.log_date)) {
      this.myDayLogs.update((list) => {
        const without = list.filter(
          (item) => item.tb_tyapp_dl_log_id !== row.tb_tyapp_dl_log_id,
        );
        return [...without, row];
      });
      return;
    }
    this.myDayLogs.update((list) => {
      const without = list.filter(
        (item) => item.tb_tyapp_dl_log_id !== row.tb_tyapp_dl_log_id,
      );
      return [...without, row];
    });
  }

  libraryDayCount(itemId: string): number {
    return this.libraryDayCounts().get(itemId) ?? 0;
  }

  canDeleteLibraryItem(itemId: string): boolean {
    return (
      this.libraryDayCountsReady() && this.libraryDayCount(itemId) === 0
    );
  }

  private isLoadedDate(date: string): boolean {
    if (date >= this.weekStart && date <= this.weekEnd) return true;
    return date === this.keptDate;
  }

  private mergeWeekRow(saved: DailyLogDayItem) {
    const library = this.libraryItems();
    const row = this.withLibrary(saved, library);
    if (!row) return;
    if (!this.isLoadedDate(row.log_date)) {
      return;
    }
    this.weekItems.update((list) => {
      const without = list.filter(
        (item) => item.tb_tyapp_dl_day_id !== row.tb_tyapp_dl_day_id,
      );
      return [...without, row];
    });
  }

  async addExistingItemToDate(
    logDate: string,
    itemId: string,
    remarks: string | null = null,
  ): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    if (
      this.itemsForDate(logDate).some((item) => item.item_id === itemId)
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
        .from('tyapp_daily_log_day_item')
        .insert({
          user_id: userId,
          item_id: itemId,
          log_date: logDate,
          sort_order: nextSortOrder(this.itemsForDate(logDate)),
          status: RecordStatus.Active,
          completed_at: null,
          remarks: remarks?.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      this.zone.run(() => {
        this.mergeWeekRow(data as DailyLogDayItem);
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

  async createLibraryItemAndAddToDate(
    logDate: string,
    input: {
      itemText: string;
      emoji: string | null;
      colourPresetKey: DlColourPresetKey;
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

    const existing = findLibraryItemByName(this.libraryItems(), text);
    if (existing) {
      return this.addExistingItemToDate(
        logDate,
        existing.tb_tyapp_dl_itm_id,
        input.remarks,
      );
    }

    this.busy.set(true);
    try {
      const { data: libraryData, error: libraryError } = await this.supabase
        .from('tyapp_daily_log_item')
        .insert({
          user_id: userId,
          item_text: text,
          emoji: input.emoji?.trim() || null,
          colour_preset_key: input.colourPresetKey,
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (libraryError) throw libraryError;

      const library = this.asLibraryItem(libraryData);
      if (!library) throw new Error('Created item was missing');

      this.zone.run(() => {
        this.libraryItems.update((list) => [...list, library]);
      });

      const { data, error } = await this.supabase
        .from('tyapp_daily_log_day_item')
        .insert({
          user_id: userId,
          item_id: library.tb_tyapp_dl_itm_id,
          log_date: logDate,
          sort_order: nextSortOrder(this.itemsForDate(logDate)),
          status: RecordStatus.Active,
          completed_at: null,
          remarks: input.remarks?.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      this.zone.run(() => {
        this.mergeWeekRow(data as DailyLogDayItem);
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
        .from('tyapp_daily_log_day_item')
        .update({ remarks: remarks?.trim() || null })
        .eq('tb_tyapp_dl_day_id', id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw error;

      this.zone.run(() => {
        this.mergeWeekRow(data as DailyLogDayItem);
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

  async toggleDayItemCompletion(item: DailyLogDayRow): Promise<boolean> {
    const nextCompletedAt = item.completed_at ? null : new Date().toISOString();

    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_log_day_item')
        .update({ completed_at: nextCompletedAt })
        .eq('tb_tyapp_dl_day_id', item.tb_tyapp_dl_day_id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw error;

      this.zone.run(() => {
        this.mergeWeekRow(data as DailyLogDayItem);
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Update Completion Failed', error);
      return false;
    }
  }

  async deleteDayItem(id: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_daily_log_day_item_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.weekItems.update((list) =>
          list.filter((item) => item.tb_tyapp_dl_day_id !== id),
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
        const index = orderedIds.indexOf(row.tb_tyapp_dl_day_id);
        return index >= 0 ? { ...row, sort_order: index } : row;
      }),
    );

    try {
      const results = await Promise.all(
        orderedIds.map((id, index) =>
          this.supabase
            .from('tyapp_daily_log_day_item')
            .update({ sort_order: index })
            .eq('tb_tyapp_dl_day_id', id)
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

  private mergeInsertedDayRows(rows: DailyLogDayRow[]) {
    if (rows.length === 0) return;
    this.weekItems.update((list) => {
      const existing = new Set(list.map((item) => item.tb_tyapp_dl_day_id));
      const added = rows.filter(
        (row) =>
          !existing.has(row.tb_tyapp_dl_day_id) &&
          this.isLoadedDate(row.log_date),
      );
      return added.length === 0 ? list : [...list, ...added];
    });
  }

  async createFromTemplate(targetDate: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await this.fetchLibraryItems();
      const { data, error } = await this.supabase.rpc(
        'tyapp_daily_log_create_from_template',
        { target_date: targetDate },
      );
      if (error) throw error;

      const library = this.libraryItems();
      const rows = this.asDayItems(data)
        .map((day) => this.withLibrary(day, library))
        .filter((row): row is DailyLogDayRow => row !== null);

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
      await this.fetchLibraryItems();
      const { data, error } = await this.supabase.rpc(
        'tyapp_daily_log_copy_previous_day',
        { target_date: targetDate },
      );
      if (error) throw error;

      const library = this.libraryItems();
      const rows = this.asDayItems(data)
        .map((day) => this.withLibrary(day, library))
        .filter((row): row is DailyLogDayRow => row !== null);

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

  async addTemplateItem(itemId: string): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    if (this.templateItems().some((row) => row.item_id === itemId)) {
      this.notification.handleError(
        'Add Template Item Failed',
        'That item is already in the Template.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_log_template_item')
        .insert({
          user_id: userId,
          item_id: itemId,
          sort_order: nextSortOrder(this.templateItems()),
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (error) throw error;

      const row = this.withTemplateLibrary(
        data as DailyLogTemplateItem,
        this.libraryItems(),
      );
      this.zone.run(() => {
        if (row) {
          this.templateItems.update((list) => [...list, row]);
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

  async createLibraryItemAndAddToTemplate(input: {
    itemText: string;
    emoji: string | null;
    colourPresetKey: DlColourPresetKey;
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

    const existing = findLibraryItemByName(this.libraryItems(), text);
    if (existing) {
      return this.addTemplateItem(existing.tb_tyapp_dl_itm_id);
    }

    this.busy.set(true);
    try {
      const { data: libraryData, error: libraryError } = await this.supabase
        .from('tyapp_daily_log_item')
        .insert({
          user_id: userId,
          item_text: text,
          emoji: input.emoji?.trim() || null,
          colour_preset_key: input.colourPresetKey,
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (libraryError) throw libraryError;
      const library = this.asLibraryItem(libraryData);
      if (!library) throw new Error('Created item was missing');

      this.zone.run(() => {
        this.libraryItems.update((list) => [...list, library]);
      });

      return this.addTemplateItem(library.tb_tyapp_dl_itm_id);
    } catch (error: unknown) {
      this.notification.handleError('Add Template Item Failed', error);
      this.zone.run(() => this.busy.set(false));
      return false;
    }
  }

  async updateLibraryItem(
    id: string,
    input: {
      itemText: string;
      emoji: string | null;
      colourPresetKey: DlColourPresetKey;
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
        .from('tyapp_daily_log_item')
        .update({
          item_text: text,
          emoji: input.emoji?.trim() || null,
          colour_preset_key: input.colourPresetKey,
        })
        .eq('tb_tyapp_dl_itm_id', id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error) throw error;
      const library = this.asLibraryItem(data);
      if (!library) throw new Error('Updated item was missing');

      this.zone.run(() => {
        this.libraryItems.update((list) =>
          list.map((item) =>
            item.tb_tyapp_dl_itm_id === id ? library : item,
          ),
        );
        this.weekItems.update((list) =>
          list.map((row) =>
            row.item_id === id ? { ...row, library } : row,
          ),
        );
        this.templateItems.update((list) =>
          list.map((row) =>
            row.item_id === id ? { ...row, library } : row,
          ),
        );
        this.historyItems.update((list) =>
          list.map((row) =>
            row.item_id === id ? { ...row, library } : row,
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

  async createLibraryItem(input: {
    itemText: string;
    emoji: string | null;
    colourPresetKey: DlColourPresetKey;
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

    if (findLibraryItemByName(this.libraryItems(), text)) {
      this.notification.handleError(
        'Add Item Failed',
        'An item with that name already exists.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_log_item')
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
      const library = this.asLibraryItem(data);
      if (!library) throw new Error('Created item was missing');

      this.zone.run(() => {
        this.libraryItems.update((list) =>
          [...list, library].sort((a, b) =>
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

  async deleteLibraryItem(id: string): Promise<boolean> {
    if (!this.canDeleteLibraryItem(id)) {
      this.notification.handleError(
        'Delete Item Failed',
        'This item is still on at least one date. Remove those day entries first.',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_daily_log_item_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.libraryItems.update((list) =>
          list.filter((item) => item.tb_tyapp_dl_itm_id !== id),
        );
        this.templateItems.update((list) =>
          list.filter((row) => row.item_id !== id),
        );
        this.weekItems.update((list) =>
          list.filter((row) => row.item_id !== id),
        );
        this.historyItems.update((list) =>
          list.filter((row) => row.item_id !== id),
        );
        const nextCounts = new Map(this.libraryDayCounts());
        nextCounts.delete(id);
        this.libraryDayCounts.set(nextCounts);
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

  async deleteTemplateItem(id: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_daily_log_template_item_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.templateItems.update((list) =>
          list.filter((item) => item.tb_tyapp_dl_tpl_id !== id),
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

  async moveTemplateItem(id: string, direction: -1 | 1): Promise<boolean> {
    const list = this.templateItems();
    const index = list.findIndex((item) => item.tb_tyapp_dl_tpl_id === id);
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
        .from('tyapp_daily_log_template_item')
        .update({ sort_order: neighborOrder })
        .eq('tb_tyapp_dl_tpl_id', current.tb_tyapp_dl_tpl_id)
        .is('deleted_at', null);
      if (firstError) throw firstError;

      const { error: secondError } = await this.supabase
        .from('tyapp_daily_log_template_item')
        .update({ sort_order: currentOrder })
        .eq('tb_tyapp_dl_tpl_id', neighbor.tb_tyapp_dl_tpl_id)
        .is('deleted_at', null);
      if (secondError) throw secondError;

      await this.fetchTemplateItems(true);
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
    logDate: string,
    input: { moodKey: DlMoodKey | null; title: string | null },
  ): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;

    const title = input.title?.trim() || null;
    const existing = this.dayLogForDate(logDate);
    try {
      if (existing) {
        const { data, error } = await this.supabase
          .from('tyapp_daily_log_day')
          .update({ mood_key: input.moodKey, title })
          .eq('tb_tyapp_dl_log_id', existing.tb_tyapp_dl_log_id)
          .is('deleted_at', null)
          .select()
          .single();
        if (error) throw error;
        this.zone.run(() => {
          this.mergeDayLog(data as DailyLogDay);
        });
        return true;
      }

      const { data, error } = await this.supabase
        .from('tyapp_daily_log_day')
        .insert({
          user_id: userId,
          log_date: logDate,
          mood_key: input.moodKey,
          title,
          status: RecordStatus.Active,
        })
        .select()
        .single();
      if (error) throw error;
      this.zone.run(() => {
        this.mergeDayLog(data as DailyLogDay);
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Save Day Failed', error);
      return false;
    }
  }

  async fetchViewerGrants(force = false) {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.viewerGrantsFetched && !force) return;

    this.viewersLoading.set(true);
    try {
      const { data: outgoing, error: outError } = await this.supabase
        .from('tyapp_daily_log_share')
        .select('*')
        .eq('owner_user_id', userId)
        .is('deleted_at', null)
        .order('tb_tyapp_dl_shr_seq_no', { ascending: true });
      if (outError) throw outError;

      const { data: incoming, error: inError } = await this.supabase
        .from('tyapp_daily_log_share')
        .select('*')
        .eq('viewer_user_id', userId)
        .is('deleted_at', null)
        .order('tb_tyapp_dl_shr_seq_no', { ascending: true });
      if (inError) throw inError;

      this.zone.run(() => {
        this.outgoingGrants.set(this.asViewerGrants(outgoing));
        this.incomingGrants.set(this.asViewerGrants(incoming));
        this.viewerGrantsFetched = true;
        this.viewersLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Viewers Failed', error);
      this.zone.run(() => this.viewersLoading.set(false));
    }
  }

  async addViewerGrant(viewerUserId: string): Promise<boolean> {
    const userId = this.currentUserId();
    if (!userId) return false;
    if (viewerUserId === userId) return false;
    if (this.outgoingGrants().some((row) => row.viewer_user_id === viewerUserId)) {
      return true;
    }

    this.busy.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_daily_log_share')
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
          data as DailyLogViewerGrant,
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

  async removeViewerGrant(grantId: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_daily_log_share_soft_delete_single_record',
        { record_id: grantId },
      );
      if (error) throw error;

      this.zone.run(() => {
        this.outgoingGrants.update((list) =>
          list.filter((row) => row.tb_tyapp_dl_shr_id !== grantId),
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

  async fetchOthersRange(startDate: string, endDate: string, force = false) {
    const userId = this.currentUserId();
    if (!userId) return;

    this.othersLoading.set(true);
    try {
      await this.fetchViewerGrants(force);
      const ownerIds = this.othersOwnerIds();
      if (ownerIds.length === 0) {
        this.zone.run(() => {
          this.othersLibraryItems.set([]);
          this.othersDayLogs.set([]);
          this.othersDayItems.set([]);
          this.othersLoading.set(false);
        });
        return;
      }

      const { data: libraryData, error: libraryError } = await this.supabase
        .from('tyapp_daily_log_item')
        .select('*')
        .in('user_id', ownerIds)
        .is('deleted_at', null);
      if (libraryError) throw libraryError;

      const library = (libraryData || [])
        .map((row) => this.asLibraryItem(row))
        .filter((row): row is DailyLogLibraryItem => row !== null);

      const { data: logData, error: logError } = await this.supabase
        .from('tyapp_daily_log_day')
        .select('*')
        .in('user_id', ownerIds)
        .is('deleted_at', null)
        .gte('log_date', startDate)
        .lte('log_date', endDate);
      if (logError) throw logError;

      const { data: itemData, error: itemError } = await this.supabase
        .from('tyapp_daily_log_day_item')
        .select('*')
        .in('user_id', ownerIds)
        .is('deleted_at', null)
        .gte('log_date', startDate)
        .lte('log_date', endDate)
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_dl_day_seq_no', { ascending: true });
      if (itemError) throw itemError;

      const rows = this.asDayItems(itemData)
        .map((day) => this.withLibrary(day, library))
        .filter((row): row is DailyLogDayRow => row !== null);

      this.zone.run(() => {
        this.othersLibraryItems.set(library);
        this.othersDayLogs.set(this.asDayLogs(logData));
        this.othersDayItems.set(rows);
        this.othersLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Others Failed', error);
      this.zone.run(() => this.othersLoading.set(false));
    }
  }
}

