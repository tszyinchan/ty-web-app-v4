import { Injectable, NgZone, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { SupabaseService } from '../../core/services/supabase.service';
import {
  FitEditEntryInput,
  FitEditSessionInput,
  FitEditSetInput,
  FitEntry,
  FitEntrySet,
  FitEntryType,
  FitSession,
  FitSessionDetail,
} from './fit.model';

@Injectable({ providedIn: 'root' })
export class FitService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  sessions = signal<FitSession[]>([]);
  loading = signal(false);

  async fetchAllSessions(force = false) {
    if (this.sessions().length > 0 && !force) return;

    const userId = this.authService.userProfile()?.user_id;
    if (!userId) return;

    this.loading.set(true);

    try {
      const { data, error } = await this.supabase
        .from('tyapp_fit_session')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('session_date', { ascending: false })
        .order('tb_tyapp_fit_ssn_seq_no', { ascending: false });

      if (error) throw error;

      this.zone.run(() => {
        this.sessions.set((data || []) as FitSession[]);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Fit Sessions Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchSessionDetail(id: string): Promise<FitSessionDetail | null> {
    this.loading.set(true);

    try {
      const { data: sessionData, error: sessionError } = await this.supabase
        .from('tyapp_fit_session')
        .select('*')
        .eq('tb_tyapp_fit_ssn_id', id)
        .is('deleted_at', null)
        .single();

      if (sessionError) throw sessionError;

      const { data: entryData, error: entryError } = await this.supabase
        .from('tyapp_fit_entry')
        .select('*')
        .eq('fit_session_id', id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('tb_tyapp_fit_ntry_seq_no', { ascending: true });

      if (entryError) throw entryError;

      const entries = (entryData || []) as FitEntry[];
      const entryIds = entries.map((item) => item.tb_tyapp_fit_ntry_id);

      let sets: FitEntrySet[] = [];

      if (entryIds.length > 0) {
        const { data: setData, error: setError } = await this.supabase
          .from('tyapp_fit_entry_set')
          .select('*')
          .in('fit_entry_id', entryIds)
          .is('deleted_at', null)
          .order('set_no', { ascending: true })
          .order('tb_tyapp_fit_set_seq_no', { ascending: true });

        if (setError) throw setError;
        sets = (setData || []) as FitEntrySet[];
      }

      const detail: FitSessionDetail = {
        session: sessionData as FitSession,
        entries: entries.map((entry) => ({
          ...entry,
          sets: sets.filter(
            (set) => set.fit_entry_id === entry.tb_tyapp_fit_ntry_id,
          ),
        })),
      };

      return this.zone.run(() => {
        this.loading.set(false);
        return detail;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Fit Session Detail Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async createSession(payload: FitEditSessionInput): Promise<string | null> {
    const userId = this.authService.userProfile()?.user_id;
    if (!userId) return null;

    this.loading.set(true);

    try {
      const { data: createdSession, error: sessionError } = await this.supabase
        .from('tyapp_fit_session')
        .insert({
          user_id: userId,
          session_date: payload.session_date,
          session_title: payload.session_title,
          location: payload.location,
          remarks: payload.remarks,
          status: payload.status,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      const sessionId = (createdSession as FitSession).tb_tyapp_fit_ssn_id;

      for (const entry of payload.entries) {
        await this.insertEntryWithSets(sessionId, entry);
      }

      await this.fetchAllSessions(true);

      return this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess('Fit session created successfully');
        return sessionId;
      });
    } catch (error: unknown) {
      this.notification.handleError('Create Fit Session Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async updateSession(payload: FitEditSessionInput): Promise<boolean> {
    if (!payload.id) return false;

    this.loading.set(true);

    try {
      const sessionId = payload.id;

      const { error: sessionError } = await this.supabase
        .from('tyapp_fit_session')
        .update({
          session_date: payload.session_date,
          session_title: payload.session_title,
          location: payload.location,
          remarks: payload.remarks,
          status: payload.status,
        })
        .eq('tb_tyapp_fit_ssn_id', sessionId)
        .is('deleted_at', null);

      if (sessionError) throw sessionError;

      const { data: existingEntriesData, error: existingEntriesError } =
        await this.supabase
          .from('tyapp_fit_entry')
          .select('*')
          .eq('fit_session_id', sessionId)
          .is('deleted_at', null);

      if (existingEntriesError) throw existingEntriesError;

      const existingEntries = (existingEntriesData || []) as FitEntry[];
      const existingEntryIds = new Set(
        existingEntries.map((item) => item.tb_tyapp_fit_ntry_id),
      );
      const incomingEntryIds = new Set(
        payload.entries
          .map((item) => item.id)
          .filter((id): id is string => !!id),
      );

      for (const entry of payload.entries) {
        if (entry.id && existingEntryIds.has(entry.id)) {
          await this.updateEntryWithSets(entry);
        } else {
          await this.insertEntryWithSets(sessionId, entry);
        }
      }

      const removedEntries = existingEntries.filter(
        (item) => !incomingEntryIds.has(item.tb_tyapp_fit_ntry_id),
      );

      for (const removedEntry of removedEntries) {
        await this.softDeleteEntryWithSets(removedEntry.tb_tyapp_fit_ntry_id);
      }

      await this.fetchAllSessions(true);

      return this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess('Fit session updated successfully');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Update Fit Session Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    this.loading.set(true);

    try {
      const deletedAt = new Date().toISOString();

      const { data: entryData, error: entryError } = await this.supabase
        .from('tyapp_fit_entry')
        .select('tb_tyapp_fit_ntry_id')
        .eq('fit_session_id', id)
        .is('deleted_at', null);

      if (entryError) throw entryError;

      const entryIds = (entryData || []).map(
        (item) => item.tb_tyapp_fit_ntry_id,
      );

      if (entryIds.length > 0) {
        const { error: setDeleteError } = await this.supabase
          .from('tyapp_fit_entry_set')
          .update({ deleted_at: deletedAt })
          .in('fit_entry_id', entryIds)
          .is('deleted_at', null);

        if (setDeleteError) throw setDeleteError;

        const { error: entryDeleteError } = await this.supabase
          .from('tyapp_fit_entry')
          .update({ deleted_at: deletedAt })
          .eq('fit_session_id', id)
          .is('deleted_at', null);

        if (entryDeleteError) throw entryDeleteError;
      }

      const { error: sessionDeleteError } = await this.supabase
        .from('tyapp_fit_session')
        .update({ deleted_at: deletedAt })
        .eq('tb_tyapp_fit_ssn_id', id)
        .is('deleted_at', null);

      if (sessionDeleteError) throw sessionDeleteError;

      this.zone.run(() => {
        this.sessions.update((list) =>
          list.filter((item) => item.tb_tyapp_fit_ssn_id !== id),
        );
      });

      return this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess('Fit session deleted');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Delete Fit Session Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async saveSession(payload: FitEditSessionInput): Promise<boolean> {
    if (payload.id) {
      return this.updateSession(payload);
    }

    const createdId = await this.createSession(payload);
    return !!createdId;
  }

  buildRepeatedSets(input: {
    setCount: number;
    reps?: number | null;
    weight?: number | null;
    weightUnit?: string | null;
    durationSec?: number | null;
    inclineValue?: number | null;
    calories?: number | null;
    distance?: number | null;
    distanceUnit?: string | null;
    levelText?: string | null;
    sideCode?: 'left' | 'right' | 'both' | null;
    remarks?: string | null;
  }): FitEditSetInput[] {
    return Array.from({ length: input.setCount }).map((_, index) => ({
      id: null,
      set_no: index + 1,
      weight_value: input.weight ?? null,
      weight_unit: input.weightUnit ?? null,
      reps_value: input.reps ?? null,
      duration_sec: input.durationSec ?? null,
      calories_value: input.calories ?? null,
      distance_value: input.distance ?? null,
      distance_unit: input.distanceUnit ?? null,
      incline_value: input.inclineValue ?? null,
      level_text: input.levelText ?? null,
      side_code: input.sideCode ?? null,
      remarks: input.remarks ?? null,
      status: 1,
    }));
  }

  private async insertEntryWithSets(
    sessionId: string,
    entry: FitEditEntryInput,
  ) {
    const { data: createdEntry, error: entryError } = await this.supabase
      .from('tyapp_fit_entry')
      .insert({
        fit_session_id: sessionId,
        sort_order: entry.sort_order,
        entry_type: entry.entry_type,
        exercise_name: entry.exercise_name,
        source_url: entry.source_url,
        remarks: entry.remarks,
        status: entry.status,
      })
      .select()
      .single();

    if (entryError) throw entryError;

    const entryId = (createdEntry as FitEntry).tb_tyapp_fit_ntry_id;

    if (entry.sets.length > 0) {
      const setPayloads = entry.sets.map((set) => ({
        fit_entry_id: entryId,
        set_no: set.set_no,
        weight_value: set.weight_value,
        weight_unit: set.weight_unit,
        reps_value: set.reps_value,
        duration_sec: set.duration_sec,
        calories_value: set.calories_value,
        distance_value: set.distance_value,
        distance_unit: set.distance_unit,
        incline_value: set.incline_value,
        level_text: set.level_text,
        side_code: set.side_code,
        remarks: set.remarks,
        status: set.status,
      }));

      const { error: setError } = await this.supabase
        .from('tyapp_fit_entry_set')
        .insert(setPayloads);

      if (setError) throw setError;
    }
  }

  private async updateEntryWithSets(entry: FitEditEntryInput) {
    if (!entry.id) return;

    const entryId = entry.id;

    const { error: updateEntryError } = await this.supabase
      .from('tyapp_fit_entry')
      .update({
        sort_order: entry.sort_order,
        entry_type: entry.entry_type,
        exercise_name: entry.exercise_name,
        source_url: entry.source_url,
        remarks: entry.remarks,
        status: entry.status,
      })
      .eq('tb_tyapp_fit_ntry_id', entryId)
      .is('deleted_at', null);

    if (updateEntryError) throw updateEntryError;

    const { data: existingSetsData, error: existingSetsError } =
      await this.supabase
        .from('tyapp_fit_entry_set')
        .select('*')
        .eq('fit_entry_id', entryId)
        .is('deleted_at', null);

    if (existingSetsError) throw existingSetsError;

    const existingSets = (existingSetsData || []) as FitEntrySet[];
    const existingSetIds = new Set(
      existingSets.map((item) => item.tb_tyapp_fit_set_id),
    );
    const incomingSetIds = new Set(
      entry.sets.map((item) => item.id).filter((id): id is string => !!id),
    );

    for (const set of entry.sets) {
      if (set.id && existingSetIds.has(set.id)) {
        await this.updateSet(set);
      } else {
        await this.insertSet(entryId, set);
      }
    }

    const removedSets = existingSets.filter(
      (item) => !incomingSetIds.has(item.tb_tyapp_fit_set_id),
    );

    if (removedSets.length > 0) {
      const deletedAt = new Date().toISOString();

      const { error: deleteSetsError } = await this.supabase
        .from('tyapp_fit_entry_set')
        .update({ deleted_at: deletedAt })
        .in(
          'tb_tyapp_fit_set_id',
          removedSets.map((item) => item.tb_tyapp_fit_set_id),
        )
        .is('deleted_at', null);

      if (deleteSetsError) throw deleteSetsError;
    }
  }

  private async insertSet(entryId: string, set: FitEditSetInput) {
    const { error } = await this.supabase.from('tyapp_fit_entry_set').insert({
      fit_entry_id: entryId,
      set_no: set.set_no,
      weight_value: set.weight_value,
      weight_unit: set.weight_unit,
      reps_value: set.reps_value,
      duration_sec: set.duration_sec,
      calories_value: set.calories_value,
      distance_value: set.distance_value,
      distance_unit: set.distance_unit,
      incline_value: set.incline_value,
      level_text: set.level_text,
      side_code: set.side_code,
      remarks: set.remarks,
      status: set.status,
    });

    if (error) throw error;
  }

  private async updateSet(set: FitEditSetInput) {
    if (!set.id) return;

    const { error } = await this.supabase
      .from('tyapp_fit_entry_set')
      .update({
        set_no: set.set_no,
        weight_value: set.weight_value,
        weight_unit: set.weight_unit,
        reps_value: set.reps_value,
        duration_sec: set.duration_sec,
        calories_value: set.calories_value,
        distance_value: set.distance_value,
        distance_unit: set.distance_unit,
        incline_value: set.incline_value,
        level_text: set.level_text,
        side_code: set.side_code,
        remarks: set.remarks,
        status: set.status,
      })
      .eq('tb_tyapp_fit_set_id', set.id)
      .is('deleted_at', null);

    if (error) throw error;
  }

  private async softDeleteEntryWithSets(entryId: string) {
    const deletedAt = new Date().toISOString();

    const { error: deleteSetsError } = await this.supabase
      .from('tyapp_fit_entry_set')
      .update({ deleted_at: deletedAt })
      .eq('fit_entry_id', entryId)
      .is('deleted_at', null);

    if (deleteSetsError) throw deleteSetsError;

    const { error: deleteEntryError } = await this.supabase
      .from('tyapp_fit_entry')
      .update({ deleted_at: deletedAt })
      .eq('tb_tyapp_fit_ntry_id', entryId)
      .is('deleted_at', null);

    if (deleteEntryError) throw deleteEntryError;
  }

  async fetchUniqueExerciseNames(): Promise<
    Array<{ name: string; type: FitEntryType }>
  > {
    const userId = this.authService.userProfile()?.user_id;
    if (!userId) return [];

    try {
      const { data, error } = await this.supabase
        .from('tyapp_fit_entry')
        .select('exercise_name, entry_type')
        .is('deleted_at', null)
        .not('exercise_name', 'is', null);

      if (error) throw error;

      const nameMap = new Map<string, FitEntryType>();
      data.forEach((row: any) => {
        const name = row.exercise_name?.trim();
        if (name) {
          nameMap.set(name, row.entry_type);
        }
      });

      return Array.from(nameMap.entries())
        .map(([name, type]) => ({ name, type }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: unknown) {
      console.error('Fetch exercise names failed', error);
      return [];
    }
  }

  async fetchRecentThreadDetails(limit = 15): Promise<FitSessionDetail[]> {
    const userId = this.authService.userProfile()?.user_id;
    if (!userId) return [];

    try {
      const { data: sessions, error: sessionErr } = await this.supabase
        .from('tyapp_fit_session')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('session_date', { ascending: false })
        .limit(limit);

      if (sessionErr) throw sessionErr;
      if (!sessions || sessions.length === 0) return [];

      const sessionIds = sessions.map((s) => s.tb_tyapp_fit_ssn_id);

      const { data: entries, error: entryErr } = await this.supabase
        .from('tyapp_fit_entry')
        .select('*')
        .in('fit_session_id', sessionIds)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });

      if (entryErr) throw entryErr;

      const entryIds = (entries || []).map((e) => e.tb_tyapp_fit_ntry_id);
      let sets: FitEntrySet[] = [];

      if (entryIds.length > 0) {
        const { data: setsData, error: setErr } = await this.supabase
          .from('tyapp_fit_entry_set')
          .select('*')
          .in('fit_entry_id', entryIds)
          .is('deleted_at', null)
          .order('set_no', { ascending: true });

        if (setErr) throw setErr;
        sets = setsData as FitEntrySet[];
      }

      return sessions.map((session) => ({
        session: session as FitSession,
        entries: (entries || [])
          .filter((e) => e.fit_session_id === session.tb_tyapp_fit_ssn_id)
          .map((entry) => ({
            ...entry,
            sets: sets.filter(
              (s) => s.fit_entry_id === entry.tb_tyapp_fit_ntry_id,
            ),
          })) as any[],
      }));
    } catch (error) {
      console.error('Fetch recent threads failed:', error);
      return [];
    }
  }
}
