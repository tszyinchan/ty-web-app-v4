import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { UserService } from '../user/user.service';
import {
  DocsignDocumentView,
  DocsignSignerSlot,
} from './docsign-document';
import { DocsignDocumentDetail, DocsignPrintLog } from './docsign.model';
import { DocsignService } from './docsign.service';
import {
  bodyContent,
  currentVersion,
  docsignLifecycle,
  signaturesForVersion,
} from './docsign.util';

@Component({
  selector: 'app-docsign-print',
  standalone: true,
  imports: [DatePipe, RouterModule, DocsignDocumentView],
  providers: [DisplayNamePipe],
  templateUrl: './docsign-print.html',
  styleUrl: './docsign-print.scss',
})
export class DocsignPrint implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private displayNamePipe = inject(DisplayNamePipe);

  public docsignService = inject(DocsignService);
  public userService = inject(UserService);

  private documentId = this.route.snapshot.paramMap.get('id');
  private printLogId = this.route.snapshot.paramMap.get('printLogId');

  loaded = signal<DocsignDocumentDetail | null>(null);
  printLog = signal<DocsignPrintLog | null>(null);

  paperSigners = computed<DocsignSignerSlot[]>(() => {
    const loaded = this.loaded();
    if (!loaded) return [];
    const version = currentVersion(loaded);
    const sigs = signaturesForVersion(
      loaded.signatures,
      version?.tb_tyapp_dsgn_ver_id,
    );
    return loaded.signer_user_ids.map((userId) => {
      const user = this.userService.users().find((item) => item.user_id === userId);
      const sig = sigs.find((item) => item.user_id === userId);
      return {
        userId,
        name: user ? this.displayNamePipe.transform(user) : 'Unknown',
        signedName: sig?.signed_name ?? null,
        signedMark: sig?.signed_mark ?? null,
        signedAt: sig?.signed_at ?? null,
        signedSvg: sig?.signed_svg ?? null,
        role: loaded.signer_titles?.[userId] || null,
      };
    });
  });

  content = computed(() => {
    const loaded = this.loaded();
    return loaded ? bodyContent(loaded) : '';
  });

  lifecycle = computed(() =>
    docsignLifecycle(this.loaded()?.sent_at, this.loaded()?.locked_at),
  );

  async ngOnInit() {
    const id = this.documentId;
    const printLogId = this.printLogId;
    if (!id || !printLogId) {
      this.router.navigate(['/docsign/list']);
      return;
    }

    await this.userService.fetchAllUsers();
    const [doc, log] = await Promise.all([
      this.docsignService.fetchDocumentById(id),
      this.docsignService.fetchPrintLog(printLogId),
    ]);

    if (!doc?.locked_at || !log || log.document_id !== id) {
      this.router.navigate(['/docsign/edit', id]);
      return;
    }

    this.loaded.set(doc);
    this.printLog.set(log);
    setTimeout(() => window.print(), 200);
  }

  onPrint() {
    window.print();
  }

  backToEdit() {
    const id = this.documentId;
    if (id) {
      this.router.navigate(['/docsign/edit', id]);
      return;
    }
    this.router.navigate(['/docsign/list']);
  }
}
