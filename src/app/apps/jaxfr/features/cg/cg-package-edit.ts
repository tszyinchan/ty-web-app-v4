import { DOCUMENT } from '@angular/common';
import {
  Component,
  DoCheck,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { filter, map, startWith } from 'rxjs/operators';
import { CgLayerView } from '../../../../core/domains/cg/cg-layer-view';
import { CgMixPreview } from '../../../../core/domains/cg/cg-mix-preview';
import { CgStage } from '../../../../core/domains/cg/cg-stage';
import {
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_ELEMENT_CATALOG,
  CG_MAX_DURATION_MS,
  CG_PACKAGE_ROLE_OPTIONS,
  CgElementType,
  CgPackageLook,
  CgPackageRole,
  CgPreviewBackdrop,
} from '../../../../core/domains/cg/cg.constants';
import { CgLayerDraft, CgPackage } from '../../../../core/domains/cg/cg.model';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  buildCgOverlayUrl,
  createEmptyLayer,
  elementLabel,
  isCgCut,
  isCgMono,
  layerIsMono,
  layerToDraft,
  normalizeDurationMs,
  packageHasUnsavedIdentity,
  setCgDesktopViewport,
  subtitlePresetOf,
} from '../../../../core/domains/cg/cg.util';
import { NotificationService } from '../../../../core/services/notification.service';
import { copyTextToClipboard } from '../../../../core/utils/copy-text.util';

@Component({
  selector: 'app-cg-package-edit',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CgStage,
    CgLayerView,
    CgMixPreview,
  ],
  templateUrl: './cg-package-edit.html',
  styleUrl: './cg-package-edit.scss',
})
export class CgPackageEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private document = inject(DOCUMENT);
  private notification = inject(NotificationService);
  readonly cg = inject(CgService);

  readonly catalog = CG_ELEMENT_CATALOG;
  readonly roleOptions = CG_PACKAGE_ROLE_OPTIONS;
  readonly backdrops = CgPreviewBackdrop;
  readonly cutMs = CG_CUT_DURATION_MS;
  readonly maxDurationMs = CG_MAX_DURATION_MS;
  readonly looks = CgPackageLook;
  readonly returnUrl = '/cg/list';

  readonly item = this.cg.draftItem;
  readonly layers = this.cg.draftLayers;
  readonly onAirItem = this.cg.onAirItem;
  readonly onAirLayers = this.cg.onAirLayers;
  readonly selectedLayerId = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.route.snapshot.firstChild?.paramMap.get('layerId') ?? ''),
    ),
    {
      initialValue:
        this.route.snapshot.firstChild?.paramMap.get('layerId') ?? '',
    },
  );
  isDirty = signal(false);
  isSaveDisabled = signal(true);
  backdrop = signal(CgPreviewBackdrop.Studio);
  private lastFadeMs = CG_DEFAULT_DURATION_MS;
  private layerDragged = false;

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.cg.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.packageId) return 'up-to-date';
    return 'none';
  });

  get packageId(): string | null {
    const key = this.cg.draftKey();
    return typeof key === 'string' ? key : null;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  ngDoCheck(): void {
    const original = this.cg.draftOriginal();
    if (!original || !this.item()) return;
    const currentlyDirty = JSON.stringify(this.cg.draftSnapshot()) !== original;
    if (this.isDirty() !== currentlyDirty) {
      this.isDirty.set(currentlyDirty);
    }
    const invalid = packageHasUnsavedIdentity(
      this.item() as Pick<CgPackage, 'name'>,
    );
    const disabled = !currentlyDirty || invalid || this.cg.loading();
    if (this.isSaveDisabled() !== disabled) {
      this.isSaveDisabled.set(disabled);
    }
  }

  async ngOnInit(): Promise<void> {
    setCgDesktopViewport(this.document, true);
    void this.cg.fetchAllPackages();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const ok = await this.cg.loadSavedDraft(id);
      this.zone.run(() => {
        if (!ok) {
          this.router.navigateByUrl(this.returnUrl);
          return;
        }
        this.dropMissingLayerRoute();
      });
      return;
    }

    this.cg.beginNewDraft();
    this.dropMissingLayerRoute();
  }

  ngOnDestroy(): void {
    setCgDesktopViewport(this.document, false);
  }

  elementLabel = elementLabel;

  addElement(type: CgElementType): void {
    const def = this.catalog.find((item) => item.type === type);
    if (!def?.shipped) {
      this.notification.handleError(
        'Element',
        `${def?.label ?? type} is next — Logo and Subtitle are on this Panel.`,
      );
      return;
    }
    const layer = createEmptyLayer(type, this.layers().length);
    if (!layer) return;
    this.cg.draftLayers.update((list) => [...list, layer]);
    this.openLayer(layer);
  }

  openLayer(layer: CgLayerDraft): void {
    if (this.layerDragged) {
      this.layerDragged = false;
      return;
    }
    if (this.selectedLayerId() === layer.clientId) {
      void this.router.navigate(this.panelCommands());
      return;
    }
    void this.router.navigate(['layer', layer.clientId], {
      relativeTo: this.route,
    });
  }

  toggleVisible(layer: CgLayerDraft, event: Event): void {
    event.stopPropagation();
    void this.cg.setLayerVisible(layer.clientId, !layer.visible);
  }

  onLayerDragStarted(): void {
    this.layerDragged = true;
  }

  onLayerDrop(event: CdkDragDrop<CgLayerDraft[]>): void {
    this.cg.reorderLayers(event.previousIndex, event.currentIndex);
  }

  setRole(role: CgPackageRole): void {
    const pkg = this.item();
    if (!pkg) return;
    pkg.role = role;
  }

  isCut(): boolean {
    return isCgCut(this.item()?.duration_ms);
  }

  packageDurationMs(): number {
    return normalizeDurationMs(this.item()?.duration_ms);
  }

  onAirDurationMs(): number {
    return normalizeDurationMs(this.onAirItem()?.duration_ms);
  }

  onAirLook(): CgPackageLook {
    return this.onAirItem()?.look ?? CgPackageLook.Color;
  }

  pendingLook(): CgPackageLook {
    return this.item()?.look ?? CgPackageLook.Color;
  }

  setCut(): void {
    const current = this.packageDurationMs();
    if (current > this.cutMs) {
      this.lastFadeMs = current;
    }
    this.setDurationMs(this.cutMs);
  }

  setFade(): void {
    if (!this.isCut()) return;
    this.setDurationMs(this.lastFadeMs);
  }

  onDurationMsChange(value: number | string): void {
    this.setDurationMs(value);
  }

  private setDurationMs(value: unknown): void {
    const pkg = this.item();
    if (!pkg) return;
    pkg.duration_ms = normalizeDurationMs(value);
  }

  isMono(): boolean {
    return isCgMono(this.item()?.look);
  }

  layerMono(layer: CgLayerDraft): boolean {
    return layerIsMono(layer.look, this.item()?.look);
  }

  setLook(look: CgPackageLook): void {
    const pkg = this.item();
    if (!pkg) return;
    pkg.look = look;
  }

  packageOutputUrl(): string {
    const token = this.item()?.public_token;
    if (!token || !this.packageId) return '';
    return buildCgOverlayUrl(token, window.location);
  }

  layoutSnapshot(layer: CgLayerDraft): CgLayerDraft['layout'] {
    return { ...layer.layout };
  }

  payloadSnapshot(layer: CgLayerDraft): CgLayerDraft['payload'] {
    return {
      ...layer.payload,
      lines: [...layer.payload.lines],
      style: { preset: subtitlePresetOf(layer.payload) },
      transition: {
        duration_ms: layer.payload.transition?.duration_ms ?? CG_DEFAULT_DURATION_MS,
      },
    };
  }

  async copyPackageOutput(): Promise<void> {
    const url = this.packageOutputUrl();
    if (!url) {
      this.notification.handleError(
        'Package Output',
        'Save the package first to get the OBS URL.',
      );
      return;
    }
    try {
      await copyTextToClipboard(url);
      this.notification.showSuccess('Package Output copied');
    } catch (error: unknown) {
      this.notification.handleError('Copy failed', error);
    }
  }

  async onSave(): Promise<void> {
    const data = this.item();
    if (!data || packageHasUnsavedIdentity(data as Pick<CgPackage, 'name'>)) {
      return;
    }
    const previousClientId = this.selectedLayerId();
    const previousToken = this.layers().find(
      (row) => row.clientId === previousClientId,
    )?.public_token;
    const id = await this.cg.savePackage(data, this.layers());
    if (!id) return;
    const fresh = await this.cg.fetchPackageById(id);
    let nextLayerId = previousClientId;
    this.zone.run(() => {
      if (fresh) {
        const drafts = fresh.layers.map((layer) => layerToDraft(layer));
        this.cg.applyDraft(fresh.package, drafts);
        const still =
          drafts.find((row) => row.clientId === previousClientId) ??
          drafts.find((row) => row.tb_tyapp_cgly_id === previousClientId) ??
          drafts.find(
            (row) => !!previousToken && row.public_token === previousToken,
          );
        nextLayerId = still?.clientId ?? '';
      } else {
        this.cg.markDraftClean();
        this.isDirty.set(false);
      }
    });
    const hadPackageId = !!this.route.snapshot.paramMap.get('id');
    if (!hadPackageId) {
      if (nextLayerId) {
        await this.router.navigate(['/cg/edit', id, 'layer', nextLayerId], {
          replaceUrl: true,
        });
      } else {
        await this.router.navigate(['/cg/edit', id], { replaceUrl: true });
      }
      return;
    }
    if (previousClientId && nextLayerId && nextLayerId !== previousClientId) {
      await this.router.navigate(['layer', nextLayerId], {
        relativeTo: this.route,
        replaceUrl: true,
      });
    }
  }

  async onDelete(): Promise<void> {
    const id = this.packageId;
    if (!id) return;
    if (!confirm('Delete this package and its layers?')) return;
    const ok = await this.cg.deletePackage(id);
    if (ok) {
      this.isDirty.set(false);
      this.cg.clearDraft();
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  private panelCommands(): (string | number)[] {
    const id = this.packageId ?? this.route.snapshot.paramMap.get('id');
    return id ? ['/cg/edit', id] : ['/cg/new'];
  }

  private dropMissingLayerRoute(): void {
    const layerId = this.route.snapshot.firstChild?.paramMap.get('layerId');
    if (!layerId) return;
    if (this.layers().some((row) => row.clientId === layerId)) return;
    void this.router.navigate(this.panelCommands(), { replaceUrl: true });
  }
}
