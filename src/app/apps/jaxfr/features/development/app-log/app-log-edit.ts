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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../../../../core/services/auth.service';
import {
  HeaderService,
  HeaderAction,
} from '../../../../../core/services/header.service';
import { AppCategoryService } from '../app-category/app-category.service';
import { UserService } from '../../user/user.service';
import { AppLog } from './app-log.model';
import { AppLogService } from './app-log.service';
import { SelectOption } from '../../../../../core/models/common.model';
import { DisplayNamePipe } from '../../../../../core/pipes/display-name.pipe';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';
import { RecordStatus } from '../../../../../core/models/status.enum';

@Component({
  selector: 'app-log-edit',
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
    MatDatepickerModule,
    MatAutocompleteModule,
  ],
  providers: [provideNativeDateAdapter(), DisplayNamePipe],
  templateUrl: './app-log-edit.html',
})
export class AppLogEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);

  public logService = inject(AppLogService);
  public categoryService = inject(AppCategoryService);
  public userService = inject(UserService);
  public authService = inject(AuthService);

  readonly RecordStatus = RecordStatus;

  item = signal<Partial<AppLog> | null>(null);
  currentId: string | null = null;
  originalDataStr = signal<string>('');
  isDirty = signal(false);

  catSearch = signal<string>('');
  categoryOptions = computed<SelectOption[]>(() =>
    this.categoryService
      .categories()
      .map((c) => ({ value: c.tb_tyapp_ap_ctgy_id, label: c.display_name })),
  );
  filteredCategories = computed(() => {
    const q = this.catSearch().toLowerCase();
    return q
      ? this.categoryOptions().filter((opt) =>
          opt.label.toLowerCase().includes(q),
        )
      : this.categoryOptions();
  });

  userSearch = signal<string>('');
  userOptions = computed<SelectOption[]>(() =>
    this.userService.users().map((u) => ({
      value: u.user_id,
      label: this.displayNamePipe.transform(u),
    })),
  );
  filteredUsers = computed(() => {
    const q = this.userSearch().toLowerCase();
    return q
      ? this.userOptions().filter((opt) => opt.label.toLowerCase().includes(q))
      : this.userOptions();
  });

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.logService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  isSaveDisabled = signal(true);

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
      const currentlyDirty = JSON.stringify(current) !== original;
      if (this.isDirty() !== currentlyDirty) {
        this.isDirty.set(currentlyDirty);
      }

      const disabled =
        this.logService.loading() ||
        (!!this.currentId && !currentlyDirty) ||
        !current.log_message?.trim() ||
        !current.category_id ||
        !current.log_user ||
        !current.version_date;

      if (this.isSaveDisabled() !== disabled) {
        this.isSaveDisabled.set(disabled);
      }
    }
  }

  displayCategoryName(id: string): string {
    const found = this.categoryOptions().find((opt) => opt.value === id);
    return found ? found.label : '';
  }
  displayUserName(id: string): string {
    const found = this.userOptions().find((opt) => opt.value === id);
    return found ? found.label : '';
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');

    await Promise.all([
      this.logService.fetchAllLogs(),
      this.categoryService.fetchAllCategories(),
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
      label: this.currentId ? 'Save Changes' : 'Create Log',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: '/development/log/list',
      syncStatus: this.syncStatus,
      actions: actions,
    });

    if (this.currentId) {
      const cachedLog = this.logService
        .logs()
        .find((l) => l.tb_tyapp_ap_lg_id === this.currentId);
      if (cachedLog) {
        this.item.set(structuredClone(cachedLog));
        this.originalDataStr.set(JSON.stringify(cachedLog));
        this.catSearch.set(cachedLog.category_id);
        this.userSearch.set(cachedLog.log_user);
      }

      const fresh = await this.logService.fetchLogById(this.currentId);
      this.zone.run(() => {
        if (fresh) {
          this.item.set(structuredClone(fresh));
          this.originalDataStr.set(JSON.stringify(fresh));
          this.catSearch.set(fresh.category_id);
          this.userSearch.set(fresh.log_user);
        } else if (!cachedLog) {
          this.router.navigate(['/development/log/list']);
        }
      });
    } else {
      const logs = this.logService.logs();
      let nextMajor = 1,
        nextMinor = 0,
        nextPatch = 0;
      if (logs.length > 0) {
        const latestLog = logs[0];
        nextMajor = latestLog.version_major;
        nextMinor = latestLog.version_minor + 1;
        nextPatch = 0;
      }

      const newLog: Partial<AppLog> = {
        version_major: nextMajor,
        version_minor: nextMinor,
        version_patch: nextPatch,
        version_date: new Date() as unknown as string,
        log_user: this.authService.userProfile()?.user_id || '',
        category_id: '',
        log_message: '',
        remarks: '',
        status: RecordStatus.Active,
      };
      this.item.set(newLog);
      this.originalDataStr.set(JSON.stringify(newLog));
    }
  }

  bumpMajor() {
    this.item.update((log) =>
      log
        ? {
            ...log,
            version_major: (log.version_major || 0) + 1,
            version_minor: 0,
            version_patch: 0,
          }
        : log,
    );
  }
  bumpMinor() {
    this.item.update((log) =>
      log
        ? {
            ...log,
            version_minor: (log.version_minor || 0) + 1,
            version_patch: 0,
          }
        : log,
    );
  }
  bumpPatch() {
    this.item.update((log) =>
      log ? { ...log, version_patch: (log.version_patch || 0) + 1 } : log,
    );
  }

  async onSave() {
    const data = this.item();
    if (
      !data ||
      !data.log_message?.trim() ||
      !data.category_id ||
      !data.log_user
    )
      return;

    const dateVal = data.version_date as unknown;
    if (dateVal instanceof Date) {
      data.version_date = new Date(
        dateVal.getTime() - dateVal.getTimezoneOffset() * 60000,
      )
        .toISOString()
        .split('T')[0];
    }

    const success = await this.logService.saveLog(data);
    if (success) {
      this.originalDataStr.set(JSON.stringify(data));
      this.isDirty.set(false);
      this.router.navigate(['/development/log/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;
    if (confirm('Are you sure you want to delete this log?')) {
      const success = await this.logService.deleteLog(this.currentId);
      if (success) {
        this.isDirty.set(false);
        this.router.navigate(['/development/log/list']);
      }
    }
  }

  onExport() {
    const data = this.item();
    if (!data || !this.currentId) return;

    const dateVal = data.version_date as unknown;
    const formattedDate =
      dateVal instanceof Date
        ? dateVal.toISOString().split('T')[0]
        : String(dateVal || '');

    const headers = [
      'Log ID',
      'Version',
      'Release Date',
      'Category',
      'Author',
      'Message',
      'Status',
      'Remarks',
    ];

    const rows: string[][] = [
      [
        this.currentId,
        `v${data.version_major}.${data.version_minor}.${data.version_patch}`,
        formattedDate,
        this.displayCategoryName(data.category_id || ''),
        this.displayUserName(data.log_user || ''),
        data.log_message || '',
        data.status === RecordStatus.Active ? 'Published' : 'Draft',
        data.remarks || '',
      ],
    ];

    exportToCsv(
      `Log_Detail_v${data.version_major}.${data.version_minor}.${data.version_patch}`,
      headers,
      rows,
    );
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
