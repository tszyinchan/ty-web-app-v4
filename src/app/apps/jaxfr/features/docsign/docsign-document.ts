import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { DocsignLifecycle } from './docsign.model';
import { DOCSIGN_DRIVE_PREVIEW } from './docsign.constants';
import { lifecycleLabel, splitDocsignContent } from './docsign.util';

export interface DocsignSignerSlot {
  userId: string;
  name: string;
  signedName: string | null;
  signedAt: string | null;
}

@Component({
  selector: 'app-docsign-document',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './docsign-document.html',
  styleUrl: './docsign-document.scss',
})
export class DocsignDocumentView {
  private sanitizer = inject(DomSanitizer);

  title = input.required<string>();
  docDate = input<string | null>(null);
  docDatetime = input<string | null>(null);
  versionNo = input<number>(0);
  lifecycle = input<DocsignLifecycle>('draft');
  content = input<string>('');
  signers = input<DocsignSignerSlot[]>([]);

  lifecycleText = computed(() => lifecycleLabel(this.lifecycle()));

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
        url: this.sanitizer.bypassSecurityTrustResourceUrl(
          DOCSIGN_DRIVE_PREVIEW(block.fileId),
        ),
      };
    }),
  );
}
