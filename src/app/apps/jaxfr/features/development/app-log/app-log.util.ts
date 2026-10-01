import { AppLog } from './app-log.model';

export interface VersionTriple {
  major: number;
  minor: number;
  patch: number;
}

/** Distinct log versions newer than the running build before we flag deploy lag. */
export const APP_LOG_DEPLOY_LAG_THRESHOLD = 2;

export function compareVersion(a: VersionTriple, b: VersionTriple): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function formatVersion(v: VersionTriple): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

export function versionFromLog(log: Pick<
  AppLog,
  'version_major' | 'version_minor' | 'version_patch'
>): VersionTriple {
  return {
    major: log.version_major,
    minor: log.version_minor,
    patch: log.version_patch,
  };
}

export function resolveLatestLogVersion(logs: AppLog[]): VersionTriple | null {
  if (logs.length === 0) return null;
  return logs.reduce<VersionTriple>((max, log) => {
    const current = versionFromLog(log);
    return compareVersion(current, max) > 0 ? current : max;
  }, versionFromLog(logs[0]));
}

/** How many distinct changelog versions are strictly newer than `current`. */
export function countNewerLogVersions(
  logs: AppLog[],
  current: VersionTriple,
): number {
  const newer = new Set<string>();
  for (const log of logs) {
    const v = versionFromLog(log);
    if (compareVersion(v, current) > 0) {
      newer.add(formatVersion(v));
    }
  }
  return newer.size;
}

export function isDeployLag(
  logs: AppLog[],
  current: VersionTriple,
  threshold = APP_LOG_DEPLOY_LAG_THRESHOLD,
): boolean {
  return countNewerLogVersions(logs, current) >= threshold;
}
