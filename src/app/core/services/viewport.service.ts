import { Injectable, inject } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { VIEWPORT_NARROW_MQ } from '../utils/viewport.util';

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private breakpointObserver = inject(BreakpointObserver);

  readonly isNarrow = toSignal(
    this.breakpointObserver
      .observe(VIEWPORT_NARROW_MQ)
      .pipe(map((result) => result.matches)),
    {
      initialValue: this.breakpointObserver.isMatched(VIEWPORT_NARROW_MQ),
    },
  );
}
