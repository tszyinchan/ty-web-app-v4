import { Component, input } from '@angular/core';

export type DailyLogIconName =
  | 'refresh'
  | 'edit'
  | 'save'
  | 'cancel'
  | 'clear-emoji'
  | 'delete'
  | 'add'
  | 'up'
  | 'down'
  | 'today'
  | 'calendar'
  | 'people';

@Component({
  selector: 'app-daily-log-icon',
  standalone: true,
  template: `
    <svg class="dl-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      @switch (name()) {
        @case ('refresh') {
          <path d="M20 6.5v4.2h-4.2" />
          <path d="M4 17.5v-4.2h4.2" />
          <path d="M18.7 10.4A7.2 7.2 0 0 0 6.4 7.2" />
          <path d="M5.3 13.6a7.2 7.2 0 0 0 12.3 3.2" />
        }
        @case ('edit') {
          <path d="M4.4 19.4l1.1-4.6L15.8 4.5a1.5 1.5 0 0 1 2.2 0l1.5 1.5a1.5 1.5 0 0 1 0 2.2L9.2 18.5z" />
          <path d="M13.4 6.8l3.8 3.8" />
        }
        @case ('save') {
          <rect x="4.6" y="3.8" width="14.8" height="16.4" rx="1.6" />
          <rect x="8.2" y="3.8" width="7.6" height="5" />
          <rect x="7.2" y="12.4" width="9.6" height="6.6" />
          <path d="M9.2 14.4h5.6" />
          <path d="M9.2 16.6h3.4" />
        }
        @case ('cancel') {
          <path d="M6.2 6.2l11.6 11.6" />
          <path d="M17.8 6.2L6.2 17.8" />
        }
        @case ('clear-emoji') {
          <rect
            x="4.4"
            y="4.4"
            width="15.2"
            height="15.2"
            rx="3.2"
            stroke-dasharray="2.4 1.8"
          />
          <path d="M8.2 12h7.6" />
        }
        @case ('delete') {
          <path d="M5 7.2h14" />
          <path d="M9.6 7.2V5.4h4.8v1.8" />
          <path d="M8.2 7.2l.8 12.2h6l.8-12.2" />
          <path d="M10.4 11v5.2" />
          <path d="M13.6 11v5.2" />
        }
        @case ('add') {
          <path d="M12 5.2v13.6" />
          <path d="M5.2 12h13.6" />
        }
        @case ('up') {
          <path d="M6.4 14.2L12 8.6l5.6 5.6" />
        }
        @case ('down') {
          <path d="M6.4 9.8L12 15.4l5.6-5.6" />
        }
        @case ('today') {
          <rect x="4.2" y="5.8" width="15.6" height="14" rx="2" />
          <path d="M8 4.4v3.2" />
          <path d="M16 4.4v3.2" />
          <path d="M4.2 10.2h15.6" />
          <circle cx="12" cy="15.4" r="1.6" fill="currentColor" stroke="none" />
        }
        @case ('calendar') {
          <rect x="4.2" y="5.8" width="15.6" height="14" rx="2" />
          <path d="M8 4.4v3.2" />
          <path d="M16 4.4v3.2" />
          <path d="M4.2 10.2h15.6" />
          <path d="M8.4 14h3" />
          <path d="M12.8 14h2.8" />
          <path d="M8.4 17h7.2" />
        }
        @case ('people') {
          <circle cx="9" cy="8.2" r="2.3" />
          <path d="M4.6 18.6v-1.4a4.4 4.4 0 0 1 8.8 0v1.4" />
          <circle cx="16.2" cy="9" r="1.9" />
          <path d="M14.4 18.6v-1.1a3.4 3.4 0 0 1 5 3.1" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }

    .dl-icon {
      width: 1.15em;
      height: 1.15em;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class DailyLogIcon {
  readonly name = input.required<DailyLogIconName>();
}
