import { Injectable, NgZone, effect, inject, signal, untracked } from '@angular/core';
import {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { format } from 'date-fns';
import { UserPresence } from '../models/user-presence.model';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { SupabaseService } from './supabase.service';

const PRESENCE_CHANNEL = 'jaxfr-presence';
const LAST_SEEN_CHANNEL = 'jaxfr-presence-db';
const HEARTBEAT_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class PresenceService {
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  onlineUserIds = signal<ReadonlySet<string>>(new Set());
  lastSeenByUserId = signal<Record<string, string>>({});

  private presenceChannel: RealtimeChannel | null = null;
  private lastSeenChannel: RealtimeChannel | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private trackedUserId: string | null = null;
  private stopping = false;
  private pageHideHandler = () => {
    void this.touchPresence();
  };

  constructor() {
    effect(() => {
      const profile = this.auth.userProfile();
      untracked(() => {
        if (profile?.user_id) {
          void this.start(profile.user_id);
        } else {
          void this.stop({ persist: true });
        }
      });
    });
  }

  isOnline(userId: string): boolean {
    return this.onlineUserIds().has(userId);
  }

  statusLabel(userId: string): string {
    if (this.isOnline(userId)) return 'Online';
    const at = this.lastSeenByUserId()[userId];
    if (!at) return '';
    return `Last seen ${format(new Date(at), 'yyyy-MM-dd HH:mm:ss')}`;
  }

  async flush(): Promise<void> {
    await this.touchPresence();
  }

  private async start(userId: string): Promise<void> {
    if (this.trackedUserId === userId && this.presenceChannel) return;
    await this.stop({ persist: false });
    this.stopping = false;
    this.trackedUserId = userId;

    await this.fetchLastSeen();
    this.subscribeLastSeen();
    this.joinPresence(userId);
    await this.touchPresence();
    this.heartbeatTimer = setInterval(() => {
      void this.touchPresence();
    }, HEARTBEAT_MS);
    window.addEventListener('pagehide', this.pageHideHandler);
  }

  private async stop(options: { persist: boolean }): Promise<void> {
    this.stopping = true;
    window.removeEventListener('pagehide', this.pageHideHandler);
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (options.persist && this.trackedUserId) {
      await this.touchPresence();
    }
    if (this.presenceChannel) {
      await this.presenceChannel.untrack();
      await this.supabase.removeChannel(this.presenceChannel);
      this.presenceChannel = null;
    }
    if (this.lastSeenChannel) {
      await this.supabase.removeChannel(this.lastSeenChannel);
      this.lastSeenChannel = null;
    }
    this.trackedUserId = null;
    this.onlineUserIds.set(new Set());
  }

  private joinPresence(userId: string): void {
    this.presenceChannel = this.supabase.channel(PRESENCE_CHANNEL);

    this.presenceChannel.on('presence', { event: 'sync' }, () => {
      this.zone.run(() => this.applyPresenceState());
    });

    this.presenceChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && this.trackedUserId === userId) {
        void this.presenceChannel?.track({ user_id: userId });
      }
    });
  }

  private applyPresenceState(): void {
    if (!this.presenceChannel) return;
    const ids = new Set<string>();
    for (const metas of Object.values(this.presenceChannel.presenceState())) {
      for (const meta of metas) {
        const extra = meta as unknown as Record<string, unknown>;
        const id = extra['user_id'];
        if (typeof id === 'string' && id.length > 0) ids.add(id);
      }
    }
    this.onlineUserIds.set(ids);
  }

  private subscribeLastSeen(): void {
    if (this.lastSeenChannel) return;
    this.lastSeenChannel = this.supabase
      .channel(LAST_SEEN_CHANNEL)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tyapp_user_presence' },
        (payload) => {
          this.zone.run(() => this.applyLastSeenChange(payload));
        },
      )
      .subscribe();
  }

  private applyLastSeenChange(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') {
      return;
    }
    this.upsertLastSeen(payload.new as unknown as UserPresence);
  }

  private async fetchLastSeen(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('tyapp_user_presence')
        .select('*');
      if (error) throw error;
      this.zone.run(() => {
        this.lastSeenByUserId.set(this.rowsToMap((data as UserPresence[]) || []));
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Presence Failed', error);
    }
  }

  private async touchPresence(): Promise<void> {
    if (!this.trackedUserId) return;
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_user_touch_presence',
      );
      if (error) throw error;
      const row = data as UserPresence | null;
      if (!row) return;
      this.zone.run(() => this.upsertLastSeen(row));
    } catch (error: unknown) {
      if (!this.stopping) {
        this.notification.handleError('Update Presence Failed', error);
      }
    }
  }

  private upsertLastSeen(row: UserPresence): void {
    if (!row.user_id || !row.last_seen_at) return;
    this.lastSeenByUserId.update((current) => ({
      ...current,
      [row.user_id]: row.last_seen_at,
    }));
  }

  private rowsToMap(rows: UserPresence[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const row of rows) {
      if (row.user_id && row.last_seen_at) map[row.user_id] = row.last_seen_at;
    }
    return map;
  }
}
