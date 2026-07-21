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
import { UserService } from '../../user/user.service';
import { WorkEmployment } from './work-employment.model';
import { WorkEmploymentService } from './work-employment.service';
import { SelectOption } from '../../../../../core/models/common.model';
import { DisplayNamePipe } from '../../../../../core/pipes/display-name.pipe';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';

@Component({
  selector: 'app-work-employment-edit',
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
  ],
  providers: [DisplayNamePipe],
  templateUrl: './work-employment-edit.html',
})
export class WorkEmploymentEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);

  public workEmploymentService = inject(WorkEmploymentService);
  public userService = inject(UserService);
  public authService = inject(AuthService);

  item = signal<Partial<WorkEmployment> | null>(null);
  currentId: string | null = null;
  originalDataStr = signal<string>('');

  isDirty = signal(false);
  isSaveDisabled = signal(true);

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
    if (this.workEmploymentService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

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
        this.workEmploymentService.loading() ||
        (!!this.currentId && !currentlyDirty) ||
        !current.employer_name_en?.trim() ||
        !current.position_title_en?.trim() ||
        !current.workload_type?.trim() ||
        !current.employment_type?.trim() ||
        !current.user_id;

      if (this.isSaveDisabled() !== disabled) {
        this.isSaveDisabled.set(disabled);
      }
    }
  }

  displayUserName(id: string): string {
    const found = this.userOptions().find((opt) => opt.value === id);
    return found ? found.label : '';
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');

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
      label: this.currentId ? 'Save Changes' : 'Create Record',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: '/work/employment/list',
      syncStatus: this.syncStatus,
      actions: actions,
    });

    Promise.all([
      this.workEmploymentService.fetchAllWorkEmployments(),
      this.userService.fetchAllUsers(),
    ]);

    if (this.currentId) {
      const cachedEmp = this.workEmploymentService
        .workEmployments()
        .find((e) => e.tb_tyapp_wk_mplm_id === this.currentId);

      if (cachedEmp) {
        this.item.set(structuredClone(cachedEmp));
        this.originalDataStr.set(JSON.stringify(cachedEmp));
        this.userSearch.set(cachedEmp.user_id);
      }

      const freshEmp = await this.workEmploymentService.fetchWorkEmploymentById(
        this.currentId,
      );

      this.zone.run(() => {
        if (freshEmp) {
          this.item.set(structuredClone(freshEmp));
          this.originalDataStr.set(JSON.stringify(freshEmp));
          this.userSearch.set(freshEmp.user_id);
        } else if (!cachedEmp) {
          this.router.navigate(['/work/employment/list']);
        }
      });
    } else {
      const newEmp: Partial<WorkEmployment> = {
        employer_name_en: '',
        employer_name_zh: '',
        position_title_en: '',
        position_title_zh: '',
        workload_type: 'Full-time',
        employment_type: 'Permanent',
        remarks: '',
        user_id: this.authService.userProfile()?.user_id || '',
        status: 1,
      };
      this.item.set(newEmp);
      this.originalDataStr.set(JSON.stringify(newEmp));
      this.userSearch.set(newEmp.user_id!);
    }
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.employer_name_en?.trim() || !data.user_id) return;

    const success = await this.workEmploymentService.saveWorkEmployment(data);
    if (success) {
      this.originalDataStr.set(JSON.stringify(data));
      this.isDirty.set(false);
      this.router.navigate(['/work/employment/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;
    if (confirm('Are you sure you want to delete this employment record?')) {
      const success = await this.workEmploymentService.deleteWorkEmployment(
        this.currentId,
      );
      if (success) {
        this.isDirty.set(false);
        this.router.navigate(['/work/employment/list']);
      }
    }
  }

  onExport() {
    const data = this.item();
    if (!data || !this.currentId) return;

    const headers = [
      'Record ID',
      'Employer (EN)',
      'Employer (ZH)',
      'Position (EN)',
      'Position (ZH)',
      'Workload',
      'Type',
      'User',
      'Status',
      'Remarks',
    ];
    const rows: string[][] = [
      [
        this.currentId,
        data.employer_name_en || '',
        data.employer_name_zh || '',
        data.position_title_en || '',
        data.position_title_zh || '',
        data.workload_type || '',
        data.employment_type || '',
        this.displayUserName(data.user_id || ''),
        data.status === 1 ? 'Active' : 'Inactive',
        data.remarks || '',
      ],
    ];

    exportToCsv(`Employment_Detail_${data.employer_name_en}`, headers, rows);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
