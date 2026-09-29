import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { YyemsService } from './yyems.service';

@Component({
  selector: 'app-yyems-item-category-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './yyems-item-category-list.html',
})
export class YyemsItemCategoryList implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private header = inject(HeaderService);
  private router = inject(Router);

  ngOnInit() {
    const isLoading = computed(() => this.yyems.dictsLoading());
    this.header.setConfig({
      backLink: '/yyems',
      title: 'Product categories',
      actions: [
        {
          label: 'New Category',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () => this.router.navigateByUrl('/yyems/items/categories/new'),
        },
      ],
    });
    void this.yyems.fetchDicts();
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
