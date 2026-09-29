import { Injectable, signal, Signal } from '@angular/core';

export interface HeaderAction {
  label: string;
  icon?: string;
  type: 'primary' | 'secondary' | 'toggle'| 'icon';
  disabled?: Signal<boolean> | (() => boolean);
  onClick?: () => void;

  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export type SyncStatus = 'loading' | 'up-to-date' | 'unsaved' | 'none';

export interface HeaderConfig {
  backLink?: string;
  /** When set, the back button runs this instead of navigating to `backLink`. */
  onBack?: () => void;
  title?: string;
  syncStatus?: Signal<SyncStatus>;
  actions?: HeaderAction[];
}

@Injectable({ providedIn: 'root' })
export class HeaderService {
  config = signal<HeaderConfig | null>(null);

  setConfig(config: HeaderConfig) {
    this.config.set(config);
  }

  clear() {
    this.config.set(null);
  }
}
