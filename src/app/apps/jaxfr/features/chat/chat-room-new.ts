import { CommonModule } from '@angular/common';
import {
  Component,
  DoCheck,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';

import { AuthService } from '../../../../core/services/auth.service';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { HasUnsavedChanges } from '../../../../core/guards/unsaved-changes.guard';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../user/user.service';
import {
  CHAT_ROOM_DESCRIPTION_MAX,
  CHAT_ROOM_MIN_OTHER_MEMBERS,
} from './chat.constants';
import { ChatService } from './chat.service';

@Component({
  selector: 'app-chat-room-new',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatAutocompleteModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './chat-room-new.html',
  styleUrl: './chat-room-new.scss',
})
export class ChatRoomNew implements OnInit, OnDestroy, DoCheck, HasUnsavedChanges {
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private displayNamePipe = inject(DisplayNamePipe);

  readonly chatService = inject(ChatService);
  readonly userService = inject(UserService);

  readonly descriptionMax = CHAT_ROOM_DESCRIPTION_MAX;

  name = '';
  description = '';
  memberUserIds = signal<string[]>([]);
  userSearch = signal('');
  isDirtyFlag = false;
  isLoading = computed(() => this.chatService.loading());

  currentUserId = computed(() => this.auth.userProfile()?.user_id ?? '');

  filteredUsers = computed(() => {
    const q = this.userSearch().toLowerCase();
    const selected = this.memberUserIds();
    const me = this.currentUserId();
    return this.userService
      .usersSharingOneGroupWith([me, ...selected])
      .map((user) => ({
        value: user.user_id,
        label: this.displayNamePipe.transform(user),
      }))
      .filter((opt) => (q ? opt.label.toLowerCase().includes(q) : true));
  });

  isDirty(): boolean {
    return this.isDirtyFlag;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirtyFlag) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  ngDoCheck() {
    this.isDirtyFlag =
      this.name.trim().length > 0 ||
      this.description.trim().length > 0 ||
      this.memberUserIds().length > 0;
  }

  displayUserName(id: string): string {
    const user = this.userService.users().find((item) => item.user_id === id);
    return this.displayNamePipe.transform(user);
  }

  async ngOnInit() {
    await Promise.all([
      this.userService.fetchAllUsers(),
      this.userService.fetchGroups(),
    ]);

    const actions: HeaderAction[] = [
      {
        label: 'Create Room',
        icon: 'add',
        type: 'primary',
        disabled: this.isLoading,
        onClick: () => void this.onCreate(),
      },
    ];

    this.headerService.setConfig({
      backLink: '/chat',
      title: 'New Room',
      actions,
    });
  }

  addMember(event: MatAutocompleteSelectedEvent): void {
    const userId = String(event.option.value);
    this.memberUserIds.update((list) =>
      list.includes(userId) ? list : [...list, userId],
    );
  }

  removeMember(index: number): void {
    this.memberUserIds.update((list) => {
      const next = [...list];
      next.splice(index, 1);
      return next;
    });
  }

  async onCreate() {
    const me = this.currentUserId();
    const name = this.name.trim();
    if (!me) return;

    if (!name) {
      this.notification.handleError('Create Room Failed', 'Room name is required');
      return;
    }
    if (this.memberUserIds().length < CHAT_ROOM_MIN_OTHER_MEMBERS) {
      this.notification.handleError(
        'Create Room Failed',
        'Pick at least one other person',
      );
      return;
    }

    const members = [...this.memberUserIds(), me];
    if (!this.userService.idsShareAGroup(members)) {
      this.notification.handleError(
        'Create Room Failed',
        'Everyone in a room must belong to the same user group',
      );
      return;
    }

    const room = await this.chatService.createRoom(
      name,
      members,
      me,
      this.description,
    );
    if (room) {
      this.isDirtyFlag = false;
      await this.router.navigate(['/chat', room.tb_tyapp_chat_rm_id]);
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
