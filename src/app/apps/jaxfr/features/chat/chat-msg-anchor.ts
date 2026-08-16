import { Directive, ElementRef, inject, input } from '@angular/core';

@Directive({
  selector: '[chatMsgAnchor]',
  standalone: true,
})
export class ChatMsgAnchor {
  readonly msgId = input.required<string>();
  readonly host = inject(ElementRef<HTMLElement>);
}
