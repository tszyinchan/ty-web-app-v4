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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';

import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { HeaderService } from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { DiffLineVm, DocsignDocumentDetail } from './docsign.model';
import { DocsignService } from './docsign.service';
import { splitDiffSides } from './docsign.util';

@Component({
  selector: 'app-docsign-compare',
  standalone: true,
  imports: [DatePipe, FormsModule, MatFormFieldModule, MatSelectModule],
  providers: [DisplayNamePipe],
  templateUrl: './docsign-compare.html',
  styleUrl: './docsign-compare.scss',
})
export class DocsignCompare implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);

  public docsignService = inject(DocsignService);
  public userService = inject(UserService);

  doc = signal<DocsignDocumentDetail | null>(null);
  leftNo = signal(1);
  rightNo = signal(1);

  versions = computed(() => this.doc()?.versions ?? []);

  leftVersion = computed(() =>
    this.versions().find((item) => item.version_no === this.leftNo()),
  );
  rightVersion = computed(() =>
    this.versions().find((item) => item.version_no === this.rightNo()),
  );

  diffSides = computed(() =>
    splitDiffSides(
      this.leftVersion()?.content ?? '',
      this.rightVersion()?.content ?? '',
    ),
  );

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    this.headerService.setConfig({
      backLink: id ? `/docsign/edit/${id}` : '/docsign/list',
      title: 'Compare versions',
    });

    await Promise.all([
      this.docsignService.fetchAllDocuments(),
      this.userService.fetchAllUsers(),
    ]);

    if (!id) {
      this.router.navigate(['/docsign/list']);
      return;
    }

    const fresh =
      this.docsignService
        .documents()
        .find((item) => item.tb_tyapp_dsgn_id === id) ??
      (await this.docsignService.fetchDocumentById(id));

    if (!fresh || !fresh.sent_at) {
      this.router.navigate(['/docsign/list']);
      return;
    }

    this.doc.set(fresh);
    const current = fresh.current_version_no;
    this.rightNo.set(current);
    this.leftNo.set(current > 1 ? current - 1 : current);
  }

  authorName(userId: string | undefined): string {
    if (!userId) return 'Unknown';
    const user = this.userService.users().find((item) => item.user_id === userId);
    return user ? this.displayNamePipe.transform(user) : 'Unknown';
  }

  trackLine(index: number, line: DiffLineVm): string {
    return `${index}:${line.kind}:${line.text}`;
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
