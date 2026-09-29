import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';

import { formatUserDisplayName } from '../../../../core/pipes/display-name.pipe';
import { HeaderService } from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { YyemsService } from './yyems.service';

@Component({
  selector: 'app-yyems-financial-account-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './yyems-financial-account-list.html',
})
export class YyemsFinancialAccountList implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private users = inject(UserService);
  private header = inject(HeaderService);
  private router = inject(Router);

  rows = computed(() => {
    const people = this.users.users();
    return this.yyems.financialAccounts().map((account) => ({
      account,
      owner: account.owner_user_id
        ? formatUserDisplayName(
            people.find((user) => user.user_id === account.owner_user_id),
          )
        : 'Joint',
    }));
  });

  ngOnInit() {
    const isLoading = computed(
      () => this.yyems.dictsLoading() || this.users.loading(),
    );
    this.header.setConfig({
      backLink: '/yyems',
      title: 'Accounts',
      actions: [
        {
          label: 'New Account',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigateByUrl('/yyems/wallets/accounts/new'),
        },
      ],
    });
    void this.users.fetchAllUsers();
    void this.yyems.fetchDicts();
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
