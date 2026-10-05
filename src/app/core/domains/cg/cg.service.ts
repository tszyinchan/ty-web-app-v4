import { Injectable, NgZone, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { RecordStatus } from '../../models/status.enum';
import { NotificationService } from '../../services/notification.service';
import { SupabaseService } from '../../services/supabase.service';
import {
  CG_DEFAULT_DURATION_MS,
  CG_LOGO_BUCKET,
  CG_OVERLAY_BROADCAST_EVENT,
  CgElementType,
  CgPackageEditMode,
  CgPackageLook,
  CgPackageRole,
  CgPreviewBackdrop,
} from './cg.constants';
import { CgLayer, CgLayerDraft, CgLayerPayload, CgPackage, CgPublicOutput } from './cg.model';
import {
  cgOutputChannelName,
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
  readPackageEditMode,
  writePackageEditMode,
} from './cg.util';

/** Debounce Layer content writes (always Direct — not Package Take). */
const LAYER_CONTENT_AUTOSAVE_MS = 450;

@Injectable({ providedIn: 'root' })
export class CgService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);
  private overlayListenChannel: RealtimeChannel | null = null;
  private overlaySendChannels = new Map<string, RealtimeChannel>();
  private overlaySendJoins = new Map<string, Promise<RealtimeChannel | null>>();
  private layerContentPersistTimers = new Map<string, number>();
  private layerContentPersistInFlight = new Set<string>();

  packages = signal<CgPackage[]>([]);
  layers = signal<CgLayer[]>([]);
  loading = signal(false);

  /** `undefined` = no session; `null` = new package; string = saved id. */
  draftKey = signal<string | null | undefined>(undefined);
  draftItem = signal<Partial<CgPackage> | null>(null);
  draftLayers = signal<CgLayerDraft[]>([]);
  /**
   * Clean baseline for Package Unsaved / Take — mix only (package fields +
   * layer membership / visible / order). Layer content is never in here;
   * it is always Direct and does not dirty the Package.
   */
  draftOriginal = signal('');
  /** Last Save (+ live cue). Empty until the package exists in DB. */
  onAirItem = signal<Partial<CgPackage> | null>(null);
  onAirLayers = signal<CgLayerDraft[]>([]);
  /** Direct = live to air; Studio = Pending then Save. Per package in localStorage. */
  editMode = signal(CgPackageEditMode.Studio);
  /** Panel Stage checkerboard / dim — Package column monitors. */
  packageBackdrop = signal(CgPreviewBackdrop.Dim);
  /** Panel Stage checkerboard / dim — Layers tiles + Layer desk. */
  layersBackdrop = signal(CgPreviewBackdrop.Dim);

  loadEditModeForPackage(packageId: string | null): void {
    this.editMode.set(readPackageEditMode(packageId));
  }

  setEditMode(mode: CgPackageEditMode, packageId: string | null): void {
    this.editMode.set(mode);
    writePackageEditMode(packageId, mode);
  }

  isDirectEditMode(): boolean {
    return this.editMode() === CgPackageEditMode.Direct;
  }

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
    options?: { quiet?: boolean },
  ): Promise<string | null> {
    // Layer content is always Direct — flush pending desk writes before
    // mix Take/Create so a reload cannot clobber unsaved content.
    await this.flushPendingLayerContent();

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
        // Take / Package autosave owns mix only for existing rows. New rows
        // still need a full insert (first Create). Content edits after that
        // go through persistLayerContent / cue patches — never Take.
        const layerQuery = draft.tb_tyapp_cgly_id
          ? this.supabase
              .from('tyapp_cg_layer')
              .update({
                visible: draft.visible,
                sort_order: index,
                status: draft.status,
                updated_at: new Date().toISOString(),
              })
              .eq('tb_tyapp_cgly_id', draft.tb_tyapp_cgly_id)
              .select()
              .single()
          : this.supabase
              .from('tyapp_cg_layer')
              .insert({
                package_id: packageId,
                element_type: draft.element_type,
                public_token: draft.public_token,
                name: draft.name?.trim() ?? '',
                layout: draft.layout,
                payload: draft.payload,
                visible: draft.visible,
                look: normalizeLayerLook(draft.look),
                sort_order: index,
                status: draft.status,
              })
              .select()
              .single();

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
        if (!options?.quiet) {
          this.notification.showSuccess(isNew ? 'Package created' : 'On air');
        }
        void this.publishOverlayOutputs([
          saved.public_token,
          ...savedLayers.map((layer) => layer.public_token),
        ]);
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

      const removed = this.packages().find((item) => item.tb_tyapp_cgpk_id === id);
      const removedLayerTokens = this.layers()
        .filter((layer) => layer.package_id === id)
        .map((layer) => layer.public_token);

      return this.zone.run(() => {
        this.packages.update((list) =>
          list.filter((item) => item.tb_tyapp_cgpk_id !== id),
        );
        this.layers.update((list) =>
          list.filter((layer) => layer.package_id !== id),
        );
        this.loading.set(false);
        this.notification.showSuccess('Package deleted');
        if (removed) {
          void this.publishOverlayOutputs([
            removed.public_token,
            ...removedLayerTokens,
          ]);
        }
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
    this.loadEditModeForPackage(null);
  }

  async loadSavedDraft(id: string): Promise<boolean> {
    if (this.draftKey() === id && this.draftItem()) return true;
    const fresh = await this.fetchPackageById(id);
    if (!fresh) return false;
    this.applyDraft(fresh.package, fresh.layers.map((layer) => layerToDraft(layer)));
    this.loadEditModeForPackage(id);
    void this.ensureOverlaySendChannel(fresh.package.public_token);
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

  /**
   * Package Unsaved / Take baseline — mix only. Layer name / layout /
   * look / payload are never compared here (always Direct).
   */
  mixSnapshot(): {
    package: {
      name: string;
      role: CgPackage['role'];
      duration_ms: number;
      look: CgPackage['look'];
      status: CgPackage['status'];
    } | null;
    layers: Array<{
      clientId: string;
      tb_tyapp_cgly_id: string | null;
      element_type: CgLayerDraft['element_type'];
      visible: boolean;
      sort_order: number;
    }>;
  } {
    const pkg = this.draftItem();
    return {
      package: pkg
        ? {
            name: pkg.name?.trim() ?? '',
            role: pkg.role ?? CgPackageRole.Channel,
            duration_ms: normalizeDurationMs(pkg.duration_ms),
            look: normalizeLook(pkg.look),
            status: pkg.status ?? RecordStatus.Active,
          }
        : null,
      layers: this.draftLayers().map((layer, index) => ({
        clientId: layer.clientId,
        tb_tyapp_cgly_id: layer.tb_tyapp_cgly_id ?? null,
        element_type: layer.element_type,
        visible: layer.visible,
        sort_order: index,
      })),
    };
  }

  /** @deprecated Prefer mixSnapshot — kept name for call sites that mean mix. */
  draftSnapshot(): ReturnType<CgService['mixSnapshot']> {
    return this.mixSnapshot();
  }

  markDraftClean(): void {
    this.draftOriginal.set(JSON.stringify(this.mixSnapshot()));
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

  /**
   * Layer content is always Direct — layout / Look / payload / name go to
   * DB + On air whether Package Studio is waiting for Take or not. Mix
   * (visible / z-order / package fields) still waits for Take in Studio.
   * No-op until the layer row exists in DB.
   */
  schedulePersistLayerContent(clientId: string): void {
    // Layer Direct: Package On air / desk mirrors content immediately;
    // DB write stays debounced. Mix (visible / z-order) is untouched.
    this.mirrorLayerContentToOnAir(clientId);
    const previous = this.layerContentPersistTimers.get(clientId);
    if (previous !== undefined) window.clearTimeout(previous);
    const handle = window.setTimeout(() => {
      this.layerContentPersistTimers.delete(clientId);
      void this.persistLayerContent(clientId);
    }, LAYER_CONTENT_AUTOSAVE_MS);
    this.layerContentPersistTimers.set(clientId, handle);
  }

  /** Drop a pending Live write (Logo Studio Draft, or before Apply). */
  cancelPersistLayerContent(clientId: string): void {
    const previous = this.layerContentPersistTimers.get(clientId);
    if (previous === undefined) return;
    window.clearTimeout(previous);
    this.layerContentPersistTimers.delete(clientId);
  }

  /**
   * Logo Studio Apply: push desk content to On air + DB now.
   * Does not touch mix (visible / z-order).
   */
  async applyLayerContent(clientId: string): Promise<boolean> {
    this.cancelPersistLayerContent(clientId);
    this.mirrorLayerContentToOnAir(clientId);
    return this.persistLayerContent(clientId);
  }

  /** Run any debounced desk content writes now (before mix Take/Create). */
  async flushPendingLayerContent(): Promise<void> {
    const pending = [...this.layerContentPersistTimers.keys()];
    for (const clientId of pending) {
      const handle = this.layerContentPersistTimers.get(clientId);
      if (handle !== undefined) window.clearTimeout(handle);
      this.layerContentPersistTimers.delete(clientId);
    }
    await Promise.all(pending.map((id) => this.persistLayerContent(id)));
    for (let i = 0; i < 40 && this.layerContentPersistInFlight.size > 0; i++) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    }
  }

  async persistLayerContent(clientId: string): Promise<boolean> {
    const current = this.draftLayers().find((layer) => layer.clientId === clientId);
    if (!current?.tb_tyapp_cgly_id) return false;
    if (this.layerContentPersistInFlight.has(clientId)) {
      this.schedulePersistLayerContent(clientId);
      return false;
    }

    const layout = structuredClone(current.layout);
    const look = normalizeLayerLook(current.look);
    const name = current.name?.trim() ?? '';
    const payload = normalizeLayerPayload(current.element_type, current.payload);

    this.layerContentPersistInFlight.add(clientId);
    try {
      const { error } = await this.supabase
        .from('tyapp_cg_layer')
        .update({
          name,
          layout,
          look,
          payload,
          updated_at: new Date().toISOString(),
        })
        .eq('tb_tyapp_cgly_id', current.tb_tyapp_cgly_id);
      if (error) throw error;
      this.zone.run(() => {
        this.rememberLayerContent(clientId, { name, layout, look, payload });
      });
      void this.publishOverlayOutputs([
        this.draftItem()?.public_token,
        current.public_token,
      ]);
      return true;
    } catch (error: unknown) {
      this.notification.handleError('Layer update failed', error);
      return false;
    } finally {
      this.layerContentPersistInFlight.delete(clientId);
    }
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

    // Baseline = last On air content so a racing Style edit that has not
    // finished Layer Direct yet is not promoted by a cue click.
    const baseline = this.airLayerPayload(clientId) ?? current.payload;
    const nextSaved: CgLayerPayload = {
      ...baseline,
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
      void this.publishOverlayOutputs([
        this.draftItem()?.public_token,
        current.public_token,
      ]);
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

    const baseline = this.airLayerPayload(clientId) ?? current.payload;
    const nextSaved: CgLayerPayload = {
      ...baseline,
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
      void this.publishOverlayOutputs([
        this.draftItem()?.public_token,
        current.public_token,
      ]);
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
      name: source.name?.trim() ?? '',
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

  /** Uploads a Logo image to the public `cg-logo` Storage bucket and
   * returns its public URL — never embed image bytes in `payload.imageUrl`
   * (see cg.constants.ts CG_LOGO_BUCKET for why: the overlay polls forever). */
  async uploadLogoImage(layerToken: string, file: File): Promise<string | null> {
    const ext = file.type === 'image/webp' ? 'webp' : 'png';
    const folder = layerToken.replace(/[^a-zA-Z0-9_-]/g, '') || 'logo';
    const path = `${folder}/${Date.now()}.${ext}`;
    try {
      const { error: uploadError } = await this.supabase.storage
        .from(CG_LOGO_BUCKET)
        .upload(path, file, {
          contentType: file.type,
          cacheControl: '31536000',
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { data } = this.supabase.storage
        .from(CG_LOGO_BUCKET)
        .getPublicUrl(path);
      return data.publicUrl;
    } catch (error: unknown) {
      this.notification.handleError('Logo upload failed', error);
      return null;
    }
  }

  /** Last On-air payload for this layer (cue merges into this, not mix baseline). */
  private airLayerPayload(clientId: string): CgLayerPayload | null {
    const layer = this.onAirLayers().find((row) => row.clientId === clientId);
    return layer
      ? { ...layer.payload, lines: [...layer.payload.lines] }
      : null;
  }

  private rememberLayerCue(clientId: string, payload: CgLayerPayload): void {
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
  }

  private rememberLayerTransition(clientId: string, durationMs: number): void {
    this.onAirLayers.update((list) =>
      list.map((layer) =>
        layer.clientId === clientId
          ? {
              ...layer,
              payload: {
                ...layer.payload,
                transition: { duration_ms: durationMs },
              },
            }
          : layer,
      ),
    );
  }

  /** Push draft content onto On air without touching mix (visible / sort). */
  private mirrorLayerContentToOnAir(clientId: string): void {
    const current = this.draftLayers().find((layer) => layer.clientId === clientId);
    if (!current) return;
    this.rememberLayerContent(clientId, {
      name: current.name?.trim() ?? '',
      layout: current.layout,
      look: normalizeLayerLook(current.look),
      payload: normalizeLayerPayload(current.element_type, current.payload),
    });
  }

  /** After Layer Direct content save: promote content on air (mix unchanged). */
  private rememberLayerContent(
    clientId: string,
    next: {
      name: string;
      layout: CgLayerDraft['layout'];
      look: CgLayerDraft['look'];
      payload: CgLayerPayload;
    },
  ): void {
    const apply = (layer: CgLayerDraft): CgLayerDraft =>
      layer.clientId === clientId
        ? {
            ...layer,
            name: next.name,
            layout: structuredClone(next.layout),
            look: next.look,
            payload: {
              ...next.payload,
              lines: [...next.payload.lines],
            },
          }
        : layer;

    this.onAirLayers.update((list) => list.map(apply));
  }

  private appendOriginalLayer(draft: CgLayerDraft): void {
    const raw = this.draftOriginal();
    if (!raw) return;
    try {
      const snapshot = JSON.parse(raw) as ReturnType<CgService['mixSnapshot']>;
      snapshot.layers = [
        ...snapshot.layers,
        {
          clientId: draft.clientId,
          tb_tyapp_cgly_id: draft.tb_tyapp_cgly_id ?? null,
          element_type: draft.element_type,
          visible: draft.visible,
          sort_order: snapshot.layers.length,
        },
      ];
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

  subscribeOverlayOutput(
    token: string,
    onSync: (output: CgPublicOutput | null) => void,
  ): void {
    void this.unsubscribeOverlayOutput();
    if (!token) return;
    this.overlayListenChannel = this.supabase
      .channel(cgOutputChannelName(token))
      .on(
        'broadcast',
        { event: CG_OVERLAY_BROADCAST_EVENT },
        (message: { payload?: unknown }) => {
          const output = normalizePublicOutput(message.payload);
          this.zone.run(() => onSync(output));
        },
      )
      .subscribe();
  }

  async unsubscribeOverlayOutput(): Promise<void> {
    if (!this.overlayListenChannel) return;
    const channel = this.overlayListenChannel;
    this.overlayListenChannel = null;
    await this.supabase.removeChannel(channel);
  }

  private async publishOverlayOutputs(
    tokens: Array<string | null | undefined>,
  ): Promise<void> {
    const unique = [...new Set(tokens.filter((token): token is string => !!token))];
    await Promise.all(unique.map((token) => this.publishOverlayOutput(token)));
  }

  private async publishOverlayOutput(token: string): Promise<void> {
    const channel = await this.ensureOverlaySendChannel(token);
    if (!channel) return;
    const output = await this.fetchPublicOutput(token);
    await channel.send({
      type: 'broadcast',
      event: CG_OVERLAY_BROADCAST_EVENT,
      payload: output ?? {},
    });
  }

  private async ensureOverlaySendChannel(
    token: string,
  ): Promise<RealtimeChannel | null> {
    const existing = this.overlaySendChannels.get(token);
    if (existing) return existing;
    const pending = this.overlaySendJoins.get(token);
    if (pending) return pending;

    const join = this.joinOverlaySendChannel(token);
    this.overlaySendJoins.set(token, join);
    try {
      return await join;
    } finally {
      this.overlaySendJoins.delete(token);
    }
  }

  private async joinOverlaySendChannel(
    token: string,
  ): Promise<RealtimeChannel | null> {
    const channel = this.supabase.channel(cgOutputChannelName(token));
    const joined = await new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(false), 4000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          window.clearTimeout(timer);
          resolve(true);
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          window.clearTimeout(timer);
          this.overlaySendChannels.delete(token);
          resolve(false);
        }
      });
    });
    if (!joined) {
      void this.supabase.removeChannel(channel);
      return null;
    }
    this.overlaySendChannels.set(token, channel);
    return channel;
  }
}
