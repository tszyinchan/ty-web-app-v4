import {
  DEFAULT_USER_PREFERENCE,
  isColorMode,
  isVisualTheme,
  isWelcomeLauncherMode,
  UserPreferenceValues,
} from '../models/user-preference.model';

export const USER_PREF_CACHE_PREFIX = 'jaxfr.user-preference.v1.';
export const USER_PREF_ACTIVE_USER_KEY = 'jaxfr.user-preference.v1.active-user';

export function userPreferenceCacheKey(userId: string): string {
  return `${USER_PREF_CACHE_PREFIX}${userId}`;
}

export function readUserPreferenceCache(
  userId: string,
): UserPreferenceValues | null {
  try {
    const raw = localStorage.getItem(userPreferenceCacheKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const row = parsed as Record<string, unknown>;
    if (
      !isVisualTheme(row['visual_theme']) ||
      !isColorMode(row['color_mode']) ||
      !isWelcomeLauncherMode(row['welcome_launcher_mode'])
    ) {
      return null;
    }
    return {
      visual_theme: row['visual_theme'],
      color_mode: row['color_mode'],
      welcome_launcher_mode: row['welcome_launcher_mode'],
    };
  } catch {
    return null;
  }
}

export function writeUserPreferenceCache(
  userId: string,
  values: UserPreferenceValues,
): void {
  localStorage.setItem(
    userPreferenceCacheKey(userId),
    JSON.stringify({
      visual_theme: values.visual_theme,
      color_mode: values.color_mode,
      welcome_launcher_mode: values.welcome_launcher_mode,
    }),
  );
  localStorage.setItem(USER_PREF_ACTIVE_USER_KEY, userId);
}

export function clearActiveUserPreferenceCache(): void {
  localStorage.removeItem(USER_PREF_ACTIVE_USER_KEY);
}

export function cacheOrDefault(userId: string): UserPreferenceValues {
  return readUserPreferenceCache(userId) ?? { ...DEFAULT_USER_PREFERENCE };
}
