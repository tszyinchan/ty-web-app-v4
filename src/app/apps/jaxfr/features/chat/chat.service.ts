import { Injectable, NgZone, effect, inject, signal, untracked } from '@angular/core';
import {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { NotificationService } from '../../../../core/services/notification.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PushService } from '../../../../core/services/push.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { RecordStatus } from '../../../../core/models/status.enum';
import { CHAT_MARK_READ_DEBOUNCE_MS, CHAT_QUOTE_MAX, CHAT_ROOM_DESCRIPTION_MAX } from './chat.constants';
import {
  ChatMessage,
  ChatMessageType,
  ChatReactions,
  ChatRoom,
  ChatRoomRead,
} from './chat.model';
import { normalizeQuoteIds, normalizeReactions, sanitizeChatHtml } from './chat.util';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private auth = inject(AuthService);
  private push = inject(PushService);
  private zone = inject(NgZone);

  rooms = signal<ChatRoom[]>([]);
  messages = signal<ChatMessage[]>([]);
  roomReads = signal<ChatRoomRead[]>([]);
  unreadByRoomId = signal<Record<string, number>>({});
  loading = signal(false);
  roomsReady = signal(false);

  private roomsLoaded = false;
  private inboxChannel: RealtimeChannel | null = null;
  private messagesChannel: RealtimeChannel | null = null;
  private subscribedRoomId: string | null = null;
  private markReadTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const profile = this.auth.userProfile();
      untracked(() => {
        if (profile) {
          this.subscribeToInbox();
          void this.fetchRooms(true, { silent: true });
        } else {
          void this.unsubscribeAll();
          this.roomsLoaded = false;
          this.roomsReady.set(false);
          this.rooms.set([]);
          this.messages.set([]);
          this.roomReads.set([]);
          this.unreadByRoomId.set({});
        }
      });
    });
  }

  async fetchRooms(
    force = false,
    options?: { silent?: boolean },
  ): Promise<void> {
    if (this.roomsLoaded && !force) return;

    const silent = options?.silent ?? false;
    if (!silent) this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_chat_room')
        .select('*')
        .is('deleted_at', null)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const me = this.auth.userProfile()?.user_id;
      const unread = await this.loadUnreadCounts();
      const rows = ((data as ChatRoom[]) || []).filter(
        (room) => !!me && room.member_user_ids.includes(me),
      );

      this.zone.run(() => {
        this.rooms.set(rows);
        this.applyUnreadCounts(unread);
        this.roomsLoaded = true;
        this.roomsReady.set(true);
        if (!silent) this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Rooms Failed', error);
      this.zone.run(() => {
        if (!silent) this.loading.set(false);
      });
    }
  }

  async fetchMessages(roomId: string): Promise<void> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_chat_message')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      this.zone.run(() => {
        this.messages.set(
          ((data as ChatMessage[]) || []).map((row) => this.normalizeMessage(row)),
        );
        this.loading.set(false);
      });
      await this.fetchRoomReads(roomId);
      this.zeroUnread(roomId);
      this.scheduleMarkRead(roomId);
    } catch (error: unknown) {
      this.notification.handleError('Fetch Messages Failed', error);
      this.zone.run(() => {
        this.messages.set([]);
        this.loading.set(false);
      });
    }
  }

  async createRoom(
    name: string,
    memberUserIds: string[],
    createdBy: string,
    description?: string,
  ): Promise<ChatRoom | null> {
    const uniqueMembers = [...new Set(memberUserIds)];
    if (!uniqueMembers.includes(createdBy)) {
      uniqueMembers.push(createdBy);
    }

    const desc = description?.trim() || null;
    if (desc && desc.length > CHAT_ROOM_DESCRIPTION_MAX) {
      this.notification.handleError(
        'Create Room Failed',
        `Description must be ${CHAT_ROOM_DESCRIPTION_MAX} characters or fewer`,
      );
      return null;
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_chat_room')
        .insert({
          name: name.trim(),
          description: desc,
          member_user_ids: uniqueMembers,
          created_by: createdBy,
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (error) throw error;

      const saved = data as ChatRoom;
      return this.zone.run(() => {
        this.upsertRoom(saved);
        this.loading.set(false);
        this.notification.showSuccess('Room created');
        return saved;
      });
    } catch (error: unknown) {
      this.notification.handleError('Create Room Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async sendMessage(
    roomId: string,
    senderUserId: string,
    bodyHtml: string,
    bodyPlain: string,
    quoteMessageIds?: string[],
  ): Promise<ChatMessage | null> {
    this.loading.set(true);
    try {
      const inRoom = new Set(
        this.messages()
          .filter((item) => item.room_id === roomId)
          .map((item) => item.tb_tyapp_chat_msg_id),
      );
      const quoteIds = [...new Set(quoteMessageIds ?? [])]
        .filter((id) => inRoom.has(id))
        .slice(0, CHAT_QUOTE_MAX);
      const { data, error } = await this.supabase
        .from('tyapp_chat_message')
        .insert({
          room_id: roomId,
          sender_user_id: senderUserId,
          msg_type: ChatMessageType.Text,
          body: sanitizeChatHtml(bodyHtml),
          body_plain: bodyPlain.trim(),
          quote_message_ids: quoteIds,
          reactions: {},
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (error) throw error;

      const saved = this.normalizeMessage(data as ChatMessage);
      return this.zone.run(() => {
        this.upsertMessage(saved);
        this.touchRoomLastMessage(roomId, saved.created_at ?? null);
        this.loading.set(false);
        this.scheduleMarkRead(roomId);
        return saved;
      });
    } catch (error: unknown) {
      this.notification.handleError('Send Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async editMessage(
    messageId: string,
    bodyHtml: string,
    bodyPlain: string,
  ): Promise<boolean> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc('tyapp_chat_edit_message', {
        p_message_id: messageId,
        p_body: sanitizeChatHtml(bodyHtml),
        p_body_plain: bodyPlain.trim(),
      });
      if (error) throw error;

      const saved = this.normalizeMessage(data as ChatMessage);
      return this.zone.run(() => {
        this.upsertMessage(saved);
        this.loading.set(false);
        this.notification.showSuccess('Message updated');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Edit Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_chat_message_soft_delete_single_record',
        { record_id: messageId },
      );
      if (error) throw error;

      return this.zone.run(() => {
        this.messages.update((list) =>
          list.map((item) =>
            item.tb_tyapp_chat_msg_id === messageId
              ? { ...item, deleted_at: new Date().toISOString() }
              : item,
          ),
        );
        this.loading.set(false);
        this.notification.showSuccess('Message deleted');
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

  async deleteRoom(roomId: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_chat_room_soft_delete_single_record',
        { record_id: roomId },
      );
      if (error) throw error;

      return this.zone.run(() => {
        this.rooms.update((list) =>
          list.filter((item) => item.tb_tyapp_chat_rm_id !== roomId),
        );
        if (this.subscribedRoomId === roomId) {
          this.messages.set([]);
        }
        this.loading.set(false);
        this.notification.showSuccess('Room deleted');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Delete Room Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async renameRoom(roomId: string, name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) {
      this.notification.handleError('Rename Failed', 'Room name is required');
      return false;
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc('tyapp_chat_rename_room', {
        p_room_id: roomId,
        p_name: trimmed,
      });
      if (error) throw error;

      const saved = data as ChatRoom;
      return this.zone.run(() => {
        this.upsertRoom(saved);
        this.loading.set(false);
        this.notification.showSuccess('Room renamed');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Rename Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async setRoomDescription(
    roomId: string,
    description: string,
  ): Promise<boolean> {
    const trimmed = description.trim();
    if (trimmed.length > CHAT_ROOM_DESCRIPTION_MAX) {
      this.notification.handleError(
        'Update Failed',
        `Description must be ${CHAT_ROOM_DESCRIPTION_MAX} characters or fewer`,
      );
      return false;
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_chat_set_room_description',
        {
          p_room_id: roomId,
          p_description: trimmed,
        },
      );
      if (error) throw error;

      const saved = data as ChatRoom;
      return this.zone.run(() => {
        this.upsertRoom(saved);
        this.loading.set(false);
        this.notification.showSuccess('Description saved');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Update Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async addRoomMembers(roomId: string, userIds: string[]): Promise<boolean> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      this.notification.handleError('Add Members Failed', 'Pick someone to add');
      return false;
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_chat_add_room_members',
        {
          p_room_id: roomId,
          p_user_ids: uniqueIds,
        },
      );
      if (error) throw error;

      const saved = data as ChatRoom;
      return this.zone.run(() => {
        this.upsertRoom(saved);
        this.loading.set(false);
        this.notification.showSuccess('Member added');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Add Members Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async removeRoomMember(roomId: string, userId: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_chat_remove_room_member',
        {
          p_room_id: roomId,
          p_user_id: userId,
        },
      );
      if (error) throw error;

      const saved = data as ChatRoom;
      return this.zone.run(() => {
        this.upsertRoom(saved);
        this.loading.set(false);
        this.notification.showSuccess('Member removed');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Remove Member Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async leaveRoom(roomId: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.rpc('tyapp_chat_leave_room', {
        p_room_id: roomId,
      });
      if (error) throw error;

      const saved = data as ChatRoom;
      return this.zone.run(() => {
        this.upsertRoom(saved);
        this.loading.set(false);
        this.notification.showSuccess(
          saved.deleted_at ? 'Room deleted' : 'Left room',
        );
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Leave Room Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async toggleReaction(messageId: string, emoji: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_chat_toggle_reaction',
        {
          p_message_id: messageId,
          p_emoji: emoji,
        },
      );
      if (error) throw error;

      const reactions = normalizeReactions(data as ChatReactions);
      this.zone.run(() => {
        this.messages.update((list) =>
          list.map((item) =>
            item.tb_tyapp_chat_msg_id === messageId
              ? { ...item, reactions }
              : item,
          ),
        );
      });
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Reaction Failed', error);
      return false;
    }
  }

  subscribeToInbox(): void {
    if (this.inboxChannel) return;

    this.inboxChannel = this.supabase
      .channel('jaxfr-chat-inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tyapp_chat_room' },
        (payload) => {
          this.zone.run(() => this.applyRoomChange(payload));
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tyapp_chat_message' },
        (payload) => {
          this.zone.run(() => this.applyInboxMessageInsert(payload));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tyapp_chat_room_read' },
        (payload) => {
          this.zone.run(() => this.applyReadChange(payload));
        },
      )
      .subscribe();
  }

  async subscribeToMessages(roomId: string): Promise<void> {
    if (this.subscribedRoomId === roomId && this.messagesChannel) return;
    await this.unsubscribeFromMessages();

    this.subscribedRoomId = roomId;
    this.messagesChannel = this.supabase
      .channel(`jaxfr-chat-messages-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tyapp_chat_message',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          this.zone.run(() => this.applyMessageChange(payload));
        },
      )
      .subscribe();
  }

  async unsubscribeFromMessages(): Promise<void> {
    this.clearMarkReadTimer();
    if (this.messagesChannel) {
      await this.supabase.removeChannel(this.messagesChannel);
      this.messagesChannel = null;
    }
    this.subscribedRoomId = null;
    this.roomReads.set([]);
  }

  async unsubscribeAll(): Promise<void> {
    await this.unsubscribeFromMessages();
    if (this.inboxChannel) {
      await this.supabase.removeChannel(this.inboxChannel);
      this.inboxChannel = null;
    }
  }

  private scheduleMarkRead(roomId: string): void {
    this.clearMarkReadTimer();
    this.markReadTimer = setTimeout(() => {
      void this.markRoomRead(roomId);
    }, CHAT_MARK_READ_DEBOUNCE_MS);
  }

  private async markRoomRead(roomId: string): Promise<void> {
    if (this.subscribedRoomId !== roomId) return;
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_chat_mark_room_read',
        { p_room_id: roomId },
      );
      if (error) throw error;
      const saved = data as ChatRoomRead | null;
      this.zone.run(() => {
        if (saved) this.upsertRead(saved);
        this.zeroUnread(roomId);
      });
    } catch (error: unknown) {
      this.notification.handleError('Mark Read Failed', error);
    }
  }

  private async fetchRoomReads(roomId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('tyapp_chat_room_read')
        .select('*')
        .eq('room_id', roomId);

      if (error) throw error;

      this.zone.run(() => {
        this.roomReads.set((data as ChatRoomRead[]) || []);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Reads Failed', error);
      this.zone.run(() => this.roomReads.set([]));
    }
  }

  private async loadUnreadCounts(): Promise<Record<string, number>> {
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_chat_unread_counts',
      );
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of (data as {
        room_id: string;
        unread_count: number | string;
      }[]) || []) {
        map[row.room_id] = Number(row.unread_count) || 0;
      }
      return map;
    } catch (error: unknown) {
      this.notification.handleError('Fetch Unread Failed', error);
      return {};
    }
  }

  private applyUnreadCounts(unread: Record<string, number>): void {
    const next = { ...unread };
    if (this.subscribedRoomId) next[this.subscribedRoomId] = 0;
    this.unreadByRoomId.set(next);
  }

  private zeroUnread(roomId: string): void {
    this.unreadByRoomId.update((current) => {
      if ((current[roomId] ?? 0) === 0) return current;
      return { ...current, [roomId]: 0 };
    });
  }

  private bumpUnread(roomId: string): void {
    this.unreadByRoomId.update((current) => ({
      ...current,
      [roomId]: (current[roomId] ?? 0) + 1,
    }));
  }

  private clearMarkReadTimer(): void {
    if (this.markReadTimer) {
      clearTimeout(this.markReadTimer);
      this.markReadTimer = undefined;
    }
  }

  private upsertRead(saved: ChatRoomRead): void {
    if (saved.room_id !== this.subscribedRoomId) return;
    this.roomReads.update((list) => {
      const index = list.findIndex((item) => item.user_id === saved.user_id);
      if (index === -1) return [...list, saved];
      const next = [...list];
      next[index] = saved;
      return next;
    });
  }

  private applyReadChange(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = payload.new as unknown as ChatRoomRead;
      if (!row?.user_id || !row.room_id || !row.last_read_at) return;
      this.upsertRead(row);
      const me = this.auth.userProfile()?.user_id;
      if (row.user_id === me) this.zeroUnread(row.room_id);
    }
  }

  private normalizeMessage(row: ChatMessage): ChatMessage {
    return {
      ...row,
      reactions: normalizeReactions(row.reactions),
      quote_message_ids: normalizeQuoteIds(row.quote_message_ids),
      edited_at: row.edited_at || null,
      deleted_at: row.deleted_at || null,
    };
  }

  private upsertMessage(saved: ChatMessage): void {
    this.messages.update((list) => {
      const index = list.findIndex(
        (item) => item.tb_tyapp_chat_msg_id === saved.tb_tyapp_chat_msg_id,
      );
      if (index === -1) return [...list, saved];
      const next = [...list];
      next[index] = saved;
      return next;
    });
  }

  private touchRoomLastMessage(
    roomId: string,
    lastMessageAt: string | null,
  ): void {
    this.rooms.update((list) => {
      const next = list.map((room) =>
        room.tb_tyapp_chat_rm_id === roomId
          ? { ...room, last_message_at: lastMessageAt }
          : room,
      );
      return this.sortRooms(next);
    });
  }

  private sortRooms(list: ChatRoom[]): ChatRoom[] {
    return [...list].sort((a, b) => {
      const aTime = a.last_message_at || a.created_at || '';
      const bTime = b.last_message_at || b.created_at || '';
      return bTime.localeCompare(aTime);
    });
  }

  private applyInboxMessageInsert(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    const row = this.normalizeMessage(payload.new as unknown as ChatMessage);
    if (!row?.tb_tyapp_chat_msg_id || !row.room_id) return;

    const knownRoom = this.rooms().some(
      (room) => room.tb_tyapp_chat_rm_id === row.room_id,
    );
    if (!knownRoom) {
      void this.fetchRooms(true, { silent: true });
    } else {
      this.touchRoomLastMessage(row.room_id, row.created_at ?? null);
    }

    if (row.room_id === this.subscribedRoomId) {
      this.upsertMessage(row);
    }

    const me = this.auth.userProfile()?.user_id;
    if (row.sender_user_id !== me && row.room_id !== this.subscribedRoomId) {
      const room = this.rooms().find(
        (item) => item.tb_tyapp_chat_rm_id === row.room_id,
      );
      this.bumpUnread(row.room_id);
      this.notification.showSuccess(`New message in ${room?.name ?? 'chat'}`);
      this.push.showLocal({
        title: room?.name ?? 'Jaxfr',
        body: row.body_plain,
        url: `/chat/${row.room_id}`,
      });
    } else if (row.room_id === this.subscribedRoomId) {
      this.scheduleMarkRead(row.room_id);
    }
  }

  private removeRoomFromList(roomId: string): void {
    this.rooms.update((list) =>
      list.filter((item) => item.tb_tyapp_chat_rm_id !== roomId),
    );
    if (this.subscribedRoomId === roomId) {
      this.messages.set([]);
      void this.unsubscribeFromMessages();
    }
  }

  private applyRoomChange(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = payload.new as unknown as ChatRoom;
      this.upsertRoom(row);
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldRow = payload.old as { tb_tyapp_chat_rm_id?: string };
      if (!oldRow.tb_tyapp_chat_rm_id) return;
      this.removeRoomFromList(oldRow.tb_tyapp_chat_rm_id);
    }
  }

  private upsertRoom(row: ChatRoom): void {
    if (!row?.tb_tyapp_chat_rm_id) return;
    const me = this.auth.userProfile()?.user_id ?? '';
    if (row.deleted_at || !me || !(row.member_user_ids ?? []).includes(me)) {
      this.removeRoomFromList(row.tb_tyapp_chat_rm_id);
      return;
    }
    this.rooms.update((list) => {
      const without = list.filter(
        (item) => item.tb_tyapp_chat_rm_id !== row.tb_tyapp_chat_rm_id,
      );
      return this.sortRooms([row, ...without]);
    });
  }

  private applyMessageChange(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = this.normalizeMessage(payload.new as unknown as ChatMessage);
      if (!row?.tb_tyapp_chat_msg_id) return;
      this.upsertMessage(row);
      if (payload.eventType === 'INSERT') {
        this.touchRoomLastMessage(row.room_id, row.created_at ?? null);
        this.scheduleMarkRead(row.room_id);
      }
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldRow = payload.old as { tb_tyapp_chat_msg_id?: string };
      if (!oldRow.tb_tyapp_chat_msg_id) return;
      this.messages.update((list) =>
        list.filter((item) => item.tb_tyapp_chat_msg_id !== oldRow.tb_tyapp_chat_msg_id),
      );
    }
  }
}
