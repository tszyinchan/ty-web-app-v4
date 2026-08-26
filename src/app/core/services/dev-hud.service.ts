import { DOCUMENT } from '@angular/common';
import {
  Injectable,
  NgZone,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { SUBDOMAINS } from '../../app.constants';
import {
  ColorMode,
  VisualTheme,
} from '../models/user-preference.model';
import { UserPreferenceService } from '../../apps/jaxfr/features/settings/user-preference.service';
import { AuthService } from './auth.service';
import { getCurrentSubdomain } from '../utils/app-env.util';

export const DEV_HUD_STORAGE_KEY = 'jaxfr.dev-hud.v1';

export interface AppearanceOverride {
  visual_theme: VisualTheme;
  color_mode: ColorMode;
}

@Injectable({ providedIn: 'root' })
export class DevHudService {
  private document = inject(DOCUMENT);
  private zone = inject(NgZone);
  private prefs = inject(UserPreferenceService);
  private auth = inject(AuthService);
  private subdomain = getCurrentSubdomain();

  readonly enabled = signal(this.readEnabled());
  readonly appearanceOverride = signal<AppearanceOverride | null>(null);

  readonly previewTheme = computed(
    () => this.appearanceOverride()?.visual_theme ?? this.prefs.visualTheme(),
  );
  readonly previewColorMode = computed(
    () => this.appearanceOverride()?.color_mode ?? this.prefs.colorMode(),
  );
  readonly isPreviewing = computed(() => this.appearanceOverride() !== null);

  constructor() {
    effect(() => {
      const loggedIn = !!this.auth.userProfile();
      if (!loggedIn) {
        untracked(() => this.appearanceOverride.set(null));
      }
    });
    this.listenHotkey();
  }

  canShowOnThisApp(): boolean {
    return (
      this.subdomain === SUBDOMAINS.JAXFR ||
      this.subdomain === SUBDOMAINS.FILELINK
    );
  }

  toggleEnabled(): void {
    if (!this.canShowOnThisApp()) return;
    const next = !this.enabled();
    this.enabled.set(next);
    this.writeEnabled(next);
    if (!next) this.appearanceOverride.set(null);
  }

  previewThemeChoice(visual_theme: VisualTheme): void {
    this.setOverride({ visual_theme });
  }

  previewColorModeChoice(color_mode: ColorMode): void {
    this.setOverride({ color_mode });
  }

  clearPreview(): void {
    this.appearanceOverride.set(null);
  }

  async savePreview(): Promise<boolean> {
    const override = this.appearanceOverride();
    if (!override) return true;
    const ok = await this.prefs.updatePreference(override);
    if (ok) this.appearanceOverride.set(null);
    return ok;
  }

  private setOverride(patch: Partial<AppearanceOverride>): void {
    if (!this.enabled()) return;
    const current = this.appearanceOverride() ?? {
      visual_theme: this.prefs.visualTheme(),
      color_mode: this.prefs.colorMode(),
    };
    this.appearanceOverride.set({ ...current, ...patch });
  }

  private listenHotkey(): void {
    const view = this.document.defaultView;
    if (!view) return;
    view.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!event.ctrlKey || !event.altKey || event.shiftKey) return;
      if (event.code !== 'KeyH') return;
      event.preventDefault();
      this.zone.run(() => this.toggleEnabled());
    });
  }

  private readEnabled(): boolean {
    try {
      return localStorage.getItem(DEV_HUD_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private writeEnabled(enabled: boolean): void {
    try {
      if (enabled) {
        localStorage.setItem(DEV_HUD_STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(DEV_HUD_STORAGE_KEY);
      }
    } catch {
      // Private mode: HUD still works for this session.
    }
  }
}
