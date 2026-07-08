import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  DoCheck,
  HostListener,
  inject,
  NgZone,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import {
  HeaderService,
  HeaderAction,
} from '../../core/services/header.service';
import { UserService } from '../user/user.service';
import { Article } from './article.model';
import { ArticleService } from './article.service';
import { SelectOption } from '../../core/models/common.model';
import { DisplayNamePipe } from '../../core/pipes/display-name.pipe';
import { exportToCsv } from '../../core/utils/csv-export.util';
import { NotificationService } from '../../core/services/notification.service';

type ArticleEditVm = Omit<Article, 'publish_date'> & { 
  publish_date: Date | string | null 
};

@Component({
  selector: 'app-article-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatAutocompleteModule,
  ],
  providers: [provideNativeDateAdapter(), DisplayNamePipe],
  templateUrl: './article-edit.html',
})
export class ArticleEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);
  private notification = inject(NotificationService);

  public articleService = inject(ArticleService);
  public userService = inject(UserService);
  public authService = inject(AuthService);

  item = signal<Partial<Article> | null>(null);
  currentId: string | null = null;
  originalDataStr = signal<string>('');

  returnUrl: string = '/article/list';
  rawArticleText = signal<string>('');

  isDirty = signal(false);
  isSaveDisabled = signal(true);

  userSearch = signal<string>('');
  userOptions = computed<SelectOption[]>(() =>
    this.userService.users().map((u) => ({
      value: u.user_id,
      label: this.displayNamePipe.transform(u),
    })),
  );
  filteredUsers = computed(() => {
    const q = this.userSearch().toLowerCase();
    return q
      ? this.userOptions().filter((opt) => opt.label.toLowerCase().includes(q))
      : this.userOptions();
  });

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.articleService.loading()) return 'loading';
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

    if (current && original) {
      const currentlyDirty = JSON.stringify(current) !== original;
      if (this.isDirty() !== currentlyDirty) {
        this.isDirty.set(currentlyDirty);
      }

      const disabled =
        this.articleService.loading() ||
        (!!this.currentId && !currentlyDirty) ||
        !current.title?.trim() ||
        !current.author?.trim() ||
        !current.platform?.trim() ||
        !current.content?.trim() ||
        !current.publish_date ||
        !current.manage_user_id;

      if (this.isSaveDisabled() !== disabled) {
        this.isSaveDisabled.set(disabled);
      }
    }
  }

  displayUserName(id: string): string {
    const found = this.userOptions().find((opt) => opt.value === id);
    return found ? found.label : '';
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');

    this.returnUrl =
      this.route.snapshot.queryParamMap.get('returnUrl') || '/article/list';

    await Promise.all([
      this.articleService.fetchAllArticles(),
      this.userService.fetchAllUsers(),
    ]);

    const actions: HeaderAction[] = [];
    if (this.currentId) {
      actions.push({
        label: 'Export',
        icon: 'download',
        type: 'secondary',
        onClick: () => this.onExport(),
      });
      actions.push({
        label: 'Delete',
        icon: 'delete_outline',
        type: 'secondary',
        onClick: () => this.onDelete(),
      });
    }
    actions.push({
      label: this.currentId ? 'Save Changes' : 'Create Article',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: this.returnUrl,
      syncStatus: this.syncStatus,
      actions: actions,
    });

    if (this.currentId) {
      const cached = this.articleService
        .articles()
        .find((a) => a.tb_tyapp_atcl_id === this.currentId);
      if (cached) {
        this.item.set(structuredClone(cached));
        this.originalDataStr.set(JSON.stringify(cached));
        this.userSearch.set(cached.manage_user_id);
      }

      const fresh = await this.articleService.fetchArticleById(this.currentId);
      this.zone.run(() => {
        if (fresh) {
          this.item.set(structuredClone(fresh));
          this.originalDataStr.set(JSON.stringify(fresh));
          this.userSearch.set(fresh.manage_user_id);
        } else if (!cached) {
          this.router.navigate(['/article/list']);
        }
      });
    } else {
      const newArticle: Partial<Article> = {
        title: '',
        author: '',
        platform: '',
        content: '',
        url_link: '',
        remarks: '',
        publish_date: new Date() as unknown as string,
        manage_user_id: this.authService.userProfile()?.user_id || '',
        status: 1,
      };
      this.item.set(newArticle);
      this.originalDataStr.set(JSON.stringify(newArticle));
    }
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.title?.trim() || !data.manage_user_id) return;

    const dateVal = data.publish_date as unknown;
    if (dateVal instanceof Date) {
      data.publish_date = new Date(
        dateVal.getTime() - dateVal.getTimezoneOffset() * 60000,
      )
        .toISOString()
        .split('T')[0];
    }

    const success = await this.articleService.saveArticle(data);
    if (success) {
      this.originalDataStr.set(JSON.stringify(data));
      this.isDirty.set(false);
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  async onDelete() {
    if (!this.currentId) return;
    if (confirm('Are you sure you want to delete this article?')) {
      const success = await this.articleService.deleteArticle(this.currentId);
      if (success) {
        this.isDirty.set(false);
        this.router.navigateByUrl(this.returnUrl);
      }
    }
  }

  onExport() {
    const data = this.item();
    if (!data || !this.currentId) return;

    const dateVal = data.publish_date as unknown;
    const formattedDate =
      dateVal instanceof Date
        ? dateVal.toISOString().split('T')[0]
        : String(dateVal || '');

    const headers = [
      'Article ID',
      'Title',
      'Platform',
      'Author',
      'Publish Date',
      'Manage User',
      'URL Link',
      'Content',
      'Status',
      'Remarks',
    ];
    const rows: string[][] = [
      [
        this.currentId,
        data.title || '',
        data.platform || '',
        data.author || '',
        formattedDate,
        this.displayUserName(data.manage_user_id || ''),
        data.url_link || '',
        data.content || '',
        data.status === 1 ? 'Published' : 'Draft',
        data.remarks || '',
      ],
    ];

    exportToCsv(`Article_Detail_${data.title}`, headers, rows);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  extractArticleData() {
    const text = this.rawArticleText();
    if (!text.trim()) return;

    let publish_date: any = null;
    let author = '';
    let platform = '';
    let title = '';
    let content = '';
    let url_link = '';

    const dateMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (dateMatch) {
      const YYYY = parseInt(dateMatch[1], 10);
      const MM = parseInt(dateMatch[2], 10) - 1;
      const DD = parseInt(dateMatch[3], 10);
      publish_date = new Date(YYYY, MM, DD);
    }

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const dateLineIdx = lines.findIndex((l) =>
      /\d{4}年\d{1,2}月\d{1,2}日/.test(l),
    );

    if (dateLineIdx !== -1) {
      for (
        let i = dateLineIdx + 1;
        i < Math.min(lines.length, dateLineIdx + 5);
        i++
      ) {
        if (
          !/星期/.test(lines[i]) &&
          !/\d{4}年\d{1,2}月\d{1,2}日/.test(lines[i]) &&
          /^[\u4e00-\u9fa5]{2,6}$/.test(lines[i])
        ) {
          author = lines[i];
          break;
        }
      }
    }

    const titleMatch = text.match(/^\s*([^\n\/]+\/\s*[^\n]+)\s*$/m);
    if (titleMatch) {
      title = titleMatch[1].split(' / ')[0].trim();
    }

    platform = text.includes('明報') ? '明報' : '未知';
    const urlMatch = text.match(/(https:\/\/\S+)/);
    if (urlMatch) url_link = urlMatch[1];

    const contentStart = text.indexOf('【明報文章】');
    if (contentStart !== -1) {
      content = text.substring(contentStart + '【明報文章】'.length).trim();
      content = content.replace(/原文網址：.+$/, '').trim();
    } else {
      content = text;
    }

    if (!title && content) title = content.slice(0, 10);

    this.item.update((current) => {
      if (!current) return current;
      return {
        ...current,
        publish_date: publish_date || current.publish_date,
        author: author || current.author,
        platform: platform || current.platform,
        title: title || current.title,
        content: content || current.content,
        url_link: url_link || current.url_link,
        status: 1,
      };
    });

    this.rawArticleText.set('');
    this.notification.showSuccess(
      'Text extracted and auto-filled successfully!',
    );
  }
}
