import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { ArticleService } from './article.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { exportToCsv } from '../../../../core/utils/csv-export.util';
import { RecordStatus } from '../../../../core/models/status.enum';
import { formatDate } from '../../../../core/utils/date-time.util';

@Component({
  selector: 'app-article-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './article-list.html',
  styleUrl: './article-list.scss',
})
export class ArticleList implements OnInit, OnDestroy {
  public articleService = inject(ArticleService);
  public userService = inject(UserService);

  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private displayNamePipe = inject(DisplayNamePipe);

  readonly RecordStatus = RecordStatus;

  searchQuery = signal<string>('');
  pageSize = signal<number>(10);
  pageIndex = signal<number>(0);

  rawListVM = computed(() => {
    const articles = this.articleService.articles();
    const users = this.userService.users();

    return articles.map((article) => {
      const user = users.find((u) => u.user_id === article.manage_user_id);
      return {
        ...article,
        manageUserName: user
          ? this.displayNamePipe.transform(user)
          : 'Unknown User',
      };
    });
  });

  filteredListVM = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.rawListVM();
    if (!q) return list;

    return list.filter(
      (item) =>
        item.title?.toLowerCase().includes(q) ||
        item.author?.toLowerCase().includes(q) ||
        item.platform?.toLowerCase().includes(q),
    );
  });

  pagedListVM = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    const end = start + this.pageSize();
    return this.filteredListVM().slice(start, end);
  });

  ngOnInit() {
    const isLoading = computed(
      () => this.articleService.loading() || this.userService.loading(),
    );

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
          label: 'Export',
          icon: 'download',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.onExport(),
        },
        {
          label: 'New Article',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });

    this.articleService.fetchAllArticles();
    this.userService.fetchAllUsers();
  }

  async onRefresh() {
    await this.articleService.fetchAllArticles(true);
    await this.userService.fetchAllUsers(true);
  }

  onSearchChange() {
    this.pageIndex.set(0);
  }

  onPageChange(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  onExport() {
    const articles = this.filteredListVM();
    if (!articles.length) return;

    const headers = [
      'Title',
      'Platform',
      'Author',
      'Publish Date',
      'Manage User',
      'Status',
    ];
    const rows: string[][] = articles.map((a) => [
      a.title || '',
      a.platform || '',
      a.author || '',
      a.publish_date || '',
      a.manageUserName,
      a.status === RecordStatus.Active ? 'Published' : 'Draft',
    ]);

    const dateStr = formatDate(new Date());
    exportToCsv(`Articles_${dateStr}`, headers, rows);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
