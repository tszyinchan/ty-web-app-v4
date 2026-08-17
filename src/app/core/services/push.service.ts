import { Injectable, NgZone, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { VAPID_PUBLIC_KEY } from '../../app.constants';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { SupabaseService } from './supabase.service';
import { truncatePushBody, urlBase64ToUint8Array } from '../utils/push.util';

const SW_URL = '/push-sw.js';
const PUSH_NAVIGATE = 'PUSH_NAVIGATE';

interface PushNavigateMessage {
  type?: unknown;
  url?: unknown;
}

@Injectable({ providedIn: 'root' })
export class PushService {
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private zone = inject(NgZone);

  private readonly vapidPublicKey = VAPID_PUBLIC_KEY;

  /** True after this browser has an active Web Push subscription saved. */
  pushReady = signal(false);

  private swRegistered = false;
  private messagesBound = false;
  private permissionPrompted = false;
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

  private async start(): Promise<void> {
    if (this.starting) return;
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    if (!window.isSecureContext) return;
    this.starting = true;
    try {
      await this.registerServiceWorker();
      if (Notification.permission === 'granted') {
        await this.subscribeAndSave();
        return;
      }
      if (Notification.permission === 'default') {
        this.promptForPermission();
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

  private promptForPermission(): void {
    if (this.permissionPrompted) return;
    this.permissionPrompted = true;
    const ref = this.snackBar.open(
      'Enable desktop notifications for chat?',
      'Allow',
      { duration: 12000 },
    );
    ref.onAction().subscribe(() => {
      void this.requestPermissionAndSubscribe();
    });
  }

  private async requestPermissionAndSubscribe(): Promise<void> {
    try {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return;
      await this.subscribeAndSave();
    } catch (error: unknown) {
      this.notification.handleError('Notification Permission Failed', error);
    }
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
