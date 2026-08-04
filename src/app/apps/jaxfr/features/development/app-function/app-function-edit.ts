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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { SelectOption } from '../../../../../core/models/common.model';
import {
  HeaderService,
  HeaderAction,
} from '../../../../../core/services/header.service';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';
import { AppCategoryService } from '../app-category/app-category.service';
import { AppFunction } from './app-function.model';
import { AppFunctionService } from './app-function.service';
import { RecordStatus } from '../../../../../core/models/status.enum';

@Component({
  selector: 'app-function-edit',
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
  templateUrl: './app-function-edit.html',
})
export class AppFunctionEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  public functionService = inject(AppFunctionService);
  public categoryService = inject(AppCategoryService);
  private headerService = inject(HeaderService);

  readonly RecordStatus = RecordStatus;

  item = signal<Partial<AppFunction> | null>(null);
  currentId: string | null = null;

  originalDataStr = signal<string>('');

  categorySearchQuery = signal<string>('');
  categoryBlurred = signal(false);

  categoryOptions = computed<SelectOption[]>(() =>
    this.categoryService.categories().map((c) => ({
      value: c.tb_tyapp_ap_ctgy_id,
      label: c.display_name,
    })),
  );

  filteredCategories = computed(() => {
    const search = String(this.categorySearchQuery() || '').toLowerCase();
    const options = this.categoryOptions();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(search) ||
        String(opt.value) === search,
    );
  });

  isCategoryValid = computed(() => {
    const id = this.item()?.category_id;
    if (!id) return false;
    return this.categoryOptions().some((opt) => opt.value === id);
  });

  showCategoryError = computed(
    () => this.categoryBlurred() && !this.isCategoryValid(),
  );

  displayCategoryName(id: string): string {
    if (!id) return '';
    const found = this.categoryOptions().find((opt) => opt.value === id);
    return found ? found.label : '';
  }

  isDirty = signal(false);

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.functionService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  isSaveDisabled = signal(true);

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');
    await this.categoryService.fetchAllCategories();

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
      label: this.currentId ? 'Save Changes' : 'Create Function',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: '/development/function/list',
      syncStatus: this.syncStatus,
      actions: actions,
    });

    if (this.currentId) {
      const fresh = await this.functionService.fetchFunctionById(
        this.currentId,
      );
      this.zone.run(() => {
        if (fresh) {
          this.item.set(structuredClone(fresh));
          this.originalDataStr.set(JSON.stringify(fresh));
          this.categorySearchQuery.set(fresh.category_id);
        } else {
          this.router.navigate(['/development/function/list']);
        }
      });
    } else {
      const newFunc = {
        function_name: '',
        category_id: '',
        description: '',
        remarks: '',
        status: RecordStatus.Active,
      };
      this.item.set(newFunc);
      this.originalDataStr.set(JSON.stringify(newFunc));
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

      const categoryId = current.category_id;
      const categoryValid =
        !!categoryId &&
        this.categoryOptions().some((opt) => opt.value === categoryId);

      const disabled =
        this.functionService.loading() ||
        (!!this.currentId && !currentlyDirty) ||
        !current.function_name?.trim() ||
        !categoryValid;

      if (this.isSaveDisabled() !== disabled) {
        this.isSaveDisabled.set(disabled);
      }
    }
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.function_name?.trim() || !this.isCategoryValid()) {
      this.categoryBlurred.set(true);
      return;
    }

    const success = await this.functionService.saveFunction(data);
    if (success) {
      this.originalDataStr.set(JSON.stringify(data));
      this.isDirty.set(false);
      this.router.navigate(['/development/function/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;
    if (confirm('Are you sure you want to delete this function?')) {
      const success = await this.functionService.deleteFunction(this.currentId);
      if (success) this.router.navigate(['/development/function/list']);
    }
  }

  onExport() {
    const data = this.item();
    if (!data || !this.currentId) return;

    const headers = [
      'Function ID',
      'Function Name',
      'Category Name',
      'Description',
      'Remarks',
      'Status',
    ];
    const rows = [
      [
        this.currentId || '',
        data.function_name || '',
        this.displayCategoryName(data.category_id || ''),
        data.description || '',
        data.remarks || '',
        data.status === RecordStatus.Active ? 'Active' : 'Inactive',
      ],
    ];

    exportToCsv(
      `Function_Detail_${data.function_name || this.currentId}`,
      headers,
      rows,
    );
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
