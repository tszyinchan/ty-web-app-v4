import { CommonModule } from '@angular/common';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { DOCSIGN_LEASE_STALE_MS } from './docsign.constants';
import { DocsignService } from './docsign.service';
import {
  currentVersion,
  documentNo,
  docsignLifecycle,
  isEditLeaseStale,
  lifecycleLabel,
  unsignedSignerIds,
} from './docsign.util';

@Component({
  selector: 'app-docsign-list',
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
  templateUrl: './docsign-list.html',
  styleUrl: './docsign-list.scss',
})
export class DocsignList implements OnInit, OnDestroy {
  public docsignService = inject(DocsignService);
  public userService = inject(UserService);

  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private displayNamePipe = inject(DisplayNamePipe);
  private auth = inject(AuthService);

  searchQuery = signal('');
  pageSize = signal(10);
  pageIndex = signal(0);

  rawListVM = computed(() => {
    const users = this.userService.users();
    return this.docsignService.documents().map((doc) => {
      const lifecycle = docsignLifecycle(doc.sent_at, doc.locked_at);
      const version = currentVersion(doc);
      const missing = unsignedSignerIds(
        doc.signer_user_ids,
        doc.signatures,
        version?.tb_tyapp_dsgn_ver_id,
      ).map((id) => {
        const user = users.find((item) => item.user_id === id);
        return user ? this.displayNamePipe.transform(user) : 'Unknown';
      });
      const owner = users.find((item) => item.user_id === doc.created_by);
      const me = this.auth.userProfile()?.user_id;
      const holder = doc.editing_by;
      const occupied =
        !doc.locked_at &&
        !!holder &&
        holder !== me &&
        !isEditLeaseStale(doc.editing_heartbeat, DOCSIGN_LEASE_STALE_MS);
      const holderUser = occupied
        ? users.find((item) => item.user_id === holder)
        : undefined;
      return {
        ...doc,
        documentNo: documentNo(doc.tb_tyapp_dsgn_seq_no),
        lifecycle,
        lifecycleLabel: lifecycleLabel(lifecycle),
        ownerName: owner ? this.displayNamePipe.transform(owner) : 'Unknown',
        missingLabel: missing.join(', '),
        inUseBy: holderUser
          ? this.displayNamePipe.transform(holderUser)
          : occupied
            ? 'Unknown'
            : '',
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
        item.documentNo.toLowerCase().includes(q) ||
        item.ownerName.toLowerCase().includes(q) ||
        item.lifecycleLabel.toLowerCase().includes(q) ||
        item.inUseBy.toLowerCase().includes(q),
    );
  });

  pagedListVM = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filteredListVM().slice(start, start + this.pageSize());
  });

  ngOnInit() {
    const isLoading = computed(
      () => this.docsignService.loading() || this.userService.loading(),
    );

    this.headerService.setConfig({
      actions: [
        {
          label: 'My signature',
          icon: 'draw',
          type: 'secondary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../signature'], { relativeTo: this.route }),
        },
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.onRefresh(),
        },
        {
          label: 'New Document',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });

    this.docsignService.fetchAllDocuments();
    this.userService.fetchAllUsers();
    this.userService.fetchGroups();
  }

  async onRefresh() {
    await Promise.all([
      this.docsignService.fetchAllDocuments(true),
      this.userService.fetchAllUsers(true),
      this.userService.fetchGroups(true),
    ]);
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
