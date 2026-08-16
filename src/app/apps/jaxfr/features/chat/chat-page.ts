import { CommonModule } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import 'emoji-picker-element';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map } from 'rxjs/operators';
import { format } from 'date-fns';
import Quill from 'quill';
import { QuillEditorComponent } from 'ngx-quill';

import { AuthService } from '../../../../core/services/auth.service';
import { AppSettingsService } from '../../../../core/services/app-settings.service';
import { HeaderService } from '../../../../core/services/header.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../user/user.service';
import { ChatHtml } from './chat-html';
import { ChatMsgAnchor } from './chat-msg-anchor';
import {
  CHAT_QUOTE_MAX,
  CHAT_QUILL_MODULES,
  CHAT_REACTION_EMOJIS,
} from './chat.constants';
import { ChatMessage } from './chat.model';
import { ChatService } from './chat.service';
import {
  canDeleteMessage,
  canEditMessage,
  isPlainEmpty,
  toReactionChips,
  truncatePlain,
} from './chat.util';

interface QuoteDraft {
  id: string;
  plain: string;
  authorName: string;
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_PX = 10;

interface QuotedItemVm {
  id: string;
  plain: string | null;
  author: string | null;
  deleted: boolean;
}

interface ThreadMessageVm {
  message: ChatMessage;
  isMine: boolean;
  authorName: string;
  timeLabel: string;
  canEdit: boolean;
  canDelete: boolean;
  quotedItems: QuotedItemVm[];
  reactionChips: ReturnType<typeof toReactionChips>;
}

@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    QuillEditorComponent,
    ChatHtml,
    ChatMsgAnchor,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ChatPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private headerService = inject(HeaderService);
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private displayNamePipe = inject(DisplayNamePipe);

  readonly chatService = inject(ChatService);
  readonly userService = inject(UserService);
  readonly appSettings = inject(AppSettingsService);

  readonly quillModules = CHAT_QUILL_MODULES;
  readonly reactionEmojis = CHAT_REACTION_EMOJIS;
  readonly messageOverflowEnabled = false;

  readonly roomId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('roomId'))),
    { initialValue: this.route.snapshot.paramMap.get('roomId') },
  );

  nowTick = signal(Date.now());
  draftHtml = signal('');
  quoteDraft = signal<QuoteDraft[]>([]);
  editingMessageId = signal<string | null>(null);
  searchQuery = signal('');
  reactionPickerMessageId = signal<string | null>(null);
  pinnedToolbarId = signal<string | null>(null);
  highlightMsgId = signal<string | null>(null);

  private editor: Quill | null = null;
  private nowTimer: ReturnType<typeof setInterval> | undefined;
  private highlightTimer: ReturnType<typeof setTimeout> | undefined;
  private bottomAnchor = viewChild<ElementRef<HTMLElement>>('bottomAnchor');
  private msgAnchors = viewChildren(ChatMsgAnchor);
  private lastMessageCount = 0;
  private actionMenuOpen = false;
  private toolbarFromLongPress = false;
  private lastPointerWasMouse = true;
  private longPressTimer: ReturnType<typeof setTimeout> | undefined;
  private longPressStart: { x: number; y: number; id: string } | null = null;

  quoteDraftVm = computed(() => {
    const drafts = this.quoteDraft();
    const messages = this.chatService.messages();
    return drafts.map((draft) => {
      const source = messages.find(
        (item) => item.tb_tyapp_chat_msg_id === draft.id,
      );
      return {
        ...draft,
        deleted: !source || !!source.deleted_at,
      };
    });
  });

  currentUserId = computed(() => this.auth.userProfile()?.user_id ?? '');

  isLoading = computed(() => this.chatService.loading());

  selectedRoom = computed(() => {
    const id = this.roomId();
    if (!id) return null;
    return (
      this.chatService.rooms().find((room) => room.tb_tyapp_chat_rm_id === id) ??
      null
    );
  });

  filteredRooms = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const rooms = this.chatService.rooms();
    if (!q) return rooms;
    return rooms.filter((room) => room.name.toLowerCase().includes(q));
  });

  threadVm = computed<ThreadMessageVm[]>(() => {
    const messages = this.chatService.messages();
    const users = this.userService.users();
    const me = this.currentUserId();
    const now = this.nowTick();
    const byId = new Map(messages.map((m) => [m.tb_tyapp_chat_msg_id, m]));

    return messages.map((message) => {
      const sender = users.find((u) => u.user_id === message.sender_user_id);
      const quotedItems: QuotedItemVm[] = (
        message.quote_message_ids ?? []
      ).map((quoteId) => {
        const quoted = byId.get(quoteId);
        const quotedSender = quoted
          ? users.find((u) => u.user_id === quoted.sender_user_id)
          : undefined;
        return {
          id: quoteId,
          plain: quoted ? quoted.body_plain : null,
          author: quotedSender
            ? this.displayNamePipe.transform(quotedSender)
            : quoted
              ? 'Unknown User'
              : null,
          deleted: !quoted || !!quoted.deleted_at,
        };
      });

      const reactionChips = toReactionChips(
        message.reactions,
        me,
        (userId) => {
          const user = users.find((u) => u.user_id === userId);
          return user ? this.displayNamePipe.transform(user) : 'Unknown';
        },
      );

      return {
        message,
        isMine: message.sender_user_id === me,
        authorName: sender
          ? this.displayNamePipe.transform(sender)
          : 'Unknown User',
        timeLabel: message.created_at
          ? format(new Date(message.created_at), 'yyyy-MM-dd HH:mm:ss')
          : '',
        canEdit: canEditMessage(
          message,
          me,
          now,
          this.appSettings.settings()?.chat_edit_window_ms,
        ),
        canDelete: canDeleteMessage(
          message,
          me,
          now,
          this.appSettings.settings()?.chat_delete_window_ms,
        ),
        quotedItems,
        reactionChips,
      };
    });
  });

  constructor() {
    effect(() => {
      this.roomId();
      untracked(() => {
        this.reactionPickerMessageId.set(null);
        this.clearPinnedToolbar();
      });
    });

    effect(() => {
      const id = this.roomId();
      const room = this.selectedRoom();
      const loading = this.isLoading();

      this.headerService.setConfig({
        backLink: id ? '/chat' : undefined,
        title: room?.name ?? 'Chat',
        actions: [
          {
            label: 'Refresh',
            icon: 'refresh',
            type: 'secondary',
            disabled: () => loading,
            onClick: () => {
              void this.appSettings.fetch();
              void this.chatService.fetchRooms(true);
            },
          },
          {
            label: 'New Room',
            icon: 'add',
            type: id ? 'secondary' : 'primary',
            disabled: () => loading,
            onClick: () => void this.router.navigate(['/chat/new']),
          },
          ...(id
            ? [
                {
                  label: 'Rename',
                  icon: 'edit',
                  type: 'secondary' as const,
                  disabled: () => loading,
                  onClick: () => void this.onRenameRoom(),
                },
                {
                  label: 'Delete Room',
                  icon: 'delete_outline',
                  type: 'secondary' as const,
                  disabled: () => loading,
                  onClick: () => void this.onDeleteRoom(),
                },
              ]
            : []),
        ],
      });
    });

    effect(() => {
      const id = this.roomId();
      untracked(() => {
        void this.syncRoom(id);
      });
    });

    effect(() => {
      const id = this.roomId();
      const ready = this.chatService.roomsReady();
      const rooms = this.chatService.rooms();
      if (!id || !ready) return;
      const stillThere = rooms.some((room) => room.tb_tyapp_chat_rm_id === id);
      if (!stillThere) {
        untracked(() => {
          void this.router.navigate(['/chat']);
        });
      }
    });

    effect(() => {
      const count = this.threadVm().length;
      if (count !== this.lastMessageCount) {
        this.lastMessageCount = count;
        queueMicrotask(() => this.scrollToBottom());
      }
    });
  }

  async ngOnInit() {
    this.nowTimer = setInterval(() => this.nowTick.set(Date.now()), 30000);
    await Promise.all([
      this.chatService.fetchRooms(true),
      this.userService.fetchAllUsers(),
    ]);
  }

  onEditorCreated(quill: Quill) {
    this.editor = quill;
    quill.root.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        event.stopPropagation();
        this.sendFromEnter();
      },
      true,
    );
  }

  memberSummary(memberIds: string[]): string {
    const names = memberIds
      .map((id) => {
        const user = this.userService.users().find((u) => u.user_id === id);
        return user ? this.displayNamePipe.transform(user) : null;
      })
      .filter((name): name is string => !!name);
    return names.join(', ');
  }

  quoteSnippet(plain: string | null, deleted: boolean): string {
    if (deleted) return 'Original message was deleted';
    return truncatePlain(plain ?? '');
  }

  isInQuoteDraft(id: string): boolean {
    return this.quoteDraft().some((item) => item.id === id);
  }

  startQuote(vm: ThreadMessageVm) {
    if (vm.message.deleted_at) return;
    if (this.editingMessageId()) return;

    const id = vm.message.tb_tyapp_chat_msg_id;
    const current = this.quoteDraft();
    if (current.some((item) => item.id === id)) {
      this.quoteDraft.set(current.filter((item) => item.id !== id));
      this.clearPinnedToolbar();
      return;
    }
    if (current.length >= CHAT_QUOTE_MAX) {
      this.notification.handleError(
        'Quote Failed',
        `You can quote at most ${CHAT_QUOTE_MAX} messages`,
      );
      this.clearPinnedToolbar();
      return;
    }

    this.quoteDraft.set([
      ...current,
      {
        id,
        plain: vm.message.body_plain,
        authorName: vm.authorName,
      },
    ]);
    this.clearPinnedToolbar();
  }

  removeQuote(id: string) {
    this.quoteDraft.set(this.quoteDraft().filter((item) => item.id !== id));
  }

  clearQuote() {
    this.quoteDraft.set([]);
  }

  jumpToMessage(id: string) {
    const anchor = this.msgAnchors().find((item) => item.msgId() === id);
    if (!anchor) {
      this.notification.handleError(
        'Quote',
        'Original message is not in this room',
      );
      return;
    }
    anchor.host.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    this.highlightMsgId.set(id);
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => {
      if (this.highlightMsgId() === id) this.highlightMsgId.set(null);
    }, 1600);
  }

  startEdit(vm: ThreadMessageVm) {
    if (!vm.canEdit) return;
    this.editingMessageId.set(vm.message.tb_tyapp_chat_msg_id);
    this.draftHtml.set(vm.message.body);
    this.quoteDraft.set([]);
    this.editor?.clipboard.dangerouslyPasteHTML(vm.message.body);
    this.clearPinnedToolbar();
  }

  cancelEdit() {
    this.editingMessageId.set(null);
    this.draftHtml.set('');
    this.editor?.setText('');
  }

  private sendFromEnter() {
    if (this.isLoading()) return;
    const plain = (this.editor?.getText() ?? '').trim();
    if (isPlainEmpty(plain)) return;
    void this.onSend();
  }

  async onSend() {
    const roomId = this.roomId();
    const me = this.currentUserId();
    if (!roomId || !me) return;

    const plain = (this.editor?.getText() ?? '').trim();
    if (isPlainEmpty(plain)) {
      this.notification.handleError('Send Failed', 'Message cannot be empty');
      return;
    }

    const html = this.draftHtml();
    const editingId = this.editingMessageId();

    if (editingId) {
      const ok = await this.chatService.editMessage(editingId, html, plain);
      if (ok) this.cancelEdit();
      return;
    }

    const saved = await this.chatService.sendMessage(
      roomId,
      me,
      html,
      plain,
      this.quoteDraft().map((item) => item.id),
    );
    if (saved) {
      this.draftHtml.set('');
      this.quoteDraft.set([]);
      this.editor?.setText('');
    }
  }

  async onToggleReaction(messageId: string, emoji: string) {
    await this.chatService.toggleReaction(messageId, emoji);
  }

  onToolbarEmoji(vm: ThreadMessageVm, emoji: string) {
    void this.onToggleReaction(vm.message.tb_tyapp_chat_msg_id, emoji);
    if (this.toolbarFromLongPress) {
      this.clearPinnedToolbar();
    }
  }

  openReactionPicker(messageId: string) {
    this.clearPinnedToolbar();
    this.reactionPickerMessageId.set(messageId);
  }

  closeReactionPicker() {
    this.reactionPickerMessageId.set(null);
  }

  onPickerEmoji(event: Event) {
    const messageId = this.reactionPickerMessageId();
    const unicode = (event as CustomEvent<{ unicode?: string }>).detail?.unicode;
    const emoji = unicode?.trim() ?? '';
    if (!messageId || !emoji) return;
    this.closeReactionPicker();
    void this.onToggleReaction(messageId, emoji);
  }

  onActionMenuOpened(messageId: string) {
    this.actionMenuOpen = true;
    this.pinnedToolbarId.set(messageId);
  }

  onActionMenuClosed() {
    this.actionMenuOpen = false;
    if (!this.toolbarFromLongPress) {
      this.pinnedToolbarId.set(null);
    }
  }

  onMessagePointerDown(event: PointerEvent, vm: ThreadMessageVm) {
    this.lastPointerWasMouse = event.pointerType === 'mouse';
    this.cancelLongPressTimer();
    if (vm.message.deleted_at) return;
    if (event.pointerType === 'mouse') return;

    this.longPressStart = {
      x: event.clientX,
      y: event.clientY,
      id: vm.message.tb_tyapp_chat_msg_id,
    };
    this.longPressTimer = setTimeout(() => {
      if (!this.longPressStart) return;
      this.toolbarFromLongPress = true;
      this.pinnedToolbarId.set(this.longPressStart.id);
      this.longPressStart = null;
    }, LONG_PRESS_MS);
  }

  onMessagePointerMove(event: PointerEvent) {
    if (!this.longPressStart) return;
    const dx = event.clientX - this.longPressStart.x;
    const dy = event.clientY - this.longPressStart.y;
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
      this.cancelLongPressTimer();
    }
  }

  onMessagePointerUp() {
    this.cancelLongPressTimer();
  }

  onMessageContextMenu(event: Event, vm: ThreadMessageVm) {
    if (vm.message.deleted_at) return;
    if (!this.lastPointerWasMouse) {
      event.preventDefault();
    }
  }

  @HostListener('document:pointerdown')
  onDocumentPointerDown() {
    if (this.actionMenuOpen || !this.toolbarFromLongPress) return;
    this.toolbarFromLongPress = false;
    this.pinnedToolbarId.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscapeReactionPicker() {
    this.closeReactionPicker();
    this.clearPinnedToolbar();
  }

  async onDeleteMessage(vm: ThreadMessageVm) {
    if (!vm.canDelete) return;
    if (!confirm('Delete this message?')) return;
    this.clearPinnedToolbar();
    await this.chatService.deleteMessage(vm.message.tb_tyapp_chat_msg_id);
  }

  async onRenameRoom() {
    const room = this.selectedRoom();
    if (!room) return;
    const next = prompt('Room name', room.name);
    if (next === null) return;
    await this.chatService.renameRoom(room.tb_tyapp_chat_rm_id, next);
  }

  async onDeleteRoom() {
    const room = this.selectedRoom();
    if (!room) return;
    if (!confirm(`Delete room "${room.name}"?`)) return;
    const ok = await this.chatService.deleteRoom(room.tb_tyapp_chat_rm_id);
    if (ok) {
      await this.router.navigate(['/chat']);
    }
  }

  ngOnDestroy() {
    this.cancelLongPressTimer();
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    if (this.nowTimer) clearInterval(this.nowTimer);
    this.headerService.clear();
    void this.chatService.unsubscribeFromMessages();
  }

  private clearPinnedToolbar() {
    this.cancelLongPressTimer();
    this.toolbarFromLongPress = false;
    this.pinnedToolbarId.set(null);
  }

  private cancelLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = undefined;
    }
    this.longPressStart = null;
  }

  private async syncRoom(roomId: string | null) {
    if (!roomId) {
      this.chatService.messages.set([]);
      await this.chatService.unsubscribeFromMessages();
      return;
    }
    await this.openRoom(roomId);
  }

  private async openRoom(roomId: string) {
    this.cancelEdit();
    this.quoteDraft.set([]);
    await this.chatService.fetchMessages(roomId);
    await this.chatService.subscribeToMessages(roomId);
    this.lastMessageCount = 0;
    queueMicrotask(() => this.scrollToBottom());
  }

  private scrollToBottom() {
    this.bottomAnchor()?.nativeElement.scrollIntoView({ block: 'end' });
  }
}
