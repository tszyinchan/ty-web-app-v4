import { Injectable, NgZone, effect, inject, signal, untracked } from '@angular/core';
import {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { NotificationService } from '../../../../core/services/notification.service';
import { AuthService } from '../../../../core/services/auth.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { RecordStatus } from '../../../../core/models/status.enum';
import {
  ChatMessage,
  ChatMessageType,
  ChatReactions,
  ChatRoom,
} from './chat.model';
import { normalizeReactions, sanitizeChatHtml } from './chat.util';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private auth = inject(AuthService);
  private zone = inject(NgZone);

  rooms = signal<ChatRoom[]>([]);
  messages = signal<ChatMessage[]>([]);
  loading = signal(false);
  roomsReady = signal(false);

  private roomsLoaded = false;
  private inboxChannel: RealtimeChannel | null = null;
  private messagesChannel: RealtimeChannel | null = null;
  private subscribedRoomId: string | null = null;

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

      this.zone.run(() => {
        this.rooms.set((data as ChatRoom[]) || []);
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
  ): Promise<ChatRoom | null> {
    const uniqueMembers = [...new Set(memberUserIds)];
    if (!uniqueMembers.includes(createdBy)) {
      uniqueMembers.push(createdBy);
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_chat_room')
        .insert({
          name: name.trim(),
          member_user_ids: uniqueMembers,
          created_by: createdBy,
          status: RecordStatus.Active,
        })
        .select()
        .single();

      if (error) throw error;

      const saved = data as ChatRoom;
      return this.zone.run(() => {
        this.rooms.update((list) => [saved, ...list]);
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
    quoteMessageId?: string | null,
  ): Promise<ChatMessage | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_chat_message')
        .insert({
          room_id: roomId,
          sender_user_id: senderUserId,
          msg_type: ChatMessageType.Text,
          body: sanitizeChatHtml(bodyHtml),
          body_plain: bodyPlain.trim(),
          quote_message_id: quoteMessageId || null,
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
        this.rooms.update((list) =>
          list.map((room) =>
            room.tb_tyapp_chat_rm_id === saved.tb_tyapp_chat_rm_id ? saved : room,
          ),
        );
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
    if (this.messagesChannel) {
      await this.supabase.removeChannel(this.messagesChannel);
      this.messagesChannel = null;
    }
    this.subscribedRoomId = null;
  }

  async unsubscribeAll(): Promise<void> {
    await this.unsubscribeFromMessages();
    if (this.inboxChannel) {
      await this.supabase.removeChannel(this.inboxChannel);
      this.inboxChannel = null;
    }
  }

  private normalizeMessage(row: ChatMessage): ChatMessage {
    return {
      ...row,
      reactions: normalizeReactions(row.reactions),
      quote_message_id: row.quote_message_id || null,
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
      this.notification.showSuccess(`New message in ${room?.name ?? 'chat'}`);
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
      if (!row?.tb_tyapp_chat_rm_id) return;
      if (row.deleted_at) {
        this.removeRoomFromList(row.tb_tyapp_chat_rm_id);
        return;
      }
      this.rooms.update((list) => {
        const without = list.filter(
          (item) => item.tb_tyapp_chat_rm_id !== row.tb_tyapp_chat_rm_id,
        );
        return this.sortRooms([row, ...without]);
      });
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldRow = payload.old as { tb_tyapp_chat_rm_id?: string };
      if (!oldRow.tb_tyapp_chat_rm_id) return;
      this.removeRoomFromList(oldRow.tb_tyapp_chat_rm_id);
    }
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
