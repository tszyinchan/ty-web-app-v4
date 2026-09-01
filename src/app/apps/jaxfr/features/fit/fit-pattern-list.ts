import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { FitService } from './fit.service';
import { RecordStatus } from '../../../../core/models/status.enum';

type FitPatternListItemVm = {
  tb_tyapp_fit_ssn_id: string;
  session_title: string;
  location: string | null;
  remarks: string | null;
  status: number;
  displayTitle: string;
  displaySubtitle: string;
};

@Component({
  selector: 'app-fit-pattern-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './fit-pattern-list.html',
  styleUrl: './fit-pattern-list.scss',
})
export class FitPatternList implements OnInit, OnDestroy {
  public fitService = inject(FitService);

  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly RecordStatus = RecordStatus;

  listVM = computed<FitPatternListItemVm[]>(() => {
    return this.fitService.patterns().map((session) => {
      const title = session.session_title?.trim() || '未命名課表';
      const subtitleParts = [
        session.location?.trim(),
        session.remarks?.trim(),
      ].filter(Boolean);

      return {
        tb_tyapp_fit_ssn_id: session.tb_tyapp_fit_ssn_id,
        session_title: session.session_title || '',
        location: session.location || null,
        remarks: session.remarks || null,
        status: session.status,
        displayTitle: title,
        displaySubtitle:
          subtitleParts.length > 0
            ? subtitleParts.join(' · ')
            : '尚未填地點或備註',
      };
    });
  });

  ngOnInit() {
    const isLoading = computed(() => this.fitService.loading());

    this.headerService.setConfig({
      actions: [
        {
          label: 'List',
          icon: 'list',
          type: 'secondary',
          onClick: () =>
            this.router.navigate(['../list'], { relativeTo: this.route }),
        },
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.onRefresh(),
        },
        {
          label: 'New Pattern',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () => this.router.navigate(['/fit/patterns/new']),
        },
      ],
    });

    this.fitService.fetchPatterns();
  }

  async onRefresh() {
    await this.fitService.fetchPatterns(true);
  }

  async onApplyToday(patternId: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    const newId = await this.fitService.applyPatternToToday(patternId);
    if (newId) {
      this.router.navigate(['/fit/edit', newId], {
        queryParams: { returnUrl: '/fit/list' },
      });
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
