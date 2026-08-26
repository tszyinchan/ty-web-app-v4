import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { DevHudService } from '../../services/dev-hud.service';
import { UserPreferenceService } from '../../../apps/jaxfr/features/settings/user-preference.service';
import {
  COLOR_MODES,
  ColorMode,
  VISUAL_THEMES,
  VisualTheme,
} from '../../models/user-preference.model';

@Component({
  selector: 'app-dev-hud',
  standalone: true,
  templateUrl: './dev-hud.html',
  styleUrl: './dev-hud.scss',
})
export class DevHud {
  readonly hud = inject(DevHudService);
  readonly prefs = inject(UserPreferenceService);
  private auth = inject(AuthService);

  readonly themes = VISUAL_THEMES;
  readonly colorModes = COLOR_MODES;
  readonly canSave = computed(
    () => !!this.auth.userProfile() && this.hud.isPreviewing(),
  );

  onTheme(theme: VisualTheme): void {
    this.hud.previewThemeChoice(theme);
  }

  onColorMode(mode: ColorMode): void {
    this.hud.previewColorModeChoice(mode);
  }

  onReset(): void {
    this.hud.clearPreview();
  }

  onSave(): void {
    void this.hud.savePreview();
  }

  onHide(): void {
    this.hud.toggleEnabled();
  }
}
