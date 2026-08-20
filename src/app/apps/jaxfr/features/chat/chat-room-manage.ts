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
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';

import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { HasUnsavedChanges } from '../../../../core/guards/unsaved-changes.guard';
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
    MatIconModule,
    MatInputModule,
  ],
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

  readonly chatService = inject(ChatService);
  readonly descriptionMax = CHAT_ROOM_DESCRIPTION_MAX;

  readonly roomId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('roomId'))),
    { initialValue: this.route.snapshot.paramMap.get('roomId') },
  );

  name = '';
  description = '';
  isDirty = signal(false);

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

  isLoading = computed(() => this.chatService.loading());

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.isLoading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.room()) return 'up-to-date';
    return 'none';
  });

  constructor() {
    effect(() => {
      const room = this.room();
      const ready = this.chatService.roomsReady();
      untracked(() => {
        if (!ready || this.redirected) return;
        if (!room) {
          this.redirected = true;
          void this.router.navigate(['/chat']);
        }
      });
    });

    effect(() => {
      const roomId = this.roomId();
      const room = this.room();

      this.headerService.setConfig({
        backLink: roomId ? `/chat/${roomId}` : '/chat',
        title: room ? `Manage "${room.name}"` : 'Manage Room',
        syncStatus: this.syncStatus,
        actions: [
          {
            label: 'Save Changes',
            icon: 'check',
            type: 'primary',
            disabled: () =>
              this.isLoading() || !this.isDirty() || !this.name.trim(),
            onClick: () => void this.onSave(),
          },
        ],
      });
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  ngDoCheck() {
    const currentlyDirty =
      this.name.trim() !== this.originalName.trim() ||
      this.description.trim() !== this.originalDescription.trim();
    if (this.isDirty() !== currentlyDirty) {
      this.isDirty.set(currentlyDirty);
    }
  }

  async ngOnInit() {
    await this.chatService.fetchRooms(true);
    const room = this.room();
    this.name = room?.name ?? '';
    this.description = room?.description ?? '';
    this.originalName = this.name;
    this.originalDescription = this.description;
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
      this.isDirty.set(false);
      await this.router.navigate(['/chat', room.tb_tyapp_chat_rm_id]);
    }
  }

  goToMembers() {
    const room = this.room();
    if (!room || !this.isCreator()) return;
    void this.router.navigate([
      '/chat',
      room.tb_tyapp_chat_rm_id,
      'manage',
      'members',
    ]);
  }

  async onDeleteRoom() {
    const room = this.room();
    if (!room || !this.isCreator()) return;
    if (!confirm(`Delete room "${room.name}"? This cannot be undone.`)) return;
    const ok = await this.chatService.deleteRoom(room.tb_tyapp_chat_rm_id);
    if (ok) {
      this.isDirty.set(false);
      await this.router.navigate(['/chat']);
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
