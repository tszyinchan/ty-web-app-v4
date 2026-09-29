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
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { YyemsFinancialAccount } from './yyems.model';
import { YyemsService } from './yyems.service';

const JOINT = '';

interface AccountForm {
  tb_tyapp_yfa_id?: string;
  display_name: string;
  currency: string;
  ownerKey: string;
}

@Component({
  selector: 'app-yyems-financial-account-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    DisplayNamePipe,
  ],
  templateUrl: './yyems-financial-account-edit.html',
})
export class YyemsFinancialAccountEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private header = inject(HeaderService);
  readonly yyems = inject(YyemsService);
  readonly users = inject(UserService);

  currentId: string | null = null;
  item = signal<AccountForm | null>(null);
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
      !current.display_name.trim() ||
      !this.yyems.currencies().some((row) => row.code === current.currency);
    if (this.isSaveDisabled() !== disabled) this.isSaveDisabled.set(disabled);
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');
    await Promise.all([
      this.yyems.fetchDicts(),
      this.users.fetchAllUsers(),
      this.users.fetchGroups(),
    ]);
    if (this.currentId) {
      const found = this.yyems
        .financialAccounts()
        .find((row) => row.tb_tyapp_yfa_id === this.currentId);
      if (!found) {
        void this.router.navigateByUrl('/yyems/wallets/accounts/list');
        return;
      }
      this.item.set(this.toForm(found));
    } else {
      this.item.set({
        display_name: '',
        currency: this.yyems.currencies()[0]?.code ?? '',
        ownerKey: JOINT,
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
      label: this.currentId ? 'Save Changes' : 'Create Account',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => void this.onSave(),
    });
    this.header.setConfig({
      backLink: '/yyems/wallets/accounts/list',
      title: this.currentId ? 'Edit account' : 'New account',
      syncStatus: this.syncStatus,
      actions,
    });
  }

  private toForm(row: YyemsFinancialAccount): AccountForm {
    return {
      tb_tyapp_yfa_id: row.tb_tyapp_yfa_id,
      display_name: row.display_name,
      currency: row.currency,
      ownerKey: row.owner_user_id ?? JOINT,
    };
  }

  async onSave() {
    const form = this.item();
    if (!form) return;
    const saved = await this.yyems.saveFinancialAccount({
      tb_tyapp_yfa_id: form.tb_tyapp_yfa_id,
      display_name: form.display_name.trim(),
      currency: form.currency,
      owner_user_id: form.ownerKey || null,
      status: RecordStatus.Active,
    });
    if (!saved) return;
    await this.yyems.fetchDicts(true);
    this.originalDataStr.set(JSON.stringify(this.item()));
    this.isDirty.set(false);
    void this.router.navigateByUrl('/yyems/wallets/accounts/list');
  }

  async onDelete() {
    if (!this.currentId) return;
    if (!confirm('Soft-delete this account? Wallets pointing at it stay until you change them.')) {
      return;
    }
    const ok = await this.yyems.deleteFinancialAccount(this.currentId);
    if (ok) {
      await this.yyems.fetchDicts(true);
      void this.router.navigateByUrl('/yyems/wallets/accounts/list');
    }
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
