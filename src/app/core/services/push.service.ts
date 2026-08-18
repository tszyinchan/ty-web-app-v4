import { Injectable, NgZone, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { VAPID_PUBLIC_KEY } from '../../app.constants';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { SupabaseService } from './supabase.service';
import { TyappPushSubscription } from '../models/push-subscription.model';
import {
  isIosNonStandalone,
  isPushSupported,
  truncatePushBody,
  urlBase64ToUint8Array,
} from '../utils/push.util';

const SW_URL = '/push-sw.js';
const PUSH_NAVIGATE = 'PUSH_NAVIGATE';

interface PushNavigateMessage {
  type?: unknown;
  url?: unknown;
}

type PushPermissionStatus = NotificationPermission | 'unsupported';

@Injectable({ providedIn: 'root' })
export class PushService {
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private router = inject(Router);
  private zone = inject(NgZone);

  private readonly vapidPublicKey = VAPID_PUBLIC_KEY;

  /** True after this browser has an active Web Push subscription saved. */
  pushReady = signal(false);

  /** Mirrors the browser's Notification.permission (or 'unsupported'). */
  permissionStatus = signal<PushPermissionStatus>(this.readPermission());

  readonly isSupported = computed(() => this.permissionStatus() !== 'unsupported');
  readonly isIosNonStandalone = computed(() => isIosNonStandalone());

  private swRegistered = false;
  private messagesBound = false;
  private starting = false;

  constructor() {
    this.bindServiceWorkerMessages();
    effect(() => {
      const profile = this.auth.userProfile();
      untracked(() => {
        if (profile?.user_id) {
          void this.start();
        }
      });
    });
  }

  showLocal(options: { title: string; body: string; url: string }): void {
    if (this.pushReady()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      return;
    }

    const n = new Notification(options.title, {
      body: truncatePushBody(options.body),
      icon: '/favicon.svg',
      tag: options.url,
    });
    n.onclick = () => {
      n.close();
      window.focus();
      this.zone.run(() => {
        void this.router.navigateByUrl(options.url);
      });
    };
  }

  /** Re-reads the live browser permission into `permissionStatus`. */
  refreshStatus(): void {
    this.permissionStatus.set(this.readPermission());
  }

  /**
   * Must be called directly from a user gesture (e.g. a button click) with
   * no prior `await`, otherwise iOS Safari treats it as not user-initiated
   * and silently ignores it.
   */
  async requestPermissionAndSubscribe(): Promise<void> {
    if (!isPushSupported()) return;
    try {
      const result = await Notification.requestPermission();
      this.permissionStatus.set(result);
      if (result !== 'granted') return;
      await this.registerServiceWorker();
      await this.subscribeAndSave();
    } catch (error: unknown) {
      this.notification.handleError('Notification Permission Failed', error);
    }
  }

  /** Unsubscribes this browser/device only; other devices are unaffected. */
  async unsubscribeThisDevice(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        this.zone.run(() => this.pushReady.set(false));
        return;
      }

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      const { error } = await this.supabase.rpc(
        'tyapp_push_delete_subscription',
        { p_endpoint: endpoint },
      );
      if (error) throw error;

      this.zone.run(() => this.pushReady.set(false));
      this.notification.showSuccess('Notifications disabled on this device');
    } catch (error: unknown) {
      this.notification.handleError('Disable Notifications Failed', error);
    }
  }

  /** Admin only (enforced by RLS): every user's subscribed devices. */
  async fetchAllSubscriptionsAdmin(): Promise<TyappPushSubscription[]> {
    const { data, error } = await this.supabase
      .from('tyapp_push_subscription')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      this.notification.handleError('Fetch Subscriptions Failed', error);
      return [];
    }
    return (data ?? []) as TyappPushSubscription[];
  }

  /** Admin only (enforced by RPC): revoke another user's device. */
  async adminDeleteSubscription(id: string): Promise<boolean> {
    const { error } = await this.supabase.rpc(
      'tyapp_push_admin_delete_subscription',
      { p_id: id },
    );
    if (error) {
      this.notification.handleError('Revoke Subscription Failed', error);
      return false;
    }
    this.notification.showSuccess('Subscription revoked');
    return true;
  }

  private readPermission(): PushPermissionStatus {
    if (!isPushSupported()) return 'unsupported';
    return Notification.permission;
  }

  private async start(): Promise<void> {
    if (this.starting) return;
    if (!isPushSupported()) return;
    this.starting = true;
    try {
      await this.registerServiceWorker();
      this.zone.run(() => this.permissionStatus.set(Notification.permission));
      if (Notification.permission === 'granted') {
        await this.subscribeAndSave();
      }
    } finally {
      this.starting = false;
    }
  }

  private async registerServiceWorker(): Promise<void> {
    if (this.swRegistered) return;
    await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    this.swRegistered = true;
  }

  private bindServiceWorkerMessages(): void {
    if (this.messagesBound || !('serviceWorker' in navigator)) return;
    this.messagesBound = true;
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as PushNavigateMessage | undefined;
      if (data?.type !== PUSH_NAVIGATE || typeof data.url !== 'string') return;
      this.zone.run(() => {
        void this.router.navigateByUrl(data.url as string);
      });
    });
  }

  private async subscribeAndSave(): Promise<void> {
    if (!this.vapidPublicKey) {
      this.notification.handleError(
        'Push Subscribe Failed',
        new Error('VAPID public key is missing'),
      );
      return;
    }
    if (!('PushManager' in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            this.vapidPublicKey,
          ) as BufferSource,
        });
      }

      const json = subscription.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.['p256dh'];
      const auth = json.keys?.['auth'];
      if (!endpoint || !p256dh || !auth) return;

      const { error } = await this.supabase.rpc(
        'tyapp_push_upsert_subscription',
        {
          p_endpoint: endpoint,
          p_p256dh: p256dh,
          p_auth: auth,
          p_user_agent: navigator.userAgent,
        },
      );
      if (error) throw error;
      this.zone.run(() => this.pushReady.set(true));
    } catch (error: unknown) {
      this.notification.handleError('Push Subscribe Failed', error);
    }
  }
}
