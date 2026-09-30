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
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { RecordStatus } from '../../../../core/models/status.enum';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { YyemsFxRate } from './yyems.model';
import { YyemsService } from './yyems.service';

@Component({
  selector: 'app-yyems-fx-rate-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './yyems-fx-rate-edit.html',
})
export class YyemsFxRateEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private header = inject(HeaderService);
  readonly yyems = inject(YyemsService);

  currentId: string | null = null;
  item = signal<Partial<YyemsFxRate> | null>(null);
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
    const year = Number(current.year);
    const rate = Number(current.to_cad);
    const disabled =
      this.yyems.busy() ||
      (!!this.currentId && !currentlyDirty) ||
      !current.currency ||
      !Number.isInteger(year) ||
      year < 1990 ||
      year > 2100 ||
      !Number.isFinite(rate) ||
      rate <= 0;
    if (this.isSaveDisabled() !== disabled) this.isSaveDisabled.set(disabled);
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');
    await this.yyems.fetchDicts();
    if (this.currentId) {
      const found = this.yyems
        .fxRates()
        .find((row) => row.tb_tyapp_yhfx_id === this.currentId);
      if (!found) {
        void this.router.navigateByUrl('/yyems/wallets/fx/list');
        return;
      }
      this.item.set({ ...found });
    } else {
      this.item.set({
        currency: this.yyems.currencies().find((row) => row.code !== 'CAD')?.code ?? '',
        year: new Date().getFullYear(),
        source: '',
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
      label: this.currentId ? 'Save Changes' : 'Create Rate',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => void this.onSave(),
    });
    this.header.setConfig({
      backLink: '/yyems/wallets/fx/list',
      title: this.currentId ? 'Edit FX rate' : 'New FX rate',
      syncStatus: this.syncStatus,
      actions,
    });
  }

  async onSave() {
    const row = this.item();
    if (!row) return;
    const saved = await this.yyems.saveFxRate({
      ...row,
      currency: row.currency,
      year: Number(row.year),
      to_cad: Number(row.to_cad),
      source: row.source?.trim() || null,
      status: RecordStatus.Active,
    });
    if (!saved) return;
    await this.yyems.fetchDicts(true);
    this.originalDataStr.set(JSON.stringify(this.item()));
    this.isDirty.set(false);
    void this.router.navigateByUrl('/yyems/wallets/fx/list');
  }

  async onDelete() {
    if (!this.currentId) return;
    if (!confirm('Soft-delete this FX rate?')) return;
    const ok = await this.yyems.deleteFxRate(this.currentId);
    if (ok) {
      await this.yyems.fetchDicts(true);
      void this.router.navigateByUrl('/yyems/wallets/fx/list');
    }
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
