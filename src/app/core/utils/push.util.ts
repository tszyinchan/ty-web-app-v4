export const PUSH_BODY_MAX = 120;

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function truncatePushBody(text: string | null | undefined): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return 'New message';
  if (trimmed.length <= PUSH_BODY_MAX) return trimmed;
  return `${trimmed.slice(0, PUSH_BODY_MAX - 1)}…`;
}
