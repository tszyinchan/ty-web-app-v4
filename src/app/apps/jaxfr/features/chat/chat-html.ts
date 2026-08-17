import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { sanitizeChatHtml } from './chat.util';

@Component({
  selector: 'app-chat-html',
  standalone: true,
  template: `<div class="ql-editor chat-html-body" [innerHTML]="trusted()"></div>`,
  styles: `
    :host {
      display: block;
    }
    .chat-html-body {
      padding: 0;
      overflow: visible;
      font-size: inherit;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
  `,
})
export class ChatHtml {
  private sanitizer = inject(DomSanitizer);

  html = input.required<string>();

  /**
   * User-authored HTML is sanitized with DOMPurify in sanitizeChatHtml
   * before this bypass. innerHTML is required to render Outlook-like
   * formatting in the bubble.
   */
  trusted = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(sanitizeChatHtml(this.html())),
  );
}
