import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  NgZone,
  signal,
  computed,
  DoCheck,
  HostListener,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import {
  HeaderService,
  HeaderAction,
} from '../../../../../core/services/header.service';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';
import { AppCategory } from './app-category.model';
import { AppCategoryService } from './app-category.service';
import { RecordStatus } from '../../../../../core/models/status.enum';

@Component({
  selector: 'app-category-edit',
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
  ],
  templateUrl: './app-category-edit.html',
})
export class AppCategoryEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  public categoryService = inject(AppCategoryService);
  private headerService = inject(HeaderService);

  readonly RecordStatus = RecordStatus;

  item = signal<Partial<AppCategory> | null>(null);
  currentId: string | null = null;

  originalDataStr = signal<string>('');

  isDirty = signal(false);

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.categoryService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  isSaveDisabled = signal(true);

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
      label: this.currentId ? 'Save Changes' : 'Create Category',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: '/development/category/list',
      syncStatus: this.syncStatus,
      actions: actions,
    });

    if (this.currentId) {
      const cachedCat = this.categoryService
        .categories()
        .find((c) => c.tb_tyapp_ap_ctgy_id === this.currentId);
      if (cachedCat) {
        this.item.set(structuredClone(cachedCat));
        this.originalDataStr.set(JSON.stringify(cachedCat));
      }

      const freshCat = await this.categoryService.fetchCategoryById(
        this.currentId,
      );

      this.zone.run(() => {
        if (freshCat) {
          this.item.set(structuredClone(freshCat));
          this.originalDataStr.set(JSON.stringify(freshCat));
        } else if (!cachedCat) {
          this.router.navigate(['/development/category/list']);
        }
      });
    } else {
      const newCat = {
        display_name: '',
        name_en: '',
        name_zh: '',
        status: RecordStatus.Active,
        remarks: '',
      };
      this.item.set(newCat);
      this.originalDataStr.set(JSON.stringify(newCat));
    }
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
      const currentlyDirty = JSON.stringify(current) !== original;
      if (this.isDirty() !== currentlyDirty) {
        this.isDirty.set(currentlyDirty);
      }

      const disabled =
        this.categoryService.loading() ||
        (!!this.currentId && !currentlyDirty) ||
        !current.display_name?.trim();

      if (this.isSaveDisabled() !== disabled) {
        this.isSaveDisabled.set(disabled);
      }
    }
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.display_name?.trim()) return;

    const success = await this.categoryService.saveCategory(data);
    if (success) {
      this.originalDataStr.set(JSON.stringify(data));
      this.isDirty.set(false);
      this.router.navigate(['/development/category/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;

    if (
      confirm(
        'Are you sure you want to delete this category? This action might be irreversible.',
      )
    ) {
      const success = await this.categoryService.deleteCategory(this.currentId);
      if (success) {
        this.router.navigate(['/development/category/list']);
      }
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  onExport() {
    const c = this.item();
    if (!c || !this.currentId) return;

    const headers = [
      'Category ID',
      'Display Name',
      'English Name',
      'Chinese Name',
      'Status',
      'Internal Remarks',
    ];
    const rows = [
      [
        this.currentId,
        c.display_name || '',
        c.name_en || '',
        c.name_zh || '',
        c.status === RecordStatus.Active ? 'Active' : 'Inactive',
        c.remarks || '',
      ],
    ];

    exportToCsv(
      `Category_Detail_${c.display_name || this.currentId}`,
      headers,
      rows,
    );
  }
}
