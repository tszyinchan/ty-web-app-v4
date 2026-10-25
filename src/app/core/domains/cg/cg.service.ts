import { Injectable, NgZone, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { RecordStatus } from '../../models/status.enum';
import { NotificationService } from '../../services/notification.service';
import { SupabaseService } from '../../services/supabase.service';
import {
  CG_DEFAULT_DURATION_MS,
  CG_LOGO_BUCKET,
  CG_OVERLAY_BROADCAST_EVENT,
  CG_OVERLAY_CUE_KIND,
  CG_OVERLAY_PRESENCE_ROLE,
  CG_PRESENCE_SYNC_WAIT_MS,
  CgElementType,
  CgPackageEditMode,
  CgPackageLook,
  CgPackageRole,
  CgPreviewBackdrop,
} from './cg.constants';
import {
  CgLayer,
  CgLayerDraft,
  CgLayerPayload,
  CgOutputState,
  CgOverlayCueMessage,
  CgPackage,
  CgPublicOutput,
} from './cg.model';
import {
  cgOutputChannelName,
  createCgPublicToken,
  createEmptyLogoLayer,
  emptySubtitlePayload,
  isOverlayCueMessage,
  layerContentSignature,
  layerToDraft,
  normalizeDurationMs,
  normalizeLayer,
  normalizeLayerLook,
  normalizeLayerPayload,
  normalizeLook,
  normalizeOutputState,
  normalizePackage,
  normalizePublicOutput,
  readPackageEditMode,
  writePackageEditMode,
} from './cg.util';

/** Debounce Layer content writes (always Direct — not Package Take). */
const LAYER_CONTENT_AUTOSAVE_MS = 450;

/**
 * Columns the list needs from `tyapp_cg_layer` — `normalizeLayer` requires
 * id / package_id / public_token / element_type; `payload` is left out.
 */
const CG_LAYER_LIST_COLUMNS =
  'tb_tyapp_cgly_id, package_id, element_type, public_token, name, visible, sort_order, status';

@Injectable({ providedIn: 'root' })
export class CgService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);
  private overlayListenChannel: RealtimeChannel | null = null;
  private overlaySendChannels = new Map<string, RealtimeChannel>();
  private overlaySendJoins = new Map<string, Promise<RealtimeChannel | null>>();
  /** Per send channel: resolves `true` on the first Presence sync. */
  private overlayPresenceSynced = new Map<string, Promise<boolean>>();
  /**
   * Last OBS-visible content (layout / look / payload without the cue) that
   * was published per Layer. Lets a Name-only edit skip the publish. Missing
   * entry = unknown, which always publishes (fail-open).
   */
  private lastPublishedSig = new Map<string, string>();
  private layerContentPersistTimers = new Map<string, number>();
  private transitionPersistTimers = new Map<string, number>();
  private layerContentPersistInFlight = new Set<string>();
  private cueSeqByClient = new Map<string, number>();
  private cueWriteQueue = new Map<
    string,
    { index: number | null; cursor: number }
  >();
  private cueFlushPromises = new Map<string, Promise<void>>();

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
  /**
   * What OBS has: the exact RPC output last sent to the overlay (only set
   * after Realtime `send` succeeded). `null` until the package exists.
   */
  onAirOutput = signal<CgPublicOutput | null>(null);
  /** Latest live cue that reached OBS (package token). */
  onAirCue = signal<CgOverlayCueMessage | null>(null);
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
        // List summary only (never `payload`, which holds the subtitle
        // lines). A Panel loads full rows via fetchPackageById.
        this.supabase
          .from('tyapp_cg_layer')
          .select(CG_LAYER_LIST_COLUMNS)
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
  ): Promise<{ packageId: string; package: CgPackage; layers: CgLayer[] } | null> {
    // Layer content is always Direct — flush pending desk writes before
    // mix Take/Create so a reload cannot clobber unsaved content.
    await this.flushPendingLayerContent();
    // Last clean mix (load / previous save): lets us write and publish only
    // what really changed.
    const baseline = this.mixBaseline();

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

      const staleLayers = existing.filter(
        (layer) => !keptIds.has(layer.tb_tyapp_cgly_id),
      );
      for (const stale of staleLayers) {
        const { error } = await this.supabase.rpc(
          'tyapp_cg_layer_soft_delete_single_record',
          { record_id: stale.tb_tyapp_cgly_id },
        );
        if (error) throw error;
      }

      const baselineById = new Map(
        (baseline?.layers ?? [])
          .filter((row) => !!row.tb_tyapp_cgly_id)
          .map((row) => [row.tb_tyapp_cgly_id as string, row]),
      );
      // What changed decides what gets written and published. No baseline
      // (or a brand-new package) means everything is treated as changed.
      let mixChanged = isNew || !baseline || staleLayers.length > 0;
      const changedLayerTokens: string[] = [];
      const savedLayers: CgLayer[] = [];
      for (const [index, draft] of drafts.entries()) {
        // Take / Package autosave owns mix only for existing rows. New rows
        // still need a full insert (first Create). Content edits after that
        // go through persistLayerContent / cue patches — never Take.
        if (draft.tb_tyapp_cgly_id) {
          const before = baselineById.get(draft.tb_tyapp_cgly_id);
          const unchanged =
            !!before &&
            before.visible === draft.visible &&
            before.sort_order === index;
          if (!unchanged) {
            // No `.select()`: the row (with its subtitle lines) stays in the DB.
            const { error } = await this.supabase
              .from('tyapp_cg_layer')
              .update({
                visible: draft.visible,
                sort_order: index,
                status: draft.status,
                updated_at: new Date().toISOString(),
              })
              .eq('tb_tyapp_cgly_id', draft.tb_tyapp_cgly_id);
            if (error) throw error;
            mixChanged = true;
            if (!before || before.visible !== draft.visible) {
              changedLayerTokens.push(draft.public_token);
            }
          }
          savedLayers.push(
            this.layerFromDraft(
              draft,
              packageId,
              index,
              draft.tb_tyapp_cgly_id,
            ),
          );
          continue;
        }

        const { data, error } = await this.supabase
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
          .select('tb_tyapp_cgly_id, tb_tyapp_cgly_seq_no, created_at, updated_at')
          .single();
        if (error) throw error;
        const row = data as unknown as Record<string, unknown>;
        const newId = row['tb_tyapp_cgly_id'];
        if (typeof newId !== 'string' || !newId) {
          throw new Error('Inserted CG layer row was incomplete');
        }
        mixChanged = true;
        changedLayerTokens.push(draft.public_token);
        savedLayers.push(this.layerFromDraft(draft, packageId, index, newId, row));
      }

      // Layer outputs embed the Package duration / look, so those reach every
      // Layer token; Name / Role are not rendered by OBS at all.
      const packageOutputChanged =
        isNew ||
        !baseline?.package ||
        baseline.package.duration_ms !== saved.duration_ms ||
        baseline.package.look !== saved.look ||
        baseline.package.status !== saved.status;
      const publishPackage = mixChanged || packageOutputChanged;
      const publishLayerTokens = [
        ...staleLayers.map((layer) => layer.public_token),
        ...(packageOutputChanged
          ? savedLayers.map((layer) => layer.public_token)
          : changedLayerTokens),
      ];

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
        if (publishPackage) {
          void this.publishOverlayOutputs(
            saved.public_token,
            publishLayerTokens,
          );
        }
        return { packageId, package: saved, layers: savedLayers };
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
          void this.publishOverlayOutputs(
            removed.public_token,
            removedLayerTokens,
          );
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
    this.lastPublishedSig.clear();
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
    this.clearOnAir();
    this.applyDraft(fresh.package, fresh.layers.map((layer) => layerToDraft(layer)));
    this.loadEditModeForPackage(id);
    void this.ensureOverlaySendChannel(fresh.package.public_token);
    const output = await this.fetchPublicOutput(fresh.package.public_token);
    this.zone.run(() => {
      // Ignore a late reply if the operator already moved to another package.
      if (this.draftKey() === id) this.onAirOutput.set(output);
    });
    return true;
  }

  applyDraft(pkg: CgPackage, drafts: CgLayerDraft[]): void {
    this.draftKey.set(pkg.tb_tyapp_cgpk_id);
    this.draftItem.set(structuredClone(pkg));
    this.draftLayers.set(structuredClone(drafts));
    // Freshly loaded content is what OBS already has.
    this.lastPublishedSig.clear();
    this.seedPublishedSigs(drafts);
    this.markDraftClean();
  }

  /** Remember current content as published (only rows not tracked yet). */
  private seedPublishedSigs(drafts: CgLayerDraft[]): void {
    for (const draft of drafts) {
      if (!draft.tb_tyapp_cgly_id || this.lastPublishedSig.has(draft.clientId)) {
        continue;
      }
      this.lastPublishedSig.set(draft.clientId, layerContentSignature(draft));
    }
  }

  /**
   * After Take / Direct autosave: keep existing layer objects (content is
   * always Live and was flushed before save) so an edit made after the flush
   * is not overwritten. Only mix fields come from the saved rows; rows that
   * were just inserted are taken as saved.
   */
  mergeSavedDraft(pkg: CgPackage, saved: CgLayerDraft[]): void {
    const keep = new Map(
      this.draftLayers()
        .filter((layer) => !!layer.tb_tyapp_cgly_id)
        .map((layer) => [layer.tb_tyapp_cgly_id as string, layer]),
    );
    this.draftKey.set(pkg.tb_tyapp_cgpk_id);
    this.draftItem.set(structuredClone(pkg));
    this.draftLayers.set(
      saved.map((fresh) => {
        const current = fresh.tb_tyapp_cgly_id
          ? keep.get(fresh.tb_tyapp_cgly_id)
          : undefined;
        return current
          ? {
              ...current,
              visible: fresh.visible,
              sort_order: fresh.sort_order,
              status: fresh.status,
            }
          : structuredClone(fresh);
      }),
    );
    // Only rows that were just inserted: existing rows keep their own entry
    // (a missing one stays "unknown" and publishes on the next edit).
    this.seedPublishedSigs(
      saved.filter(
        (row) => !row.tb_tyapp_cgly_id || !keep.has(row.tb_tyapp_cgly_id),
      ),
    );
    this.markDraftClean();
  }

  clearDraft(): void {
    this.lastPublishedSig.clear();
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

  /** Mix as of the last clean point (load / save), or `null` if unknown. */
  private mixBaseline(): ReturnType<CgService['mixSnapshot']> | null {
    const raw = this.draftOriginal();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ReturnType<CgService['mixSnapshot']>;
    } catch {
      return null;
    }
  }

  /** A saved Layer row built from the draft that was just written. */
  private layerFromDraft(
    draft: CgLayerDraft,
    packageId: string,
    sortOrder: number,
    id: string,
    row?: Record<string, unknown>,
  ): CgLayer {
    const seq = row?.['tb_tyapp_cgly_seq_no'];
    const created = row?.['created_at'];
    const updated = row?.['updated_at'];
    return {
      tb_tyapp_cgly_id: id,
      tb_tyapp_cgly_seq_no: typeof seq === 'number' ? seq : undefined,
      package_id: packageId,
      element_type: draft.element_type,
      public_token: draft.public_token,
      name: draft.name?.trim() ?? '',
      layout: structuredClone(draft.layout),
      payload: normalizeLayerPayload(draft.element_type, draft.payload),
      visible: draft.visible,
      look: normalizeLayerLook(draft.look),
      sort_order: sortOrder,
      status: draft.status,
      created_at: typeof created === 'string' ? created : undefined,
      updated_at: typeof updated === 'string' ? updated : undefined,
      deleted_at: null,
    };
  }

  private clearOnAir(): void {
    this.onAirOutput.set(null);
    this.onAirCue.set(null);
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
    // Layer content is always Live: DB write is debounced, then the output
    // is published (Panel On air follows that publish, not the draft).
    const previous = this.layerContentPersistTimers.get(clientId);
    if (previous !== undefined) window.clearTimeout(previous);
    const handle = window.setTimeout(() => {
      this.layerContentPersistTimers.delete(clientId);
      void this.persistLayerContent(clientId);
    }, LAYER_CONTENT_AUTOSAVE_MS);
    this.layerContentPersistTimers.set(clientId, handle);
  }

  /** Drop a pending Live write (layer removed from the draft). */
  cancelPersistLayerContent(clientId: string): void {
    const transition = this.transitionPersistTimers.get(clientId);
    if (transition !== undefined) {
      window.clearTimeout(transition);
      this.transitionPersistTimers.delete(clientId);
    }
    const previous = this.layerContentPersistTimers.get(clientId);
    if (previous === undefined) return;
    window.clearTimeout(previous);
    this.layerContentPersistTimers.delete(clientId);
  }

  /** Run any debounced desk content writes now (before mix Take/Create). */
  async flushPendingLayerContent(): Promise<void> {
    const pending = [...this.layerContentPersistTimers.keys()];
    for (const clientId of pending) {
      const handle = this.layerContentPersistTimers.get(clientId);
      if (handle !== undefined) window.clearTimeout(handle);
      this.layerContentPersistTimers.delete(clientId);
    }
    const pendingTransitions = [...this.transitionPersistTimers.keys()];
    for (const clientId of pendingTransitions) {
      const handle = this.transitionPersistTimers.get(clientId);
      if (handle !== undefined) window.clearTimeout(handle);
      this.transitionPersistTimers.delete(clientId);
    }
    await Promise.all([
      ...pending.map((id) => this.persistLayerContent(id)),
      ...pendingTransitions.map((id) => this.persistLayerTransition(id)),
    ]);
    for (let i = 0; i < 40 && this.layerContentPersistInFlight.size > 0; i++) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    }
    await this.waitForPendingCueWrites();
  }

  async persistLayerContent(clientId: string): Promise<boolean> {
    await this.waitForPendingCueWrites();
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
      // Publish only when OBS would see something different (a Name-only
      // edit changes nothing on air). Unknown baseline always publishes.
      const signature = layerContentSignature({
        element_type: current.element_type,
        layout,
        look,
        payload,
      });
      if (this.lastPublishedSig.get(clientId) !== signature) {
        this.lastPublishedSig.set(clientId, signature);
        void this.publishOverlayOutputs(this.draftItem()?.public_token, [
          current.public_token,
        ]).then((published) => {
          // Did not reach OBS — forget it so the next edit publishes again.
          if (!published) this.lastPublishedSig.delete(clientId);
        });
      }
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

  async cueLayer(
    clientId: string,
    index: number | null,
    cursor: number,
  ): Promise<boolean> {
    const current = this.draftLayers().find((layer) => layer.clientId === clientId);
    if (!current) return false;

    this.zone.run(() => this.setDraftCue(clientId, index, cursor));

    // Time-based floor so a Panel reload (counter back to 0) still beats the
    // overlay's remembered seq.
    const seq = Math.max(
      (this.cueSeqByClient.get(clientId) ?? 0) + 1,
      Date.now(),
    );
    this.cueSeqByClient.set(clientId, seq);

    const layerId = current.tb_tyapp_cgly_id;
    const message: CgOverlayCueMessage = {
      kind: CG_OVERLAY_CUE_KIND,
      layerId: layerId ?? clientId,
      index,
      cursor,
      seq,
    };
    void this.broadcastCue(
      [this.draftItem()?.public_token, current.public_token],
      message,
    );

    if (!layerId) return true;

    this.cueWriteQueue.set(clientId, { index, cursor });
    if (!this.cueFlushPromises.has(clientId)) {
      const flush = this.flushCueWrites(clientId, layerId).finally(() => {
        this.cueFlushPromises.delete(clientId);
      });
      this.cueFlushPromises.set(clientId, flush);
    }
    return true;
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

    // Layer content is always Live, so the draft payload is what goes to DB.
    try {
      const { error } = await this.supabase
        .from('tyapp_cg_layer')
        .update({
          payload: nextDraft,
          updated_at: new Date().toISOString(),
        })
        .eq('tb_tyapp_cgly_id', layerId);
      if (error) throw error;
      // Lines changed: always publish, and forget the content signature so
      // the next desk edit re-publishes once (never skip on a stale baseline).
      this.lastPublishedSig.delete(clientId);
      void this.publishOverlayOutputs(this.draftItem()?.public_token, [
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
    });

    if (!current.tb_tyapp_cgly_id) return true;

    // Local draft is already updated. The DB write + publish are coalesced
    // (latest wins) so typing or wheel scrubbing the ms field sends one write.
    const previous = this.transitionPersistTimers.get(clientId);
    if (previous !== undefined) window.clearTimeout(previous);
    this.transitionPersistTimers.set(
      clientId,
      window.setTimeout(() => {
        this.transitionPersistTimers.delete(clientId);
        void this.persistLayerTransition(clientId);
      }, LAYER_CONTENT_AUTOSAVE_MS),
    );
    return true;
  }

  private async persistLayerTransition(clientId: string): Promise<boolean> {
    await this.waitForPendingCueWrites();
    const current = this.draftLayers().find((layer) => layer.clientId === clientId);
    const layerId = current?.tb_tyapp_cgly_id;
    if (!current || !layerId) return false;
    try {
      const { error } = await this.supabase
        .from('tyapp_cg_layer')
        .update({
          payload: current.payload,
          updated_at: new Date().toISOString(),
        })
        .eq('tb_tyapp_cgly_id', layerId);
      if (error) throw error;
      this.lastPublishedSig.delete(clientId);
      void this.publishOverlayOutputs(this.draftItem()?.public_token, [
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
        this.loading.set(false);
        // Target may be on air in OBS right now — don't wait for the 30s poll.
        void this.publishOverlayOutputs(target.public_token, [
          saved.public_token,
        ]);
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

  private setDraftCue(
    clientId: string,
    index: number | null,
    cursor: number,
  ): void {
    this.draftLayers.update((list) =>
      list.map((layer) =>
        layer.clientId === clientId
          ? { ...layer, payload: { ...layer.payload, index, cursor } }
          : layer,
      ),
    );
  }

  private async flushCueWrites(
    clientId: string,
    layerId: string,
  ): Promise<void> {
    try {
      while (this.cueWriteQueue.has(clientId)) {
        while (this.layerContentPersistInFlight.has(clientId)) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
        }
        const next = this.cueWriteQueue.get(clientId);
        if (!next) break;
        this.cueWriteQueue.delete(clientId);
        const { error } = await this.supabase.rpc('tyapp_cg_layer_set_cue', {
          p_layer_id: layerId,
          p_index: next.index,
          p_cursor: next.cursor,
        });
        if (error) {
          const source = this.draftLayers().find(
            (layer) => layer.clientId === clientId,
          )?.payload;
          if (!source) throw error;
          const { error: fallbackError } = await this.supabase
            .from('tyapp_cg_layer')
            .update({
              payload: {
                ...source,
                lines: [...source.lines],
                index: next.index,
                cursor: next.cursor,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('tb_tyapp_cgly_id', layerId);
          if (fallbackError) throw error;
        }
        if (this.cueWriteQueue.has(clientId)) continue;
        this.zone.run(() =>
          this.setDraftCue(clientId, next.index, next.cursor),
        );
        const current = this.draftLayers().find(
          (layer) => layer.clientId === clientId,
        );
        void this.broadcastCue(
          [this.draftItem()?.public_token, current?.public_token],
          {
            kind: CG_OVERLAY_CUE_KIND,
            layerId,
            index: next.index,
            cursor: next.cursor,
            seq: this.cueSeqByClient.get(clientId) ?? 0,
          },
        );
      }
    } catch (error: unknown) {
      this.notification.handleError('Cue subtitle failed', error);
    }
  }

  private async broadcastCue(
    tokens: Array<string | null | undefined>,
    message: CgOverlayCueMessage,
  ): Promise<void> {
    const unique = [
      ...new Set(tokens.filter((token): token is string => !!token)),
    ];
    await Promise.all(
      unique.map(async (token) => {
        const channel = await this.ensureOverlaySendChannel(token);
        if (!channel) return;
        const result = await channel.send({
          type: 'broadcast',
          event: CG_OVERLAY_BROADCAST_EVENT,
          payload: message,
        });
        // Panel On air only follows a cue that really reached the channel.
        if (result === 'ok' && token === this.draftItem()?.public_token) {
          this.zone.run(() => this.onAirCue.set(message));
        }
      }),
    );
  }

  private async waitForPendingCueWrites(): Promise<void> {
    const pending = [...this.cueFlushPromises.values()];
    if (pending.length === 0) return;
    await Promise.all(pending);
  }

  async fetchPublicOutput(token: string): Promise<CgPublicOutput | null> {
    return (await this.fetchPublicOutputResult(token)).output;
  }

  /**
   * `ok: false` = the request failed (network / RPC error) — callers must not
   * treat that as "nothing on air". `ok: true, output: null` = token is gone.
   */
  async fetchPublicOutputResult(
    token: string,
  ): Promise<{ ok: boolean; output: CgPublicOutput | null }> {
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_cg_get_output_by_token',
        { p_token: token },
      );
      if (error) throw error;
      return { ok: true, output: normalizePublicOutput(data) };
    } catch {
      return { ok: false, output: null };
    }
  }

  /**
   * Safety-poll state (content `rev` + stored cues, a few hundred bytes).
   * `undefined` = request failed or RPC missing; `null` = token is gone.
   */
  async fetchPublicOutputState(
    token: string,
  ): Promise<CgOutputState | null | undefined> {
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_cg_get_output_state_by_token',
        { p_token: token },
      );
      if (error) throw error;
      if (data == null) return null;
      return normalizeOutputState(data) ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Overlay side. `onResubscribed` fires when the channel rejoins after a
   * drop (not on the first join) so the caller can catch up on missed messages.
   * The overlay also announces itself via Presence so the Panel can skip
   * publishing Layer tokens that nobody is watching.
   */
  subscribeOverlayOutput(
    token: string,
    onSync: (output: CgPublicOutput | null) => void,
    onCue?: (cue: CgOverlayCueMessage) => void,
    onResubscribed?: () => void,
  ): void {
    void this.unsubscribeOverlayOutput();
    if (!token) return;
    const channel = this.supabase.channel(cgOutputChannelName(token));
    let joinedBefore = false;
    channel
      .on(
        'broadcast',
        { event: CG_OVERLAY_BROADCAST_EVENT },
        (message: { payload?: unknown }) => {
          if (isOverlayCueMessage(message.payload)) {
            const cue = message.payload;
            this.zone.run(() => onCue?.(cue));
            return;
          }
          const output = normalizePublicOutput(message.payload);
          this.zone.run(() => onSync(output));
        },
      )
      // Binding a Presence listener is what turns Presence on for this join.
      .on('presence', { event: 'sync' }, () => undefined)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        void channel.track({ role: CG_OVERLAY_PRESENCE_ROLE });
        if (joinedBefore) {
          this.zone.run(() => onResubscribed?.());
        }
        joinedBefore = true;
      });
    this.overlayListenChannel = channel;
  }

  async unsubscribeOverlayOutput(): Promise<void> {
    if (!this.overlayListenChannel) return;
    const channel = this.overlayListenChannel;
    this.overlayListenChannel = null;
    await this.supabase.removeChannel(channel);
  }

  /**
   * Publish the DB's output to overlays. The Package token always publishes
   * (that is what OBS uses, and an overlay that was not refreshed after a
   * deploy does not announce Presence). Layer tokens publish only when an
   * overlay is listening — or when we cannot tell (fail-open).
   * Resolves `false` when any attempted publish did not reach the channel.
   */
  private async publishOverlayOutputs(
    packageToken: string | null | undefined,
    layerTokens: Array<string | null | undefined>,
  ): Promise<boolean> {
    await this.waitForPendingCueWrites();
    const layers = [
      ...new Set(
        layerTokens.filter(
          (token): token is string => !!token && token !== packageToken,
        ),
      ),
    ];
    const results = await Promise.all([
      packageToken
        ? this.publishOverlayOutput(packageToken)
        : Promise.resolve(true),
      ...layers.map(async (token) =>
        (await this.hasOverlayListener(token))
          ? this.publishOverlayOutput(token)
          : true,
      ),
    ]);
    return results.every(Boolean);
  }

  private async publishOverlayOutput(token: string): Promise<boolean> {
    const channel = await this.ensureOverlaySendChannel(token);
    if (!channel) return false;
    const { ok, output } = await this.fetchPublicOutputResult(token);
    // A failed read must never look like "nothing on air" to OBS.
    if (!ok) return false;
    const result = await channel.send({
      type: 'broadcast',
      event: CG_OVERLAY_BROADCAST_EVENT,
      payload: output ?? {},
    });
    // Panel On air = the exact output that just reached OBS.
    if (result === 'ok' && token === this.draftItem()?.public_token) {
      this.zone.run(() => this.onAirOutput.set(output));
    }
    return result === 'ok';
  }

  /**
   * Is an overlay watching this token? Any doubt (channel or Presence not
   * ready within the wait) counts as "yes" so we over-publish, never miss.
   */
  private async hasOverlayListener(token: string): Promise<boolean> {
    const channel = await this.ensureOverlaySendChannel(token);
    const synced = this.overlayPresenceSynced.get(token);
    if (!channel || !synced) return true;
    const ready = await Promise.race([
      synced,
      new Promise<boolean>((resolve) =>
        window.setTimeout(() => resolve(false), CG_PRESENCE_SYNC_WAIT_MS),
      ),
    ]);
    if (!ready) return true;
    return Object.values(channel.presenceState<{ role?: string }>()).some(
      (metas) =>
        metas.some((meta) => meta.role === CG_OVERLAY_PRESENCE_ROLE),
    );
  }

  /**
   * Leave the Panel's send channels (e.g. when the Panel closes). They are
   * re-joined lazily on the next publish / cue, so behaviour is unchanged.
   */
  async releaseOverlaySendChannels(): Promise<void> {
    const channels = [...this.overlaySendChannels.values()];
    this.overlaySendChannels.clear();
    this.overlayPresenceSynced.clear();
    await Promise.all(
      channels.map((channel) => this.supabase.removeChannel(channel)),
    );
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
    // Presence is read-only here: the Panel never tracks, it only checks
    // whether an overlay has (resolves on the first Presence sync).
    let markSynced: (value: boolean) => void = () => undefined;
    const synced = new Promise<boolean>((resolve) => {
      markSynced = resolve;
    });
    channel.on('presence', { event: 'sync' }, () => markSynced(true));
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
          this.overlayPresenceSynced.delete(token);
          resolve(false);
        }
      });
    });
    if (!joined) {
      void this.supabase.removeChannel(channel);
      return null;
    }
    this.overlaySendChannels.set(token, channel);
    this.overlayPresenceSynced.set(token, synced);
    return channel;
  }
}
