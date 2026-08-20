import { Injectable, NgZone, computed, effect, inject, signal, untracked } from "@angular/core";
import {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { AuthService } from "../../../../core/services/auth.service";
import { NotificationService } from "../../../../core/services/notification.service";
import { SupabaseService } from "../../../../core/services/supabase.service";
import { RecordStatus } from "../../../../core/models/status.enum";
import { TyappUser } from "../../../../core/models/user.model";
import { UserGroup, UserGroupMember } from "./user-group.model";

/**
 * Shared, app-wide user directory. Other sessions may keep this cached list
 * on screen for a long time (e.g. an open Chat room), so a Realtime
 * subscription keeps display names/roles fresh without a manual refresh.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  users = signal<TyappUser[]>([]);
  groups = signal<UserGroup[]>([]);
  groupMembers = signal<UserGroupMember[]>([]);
  loading = signal(false);
  groupsLoading = signal(false);

  /**
   * People I may pick in Chat / Filelink: union of my active groups, plus me.
   * Super Admin is not auto-included in every group — they must join a group
   * to interact there.
   */
  visibleUsers = computed(() => {
    const visibleIds = this.visibleUserIds();
    return this.users().filter((user) => visibleIds.has(user.user_id));
  });

  /**
   * Work pickers: Super Admin can assign records to anyone; others follow
   * the same circle as Chat / Filelink.
   */
  pickerUsers = computed(() =>
    this.authService.isSuperAdmin() ? this.users() : this.visibleUsers(),
  );

  private initialized = false;
  private groupsInitialized = false;
  private fetchPromise: Promise<void> | null = null;
  private groupsFetchPromise: Promise<void> | null = null;
  private directoryChannel: RealtimeChannel | null = null;
  private groupsChannel: RealtimeChannel | null = null;

  constructor() {
    effect(() => {
      const profile = this.authService.userProfile();
      untracked(() => {
        if (profile) {
          this.subscribeToDirectory();
          this.subscribeToGroups();
          void this.fetchGroups();
        } else {
          void this.unsubscribeFromDirectory();
          void this.unsubscribeFromGroups();
          this.groups.set([]);
          this.groupMembers.set([]);
          this.groupsInitialized = false;
        }
      });
    });
  }

  private visibleUserIds(): Set<string> {
    const me = this.authService.userProfile()?.user_id;
    const activeGroupIds = new Set(
      this.groups()
        .filter(
          (group) =>
            group.status === RecordStatus.Active && !group.deleted_at,
        )
        .map((group) => group.tb_tyapp_usr_grp_id),
    );
    const myGroupIds = new Set(
      this.groupMembers()
        .filter(
          (member) => member.user_id === me && activeGroupIds.has(member.group_id),
        )
        .map((member) => member.group_id),
    );
    const ids = new Set(
      this.groupMembers()
        .filter((member) => myGroupIds.has(member.group_id))
        .map((member) => member.user_id),
    );
    if (me) ids.add(me);
    return ids;
  }

  idsShareAGroup(userIds: string[]): boolean {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length < 2) return true;
    const members = this.groupMembers();
    return this.groups().some((group) => {
      if (group.status !== RecordStatus.Active || group.deleted_at) {
        return false;
      }
      const inGroup = new Set(
        members
          .filter((member) => member.group_id === group.tb_tyapp_usr_grp_id)
          .map((member) => member.user_id),
      );
      return ids.every((id) => inGroup.has(id));
    });
  }

  usersSharingOneGroupWith(userIds: string[]): TyappUser[] {
    const required = [...new Set(userIds.filter(Boolean))];
    return this.visibleUsers().filter((user) => {
      if (required.includes(user.user_id)) return false;
      return this.idsShareAGroup([...required, user.user_id]);
    });
  }

  fetchAllUsers(forceRefresh = false): Promise<void> {
    if (this.initialized && !forceRefresh) return Promise.resolve();
    if (this.fetchPromise) return this.fetchPromise;

    this.loading.set(true);

    const request = (async () => {
      try {
        const { data, error } = await this.supabase
          .from('tyapp_user')
          .select('*')
          .is('deleted_at', null)
          .order('tb_tyapp_pofl_seq_no', { ascending: true });

        if (error) throw error;

        this.zone.run(() => {
          this.users.set(data || []);
          this.initialized = true;
          this.loading.set(false);
        });
      } catch (error: unknown) {
        this.notification.handleError('Fetch Failed', error);
        this.zone.run(() => this.loading.set(false));
      } finally {
        this.fetchPromise = null;
      }
    })();

    this.fetchPromise = request;
    return request;
  }

  async fetchUserById(userId: string): Promise<TyappUser | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_user')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as TyappUser;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch User Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async updateUser(
    userId: string,
    updates: Partial<TyappUser>,
  ): Promise<boolean> {
    if (!this.authService.isSuperAdmin()) {
      if (userId !== this.authService.userProfile()?.user_id) {
        this.notification.handleError(
          'Update Error',
          'You can only edit your own profile',
        );
        return false;
      }
      updates = this.selfProfileUpdates(updates);
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_user')
        .update(updates)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        const updatedUser = data as TyappUser;
        if (!updatedUser) return false;

        this.users.update((list) =>
          list.map((u) => (u.user_id === userId ? updatedUser : u)),
        );

        if (userId === this.authService.userProfile()?.user_id) {
          this.authService.updateLocalProfile(updatedUser);
        }

        this.loading.set(false);
        this.notification.showSuccess('Updated successfully');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Update Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  private selfProfileUpdates(updates: Partial<TyappUser>): Partial<TyappUser> {
    const next: Partial<TyappUser> = {};
    if (updates.legal_first_name !== undefined) {
      next.legal_first_name = updates.legal_first_name;
    }
    if (updates.legal_middle_name !== undefined) {
      next.legal_middle_name = updates.legal_middle_name;
    }
    if (updates.legal_last_name !== undefined) {
      next.legal_last_name = updates.legal_last_name;
    }
    if (updates.preferred_first_name !== undefined) {
      next.preferred_first_name = updates.preferred_first_name;
    }
    if (updates.customized_display_name !== undefined) {
      next.customized_display_name = updates.customized_display_name;
    }
    if (updates.name_display_mode !== undefined) {
      next.name_display_mode = updates.name_display_mode;
    }
    return next;
  }

  fetchGroups(forceRefresh = false): Promise<void> {
    if (this.groupsInitialized && !forceRefresh) return Promise.resolve();
    if (this.groupsFetchPromise) return this.groupsFetchPromise;

    this.groupsLoading.set(true);

    const request = (async () => {
      try {
        const [groupRes, memberRes] = await Promise.all([
          this.supabase
            .from('tyapp_user_group')
            .select('*')
            .is('deleted_at', null)
            .order('customized_order', { ascending: true })
            .order('name', { ascending: true }),
          this.supabase.from('tyapp_user_group_member').select('*'),
        ]);

        if (groupRes.error) throw groupRes.error;
        if (memberRes.error) throw memberRes.error;

        this.zone.run(() => {
          this.groups.set((groupRes.data as UserGroup[]) || []);
          this.groupMembers.set((memberRes.data as UserGroupMember[]) || []);
          this.groupsInitialized = true;
          this.groupsLoading.set(false);
        });
      } catch (error: unknown) {
        this.notification.handleError('Fetch Groups Failed', error);
        this.zone.run(() => this.groupsLoading.set(false));
      } finally {
        this.groupsFetchPromise = null;
      }
    })();

    this.groupsFetchPromise = request;
    return request;
  }

  memberUserIdsForGroup(groupId: string): string[] {
    return this.groupMembers()
      .filter((member) => member.group_id === groupId)
      .map((member) => member.user_id);
  }

  async saveGroup(
    group: Partial<UserGroup>,
    memberUserIds: string[],
  ): Promise<UserGroup | null> {
    if (!this.authService.isSuperAdmin()) {
      this.notification.handleError(
        'Save Group Failed',
        'Only a super admin can manage groups',
      );
      return null;
    }

    const isNew = !group.tb_tyapp_usr_grp_id;
    const {
      created_at,
      updated_at,
      deleted_at,
      tb_tyapp_usr_grp_id,
      ...payload
    } = group;

    const savePayload = {
      ...payload,
      name: payload.name?.trim() ?? '',
      remarks: payload.remarks?.trim() || null,
      customized_order: Number.isFinite(Number(payload.customized_order))
        ? Number(payload.customized_order)
        : 0,
    };

    this.groupsLoading.set(true);
    try {
      const query = isNew
        ? this.supabase
            .from('tyapp_user_group')
            .insert(savePayload)
            .select()
            .single()
        : this.supabase
            .from('tyapp_user_group')
            .update(savePayload)
            .eq('tb_tyapp_usr_grp_id', tb_tyapp_usr_grp_id)
            .select()
            .single();

      const { data, error } = await query;
      if (error) throw error;

      const saved = data as UserGroup;
      const membersOk = await this.replaceGroupMembers(
        saved.tb_tyapp_usr_grp_id,
        memberUserIds,
      );
      if (!membersOk) {
        this.zone.run(() => this.groupsLoading.set(false));
        return null;
      }

      return this.zone.run(() => {
        this.groups.update((list) => {
          const next = isNew
            ? [...list, saved]
            : list.map((item) =>
                item.tb_tyapp_usr_grp_id === saved.tb_tyapp_usr_grp_id
                  ? saved
                  : item,
              );
          return [...next].sort(
            (a, b) => a.customized_order - b.customized_order,
          );
        });
        this.groupsLoading.set(false);
        this.notification.showSuccess('Saved successfully');
        return saved;
      });
    } catch (error: unknown) {
      this.notification.handleError('Save Group Failed', error);
      return this.zone.run(() => {
        this.groupsLoading.set(false);
        return null;
      });
    }
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    if (!this.authService.isSuperAdmin()) {
      this.notification.handleError(
        'Delete Group Failed',
        'Only a super admin can manage groups',
      );
      return false;
    }

    this.groupsLoading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_user_group_soft_delete_single_record',
        { record_id: groupId },
      );
      if (error) throw error;

      return this.zone.run(() => {
        this.groups.update((list) =>
          list.filter((item) => item.tb_tyapp_usr_grp_id !== groupId),
        );
        this.groupMembers.update((list) =>
          list.filter((item) => item.group_id !== groupId),
        );
        this.groupsLoading.set(false);
        this.notification.showSuccess('Group deleted');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Delete Group Failed', error);
      return this.zone.run(() => {
        this.groupsLoading.set(false);
        return false;
      });
    }
  }

  private async replaceGroupMembers(
    groupId: string,
    memberUserIds: string[],
  ): Promise<boolean> {
    const uniqueIds = [...new Set(memberUserIds.filter(Boolean))];
    try {
      const { error: delError } = await this.supabase
        .from('tyapp_user_group_member')
        .delete()
        .eq('group_id', groupId);
      if (delError) throw delError;

      if (uniqueIds.length > 0) {
        const { data, error: insError } = await this.supabase
          .from('tyapp_user_group_member')
          .insert(uniqueIds.map((user_id) => ({ group_id: groupId, user_id })))
          .select();
        if (insError) throw insError;

        this.groupMembers.update((list) => [
          ...list.filter((item) => item.group_id !== groupId),
          ...((data as UserGroupMember[]) || []),
        ]);
      } else {
        this.groupMembers.update((list) =>
          list.filter((item) => item.group_id !== groupId),
        );
      }

      return true;
    } catch (error: unknown) {
      this.notification.handleError('Save Group Members Failed', error);
      return false;
    }
  }

  private subscribeToDirectory(): void {
    if (this.directoryChannel) return;

    this.directoryChannel = this.supabase
      .channel('jaxfr-user-directory')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tyapp_user' },
        (payload) => {
          this.zone.run(() => this.applyUserChange(payload));
        },
      )
      .subscribe();
  }

  private async unsubscribeFromDirectory(): Promise<void> {
    if (this.directoryChannel) {
      await this.supabase.removeChannel(this.directoryChannel);
      this.directoryChannel = null;
    }
  }

  private subscribeToGroups(): void {
    if (this.groupsChannel) return;

    this.groupsChannel = this.supabase
      .channel('jaxfr-user-groups')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tyapp_user_group' },
        () => {
          void this.fetchGroups(true);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tyapp_user_group_member' },
        () => {
          void this.fetchGroups(true);
        },
      )
      .subscribe();
  }

  private async unsubscribeFromGroups(): Promise<void> {
    if (this.groupsChannel) {
      await this.supabase.removeChannel(this.groupsChannel);
      this.groupsChannel = null;
    }
  }

  private applyUserChange(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = payload.new as unknown as TyappUser;
      if (!row?.user_id) return;

      if (row.deleted_at) {
        this.removeUserFromList(row.user_id);
      } else {
        this.upsertUser(row);
      }

      if (row.user_id === this.authService.userProfile()?.user_id) {
        this.authService.updateLocalProfile(row);
      }
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldRow = payload.old as { user_id?: string };
      if (oldRow.user_id) this.removeUserFromList(oldRow.user_id);
    }
  }

  private upsertUser(row: TyappUser): void {
    this.users.update((list) => {
      const index = list.findIndex((item) => item.user_id === row.user_id);
      if (index === -1) {
        return [...list, row].sort(
          (a, b) => a.tb_tyapp_pofl_seq_no - b.tb_tyapp_pofl_seq_no,
        );
      }
      const next = [...list];
      next[index] = row;
      return next;
    });
  }

  private removeUserFromList(userId: string): void {
    this.users.update((list) =>
      list.filter((item) => item.user_id !== userId),
    );
  }
}
