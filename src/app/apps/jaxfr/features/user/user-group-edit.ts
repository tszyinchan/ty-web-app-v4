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
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { RecordStatus } from '../../../../core/models/status.enum';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { AuthService } from '../../../../core/services/auth.service';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { exportToCsv } from '../../../../core/utils/csv-export.util';
import { UserGroup } from './user-group.model';
import { UserService } from './user.service';

@Component({
  selector: 'app-user-group-edit',
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
    MatCheckboxModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './user-group-edit.html',
  styleUrl: './user-group-edit.scss',
})
export class UserGroupEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);
  public userService = inject(UserService);

  readonly RecordStatus = RecordStatus;

  item = signal<Partial<UserGroup> | null>(null);
  currentId: string | null = null;
  selectedMemberIds: string[] = [];
  originalDataStr = signal('');
  originalMembersStr = '';
  isDirty = signal(false);
  isSaveDisabled = signal(true);

  memberOptions = computed(() =>
    this.userService.users().map((user) => ({
      id: user.user_id,
      label: this.displayNamePipe.transform(user),
    })),
  );

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.userService.groupsLoading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  async ngOnInit() {
    if (!this.auth.isAdmin()) {
      const myId = this.auth.userProfile()?.user_id;
      void this.router.navigate(myId ? ['/users/edit', myId] : ['/welcome'], {
        replaceUrl: true,
      });
      return;
    }

    this.currentId = this.route.snapshot.paramMap.get('id');
    await Promise.all([
      this.userService.fetchGroups(),
      this.userService.fetchAllUsers(),
    ]);

    const actions: HeaderAction[] = [];
    if (this.currentId) {
      actions.push({
        label: 'Export',
        icon: 'download',
        type: 'secondary',
        onClick: () => this.onExport(),
      });
      actions.push({
        label: 'Delete',
        icon: 'delete_outline',
        type: 'secondary',
        onClick: () => this.onDelete(),
      });
    }
    actions.push({
      label: this.currentId ? 'Save Changes' : 'Create Group',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: '/users/groups/list',
      syncStatus: this.syncStatus,
      actions,
    });

    if (this.currentId) {
      const cached = this.userService
        .groups()
        .find((group) => group.tb_tyapp_usr_grp_id === this.currentId);
      if (cached) {
        this.setGroup(cached);
      } else {
        this.router.navigate(['/users/groups/list']);
      }
    } else {
      const nextOrder =
        this.userService
          .groups()
          .reduce((max, group) => Math.max(max, group.customized_order ?? 0), 0) +
        1;
      const newGroup: Partial<UserGroup> = {
        name: '',
        customized_order: nextOrder,
        status: RecordStatus.Active,
        remarks: '',
      };
      this.item.set(newGroup);
      this.selectedMemberIds = [];
      this.originalDataStr.set(JSON.stringify(newGroup));
      this.originalMembersStr = this.membersSnapshot();
    }
  }

  private setGroup(group: UserGroup) {
    this.item.set(structuredClone(group));
    this.originalDataStr.set(JSON.stringify(group));
    this.selectedMemberIds = this.userService.memberUserIdsForGroup(
      group.tb_tyapp_usr_grp_id,
    );
    this.originalMembersStr = this.membersSnapshot();
  }

  isMemberSelected(userId: string): boolean {
    return this.selectedMemberIds.includes(userId);
  }

  toggleMember(userId: string, checked: boolean) {
    if (checked) {
      if (!this.selectedMemberIds.includes(userId)) {
        this.selectedMemberIds = [...this.selectedMemberIds, userId];
      }
    } else {
      this.selectedMemberIds = this.selectedMemberIds.filter(
        (id) => id !== userId,
      );
    }
  }

  private membersSnapshot(): string {
    return JSON.stringify([...this.selectedMemberIds].sort());
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
    if (!current || !original) return;

    const currentlyDirty =
      JSON.stringify(current) !== original ||
      this.membersSnapshot() !== this.originalMembersStr;
    if (this.isDirty() !== currentlyDirty) {
      this.isDirty.set(currentlyDirty);
    }

    const disabled =
      this.userService.groupsLoading() ||
      (!!this.currentId && !currentlyDirty) ||
      !current.name?.trim();
    if (this.isSaveDisabled() !== disabled) {
      this.isSaveDisabled.set(disabled);
    }
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.name?.trim()) return;

    const saved = await this.userService.saveGroup(
      data,
      this.selectedMemberIds,
    );
    if (saved) {
      this.originalDataStr.set(JSON.stringify(saved));
      this.originalMembersStr = this.membersSnapshot();
      this.isDirty.set(false);
      this.router.navigate(['/users/groups/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;
    if (!confirm('Delete this group? People in it will no longer share this circle.')) {
      return;
    }
    const success = await this.userService.deleteGroup(this.currentId);
    if (success) {
      this.router.navigate(['/users/groups/list']);
    }
  }

  onExport() {
    const group = this.item();
    if (!group || !this.currentId) return;

    const memberNames = this.selectedMemberIds
      .map((id) => {
        const user = this.userService.users().find((item) => item.user_id === id);
        return this.displayNamePipe.transform(user);
      })
      .join('; ');

    exportToCsv(`User_Group_${group.name || this.currentId}`, [
      'Group ID',
      'Name',
      'Order',
      'Status',
      'Members',
      'Remarks',
    ], [
      [
        this.currentId,
        group.name || '',
        String(group.customized_order ?? ''),
        group.status === RecordStatus.Active ? 'Active' : 'Inactive',
        memberNames,
        group.remarks || '',
      ],
    ]);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
