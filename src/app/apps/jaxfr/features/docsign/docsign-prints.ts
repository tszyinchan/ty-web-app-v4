import { DatePipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterModule } from '@angular/router';

import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { HeaderService } from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { DocsignPrintLog } from './docsign.model';
import { DocsignService } from './docsign.service';

@Component({
  selector: 'app-docsign-prints',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './docsign-prints.html',
  styleUrl: './docsign-prints.scss',
})
export class DocsignPrints implements OnInit, OnDestroy {
  public docsignService = inject(DocsignService);
  public userService = inject(UserService);

  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);

  logs = signal<DocsignPrintLog[]>([]);
  searchQuery = signal('');
  pageSize = signal(10);
  pageIndex = signal(0);

  rawListVM = computed(() => {
    const docs = this.docsignService.documents();
    const users = this.userService.users();
    return this.logs().map((log) => {
      const doc = docs.find((item) => item.tb_tyapp_dsgn_id === log.document_id);
      const printer = users.find((item) => item.user_id === log.printed_by);
      return {
        ...log,
        title: doc?.title || 'Unknown document',
        printerName: printer ? this.displayNamePipe.transform(printer) : 'Unknown',
      };
    });
  });

  filteredListVM = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.rawListVM();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.printerName.toLowerCase().includes(q) ||
        item.tb_tyapp_dsgn_prn_id.toLowerCase().includes(q) ||
        item.document_id.toLowerCase().includes(q),
    );
  });

  pagedListVM = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filteredListVM().slice(start, start + this.pageSize());
  });

  async ngOnInit() {
    this.headerService.setConfig({
      backLink: '/docsign/list',
      title: 'Print log',
    });

    await Promise.all([
      this.docsignService.fetchAllDocuments(),
      this.userService.fetchAllUsers(),
    ]);
    this.logs.set(await this.docsignService.fetchPrintLogs());
  }

  onSearchChange() {
    this.pageIndex.set(0);
  }

  onPageChange(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
