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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { RecordStatus } from '../../../../core/models/status.enum';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { YyemsItem } from './yyems.model';
import { YyemsService } from './yyems.service';

@Component({
  selector: 'app-yyems-item-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
  ],
  templateUrl: './yyems-item-edit.html',
})
export class YyemsItemEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private header = inject(HeaderService);
  readonly yyems = inject(YyemsService);

  currentId: string | null = null;
  item = signal<Partial<YyemsItem> | null>(null);
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
      !current.category_id ||
      !current.name_zh?.trim();
    if (this.isSaveDisabled() !== disabled) this.isSaveDisabled.set(disabled);
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');
    await this.yyems.fetchDicts();
    if (this.currentId) {
      const found = this.yyems.items().find((i) => i.tb_tyapp_yit_id === this.currentId);
      if (!found) {
        void this.router.navigateByUrl('/yyems/items/list');
        return;
      }
      this.item.set({ ...found });
    } else {
      this.item.set({
        category_id: '',
        name_zh: '',
        name_en: '',
        food_category: '',
        description: '',
        plan_buy: false,
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
      label: this.currentId ? 'Save Changes' : 'Create Item',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => void this.onSave(),
    });
    this.header.setConfig({
      backLink: '/yyems/items/list',
      title: this.currentId ? 'Edit item' : 'New item',
      syncStatus: this.syncStatus,
      actions,
    });
  }

  async onSave() {
    const row = this.item();
    if (!row) return;
    const saved = await this.yyems.saveItem({
      ...row,
      name_zh: row.name_zh?.trim() || '',
      name_en: row.name_en?.trim() || null,
      food_category: row.food_category?.trim() || null,
      description: row.description?.trim() || null,
      status: RecordStatus.Active,
    });
    if (!saved) return;
    await this.yyems.fetchDicts(true);
    this.originalDataStr.set(JSON.stringify(this.item()));
    this.isDirty.set(false);
    void this.router.navigateByUrl('/yyems/items/list');
  }

  async onDelete() {
    if (!this.currentId) return;
    if (!confirm('Soft-delete this item?')) return;
    const ok = await this.yyems.deleteItem(this.currentId);
    if (ok) {
      await this.yyems.fetchDicts(true);
      void this.router.navigateByUrl('/yyems/items/list');
    }
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
