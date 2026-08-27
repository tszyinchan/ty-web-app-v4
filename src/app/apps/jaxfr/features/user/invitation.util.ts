import { RecordStatus } from '../../../../core/models/status.enum';
import { Invitation } from './invitation.model';

export function generateInviteCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isInviteExpired(
  expiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const expires = new Date(expiresAt).getTime();
  return Number.isNaN(expires) || expires <= now;
}

export function isInviteExhausted(
  invite: Pick<Invitation, 'uses_count' | 'max_uses'>,
): boolean {
  return invite.uses_count >= invite.max_uses;
}

export type InviteListStatus = 'Active' | 'Inactive' | 'Expired' | 'Used up';

export function inviteListStatus(
  invite: Invitation,
  now = Date.now(),
): InviteListStatus {
  if (invite.status === RecordStatus.Inactive) return 'Inactive';
  if (isInviteExpired(invite.expires_at, now)) return 'Expired';
  if (isInviteExhausted(invite)) return 'Used up';
  return 'Active';
}
