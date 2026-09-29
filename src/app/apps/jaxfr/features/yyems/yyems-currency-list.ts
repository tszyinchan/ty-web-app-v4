import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { YyemsService } from './yyems.service';

@Component({
  selector: 'app-yyems-currency-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './yyems-currency-list.html',
})
export class YyemsCurrencyList implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private header = inject(HeaderService);
  private router = inject(Router);

  ngOnInit() {
    const isLoading = computed(() => this.yyems.dictsLoading());
    this.header.setConfig({
      backLink: '/yyems',
      title: 'Currencies',
      actions: [
        {
          label: 'New Currency',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigateByUrl('/yyems/wallets/currencies/new'),
        },
      ],
    });
    void this.yyems.fetchDicts();
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
