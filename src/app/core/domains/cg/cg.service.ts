import { Injectable, NgZone, inject, signal } from '@angular/core';
import { NotificationService } from '../../services/notification.service';
import { SupabaseService } from '../../services/supabase.service';
import { CgPackage, CgPublicSlot, CgSlot, CgSlotDraft } from './cg.model';
import { normalizePublicSlot, normalizeSlot } from './cg.util';

@Injectable({ providedIn: 'root' })
export class CgService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  packages = signal<CgPackage[]>([]);
  slots = signal<CgSlot[]>([]);
  loading = signal(false);

  async fetchAllPackages(force = false): Promise<void> {
    if (this.packages().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const [packageResult, slotResult] = await Promise.all([
        this.supabase
          .from('tyapp_cg_package')
          .select('*')
          .is('deleted_at', null)
          .order('name', { ascending: true }),
        this.supabase
          .from('tyapp_cg_slot')
          .select('*')
          .is('deleted_at', null)
          .order('sort_order', { ascending: true }),
      ]);

      if (packageResult.error) throw packageResult.error;
      if (slotResult.error) throw slotResult.error;

      this.zone.run(() => {
        this.packages.set((packageResult.data ?? []) as CgPackage[]);
        this.slots.set(
          (slotResult.data ?? [])
            .map((row) => normalizeSlot(row))
            .filter((slot): slot is CgSlot => slot !== null),
        );
        this.loading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch CG packages failed', error);
      this.zone.run(() => this.loading.set(false));
    }
  }

  async fetchPackageById(
    id: string,
  ): Promise<{ package: CgPackage; slots: CgSlot[] } | null> {
    this.loading.set(true);
    try {
      const [packageResult, slotResult] = await Promise.all([
        this.supabase
          .from('tyapp_cg_package')
          .select('*')
          .eq('tb_tyapp_cgpk_id', id)
          .is('deleted_at', null)
          .single(),
        this.supabase
          .from('tyapp_cg_slot')
          .select('*')
          .eq('package_id', id)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true }),
      ]);

      if (packageResult.error) throw packageResult.error;
      if (slotResult.error) throw slotResult.error;

      const slots = (slotResult.data ?? [])
        .map((row) => normalizeSlot(row))
        .filter((slot): slot is CgSlot => slot !== null);

      return this.zone.run(() => {
        this.loading.set(false);
        return {
          package: packageResult.data as CgPackage,
          slots,
        };
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch CG package failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async savePackage(
    pkg: Partial<CgPackage>,
    drafts: CgSlotDraft[],
  ): Promise<string | null> {
    const isNew = !pkg.tb_tyapp_cgpk_id;
    const {
      tb_tyapp_cgpk_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...packagePayload
    } = pkg;

    this.loading.set(true);
    try {
      const packageQuery = isNew
        ? this.supabase
            .from('tyapp_cg_package')
            .insert({
              name: packagePayload.name?.trim(),
              role: packagePayload.role,
              status: packagePayload.status,
            })
            .select()
            .single()
        : this.supabase
            .from('tyapp_cg_package')
            .update({
              name: packagePayload.name?.trim(),
              role: packagePayload.role,
              status: packagePayload.status,
              updated_at: new Date().toISOString(),
            })
            .eq('tb_tyapp_cgpk_id', pkg.tb_tyapp_cgpk_id)
            .select()
            .single();

      const { data: savedPackage, error: packageError } = await packageQuery;
      if (packageError) throw packageError;

      const saved = savedPackage as CgPackage;
      const packageId = saved.tb_tyapp_cgpk_id;
      const existing = isNew
        ? []
        : this.slots().filter((slot) => slot.package_id === packageId);
      const keptIds = new Set(
        drafts
          .map((draft) => draft.tb_tyapp_cgsl_id)
          .filter((id): id is string => !!id),
      );

      for (const stale of existing.filter(
        (slot) => !keptIds.has(slot.tb_tyapp_cgsl_id),
      )) {
        const { error } = await this.supabase.rpc(
          'tyapp_cg_slot_soft_delete_single_record',
          { record_id: stale.tb_tyapp_cgsl_id },
        );
        if (error) throw error;
      }

      const savedSlots: CgSlot[] = [];
      for (const [index, draft] of drafts.entries()) {
        const row = {
          package_id: packageId,
          component_type: draft.component_type,
          public_token: draft.public_token,
          layout: draft.layout,
          payload: draft.payload,
          visible: draft.visible,
          sort_order: index,
          status: draft.status,
          updated_at: new Date().toISOString(),
        };

        const slotQuery = draft.tb_tyapp_cgsl_id
          ? this.supabase
              .from('tyapp_cg_slot')
              .update(row)
              .eq('tb_tyapp_cgsl_id', draft.tb_tyapp_cgsl_id)
              .select()
              .single()
          : this.supabase.from('tyapp_cg_slot').insert(row).select().single();

        const { data, error } = await slotQuery;
        if (error) throw error;
        const normalized = normalizeSlot(data);
        if (normalized) savedSlots.push(normalized);
      }

      return this.zone.run(() => {
        this.packages.update((list) =>
          isNew
            ? [...list, saved].sort((a, b) => a.name.localeCompare(b.name))
            : list.map((item) =>
                item.tb_tyapp_cgpk_id === saved.tb_tyapp_cgpk_id ? saved : item,
              ),
        );
        this.slots.update((list) => [
          ...list.filter((slot) => slot.package_id !== packageId),
          ...savedSlots,
        ]);
        this.loading.set(false);
        this.notification.showSuccess('Package saved');
        return packageId;
      });
    } catch (error: unknown) {
      this.notification.handleError('Save CG package failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async deletePackage(id: string): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(
        'tyapp_cg_package_soft_delete_single_record',
        { record_id: id },
      );
      if (error) throw error;

      return this.zone.run(() => {
        this.packages.update((list) =>
          list.filter((item) => item.tb_tyapp_cgpk_id !== id),
        );
        this.slots.update((list) =>
          list.filter((slot) => slot.package_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Package deleted');
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError('Delete CG package failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  async fetchPublicSlot(token: string): Promise<CgPublicSlot | null> {
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_cg_get_slot_by_token',
        { p_token: token },
      );
      if (error) throw error;
      return normalizePublicSlot(data);
    } catch {
      return null;
    }
  }
}
