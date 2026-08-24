import { RecordStatus } from './status.enum';

export const VISUAL_THEMES = ['aero', 'material'] as const;
export type VisualTheme = (typeof VISUAL_THEMES)[number];

export const COLOR_MODES = ['light', 'dark', 'system'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const WELCOME_LAUNCHER_MODES = ['auto', 'compact', 'detailed'] as const;
export type WelcomeLauncherMode = (typeof WELCOME_LAUNCHER_MODES)[number];

export type ResolvedColorMode = 'light' | 'dark';
export type ResolvedWelcomeLauncherMode = 'compact' | 'detailed';

export interface UserPreferenceValues {
  visual_theme: VisualTheme;
  color_mode: ColorMode;
  welcome_launcher_mode: WelcomeLauncherMode;
}

export interface UserPreference extends UserPreferenceValues {
  tb_tyapp_usr_prf_id: string;
  tb_tyapp_usr_prf_seq_no: number;
  user_id: string;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const DEFAULT_USER_PREFERENCE: UserPreferenceValues = {
  visual_theme: 'aero',
  color_mode: 'system',
  welcome_launcher_mode: 'auto',
};

export function isVisualTheme(value: unknown): value is VisualTheme {
  return value === 'aero' || value === 'material';
}

export function isColorMode(value: unknown): value is ColorMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function isWelcomeLauncherMode(
  value: unknown,
): value is WelcomeLauncherMode {
  return value === 'auto' || value === 'compact' || value === 'detailed';
}

export function resolveColorMode(
  colorMode: ColorMode,
  osPrefersDark: boolean,
): ResolvedColorMode {
  if (colorMode === 'dark') return 'dark';
  if (colorMode === 'light') return 'light';
  return osPrefersDark ? 'dark' : 'light';
}

export function resolveWelcomeLauncherMode(
  preference: WelcomeLauncherMode,
  isNarrowViewport: boolean,
): ResolvedWelcomeLauncherMode {
  if (preference === 'compact') return 'compact';
  if (preference === 'detailed') return 'detailed';
  return isNarrowViewport ? 'compact' : 'detailed';
}
