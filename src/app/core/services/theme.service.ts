import { DOCUMENT } from '@angular/common';
import {
  Injectable,
  NgZone,
  RendererFactory2,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { resolveColorMode } from '../models/user-preference.model';
import { UserPreferenceService } from '../../apps/jaxfr/features/settings/user-preference.service';
import { DevHudService } from './dev-hud.service';

const THEME_CLASSES = ['theme-aero', 'theme-material'] as const;
const MODE_CLASSES = ['mode-light', 'mode-dark'] as const;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private document = inject(DOCUMENT);
  private zone = inject(NgZone);
  private prefs = inject(UserPreferenceService);
  private devHud = inject(DevHudService);
  private renderer = inject(RendererFactory2).createRenderer(null, null);

  private osPrefersDark = signal(this.readOsPrefersDark());

  readonly visualTheme = computed(
    () => this.devHud.appearanceOverride()?.visual_theme ?? this.prefs.visualTheme(),
  );
  readonly resolvedColorMode = computed(() =>
    resolveColorMode(
      this.devHud.appearanceOverride()?.color_mode ?? this.prefs.colorMode(),
      this.osPrefersDark(),
    ),
  );

  constructor() {
    this.listenToOsColorScheme();

    effect(() => {
      const theme = this.visualTheme();
      const mode = this.resolvedColorMode();
      untracked(() => this.apply(theme, mode));
    });
  }

  private apply(theme: 'aero' | 'material', mode: 'light' | 'dark'): void {
    const root = this.document.documentElement;
    for (const className of THEME_CLASSES) {
      this.renderer.removeClass(root, className);
    }
    for (const className of MODE_CLASSES) {
      this.renderer.removeClass(root, className);
    }
    this.renderer.addClass(
      root,
      theme === 'material' ? 'theme-material' : 'theme-aero',
    );
    this.renderer.addClass(root, mode === 'dark' ? 'mode-dark' : 'mode-light');
  }

  private readOsPrefersDark(): boolean {
    const view = this.document.defaultView;
    if (!view) return false;
    return view.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private listenToOsColorScheme(): void {
    const view = this.document.defaultView;
    if (!view) return;
    const media = view.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      this.zone.run(() => this.osPrefersDark.set(event.matches));
    };
    media.addEventListener('change', onChange);
  }
}
