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
import { FormsModule } from '@angular/forms';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { ActivatedRoute, Router } from '@angular/router';
import { CgLayerView } from '../../../../core/domains/cg/cg-layer-view';
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
  subtitlePresetOf,
} from '../../../../core/domains/cg/cg.util';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { copyTextToClipboard } from '../../../../core/utils/copy-text.util';

@Component({
  selector: 'app-cg-package-edit',
  standalone: true,
  imports: [FormsModule, CdkDropList, CdkDrag, CdkDragHandle, CgStage, CgLayerView],
  templateUrl: './cg-package-edit.html',
  styleUrl: './cg-package-edit.scss',
})
export class CgPackageEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
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
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const ok = await this.cg.loadSavedDraft(id);
      this.zone.run(() => {
        if (!ok) {
          this.router.navigateByUrl(this.returnUrl);
          return;
        }
        this.bindHeader();
      });
      return;
    }

    this.cg.beginNewDraft();
    this.bindHeader();
  }

  ngOnDestroy(): void {
    this.headerService.clear();
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
    const id = this.packageId;
    if (id) {
      void this.router.navigate(['/cg/edit', id, 'layer', layer.clientId]);
      return;
    }
    void this.router.navigate(['/cg/new/layer', layer.clientId]);
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
    const id = await this.cg.savePackage(data, this.layers());
    if (!id) return;
    const fresh = await this.cg.fetchPackageById(id);
    this.zone.run(() => {
      if (fresh) {
        this.cg.applyDraft(
          fresh.package,
          fresh.layers.map((layer) => layerToDraft(layer)),
        );
      } else {
        this.cg.markDraftClean();
        this.isDirty.set(false);
      }
      this.bindHeader();
    });
    if (!this.route.snapshot.paramMap.get('id')) {
      await this.router.navigate(['/cg/edit', id], { replaceUrl: true });
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

  private bindHeader(): void {
    const actions: HeaderAction[] = [];
    if (this.packageId) {
      actions.push({
        label: 'Delete',
        icon: 'delete',
        type: 'secondary',
        onClick: () => void this.onDelete(),
      });
    }
    actions.push({
      label: this.packageId ? 'Save changes' : 'Create package',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => void this.onSave(),
    });
    this.headerService.setConfig({
      backLink: this.returnUrl,
      syncStatus: this.syncStatus,
      actions,
    });
  }
}
