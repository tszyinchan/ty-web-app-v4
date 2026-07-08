import { Injectable, inject, NgZone, signal } from '@angular/core';
import { YY525_Wash_Log_API } from '../../../app.constants';
import { NotificationService } from '../../../core/services/notification.service';
import { WashLog } from './wash-log.model';

@Injectable({ providedIn: 'root' })
export class WashLogService {
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  washLogs = signal<WashLog[]>([]);
  loading = signal(false);

  async fetchAllLogs(force = false) {
    if (this.washLogs().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const url = `${YY525_Wash_Log_API.GAS_URL}?token=${YY525_Wash_Log_API.TOKEN}`;
      const response = await fetch(url);

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error(result.error);

      this.zone.run(() => {
        const sortedData = (result.data || []).sort(
          (a: WashLog, b: WashLog) =>
            new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        this.washLogs.set(sortedData);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Wash Logs Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }
}
