import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export interface DailyLogChromeAction {
  label: string;
  icon?: string;
  disabled?: boolean;
  onClick: () => void;
}

export interface DailyLogChromeNavLink {
  label: string;
  routerLink: string;
}

export interface DailyLogChromeMonthNav {
  prev: () => void;
  next: () => void;
}

@Component({
  selector: 'app-daily-log-chrome',
  standalone: true,
  imports: [RouterModule, MatIconModule],
  templateUrl: './daily-log-chrome.html',
  styleUrl: './daily-log-chrome.scss',
})
export class DailyLogChrome {
  readonly title = input.required<string>();
  readonly backLink = input<string | null>(null);
  readonly backLabel = input('Back');
  readonly navLinks = input<DailyLogChromeNavLink[]>([]);
  readonly actions = input<DailyLogChromeAction[]>([]);
  readonly monthNav = input<DailyLogChromeMonthNav | null>(null);
  readonly monthLabel = input<string | null>(null);
}
