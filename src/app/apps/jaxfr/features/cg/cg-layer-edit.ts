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
import { ActivatedRoute, Router } from '@angular/router';
import { CgLayerView } from '../../../../core/domains/cg/cg-layer-view';
import { CgStage } from '../../../../core/domains/cg/cg-stage';
import {
  CG_ANCHOR_OPTIONS,
  CG_LAYOUT_UNIT_OPTIONS,
  CG_LOGO_ACCEPT,
  CG_LOGO_MAX_BYTES,
  CG_SAMPLE_LOGO_URL,
  CgElementType,
  CgPreviewBackdrop,
} from '../../../../core/domains/cg/cg.constants';
import { CgLayerDraft, CgPackage } from '../../../../core/domains/cg/cg.model';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  buildCgOverlayUrl,
  elementLabel,
  isEmbeddedImageUrl,
  isLocalFilesystemPath,
  layerToDraft,
  normalizeDurationMs,
  isCgMono,
  packageHasUnsavedIdentity,
  readImageFileAsDataUrl,
} from '../../../../core/domains/cg/cg.util';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { copyTextToClipboard } from '../../../../core/utils/copy-text.util';

@Component({
  selector: 'app-cg-layer-edit',
  standalone: true,
  imports: [FormsModule, CgStage, CgLayerView],
  templateUrl: './cg-layer-edit.html',
  styleUrl: './cg-layer-edit.scss',
})
export class CgLayerEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
  private notification = inject(NotificationService);
  readonly cg = inject(CgService);

  readonly Logo = CgElementType.Logo;
  readonly anchorOptions = CG_ANCHOR_OPTIONS;
  readonly unitOptions = CG_LAYOUT_UNIT_OPTIONS;
  readonly backdrops = CgPreviewBackdrop;
  readonly logoAccept = CG_LOGO_ACCEPT;

  isDirty = signal(false);
  isSaveDisabled = signal(true);
  backdrop = signal(CgPreviewBackdrop.Studio);
  private layerId = '';

  readonly layer = computed(() => {
    const id = this.layerId;
    return this.cg.draftLayers().find((row) => row.clientId === id) ?? null;
  });

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
    if (!original || !this.cg.draftItem()) return;
    const currentlyDirty = JSON.stringify(this.cg.draftSnapshot()) !== original;
    if (this.isDirty() !== currentlyDirty) {
      this.isDirty.set(currentlyDirty);
    }
    const invalid = packageHasUnsavedIdentity(
      this.cg.draftItem() as Pick<CgPackage, 'name'>,
    );
    const disabled = !currentlyDirty || invalid || this.cg.loading();
    if (this.isSaveDisabled() !== disabled) {
      this.isSaveDisabled.set(disabled);
    }
  }

  async ngOnInit(): Promise<void> {
    this.layerId = this.route.snapshot.paramMap.get('layerId') ?? '';
    const packageId = this.route.snapshot.paramMap.get('id');

    if (packageId) {
      const ok = await this.cg.loadSavedDraft(packageId);
      this.zone.run(() => {
        if (!ok || !this.layer()) {
          this.router.navigateByUrl(this.panelUrl());
          return;
        }
        this.bindHeader();
      });
      return;
    }

    if (this.cg.draftKey() === undefined) {
      this.cg.beginNewDraft();
    }
    if (!this.layer()) {
      this.router.navigateByUrl(this.panelUrl());
      return;
    }
    this.bindHeader();
  }

  ngOnDestroy(): void {
    this.headerService.clear();
  }

  elementLabel = elementLabel;

  toggleVisible(layer: CgLayerDraft): void {
    void this.cg.setLayerVisible(layer.clientId, !layer.visible);
  }

  useSampleLogo(layer: CgLayerDraft): void {
    layer.payload.imageUrl = CG_SAMPLE_LOGO_URL;
    delete layer.payload.fileName;
    this.cg.touchPreview();
  }

  isEmbeddedLogo(layer: CgLayerDraft): boolean {
    return isEmbeddedImageUrl(layer.payload.imageUrl);
  }

  onImageUrlChange(layer: CgLayerDraft): void {
    if (isLocalFilesystemPath(layer.payload.imageUrl)) {
      this.notification.handleError(
        'Local path',
        'The browser cannot open a disk path. Use Choose local image.',
      );
      layer.payload.imageUrl = '';
    }
    delete layer.payload.fileName;
    this.cg.touchPreview();
  }

  async onLogoFile(layer: CgLayerDraft, event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) {
      return;
    }
    const file = input.files[0];
    input.value = '';
    if (!/^image\/(png|webp)$/.test(file.type)) {
      this.notification.handleError(
        'Logo',
        'Use a PNG or WebP with transparency.',
      );
      return;
    }
    if (file.size > CG_LOGO_MAX_BYTES) {
      this.notification.handleError('Logo', 'Keep the file under 1.5 MB for now.');
      return;
    }
    try {
      layer.payload.imageUrl = await readImageFileAsDataUrl(file);
      layer.payload.fileName = file.name;
      this.cg.touchPreview();
    } catch (error: unknown) {
      this.notification.handleError('Logo', error);
    }
  }

  touchPreview(): void {
    this.cg.touchPreview();
  }

  layoutSnapshot(layer: CgLayerDraft): CgLayerDraft['layout'] {
    return { ...layer.layout };
  }

  payloadSnapshot(layer: CgLayerDraft): CgLayerDraft['payload'] {
    return { ...layer.payload };
  }

  packageDurationMs(): number {
    return normalizeDurationMs(this.cg.draftItem()?.duration_ms);
  }

  isMono(): boolean {
    return isCgMono(this.cg.draftItem()?.look);
  }

  layerOutputUrl(layer: CgLayerDraft): string {
    if (!this.packageId) return '';
    return buildCgOverlayUrl(layer.public_token, window.location);
  }

  async copyLayerOutput(layer: CgLayerDraft): Promise<void> {
    const url = this.layerOutputUrl(layer);
    if (!url) {
      this.notification.handleError(
        'Layer Output',
        'Save the package first to get the OBS URL.',
      );
      return;
    }
    try {
      await copyTextToClipboard(url);
      this.notification.showSuccess('Layer Output copied');
    } catch (error: unknown) {
      this.notification.handleError('Copy failed', error);
    }
  }

  removeLayer(layer: CgLayerDraft): void {
    if (!confirm('Remove this layer from the package?')) return;
    this.cg.draftLayers.update((list) =>
      list.filter((row) => row.clientId !== layer.clientId),
    );
    void this.router.navigateByUrl(this.panelUrl());
  }

  async onSave(): Promise<void> {
    const data = this.cg.draftItem();
    if (!data || packageHasUnsavedIdentity(data as Pick<CgPackage, 'name'>)) {
      return;
    }
    const id = await this.cg.savePackage(data, this.cg.draftLayers());
    if (!id) return;
    const previousClientId = this.layerId;
    const fresh = await this.cg.fetchPackageById(id);
    this.zone.run(() => {
      if (fresh) {
        const drafts = fresh.layers.map((row) => layerToDraft(row));
        this.cg.applyDraft(fresh.package, drafts);
        const still =
          drafts.find((row) => row.clientId === previousClientId) ??
          drafts.find((row) => row.tb_tyapp_cgly_id === previousClientId);
        if (still && still.clientId !== this.layerId) {
          this.layerId = still.clientId;
        }
      } else {
        this.cg.markDraftClean();
        this.isDirty.set(false);
      }
      this.bindHeader();
    });
    if (!this.route.snapshot.paramMap.get('id')) {
      await this.router.navigate(['/cg/edit', id, 'layer', this.layerId], {
        replaceUrl: true,
      });
    }
  }

  private panelUrl(): string {
    return this.packageId ? `/cg/edit/${this.packageId}` : '/cg/new';
  }

  private bindHeader(): void {
    const actions: HeaderAction[] = [
      {
        label: this.packageId ? 'Save changes' : 'Create package',
        icon: 'check',
        type: 'primary',
        disabled: this.isSaveDisabled,
        onClick: () => void this.onSave(),
      },
    ];
    this.headerService.setConfig({
      backLink: this.panelUrl(),
      syncStatus: this.syncStatus,
      actions,
    });
  }
}
