import { DatePipe } from '@angular/common';
import { Component, ViewEncapsulation, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { APP_CONFIG } from '../../../../app.constants';
import { DocsignLifecycle } from './docsign.model';
import {
  DOCSIGN_BRAND_ICON,
  DOCSIGN_DRIVE_PREVIEW,
  DOCSIGN_DRIVE_VIEW,
} from './docsign.constants';
import {
  lifecycleLabel,
  sanitizeSignatureSvg,
  splitDocsignContent,
} from './docsign.util';

export interface DocsignSignerSlot {
  userId: string;
  name: string;
  signedName: string | null;
  signedMark?: string | null;
  signedAt: string | null;
  signedSvg?: string | null;
}

@Component({
  selector: 'app-docsign-document',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './docsign-document.html',
  styleUrl: './docsign-document.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'docsign-document-host',
    '[class.print-mode]': 'printMode()',
  },
})
export class DocsignDocumentView {
  private sanitizer = inject(DomSanitizer);

  readonly appName = APP_CONFIG.appName;
  readonly brandIcon = DOCSIGN_BRAND_ICON;

  title = input.required<string>();
  docDate = input<string | null>(null);
  versionNo = input<number>(0);
  lifecycle = input<DocsignLifecycle>('draft');
  content = input<string>('');
  signers = input<DocsignSignerSlot[]>([]);
  printMode = input(false);
  documentNo = input<string>('');

  lifecycleText = computed(() => lifecycleLabel(this.lifecycle()));

  signerViews = computed(() =>
    this.signers().map((slot) => ({
      ...slot,
      svgHtml: this.trustSvg(slot.signedSvg),
    })),
  );

  blocks = computed(() =>
    splitDocsignContent(this.content()).map((block) => {
      if (block.kind === 'html') {
        return {
          kind: 'html' as const,
          html: this.sanitizer.bypassSecurityTrustHtml(block.html),
        };
      }
      return {
        kind: 'drive' as const,
        fileId: block.fileId,
        url: this.sanitizer.bypassSecurityTrustResourceUrl(
          DOCSIGN_DRIVE_PREVIEW(block.fileId),
        ),
        href: DOCSIGN_DRIVE_VIEW(block.fileId),
      };
    }),
  );

  private trustSvg(svg: string | null | undefined): SafeHtml | null {
    const clean = sanitizeSignatureSvg(svg);
    if (!clean) return null;
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}
