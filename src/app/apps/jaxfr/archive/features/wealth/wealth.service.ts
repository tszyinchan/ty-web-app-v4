import { Injectable, inject, NgZone, signal } from '@angular/core';
import { WealthTransaction, AssetSnapshot } from './wealth.model';
import { NotificationService } from '../../../../../core/services/notification.service';
import { SupabaseService } from '../../../../../core/services/supabase.service';

@Injectable({ providedIn: 'root' })
export class WealthService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  transactions = signal<WealthTransaction[]>([]);
  snapshots = signal<AssetSnapshot[]>([]);
  loading = signal(false);

  async fetchAllTransactions(force = false) {
    if (this.transactions().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_fin_transaction')
        .select('*')
        .is('deleted_at', null)
        .order('seq_major', { ascending: false })
        .order('seq_minor', { ascending: true });

      if (error) throw error;

      this.zone.run(() => {
        this.transactions.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Transactions Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchTransactionById(id: string): Promise<WealthTransaction | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_fin_transaction')
        .select('*')
        .eq('tb_tyapp_fin_txn_id', id)
        .single();

      if (error) throw error;

      return this.zone.run(() => {
        this.loading.set(false);
        return data as WealthTransaction;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Transaction Error', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async saveTransaction(txnData: Partial<WealthTransaction>): Promise<boolean> {
    const isNew = !txnData.tb_tyapp_fin_txn_id;
    const {
      tb_tyapp_fin_txn_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = txnData;

    this.loading.set(true);

    const query = isNew
      ? this.supabase.from('tyapp_fin_transaction').insert(payload).select().single()
      : this.supabase
          .from('tyapp_fin_transaction')
          .update(payload)
          .eq('tb_tyapp_fin_txn_id', txnData.tb_tyapp_fin_txn_id)
          .select()
          .single();

    try {
      const { data, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = data as WealthTransaction;
        this.transactions.update((list) => {
          let newList: WealthTransaction[];
          if (isNew) {
            newList = [saved, ...list];
          } else {
            newList = list.map((item) =>
              item.tb_tyapp_fin_txn_id === saved.tb_tyapp_fin_txn_id
                ? saved
                : item
            );
          }
          return newList.sort((a, b) => {
            if (b.seq_major !== a.seq_major) return b.seq_major - a.seq_major;
            return a.seq_minor - b.seq_minor;
          });
        });
        this.loading.set(false);
        this.notification.showSuccess('Transaction saved successfully');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Save Transaction Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async deleteTransaction(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase
        .from('tyapp_fin_transaction')
        .update({ deleted_at: new Date().toISOString() })
        .eq('tb_tyapp_fin_txn_id', id);

      if (error) throw error;

      return this.zone.run(() => {
        this.transactions.update((list) =>
          list.filter((item) => item.tb_tyapp_fin_txn_id !== id)
        );
        this.loading.set(false);
        this.notification.showSuccess('Transaction deleted');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Delete Transaction Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  // Assets Snapshots
  async fetchAllSnapshots(force = false) {
    if (this.snapshots().length > 0 && !force) return;
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_fin_asset_snapshot')
        .select('*')
        .is('deleted_at', null)
        .order('snapshot_date', { ascending: false });

      if (error) throw error;

      this.zone.run(() => {
        this.snapshots.set(data || []);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch Snapshots Failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async saveSnapshot(snapData: Partial<AssetSnapshot>): Promise<boolean> {
    const isNew = !snapData.tb_tyapp_fin_snap_id;
    const {
      tb_tyapp_fin_snap_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...payload
    } = snapData;

    this.loading.set(true);

    const query = isNew
      ? this.supabase.from('tyapp_fin_asset_snapshot').insert(payload).select().single()
      : this.supabase
          .from('tyapp_fin_asset_snapshot')
          .update(payload)
          .eq('tb_tyapp_fin_snap_id', snapData.tb_tyapp_fin_snap_id)
          .select()
          .single();

    try {
      const { data, error } = await query;
      if (error) throw error;

      return this.zone.run(() => {
        const saved = data as AssetSnapshot;
        this.snapshots.update((list) =>
          isNew
            ? [saved, ...list].sort((a, b) => new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime())
            : list.map((item) =>
                item.tb_tyapp_fin_snap_id === saved.tb_tyapp_fin_snap_id ? saved : item
              )
        );
        this.loading.set(false);
        this.notification.showSuccess('Snapshot saved successfully');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Save Snapshot Failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }
}
