import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export interface DclChromeAction {
  label: string;
  icon?: string;
  disabled?: boolean;
  onClick: () => void;
}

export interface DclChromeNavLink {
  label: string;
  routerLink: string;
}

export interface DclChromeMonthNav {
  prev: () => void;
  next: () => void;
}

@Component({
  selector: 'app-dcl-chrome',
  standalone: true,
  imports: [RouterModule, MatIconModule],
  templateUrl: './daily-checklist-chrome.html',
  styleUrl: './daily-checklist-chrome.scss',
})
export class DailyChecklistChrome {
  readonly title = input.required<string>();
  readonly backLink = input<string | null>(null);
  readonly backLabel = input('Back');
  readonly navLinks = input<DclChromeNavLink[]>([]);
  readonly actions = input<DclChromeAction[]>([]);
  readonly monthNav = input<DclChromeMonthNav | null>(null);
  readonly monthLabel = input<string | null>(null);
}
