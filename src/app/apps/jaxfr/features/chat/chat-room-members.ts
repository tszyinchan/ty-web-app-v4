import { CommonModule } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { UserService } from '../user/user.service';
import { CHAT_ROOM_MIN_MEMBERS } from './chat.constants';
import { ChatService } from './chat.service';

@Component({
  selector: 'app-chat-room-members',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatAutocompleteModule,
    MatTooltipModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './chat-room-members.html',
  styleUrl: './chat-room-members.scss',
})
export class ChatRoomMembers implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private headerService = inject(HeaderService);
  private auth = inject(AuthService);
  private displayNamePipe = inject(DisplayNamePipe);

  readonly chatService = inject(ChatService);
  readonly userService = inject(UserService);

  readonly roomId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('roomId'))),
    { initialValue: this.route.snapshot.paramMap.get('roomId') },
  );

  userSearch = signal('');
  private redirected = false;

  currentUserId = computed(() => this.auth.userProfile()?.user_id ?? '');

  room = computed(() => {
    const id = this.roomId();
    if (!id) return null;
    return (
      this.chatService.rooms().find((r) => r.tb_tyapp_chat_rm_id === id) ?? null
    );
  });

  canRemoveMembers = computed(
    () => (this.room()?.member_user_ids.length ?? 0) > CHAT_ROOM_MIN_MEMBERS,
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
        title: room ? `Members of "${room.name}"` : 'Members',
      });
    });
  }

  async ngOnInit() {
    await Promise.all([
      this.chatService.fetchRooms(true),
      this.userService.fetchAllUsers(),
    ]);
  }

  memberDisplayName(userId: string): string {
    const user = this.userService.users().find((item) => item.user_id === userId);
    return this.displayNamePipe.transform(user);
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
