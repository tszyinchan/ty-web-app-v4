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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { RecordStatus } from '../../../../core/models/status.enum';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { YyemsVendorCategory } from './yyems.model';
import { YyemsService } from './yyems.service';

@Component({
  selector: 'app-yyems-vendor-category-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './yyems-vendor-category-edit.html',
})
export class YyemsVendorCategoryEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private header = inject(HeaderService);
  readonly yyems = inject(YyemsService);

  currentId: string | null = null;
  item = signal<Partial<YyemsVendorCategory> | null>(null);
  originalDataStr = signal('');
  isDirty = signal(false);
  isSaveDisabled = signal(true);

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.yyems.busy()) return 'loading';
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
    if (!current || !original) return;
    const currentlyDirty = JSON.stringify(current) !== original;
    if (this.isDirty() !== currentlyDirty) this.isDirty.set(currentlyDirty);
    const disabled =
      this.yyems.busy() ||
      (!!this.currentId && !currentlyDirty) ||
      !current.level1?.trim() ||
      !current.level2?.trim() ||
      !current.level3?.trim();
    if (this.isSaveDisabled() !== disabled) this.isSaveDisabled.set(disabled);
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');
    await this.yyems.fetchDicts();
    if (this.currentId) {
      const found = this.yyems
        .vendorCategories()
        .find((row) => row.tb_tyapp_yhvc_id === this.currentId);
      if (!found) {
        void this.router.navigateByUrl('/yyems/vendors/categories/list');
        return;
      }
      this.item.set({ ...found });
    } else {
      this.item.set({
        level1: '',
        level2: '',
        level3: '',
        display_name: '',
        status: RecordStatus.Active,
      });
    }
    this.originalDataStr.set(JSON.stringify(this.item()));
    const actions: HeaderAction[] = [];
    if (this.currentId) {
      actions.push({
        label: 'Delete',
        icon: 'delete_outline',
        type: 'secondary',
        onClick: () => void this.onDelete(),
      });
    }
    actions.push({
      label: this.currentId ? 'Save Changes' : 'Create Category',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => void this.onSave(),
    });
    this.header.setConfig({
      backLink: '/yyems/vendors/categories/list',
      title: this.currentId ? 'Edit vendor category' : 'New vendor category',
      syncStatus: this.syncStatus,
      actions,
    });
  }

  async onSave() {
    const row = this.item();
    if (!row) return;
    const level1 = row.level1?.trim() || '';
    const level2 = row.level2?.trim() || '';
    const level3 = row.level3?.trim() || '';
    const saved = await this.yyems.saveVendorCategory({
      ...row,
      level1,
      level2,
      level3,
      display_name:
        row.display_name?.trim() || [level1, level2, level3].filter(Boolean).join(' / '),
      status: RecordStatus.Active,
    });
    if (!saved) return;
    await this.yyems.fetchDicts(true);
    this.originalDataStr.set(JSON.stringify(this.item()));
    this.isDirty.set(false);
    void this.router.navigateByUrl('/yyems/vendors/categories/list');
  }

  async onDelete() {
    if (!this.currentId) return;
    if (!confirm('Soft-delete this vendor category?')) return;
    const ok = await this.yyems.deleteVendorCategory(this.currentId);
    if (ok) {
      await this.yyems.fetchDicts(true);
      void this.router.navigateByUrl('/yyems/vendors/categories/list');
    }
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
