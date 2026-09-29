import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { YyemsService } from './yyems.service';

@Component({
  selector: 'app-yyems-vendor-category-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './yyems-vendor-category-list.html',
})
export class YyemsVendorCategoryList implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private header = inject(HeaderService);
  private router = inject(Router);

  ngOnInit() {
    const isLoading = computed(() => this.yyems.dictsLoading());
    this.header.setConfig({
      backLink: '/yyems',
      title: 'Vendor categories',
      actions: [
        {
          label: 'New Category',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigateByUrl('/yyems/vendors/categories/new'),
        },
      ],
    });
    void this.yyems.fetchDicts();
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
