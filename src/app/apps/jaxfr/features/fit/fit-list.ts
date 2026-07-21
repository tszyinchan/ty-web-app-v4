import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { FitService } from './fit.service';

import {
  getWeekRange,
  groupItemsByPeriod,
} from '../../../../core/utils/date-time.util';

type FitListItemVm = {
  tb_tyapp_fit_ssn_id: string;
  session_date: string;
  session_title: string;
  location: string | null;
  remarks: string | null;
  status: number;
  displayTitle: string;
  displaySubtitle: string;
  displayMeta: string;
};

type FitListGroupVm = {
  periodLabel: string;
  items: FitListItemVm[];
};

@Component({
  selector: 'app-fit-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './fit-list.html',
  styleUrl: './fit-list.scss',
})
export class FitList implements OnInit, OnDestroy {
  public fitService = inject(FitService);

  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  listVM = computed<FitListItemVm[]>(() => {
    return this.fitService.sessions().map((session) => {
      const title = session.session_title?.trim() || 'Untitled Session';

      const subtitleParts = [
        session.location?.trim(),
        session.remarks?.trim(),
      ].filter(Boolean);

      const displaySubtitle =
        subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'No extra notes';

      return {
        tb_tyapp_fit_ssn_id: session.tb_tyapp_fit_ssn_id,
        session_date: session.session_date,
        session_title: session.session_title || '',
        location: session.location || null,
        remarks: session.remarks || null,
        status: session.status,
        displayTitle: session.session_date,
        displaySubtitle,
        displayMeta: title,
      };
    });
  });

  groupedListVM = computed<FitListGroupVm[]>(() => {
    // 🌟 直接呼叫你完美處理過時區的核心工具
    return groupItemsByPeriod(this.listVM(), (item) => {
      const range = getWeekRange(item.session_date);
      return range ? range.label : 'Unknown Week';
    });
  });

  ngOnInit() {
    const isLoading = computed(() => this.fitService.loading());

    this.headerService.setConfig({
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.onRefresh(),
        },
        {
          label: 'New Session',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });

    this.fitService.fetchAllSessions();
  }

  async onRefresh() {
    await this.fitService.fetchAllSessions(true);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}