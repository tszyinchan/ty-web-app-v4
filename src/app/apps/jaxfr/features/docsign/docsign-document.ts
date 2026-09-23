import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  Injector,
  NgZone,
  OnDestroy,
  ViewEncapsulation,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { APP_CONFIG } from '../../../../app.constants';
import { DocsignLifecycle } from './docsign.model';
import {
  DOCSIGN_BRAND_ICON,
  DOCSIGN_DRIVE_PREVIEW,
  DOCSIGN_DRIVE_VIEW,
} from './docsign.constants';
import {
  planDocsignPages,
  sanitizeSignatureSvg,
  splitDocsignContent,
  splitHtmlFlowUnits,
} from './docsign.util';

export interface DocsignSignerSlot {
  userId: string;
  name: string;
  role?: string | null;
  signedName: string | null;
  signedMark?: string | null;
  signedAt: string | null;
  signedSvg?: string | null;
}

export type DocsignFlowUnit =
  | { id: string; kind: 'html'; html: SafeHtml }
  | {
      id: string;
      kind: 'drive';
      fileId: string;
      url: SafeResourceUrl;
      href: string;
    };

interface PaperPageVm {
  no: number;
  key: string;
  showMasthead: boolean;
  showContinue: boolean;
  showSignatures: boolean;
  overflow: boolean;
  units: DocsignFlowUnit[];
}

function boxHeight(el: HTMLElement | undefined | null): number {
  if (!el) return 0;
  const style = getComputedStyle(el);
  return (
    el.getBoundingClientRect().height +
    parseFloat(style.marginTop) +
    parseFloat(style.marginBottom)
  );
}

@Component({
  selector: 'app-docsign-document',
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet],
  templateUrl: './docsign-document.html',
  styleUrl: './docsign-document.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'docsign-document-host',
    '[class.print-mode]': 'printMode()',
  },
})
export class DocsignDocumentView implements OnDestroy {
  private sanitizer = inject(DomSanitizer);
  private zone = inject(NgZone);
  private injector = inject(Injector);

  readonly appName = APP_CONFIG.appName;
  readonly brandIcon = DOCSIGN_BRAND_ICON;

  title = input.required<string>();
  docDate = input<string | null>(null);
  versionNo = input<number>(0);
  lifecycle = input<DocsignLifecycle>('draft');
  content = input<string>('');
  signers = input<DocsignSignerSlot[]>([]);
  printMode = input(false);
  documentId = input<string>('');
  scrollRoot = input<HTMLElement | null>(null);

  pageCount = output<number>();
  visiblePage = output<number>();

  private measurePaper = viewChild<ElementRef<HTMLElement>>('measurePaper');
  private measureMasthead = viewChild<ElementRef<HTMLElement>>('measureMasthead');
  private measureContinue = viewChild<ElementRef<HTMLElement>>('measureContinue');
  private measureStack = viewChild<ElementRef<HTMLElement>>('measureStack');
  private measureUnits = viewChildren<ElementRef<HTMLElement>>('measureUnit');
  private measureEnd = viewChild<ElementRef<HTMLElement>>('measureEnd');
  private paperPages = viewChildren<ElementRef<HTMLElement>>('paperPage');

  private measureObserver: ResizeObserver | null = null;
  private pageObserver: IntersectionObserver | null = null;
  private observedStack: HTMLElement | null = null;
  private planQueued = false;
  private lastPlanKey = '';
  private visiblePageNo = 1;

  pages = signal<PaperPageVm[]>([
    {
      no: 1,
      key: 'pending',
      showMasthead: true,
      showContinue: false,
      showSignatures: true,
      overflow: false,
      units: [],
    },
  ]);

  signerViews = computed(() =>
    this.signers().map((slot) => ({
      ...slot,
      svgHtml: this.trustSvg(slot.signedSvg),
    })),
  );

  flowUnits = computed<DocsignFlowUnit[]>(() => {
    const units: DocsignFlowUnit[] = [];
    let index = 0;
    for (const block of splitDocsignContent(this.content())) {
      if (block.kind === 'html') {
        for (const html of splitHtmlFlowUnits(block.html)) {
          index += 1;
          units.push({
            id: `html-${index}`,
            kind: 'html',
            html: this.sanitizer.bypassSecurityTrustHtml(html),
          });
        }
        continue;
      }
      index += 1;
      units.push({
        id: `drive-${block.fileId}-${index}`,
        kind: 'drive',
        fileId: block.fileId,
        url: this.sanitizer.bypassSecurityTrustResourceUrl(
          DOCSIGN_DRIVE_PREVIEW(block.fileId),
        ),
        href: DOCSIGN_DRIVE_VIEW(block.fileId),
      });
    }
    return units;
  });

  constructor() {
    effect(() => {
      this.flowUnits();
      this.signerViews();
      this.title();
      this.docDate();
      this.versionNo();
      this.lifecycle();
      this.documentId();
      this.printMode();
      untracked(() => this.queuePlan());
    });

    effect(() => {
      this.pages();
      this.scrollRoot();
      untracked(() => this.queuePageObserver());
    });
  }

  ngOnDestroy() {
    this.measureObserver?.disconnect();
    this.pageObserver?.disconnect();
  }

  goToPage(page: number) {
    const pages = this.pages();
    const next = Math.max(1, Math.min(page, pages.length || 1));
    const el = this.paperPages()[next - 1]?.nativeElement;
    if (!el) return;
    this.visiblePageNo = next;
    this.visiblePage.emit(next);
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  private queuePlan() {
    if (this.planQueued) return;
    this.planQueued = true;
    afterNextRender(
      () => {
        this.planQueued = false;
        this.bindMeasureObserver();
        this.measureAndPlan();
      },
      { injector: this.injector },
    );
  }

  private queuePageObserver() {
    afterNextRender(
      () => this.bindPageObserver(),
      { injector: this.injector },
    );
  }

  private bindMeasureObserver() {
    const stack = this.measureStack()?.nativeElement ?? null;
    if (!stack || stack === this.observedStack) return;
    this.measureObserver?.disconnect();
    this.observedStack = stack;
    this.measureObserver = new ResizeObserver(() => {
      this.zone.run(() => this.measureAndPlan());
    });
    this.measureObserver.observe(stack);
  }

  private measureAndPlan() {
    const paper = this.measurePaper()?.nativeElement;
    if (!paper) return;

    const style = getComputedStyle(paper);
    const padY =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availablePx = Math.max(1, paper.clientHeight - padY);
    const units = this.flowUnits();
    const measured = this.measureUnits();
    const unitPx = units.map((_, index) =>
      boxHeight(measured[index]?.nativeElement),
    );

    const plan = planDocsignPages({
      availablePx,
      mastheadPx: boxHeight(this.measureMasthead()?.nativeElement),
      continuePx: boxHeight(this.measureContinue()?.nativeElement),
      unitPx,
      signaturesPx: boxHeight(this.measureEnd()?.nativeElement),
    });
    const planKey = `${JSON.stringify(plan)}|${this.content()}|${units.map((unit) => unit.id).join(',')}`;
    if (planKey === this.lastPlanKey) {
      return;
    }
    this.lastPlanKey = planKey;

    const nextPages: PaperPageVm[] = plan.map((page, index) => ({
      no: index + 1,
      key: `p${index + 1}-${page.unitIndexes.join(',')}-${page.showSignatures ? 's' : 'b'}`,
      showMasthead: page.showMasthead,
      showContinue: page.showContinue,
      showSignatures: page.showSignatures,
      overflow: page.overflow,
      units: page.unitIndexes
        .map((unitIndex) => units[unitIndex])
        .filter((unit): unit is DocsignFlowUnit => !!unit),
    }));

    this.pages.set(nextPages);
    this.pageCount.emit(nextPages.length);
    if (this.visiblePageNo > nextPages.length) {
      this.visiblePageNo = nextPages.length;
      this.visiblePage.emit(this.visiblePageNo);
    }
  }

  private bindPageObserver() {
    this.pageObserver?.disconnect();
    const root = this.scrollRoot();
    const els = this.paperPages();
    if (!root || els.length === 0) return;

    this.pageObserver = new IntersectionObserver(
      () => {
        this.zone.run(() => this.syncVisiblePage());
      },
      {
        root,
        threshold: [0, 0.2, 0.4, 0.6, 0.8, 1],
      },
    );

    for (const page of els) {
      this.pageObserver.observe(page.nativeElement);
    }
    this.syncVisiblePage();
  }

  private syncVisiblePage() {
    const root = this.scrollRoot();
    const els = this.paperPages();
    if (!root || els.length === 0) return;
    const probe = root.getBoundingClientRect().top + 24;
    let pageNo = this.visiblePageNo;
    for (const page of els) {
      const el = page.nativeElement;
      const rect = el.getBoundingClientRect();
      if (rect.top <= probe && rect.bottom > probe) {
        const next = Number(el.getAttribute('data-page'));
        if (Number.isFinite(next)) pageNo = next;
        break;
      }
    }
    if (pageNo === this.visiblePageNo) return;
    this.visiblePageNo = pageNo;
    this.visiblePage.emit(pageNo);
  }

  private trustSvg(svg: string | null | undefined): SafeHtml | null {
    const clean = sanitizeSignatureSvg(svg);
    if (!clean) return null;
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}
