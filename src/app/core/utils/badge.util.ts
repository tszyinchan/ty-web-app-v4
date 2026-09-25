/** Shared count-badge formatting for launcher tiles (chat unread, Doc Sign pending, etc.). */
export function formatCountBadge(count: number, max: number): string | null {
  if (count <= 0) return null;
  return count > max ? `${max}+` : String(count);
}
