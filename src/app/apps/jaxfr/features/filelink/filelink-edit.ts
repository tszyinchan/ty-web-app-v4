import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  DoCheck,
  HostListener,
  inject,
  NgZone,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { COMMA, ENTER } from '@angular/cdk/keycodes';

import { AuthService } from '../../../../core/services/auth.service';
import {
  HeaderService,
  HeaderAction,
} from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../user/user.service';

import { FilelinkService } from '../../../../core/domains/filelink/filelink.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { RecordStatus } from '../../../../core/models/status.enum';
import { FilelinkItem } from '../../../../core/domains/filelink/filelink.model';

@Component({
  selector: 'app-filelink-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatAutocompleteModule,
    MatChipsModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './filelink-edit.html',
  styleUrl: './filelink-edit.scss',
})
export class FilelinkEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);
  private notification = inject(NotificationService);

  public filelinkService = inject(FilelinkService);
  public userService = inject(UserService);
  public authService = inject(AuthService);

  readonly RecordStatus = RecordStatus;

  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  readonly COMMON_META_KEYS = [
    'amount',
    'currency',
    'company',
    'document_no',
    'category',
    'remarks',
    'expiry_date',
  ];

  item = signal<Partial<FilelinkItem> | null>(null);
  currentId: string | null = null;
  originalDataStr = signal<string>('');

  isDirty = signal(false);
  isSaveDisabled = signal(true);

  metaPairs = signal<{ k: string; v: string }[]>([]);

  userSearch = signal<string>('');

  visibleAllowedUserIds = computed(() =>
    (this.item()?.allowed_users || []).filter(
      (id) => !this.userService.isUnavailableId(id),
    ),
  );

  filteredUsers = computed(() => {
    const q = this.userSearch().toLowerCase();
    const item = this.item();
    const owner = item?.user_id || this.authService.userProfile()?.user_id || '';
    const allowed = item?.allowed_users || [];
    const visibleAllowed = this.visibleAllowedUserIds();
    return this.userService
      .usersSharingOneGroupWith([owner, ...visibleAllowed])
      .filter(
        (user) =>
          !this.userService.isUnavailable(user) &&
          !allowed.includes(user.user_id),
      )
      .map((u) => ({
        value: u.user_id,
        label: this.displayNamePipe.transform(u),
      }))
      .filter((opt) => (q ? opt.label.toLowerCase().includes(q) : true));
  });

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.filelinkService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  getFilteredMetaKeys(currentInput: string): string[] {
    const q = (currentInput || '').toLowerCase();
    return this.COMMON_META_KEYS.filter((key) => key.toLowerCase().includes(q));
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
    const current = this.item();
    const original = this.originalDataStr();

    if (current && original) {
      const newMeta: Record<string, unknown> = {};
      this.metaPairs().forEach((pair) => {
        if (pair.k.trim()) newMeta[pair.k.trim()] = pair.v;
      });
      current.metadata = Object.keys(newMeta).length > 0 ? newMeta : null;

      const currentlyDirty = JSON.stringify(current) !== original;
      if (this.isDirty() !== currentlyDirty) {
        this.isDirty.set(currentlyDirty);
      }

      const disabled =
        this.filelinkService.loading() ||
        (!!this.currentId && !currentlyDirty) ||
        !current.item_path;

      if (this.isSaveDisabled() !== disabled) {
        this.isSaveDisabled.set(disabled);
      }
    }
  }

  displayUserName(id: string): string {
    const user = this.userService.users().find((item) => item.user_id === id);
    return this.displayNamePipe.transform(user);
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');

    await Promise.all([
      this.filelinkService.fetchAllItems(),
      this.userService.fetchAllUsers(),
      this.userService.fetchGroups(),
    ]);

    const actions: HeaderAction[] = [];
    if (this.currentId) {
      actions.push({
        label: 'Delete',
        icon: 'delete_outline',
        type: 'secondary',
        onClick: () => this.onDelete(),
      });
    }
    actions.push({
      label: this.currentId ? 'Save Changes' : 'Create Link',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: '/filelink/list',
      syncStatus: this.syncStatus,
      actions: actions,
    });

    if (this.currentId) {
      const fresh = await this.filelinkService.fetchItemById(this.currentId);
      const currentUserId = this.authService.userProfile()?.user_id;

      this.zone.run(() => {
        if (fresh) {
          if (fresh.user_id !== currentUserId) {
            alert(
              'Permission Denied: You are not the owner of this file link.',
            );
            this.router.navigate(['/filelink/list']);
            return;
          }

          fresh.item_path = fresh.item_path || [];
          fresh.allowed_users = fresh.allowed_users || [];

          this.item.set(structuredClone(fresh));
          this.initMetaPairs(fresh.metadata);
          this.originalDataStr.set(JSON.stringify(fresh));
        } else {
          this.router.navigate(['/filelink/list']);
        }
      });
    } else {
      const targetUserId = this.authService.userProfile()?.user_id || '';
      const prefillPath = this.filelinkService.currentExplorerPath();
      const newItem: Partial<FilelinkItem> = {
        user_id: targetUserId,
        item_path: prefillPath,
        allowed_users: [],
        status: RecordStatus.Active,
        sort_order: 0,
      };

      this.item.set(newItem);
      this.originalDataStr.set(JSON.stringify(newItem));
    }
  }

  addPath(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) {
      this.item.update((curr) => {
        if (!curr) return curr;
        return { ...curr, item_path: [...(curr.item_path || []), value] };
      });
    }
    event.chipInput!.clear();
  }

  removePath(index: number): void {
    this.item.update((curr) => {
      if (!curr) return curr;
      const newPaths = [...(curr.item_path || [])];
      newPaths.splice(index, 1);
      return { ...curr, item_path: newPaths };
    });
  }

  addAllowedUser(event: MatAutocompleteSelectedEvent): void {
    const userId = String(event.option.value);
    this.userSearch.set('');
    const curr = this.item();
    if (!curr) return;
    const allowed = curr.allowed_users || [];
    if (allowed.includes(userId) || this.userService.isUnavailableId(userId)) {
      return;
    }
    const owner = curr.user_id || this.authService.userProfile()?.user_id || '';
    const visibleAllowed = this.visibleAllowedUserIds();
    if (!this.userService.idsShareAGroup([owner, ...visibleAllowed, userId])) {
      this.notification.handleError(
        'Add User Failed',
        'Everyone granted access must belong to the same user group',
      );
      return;
    }
    this.item.set({ ...curr, allowed_users: [...allowed, userId] });
  }

  removeAllowedUser(userId: string): void {
    this.item.update((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        allowed_users: (curr.allowed_users || []).filter((id) => id !== userId),
      };
    });
  }

  initMetaPairs(metadata: Record<string, unknown> | null | undefined) {
    if (!metadata) {
      this.metaPairs.set([]);
      return;
    }
    const pairs = Object.entries(metadata).map(([k, v]) => ({
      k,
      v: String(v),
    }));
    this.metaPairs.set(pairs);
  }

  addMetaPair() {
    this.metaPairs.update((arr) => [...arr, { k: '', v: '' }]);
    this.onMetaChange();
  }

  removeMetaPair(index: number) {
    this.metaPairs.update((arr) => {
      const newArr = [...arr];
      newArr.splice(index, 1);
      return newArr;
    });
    this.onMetaChange();
  }

  onMetaChange() {
    this.item.update((curr) => ({ ...curr! }));
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.user_id) return;

    const allowed = data.allowed_users || [];
    const visibleAllowed = allowed.filter(
      (id) => !this.userService.isUnavailableId(id),
    );
    if (
      visibleAllowed.length > 0 &&
      !this.userService.idsShareAGroup([data.user_id, ...visibleAllowed])
    ) {
      this.notification.handleError(
        'Save Failed',
        'Everyone granted access must belong to the same user group',
      );
      return;
    }

    const success = await this.filelinkService.saveItem(data);
    if (success) {
      this.isDirty.set(false);
      this.router.navigate(['/filelink/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;
    if (confirm('Are you sure you want to delete this file link?')) {
      const success = await this.filelinkService.deleteItem(this.currentId);

      if (success) {
        this.isDirty.set(false);
        this.router.navigate(['/filelink/list']);
      }
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
