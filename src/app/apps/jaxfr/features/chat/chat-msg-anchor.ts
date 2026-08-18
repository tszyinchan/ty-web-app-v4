import { Directive, ElementRef, inject, input } from '@angular/core';

@Directive({
  selector: '[appChatMsgAnchor]',
  standalone: true,
})
export class ChatMsgAnchor {
  readonly msgId = input.required<string>();
  readonly host = inject(ElementRef<HTMLElement>);
}
