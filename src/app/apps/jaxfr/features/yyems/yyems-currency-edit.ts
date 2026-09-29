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

import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { YyemsCurrency } from './yyems.model';
import { YyemsService } from './yyems.service';

@Component({
  selector: 'app-yyems-currency-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './yyems-currency-edit.html',
})
export class YyemsCurrencyEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private header = inject(HeaderService);
  readonly yyems = inject(YyemsService);

  currentCode: string | null = null;
  item = signal<YyemsCurrency | null>(null);
  originalDataStr = signal('');
  isDirty = signal(false);
  isSaveDisabled = signal(true);

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.yyems.busy()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentCode) return 'up-to-date';
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
      (!!this.currentCode && !currentlyDirty) ||
      !current.code.trim() ||
      !current.symbol.trim();
    if (this.isSaveDisabled() !== disabled) this.isSaveDisabled.set(disabled);
  }

  async ngOnInit() {
    this.currentCode = this.route.snapshot.paramMap.get('code');
    await this.yyems.fetchDicts();
    if (this.currentCode) {
      const found = this.yyems
        .currencies()
        .find((row) => row.code === this.currentCode);
      if (!found) {
        void this.router.navigateByUrl('/yyems/wallets/currencies/list');
        return;
      }
      this.item.set({ ...found });
    } else {
      this.item.set({ code: '', symbol: '' });
    }
    this.originalDataStr.set(JSON.stringify(this.item()));
    const actions: HeaderAction[] = [
      {
        label: this.currentCode ? 'Save Changes' : 'Create Currency',
        icon: 'check',
        type: 'primary',
        disabled: this.isSaveDisabled,
        onClick: () => void this.onSave(),
      },
    ];
    this.header.setConfig({
      backLink: '/yyems/wallets/currencies/list',
      title: this.currentCode ? 'Edit currency' : 'New currency',
      syncStatus: this.syncStatus,
      actions,
    });
  }

  async onSave() {
    const row = this.item();
    if (!row) return;
    const saved = await this.yyems.saveCurrency(
      { code: row.code.trim().toUpperCase(), symbol: row.symbol.trim() },
      !this.currentCode,
    );
    if (!saved) return;
    await this.yyems.fetchDicts(true);
    this.item.set({ ...saved });
    this.currentCode = saved.code;
    this.originalDataStr.set(JSON.stringify(this.item()));
    this.isDirty.set(false);
    void this.router.navigate(['/yyems/wallets/currencies/edit', saved.code], {
      replaceUrl: true,
    });
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
