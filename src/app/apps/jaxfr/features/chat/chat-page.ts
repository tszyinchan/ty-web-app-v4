import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
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
import { HeaderService } from '../../../../core/services/header.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../user/user.service';
import { ChatHtml } from './chat-html';
import { CHAT_QUILL_MODULES, CHAT_REACTION_EMOJIS } from './chat.constants';
import { ChatMessage } from './chat.model';
import { ChatService } from './chat.service';
import {
  canDeleteMessage,
  canEditMessage,
  isPlainEmpty,
  truncatePlain,
} from './chat.util';

interface QuoteDraft {
  id: string;
  plain: string;
  authorName: string;
}

interface ThreadMessageVm {
  message: ChatMessage;
  isMine: boolean;
  authorName: string;
  timeLabel: string;
  canEdit: boolean;
  canDelete: boolean;
  quotedPlain: string | null;
  quotedAuthor: string | null;
  quotedDeleted: boolean;
  reactionChips: {
    emoji: string;
    count: number;
    mine: boolean;
    tooltip: string;
  }[];
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
  ],
  providers: [DisplayNamePipe],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.scss',
})
export class ChatPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private headerService = inject(HeaderService);
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private displayNamePipe = inject(DisplayNamePipe);
  private breakpointObserver = inject(BreakpointObserver);

  readonly chatService = inject(ChatService);
  readonly userService = inject(UserService);

  readonly quillModules = CHAT_QUILL_MODULES;
  readonly reactionEmojis = CHAT_REACTION_EMOJIS;

  readonly isHandset = toSignal(
    this.breakpointObserver
      .observe(Breakpoints.Handset)
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly roomId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('roomId'))),
    { initialValue: this.route.snapshot.paramMap.get('roomId') },
  );

  nowTick = signal(Date.now());
  draftHtml = signal('');
  quoteDraft = signal<QuoteDraft | null>(null);
  editingMessageId = signal<string | null>(null);
  searchQuery = signal('');

  private editor: Quill | null = null;
  private nowTimer: ReturnType<typeof setInterval> | undefined;
  private bottomAnchor = viewChild<ElementRef<HTMLElement>>('bottomAnchor');
  private lastMessageCount = 0;

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
      const quoted = message.quote_message_id
        ? byId.get(message.quote_message_id)
        : undefined;
      const quotedSender = quoted
        ? users.find((u) => u.user_id === quoted.sender_user_id)
        : undefined;

      const reactionChips = Object.entries(message.reactions).map(
        ([emoji, entries]) => ({
          emoji,
          count: entries.length,
          mine: entries.some((entry) => entry.user_id === me),
          tooltip: entries
            .map((entry) => {
              const user = users.find((u) => u.user_id === entry.user_id);
              return user ? this.displayNamePipe.transform(user) : 'Unknown';
            })
            .join(', '),
        }),
      );

      return {
        message,
        isMine: message.sender_user_id === me,
        authorName: sender
          ? this.displayNamePipe.transform(sender)
          : 'Unknown User',
        timeLabel: message.created_at
          ? format(new Date(message.created_at), 'MMM d, HH:mm')
          : '',
        canEdit: canEditMessage(message, me, now),
        canDelete: canDeleteMessage(message, me),
        quotedPlain: quoted ? quoted.body_plain : null,
        quotedAuthor: quotedSender
          ? this.displayNamePipe.transform(quotedSender)
          : quoted
            ? 'Unknown User'
            : null,
        quotedDeleted: !!quoted?.deleted_at,
        reactionChips,
      };
    });
  });

  constructor() {
    effect(() => {
      const id = this.roomId();
      const room = this.selectedRoom();
      const loading = this.isLoading();

      this.headerService.setConfig({
        backLink: id ? '/chat' : undefined,
        title: room?.name ?? 'Chat',
        actions: [
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
      this.chatService.fetchRooms(),
      this.userService.fetchAllUsers(),
    ]);
    this.chatService.subscribeToRooms();
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

  startQuote(vm: ThreadMessageVm) {
    if (vm.message.deleted_at) return;
    this.quoteDraft.set({
      id: vm.message.tb_tyapp_chat_msg_id,
      plain: vm.message.body_plain,
      authorName: vm.authorName,
    });
  }

  clearQuote() {
    this.quoteDraft.set(null);
  }

  startEdit(vm: ThreadMessageVm) {
    if (!vm.canEdit) return;
    this.editingMessageId.set(vm.message.tb_tyapp_chat_msg_id);
    this.draftHtml.set(vm.message.body);
    this.quoteDraft.set(null);
    this.editor?.clipboard.dangerouslyPasteHTML(vm.message.body);
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
      this.quoteDraft()?.id,
    );
    if (saved) {
      this.draftHtml.set('');
      this.quoteDraft.set(null);
      this.editor?.setText('');
    }
  }

  async onToggleReaction(messageId: string, emoji: string) {
    await this.chatService.toggleReaction(messageId, emoji);
  }

  async onDeleteMessage(vm: ThreadMessageVm) {
    if (!vm.canDelete) return;
    if (!confirm('Delete this message?')) return;
    await this.chatService.deleteMessage(vm.message.tb_tyapp_chat_msg_id);
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
    if (this.nowTimer) clearInterval(this.nowTimer);
    this.headerService.clear();
    void this.chatService.unsubscribeAll();
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
    this.quoteDraft.set(null);
    await this.chatService.fetchMessages(roomId);
    await this.chatService.subscribeToMessages(roomId);
    this.lastMessageCount = 0;
    queueMicrotask(() => this.scrollToBottom());
  }

  private scrollToBottom() {
    this.bottomAnchor()?.nativeElement.scrollIntoView({ block: 'end' });
  }
}
