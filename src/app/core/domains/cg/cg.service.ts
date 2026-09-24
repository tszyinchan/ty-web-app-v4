import { Injectable, NgZone, inject, signal } from '@angular/core';
import { RecordStatus } from '../../models/status.enum';
import { NotificationService } from '../../services/notification.service';
import { SupabaseService } from '../../services/supabase.service';
import {
  CG_DEFAULT_DURATION_MS,
  CgElementType,
  CgPackageLook,
  CgPackageRole,
} from './cg.constants';
import { CgLayer, CgLayerDraft, CgLayerPayload, CgPackage, CgPublicOutput } from './cg.model';
import {
  createCgPublicToken,
  createEmptyLogoLayer,
  emptySubtitlePayload,
  layerToDraft,
  normalizeDurationMs,
  normalizeLayer,
  normalizeLayerLook,
  normalizeLayerPayload,
  normalizeLook,
  normalizePackage,
  normalizePublicOutput,
} from './cg.util';

@Injectable({ providedIn: 'root' })
export class CgService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  packages = signal<CgPackage[]>([]);
  layers = signal<CgLayer[]>([]);
  loading = signal(false);

  /** `undefined` = no session; `null` = new package; string = saved id. */
  draftKey = signal<string | null | undefined>(undefined);
  draftItem = signal<Partial<CgPackage> | null>(null);
  draftLayers = signal<CgLayerDraft[]>([]);
  draftOriginal = signal('');
  /** Last Save (+ live cue). Empty until the package exists in DB. */
  onAirItem = signal<Partial<CgPackage> | null>(null);
  onAirLayers = signal<CgLayerDraft[]>([]);

  async fetchAllPackages(force = false): Promise<void> {
    if (this.packages().length > 0 && !force) return;

    this.loading.set(true);
    try {
      const [packageResult, layerResult] = await Promise.all([
        this.supabase
          .from('tyapp_cg_package')
          .select('*')
          .is('deleted_at', null)
          .order('name', { ascending: true }),
        this.supabase
          .from('tyapp_cg_layer')
          .select('*')
          .is('deleted_at', null)
          .order('sort_order', { ascending: true }),
      ]);

      if (packageResult.error) throw packageResult.error;
      if (layerResult.error) throw layerResult.error;

      this.zone.run(() => {
        this.packages.set(
          (packageResult.data ?? [])
            .map((row) => normalizePackage(row))
            .filter((pkg): pkg is CgPackage => pkg !== null),
        );
        this.layers.set(
          (layerResult.data ?? [])
            .map((row) => normalizeLayer(row))
            .filter((layer): layer is CgLayer => layer !== null),
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
  ): Promise<{ package: CgPackage; layers: CgLayer[] } | null> {
    this.loading.set(true);
    try {
      const [packageResult, layerResult] = await Promise.all([
        this.supabase
          .from('tyapp_cg_package')
          .select('*')
          .eq('tb_tyapp_cgpk_id', id)
          .is('deleted_at', null)
          .single(),
        this.supabase
          .from('tyapp_cg_layer')
          .select('*')
          .eq('package_id', id)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true }),
      ]);

      if (packageResult.error) throw packageResult.error;
      if (layerResult.error) throw layerResult.error;

      const layers = (layerResult.data ?? [])
        .map((row) => normalizeLayer(row))
        .filter((layer): layer is CgLayer => layer !== null);

      const pkg = normalizePackage(packageResult.data);
      if (!pkg) throw new Error('CG package row was incomplete');

      return this.zone.run(() => {
        this.loading.set(false);
        return {
          package: pkg,
          layers,
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
    drafts: CgLayerDraft[],
  ): Promise<string | null> {
    const isNew = !pkg.tb_tyapp_cgpk_id;
    const {
      tb_tyapp_cgpk_seq_no,
      created_at,
      updated_at,
      deleted_at,
      ...packagePayload
    } = pkg;
    const publicToken =
      packagePayload.public_token?.trim() || createCgPublicToken();

    this.loading.set(true);
    try {
      const packageQuery = isNew
        ? this.supabase
            .from('tyapp_cg_package')
            .insert({
              name: packagePayload.name?.trim(),
              role: packagePayload.role,
              public_token: publicToken,
              duration_ms: normalizeDurationMs(packagePayload.duration_ms),
              look: normalizeLook(packagePayload.look),
              status: packagePayload.status,
            })
            .select()
            .single()
        : this.supabase
            .from('tyapp_cg_package')
            .update({
              name: packagePayload.name?.trim(),
              role: packagePayload.role,
              duration_ms: normalizeDurationMs(packagePayload.duration_ms),
              look: normalizeLook(packagePayload.look),
              status: packagePayload.status,
              updated_at: new Date().toISOString(),
            })
            .eq('tb_tyapp_cgpk_id', pkg.tb_tyapp_cgpk_id)
            .select()
            .single();

      const { data: savedPackage, error: packageError } = await packageQuery;
      if (packageError) throw packageError;

      const saved = normalizePackage(savedPackage);
      if (!saved) throw new Error('Saved CG package row was incomplete');
      const packageId = saved.tb_tyapp_cgpk_id;
      const existing = isNew
        ? []
        : this.layers().filter((layer) => layer.package_id === packageId);
      const keptIds = new Set(
        drafts
          .map((draft) => draft.tb_tyapp_cgly_id)
          .filter((id): id is string => !!id),
      );

      for (const stale of existing.filter(
        (layer) => !keptIds.has(layer.tb_tyapp_cgly_id),
      )) {
        const { error } = await this.supabase.rpc(
          'tyapp_cg_layer_soft_delete_single_record',
          { record_id: stale.tb_tyapp_cgly_id },
        );
        if (error) throw error;
      }

      const savedLayers: CgLayer[] = [];
      for (const [index, draft] of drafts.entries()) {
        const row = {
          package_id: packageId,
          element_type: draft.element_type,
          public_token: draft.public_token,
          layout: draft.layout,
          payload: draft.payload,
          visible: draft.visible,
          look: normalizeLayerLook(draft.look),
          sort_order: index,
          status: draft.status,
          updated_at: new Date().toISOString(),
        };

        const layerQuery = draft.tb_tyapp_cgly_id
          ? this.supabase
              .from('tyapp_cg_layer')
              .update(row)
              .eq('tb_tyapp_cgly_id', draft.tb_tyapp_cgly_id)
              .select()
              .single()
          : this.supabase.from('tyapp_cg_layer').insert(row).select().single();

        const { data, error } = await layerQuery;
        if (error) throw error;
        const normalized = normalizeLayer(data);
        if (normalized) savedLayers.push(normalized);
      }

      return this.zone.run(() => {
        this.packages.update((list) =>
          isNew
            ? [...list, saved].sort((a, b) => a.name.localeCompare(b.name))
            : list.map((item) =>
                item.tb_tyapp_cgpk_id === saved.tb_tyapp_cgpk_id ? saved : item,
              ),
        );
        this.layers.update((list) => [
          ...list.filter((layer) => layer.package_id !== packageId),
          ...savedLayers,
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
        this.layers.update((list) =>
          list.filter((layer) => layer.package_id !== id),
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

  beginNewDraft(): void {
    if (this.draftKey() === null && this.draftItem()) return;
    const logo = createEmptyLogoLayer(0);
    const created: Partial<CgPackage> = {
      name: '',
      role: CgPackageRole.Channel,
      public_token: createCgPublicToken(),
      duration_ms: CG_DEFAULT_DURATION_MS,
      look: CgPackageLook.Color,
      status: RecordStatus.Active,
    };
    this.draftKey.set(null);
    this.draftItem.set(created);
    this.draftLayers.set([logo]);
    this.clearOnAir();
    this.markDraftClean();
  }

  async loadSavedDraft(id: string): Promise<boolean> {
    if (this.draftKey() === id && this.draftItem()) return true;
    const fresh = await this.fetchPackageById(id);
    if (!fresh) return false;
    this.applyDraft(fresh.package, fresh.layers.map((layer) => layerToDraft(layer)));
    return true;
  }

  applyDraft(pkg: CgPackage, drafts: CgLayerDraft[]): void {
    this.draftKey.set(pkg.tb_tyapp_cgpk_id);
    this.draftItem.set(structuredClone(pkg));
    this.draftLayers.set(structuredClone(drafts));
    this.captureOnAir();
    this.markDraftClean();
  }

  clearDraft(): void {
    this.draftKey.set(undefined);
    this.draftItem.set(null);
    this.draftLayers.set([]);
    this.draftOriginal.set('');
    this.clearOnAir();
  }

  draftSnapshot(): {
    package: Partial<CgPackage> | null;
    layers: CgLayerDraft[];
  } {
    return {
      package: this.draftItem(),
      layers: this.draftLayers(),
    };
  }

  markDraftClean(): void {
    this.draftOriginal.set(JSON.stringify(this.draftSnapshot()));
  }

  private captureOnAir(): void {
    this.onAirItem.set(structuredClone(this.draftItem()));
    this.onAirLayers.set(structuredClone(this.draftLayers()));
  }

  private clearOnAir(): void {
    this.onAirItem.set(null);
    this.onAirLayers.set([]);
  }

  touchPreview(): void {
    this.draftLayers.update((list) =>
      list.map((layer) => ({
        ...layer,
        layout: { ...layer.layout },
        payload: { ...layer.payload, lines: [...layer.payload.lines] },
      })),
    );
  }

  setLayerVisible(clientId: string, visible: boolean): void {
    const previous = this.draftLayers().find((layer) => layer.clientId === clientId);
    if (!previous || previous.visible === visible) return;
    this.draftLayers.update((list) =>
      list.map((layer) =>
        layer.clientId === clientId ? { ...layer, visible } : layer,
      ),
    );
  }

  reorderLayers(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    this.draftLayers.update((list) => {
      const next = [...list];
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= next.length ||
        toIndex >= next.length
      ) {
        return list;
      }
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((layer, index) => ({ ...layer, sort_order: index }));
    });
  }

  async patchLayerPayload(
    clientId: string,
    payload: CgLayerPayload,
  ): Promise<boolean> {
    const current = this.draftLayers().find((layer) => layer.clientId === clientId);
    if (!current) return false;

    const nextDraft: CgLayerPayload = {
      ...current.payload,
      lines: [...payload.lines],
      index: payload.index,
      cursor: payload.cursor,
    };

    this.zone.run(() => {
      this.draftLayers.update((list) =>
        list.map((layer) =>
          layer.clientId === clientId
            ? { ...layer, payload: nextDraft }
            : layer,
        ),
      );
    });

    const layerId = current.tb_tyapp_cgly_id;
    if (!layerId) return true;

    const originalPayload = this.originalLayerPayload(clientId) ?? current.payload;
    const nextSaved: CgLayerPayload = {
      ...originalPayload,
      lines: [...payload.lines],
      index: payload.index,
      cursor: payload.cursor,
    };

    try {
      const { error } = await this.supabase
        .from('tyapp_cg_layer')
        .update({
          payload: nextSaved,
          updated_at: new Date().toISOString(),
        })
        .eq('tb_tyapp_cgly_id', layerId);
      if (error) throw error;
      this.zone.run(() => this.rememberLayerCue(clientId, nextSaved));
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Cue subtitle failed', error);
      return false;
    }
  }

  async patchLayerTransition(
    clientId: string,
    durationMs: unknown,
  ): Promise<boolean> {
    const current = this.draftLayers().find((layer) => layer.clientId === clientId);
    if (!current) return false;
    const ms = normalizeDurationMs(durationMs);
    const nextDraft: CgLayerPayload = {
      ...current.payload,
      transition: { duration_ms: ms },
    };

    this.zone.run(() => {
      this.draftLayers.update((list) =>
        list.map((layer) =>
          layer.clientId === clientId
            ? { ...layer, payload: nextDraft }
            : layer,
        ),
      );
      this.onAirLayers.update((list) =>
        list.map((layer) =>
          layer.clientId === clientId
            ? {
                ...layer,
                payload: {
                  ...layer.payload,
                  transition: { duration_ms: ms },
                },
              }
            : layer,
        ),
      );
    });

    const layerId = current.tb_tyapp_cgly_id;
    if (!layerId) {
      this.rememberLayerTransition(clientId, ms);
      return true;
    }

    const originalPayload = this.originalLayerPayload(clientId) ?? current.payload;
    const nextSaved: CgLayerPayload = {
      ...originalPayload,
      transition: { duration_ms: ms },
    };

    try {
      const { error } = await this.supabase
        .from('tyapp_cg_layer')
        .update({
          payload: nextSaved,
          updated_at: new Date().toISOString(),
        })
        .eq('tb_tyapp_cgly_id', layerId);
      if (error) throw error;
      this.zone.run(() => this.rememberLayerTransition(clientId, ms));
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Cue fade failed', error);
      return false;
    }
  }

  async copyLayerToPackage(
    source: CgLayerDraft,
    targetPackageId: string,
  ): Promise<CgLayer | null> {
    const target = this.packages().find(
      (pkg) => pkg.tb_tyapp_cgpk_id === targetPackageId,
    );
    if (!target) {
      this.notification.handleError(
        'Copy layer',
        'That package is not in the list.',
      );
      return null;
    }

    const payload = normalizeLayerPayload(source.element_type, source.payload);
    const copiedPayload =
      source.element_type === CgElementType.Subtitle
        ? emptySubtitlePayload(
            payload.lines,
            null,
            payload.cursor,
            payload.style,
            payload.transition?.duration_ms,
          )
        : payload;
    const siblings = this.layers().filter(
      (layer) => layer.package_id === targetPackageId,
    );
    const sortOrder =
      siblings.length > 0
        ? Math.max(...siblings.map((layer) => layer.sort_order)) + 1
        : 0;
    const row = {
      package_id: targetPackageId,
      element_type: source.element_type,
      public_token: createCgPublicToken(),
      layout: { ...source.layout },
      payload: copiedPayload,
      visible: source.visible,
      look: normalizeLayerLook(source.look),
      sort_order: sortOrder,
      status: source.status,
    };

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_cg_layer')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      const saved = normalizeLayer(data);
      if (!saved) throw new Error('Copied CG layer row was incomplete');

      return this.zone.run(() => {
        this.layers.update((list) => [...list, saved]);
        if (this.draftKey() === targetPackageId) {
          const draft = layerToDraft(saved);
          this.draftLayers.update((list) => [...list, draft]);
          this.appendOriginalLayer(draft);
        }
        this.loading.set(false);
        this.notification.showSuccess(`Copied to ${target.name}`);
        return saved;
      });
    } catch (error: unknown) {
      this.notification.handleError('Copy layer failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  private originalLayerPayload(clientId: string): CgLayerPayload | null {
    const raw = this.draftOriginal();
    if (!raw) return null;
    try {
      const snapshot = JSON.parse(raw) as { layers: CgLayerDraft[] };
      const layer = snapshot.layers.find((row) => row.clientId === clientId);
      return layer
        ? { ...layer.payload, lines: [...layer.payload.lines] }
        : null;
    } catch {
      return null;
    }
  }

  private rememberLayerCue(clientId: string, payload: CgLayerPayload): void {
    const raw = this.draftOriginal();
    if (!raw) return;
    try {
      const snapshot = JSON.parse(raw) as {
        package: Partial<CgPackage> | null;
        layers: CgLayerDraft[];
      };
      snapshot.layers = snapshot.layers.map((layer) =>
        layer.clientId === clientId
          ? {
              ...layer,
              payload: {
                ...layer.payload,
                lines: [...payload.lines],
                index: payload.index,
                cursor: payload.cursor,
              },
            }
          : layer,
      );
      this.draftOriginal.set(JSON.stringify(snapshot));
      this.onAirLayers.update((list) =>
        list.map((layer) =>
          layer.clientId === clientId
            ? {
                ...layer,
                payload: {
                  ...layer.payload,
                  lines: [...payload.lines],
                  index: payload.index,
                  cursor: payload.cursor,
                },
              }
            : layer,
        ),
      );
    } catch {
      return;
    }
  }

  private rememberLayerTransition(clientId: string, durationMs: number): void {
    const raw = this.draftOriginal();
    if (!raw) return;
    try {
      const snapshot = JSON.parse(raw) as {
        package: Partial<CgPackage> | null;
        layers: CgLayerDraft[];
      };
      snapshot.layers = snapshot.layers.map((layer) =>
        layer.clientId === clientId
          ? {
              ...layer,
              payload: {
                ...layer.payload,
                transition: { duration_ms: durationMs },
              },
            }
          : layer,
      );
      this.draftOriginal.set(JSON.stringify(snapshot));
    } catch {
      return;
    }
  }

  private appendOriginalLayer(draft: CgLayerDraft): void {
    const raw = this.draftOriginal();
    if (!raw) return;
    try {
      const snapshot = JSON.parse(raw) as {
        package: Partial<CgPackage> | null;
        layers: CgLayerDraft[];
      };
      snapshot.layers = [...snapshot.layers, structuredClone(draft)];
      this.draftOriginal.set(JSON.stringify(snapshot));
      this.onAirLayers.update((list) => [...list, structuredClone(draft)]);
    } catch {
      return;
    }
  }

  async fetchPublicOutput(token: string): Promise<CgPublicOutput | null> {
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_cg_get_output_by_token',
        { p_token: token },
      );
      if (error) throw error;
      return normalizePublicOutput(data);
    } catch {
      return null;
    }
  }
}
