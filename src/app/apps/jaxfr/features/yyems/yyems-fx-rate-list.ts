import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { YyemsService } from './yyems.service';

@Component({
  selector: 'app-yyems-fx-rate-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './yyems-fx-rate-list.html',
})
export class YyemsFxRateList implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private header = inject(HeaderService);
  private router = inject(Router);

  rows = computed(() =>
    [...this.yyems.fxRates()].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return a.currency.localeCompare(b.currency);
    }),
  );

  ngOnInit() {
    const isLoading = computed(() => this.yyems.dictsLoading());
    this.header.setConfig({
      backLink: '/yyems',
      title: 'FX rates',
      actions: [
        {
          label: 'New Rate',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () => this.router.navigateByUrl('/yyems/wallets/fx/new'),
        },
      ],
    });
    void this.yyems.fetchDicts();
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
