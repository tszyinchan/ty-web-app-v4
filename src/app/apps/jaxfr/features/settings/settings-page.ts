import { Component, OnDestroy, inject } from '@angular/core';

import { ColorMode, VisualTheme, WelcomeLauncherMode } from '../../../../core/models/user-preference.model';
import { HeaderService } from '../../../../core/services/header.service';
import { NotificationSettings } from './notification-settings';
import { UserPreferenceService } from './user-preference.service';

interface PreferenceOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [NotificationSettings],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage implements OnDestroy {
  private header = inject(HeaderService);
  readonly prefs = inject(UserPreferenceService);

  readonly visualThemeOptions: PreferenceOption<VisualTheme>[] = [
    {
      value: 'aero',
      label: 'Aero',
      description: 'Glass, gradients, and layered panels.',
    },
    {
      value: 'material',
      label: 'Material',
      description: 'Flat surfaces that stay easy to read on phones.',
    },
  ];

  readonly colorModeOptions: PreferenceOption<ColorMode>[] = [
    {
      value: 'light',
      label: 'Light',
      description: 'Always use a light background.',
    },
    {
      value: 'dark',
      label: 'Dark',
      description: 'Always use a dark background.',
    },
    {
      value: 'system',
      label: 'System',
      description: 'Follow your device light or dark setting.',
    },
  ];

  readonly launcherOptions: PreferenceOption<WelcomeLauncherMode>[] = [
    {
      value: 'auto',
      label: 'Auto',
      description:
        'Show detailed launchers on larger screens and compact icons on mobile.',
    },
    {
      value: 'compact',
      label: 'Simple icons',
      description: 'Keep the launcher compact on every device.',
    },
    {
      value: 'detailed',
      label: 'Detailed icons',
      description: 'Always show names and descriptions where space permits.',
    },
  ];

  constructor() {
    this.header.setConfig({ title: 'Settings' });
  }

  ngOnDestroy() {
    this.header.clear();
  }

  onVisualTheme(value: VisualTheme) {
    void this.prefs.updatePreference({ visual_theme: value });
  }

  onColorMode(value: ColorMode) {
    void this.prefs.updatePreference({ color_mode: value });
  }

  onLauncherMode(value: WelcomeLauncherMode) {
    void this.prefs.updatePreference({ welcome_launcher_mode: value });
  }
}
