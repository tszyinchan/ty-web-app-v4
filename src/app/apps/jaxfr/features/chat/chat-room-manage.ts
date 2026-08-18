import { CommonModule } from '@angular/common';
import {
  Component,
  DoCheck,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';

import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { HasUnsavedChanges } from '../../../../core/guards/unsaved-changes.guard';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { UserService } from '../user/user.service';
import { CHAT_ROOM_DESCRIPTION_MAX } from './chat.constants';
import { ChatService } from './chat.service';

@Component({
  selector: 'app-chat-room-manage',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatAutocompleteModule,
    MatTooltipModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './chat-room-manage.html',
  styleUrl: './chat-room-manage.scss',
})
export class ChatRoomManage
  implements OnInit, OnDestroy, DoCheck, HasUnsavedChanges
{
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private headerService = inject(HeaderService);
  private auth = inject(AuthService);
  private displayNamePipe = inject(DisplayNamePipe);

  readonly chatService = inject(ChatService);
  readonly userService = inject(UserService);
  readonly descriptionMax = CHAT_ROOM_DESCRIPTION_MAX;

  readonly roomId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('roomId'))),
    { initialValue: this.route.snapshot.paramMap.get('roomId') },
  );

  name = '';
  description = '';
  userSearch = signal('');
  isDirtyFlag = false;

  private originalName = '';
  private originalDescription = '';
  private redirected = false;

  currentUserId = computed(() => this.auth.userProfile()?.user_id ?? '');

  room = computed(() => {
    const id = this.roomId();
    if (!id) return null;
    return (
      this.chatService.rooms().find((r) => r.tb_tyapp_chat_rm_id === id) ?? null
    );
  });

  isCreator = computed(() => {
    const room = this.room();
    const me = this.currentUserId();
    return !!room && !!me && room.created_by === me;
  });

  canRemoveMembers = computed(
    () => (this.room()?.member_user_ids.length ?? 0) > 2,
  );

  filteredUsers = computed(() => {
    const q = this.userSearch().toLowerCase().trim();
    const members = new Set(this.room()?.member_user_ids ?? []);
    return this.userService
      .users()
      .filter((user) => !members.has(user.user_id))
      .map((user) => ({
        value: user.user_id,
        label: this.displayNamePipe.transform(user),
      }))
      .filter((opt) => (q ? opt.label.toLowerCase().includes(q) : true));
  });

  isLoading = computed(() => this.chatService.loading());

  constructor() {
    effect(() => {
      const room = this.room();
      const ready = this.chatService.roomsReady();
      const me = this.currentUserId();
      untracked(() => {
        if (!ready || this.redirected) return;
        if (!room) {
          this.redirected = true;
          void this.router.navigate(['/chat']);
          return;
        }
        if (!!me && room.created_by !== me) {
          this.redirected = true;
          void this.router.navigate(['/chat', room.tb_tyapp_chat_rm_id]);
        }
      });
    });

    effect(() => {
      const roomId = this.roomId();
      const room = this.room();

      this.headerService.setConfig({
        backLink: roomId ? `/chat/${roomId}` : '/chat',
        title: room ? `Manage "${room.name}"` : 'Manage Room',
        actions: [
          {
            label: 'Save Changes',
            icon: 'check',
            type: 'primary',
            disabled: () =>
              this.isLoading() || !this.isDirtyFlag || !this.name.trim(),
            onClick: () => void this.onSave(),
          },
        ],
      });
    });
  }

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
      this.name.trim() !== this.originalName.trim() ||
      this.description.trim() !== this.originalDescription.trim();
  }

  async ngOnInit() {
    await Promise.all([
      this.chatService.fetchRooms(true),
      this.userService.fetchAllUsers(),
    ]);
    const room = this.room();
    this.name = room?.name ?? '';
    this.description = room?.description ?? '';
    this.originalName = this.name;
    this.originalDescription = this.description;
  }

  memberDisplayName(userId: string): string {
    const user = this.userService.users().find((item) => item.user_id === userId);
    return user ? this.displayNamePipe.transform(user) : 'Unknown User';
  }

  async onSave() {
    const room = this.room();
    const name = this.name.trim();
    if (!room || !name) return;

    const tasks: Promise<boolean>[] = [];
    if (name !== this.originalName.trim()) {
      tasks.push(this.chatService.renameRoom(room.tb_tyapp_chat_rm_id, name));
    }
    if (this.description.trim() !== this.originalDescription.trim()) {
      tasks.push(
        this.chatService.setRoomDescription(
          room.tb_tyapp_chat_rm_id,
          this.description,
        ),
      );
    }
    if (tasks.length === 0) return;

    const results = await Promise.all(tasks);
    if (results.every(Boolean)) {
      this.originalName = name;
      this.originalDescription = this.description.trim();
      this.isDirtyFlag = false;
    }
  }

  async onDeleteRoom() {
    const room = this.room();
    if (!room) return;
    if (!confirm(`Delete room "${room.name}"? This cannot be undone.`)) return;
    const ok = await this.chatService.deleteRoom(room.tb_tyapp_chat_rm_id);
    if (ok) {
      this.isDirtyFlag = false;
      await this.router.navigate(['/chat']);
    }
  }

  async onAddMember(event: MatAutocompleteSelectedEvent) {
    const room = this.room();
    const userId = String(event.option.value);
    if (!room || !userId) return;
    this.userSearch.set('');
    await this.chatService.addRoomMembers(room.tb_tyapp_chat_rm_id, [userId]);
  }

  async onRemoveMember(userId: string) {
    const room = this.room();
    if (!room) return;
    const name = this.memberDisplayName(userId);
    if (!confirm(`Remove ${name} from this room?`)) return;
    await this.chatService.removeRoomMember(room.tb_tyapp_chat_rm_id, userId);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
