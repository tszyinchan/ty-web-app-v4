import { DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  Renderer2,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { APP_CONFIG } from '../../../../app.constants';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { UserService } from '../user/user.service';
import { DOCSIGN_BRAND_ICON } from './docsign.constants';
import {
  DocsignDocumentView,
  DocsignSignerSlot,
} from './docsign-document';
import { DocsignDocumentDetail, DocsignPrintLog } from './docsign.model';
import { DocsignService } from './docsign.service';
import {
  bodyContent,
  buildDocsignPrintPageName,
  cssQuotedString,
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
export class DocsignPrint implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private renderer = inject(Renderer2);
  private host = inject(ElementRef<HTMLElement>);
  private displayNamePipe = inject(DisplayNamePipe);
  private title = inject(Title);
  private pageStyleEl: HTMLStyleElement | null = null;
  private previousTitle = this.title.getTitle();

  public docsignService = inject(DocsignService);
  public userService = inject(UserService);

  readonly appName = APP_CONFIG.appName;
  readonly brandIcon = DOCSIGN_BRAND_ICON;

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

  creatorName = computed(() => {
    const createdBy = this.loaded()?.created_by;
    if (!createdBy) return 'Unknown';
    const user = this.userService.users().find((item) => item.user_id === createdBy);
    return user ? this.displayNamePipe.transform(user) : 'Unknown';
  });

  printPageName = computed(() => {
    const doc = this.loaded();
    const log = this.printLog();
    if (!doc || !log) return '';
    return buildDocsignPrintPageName({
      printedAt: log.printed_at,
      docDate: doc.doc_date,
      title: doc.title,
      creatorName: this.creatorName(),
      appName: this.appName,
    });
  });

  private headerPageCss = computed(() => {
    const doc = this.loaded();
    if (!doc) return '';
    const brand = cssQuotedString(`${this.appName} Doc Sign`);
    const title = cssQuotedString(`Title: ${doc.title || 'Untitled document'}`);
    const creator = cssQuotedString(`Created by: ${this.creatorName()}`);
    return `
      @page {
        margin: 18mm 12mm 16mm;
        background: #fff;
        font-family: Roboto, "Helvetica Neue", sans-serif;
        font-size: 8pt;
        color: #5a6a78;
        @top-left {
          content: ${brand};
          vertical-align: bottom;
          padding-bottom: 3mm;
        }
        @top-center {
          content: ${title};
          color: #1c1c1c;
          font-weight: 600;
          vertical-align: bottom;
          padding-bottom: 3mm;
        }
        @top-right {
          content: ${creator} "${'\u2003\u2003'}Page " counter(page) " / " counter(pages);
          vertical-align: bottom;
          padding-bottom: 3mm;
        }
      }
    `;
  });

  constructor() {
    effect(() => {
      this.syncPageStyle(this.headerPageCss());
      const pageName = this.printPageName();
      if (pageName) this.title.setTitle(pageName);
    });
  }

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

  ngOnDestroy() {
    this.title.setTitle(this.previousTitle);
    if (this.pageStyleEl) {
      this.renderer.removeChild(this.host.nativeElement, this.pageStyleEl);
      this.pageStyleEl = null;
    }
  }

  private syncPageStyle(css: string) {
    if (!css) return;
    if (!this.pageStyleEl) {
      this.pageStyleEl = this.renderer.createElement('style');
      this.renderer.appendChild(this.host.nativeElement, this.pageStyleEl);
    }
    this.renderer.setProperty(this.pageStyleEl, 'textContent', css);
  }
}
