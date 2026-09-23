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
  CG_ELEMENT_CATALOG,
  CG_LAYOUT_UNIT_OPTIONS,
  CG_LOGO_ACCEPT,
  CG_LOGO_MAX_BYTES,
  CG_PACKAGE_ROLE_OPTIONS,
  CG_SAMPLE_LOGO_URL,
  CgElementType,
  CgPackageRole,
  CgPreviewBackdrop,
} from '../../../../core/domains/cg/cg.constants';
import { CgLayerDraft, CgPackage } from '../../../../core/domains/cg/cg.model';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  buildCgOverlayUrl,
  createEmptyLogoLayer,
  createCgPublicToken,
  elementLabel,
  isEmbeddedImageUrl,
  isLocalFilesystemPath,
  layerToDraft,
  packageHasUnsavedIdentity,
  readImageFileAsDataUrl,
} from '../../../../core/domains/cg/cg.util';
import { RecordStatus } from '../../../../core/models/status.enum';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { copyTextToClipboard } from '../../../../core/utils/copy-text.util';

@Component({
  selector: 'app-cg-package-edit',
  standalone: true,
  imports: [FormsModule, CgStage, CgLayerView],
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

  readonly Logo = CgElementType.Logo;
  readonly catalog = CG_ELEMENT_CATALOG;
  readonly roleOptions = CG_PACKAGE_ROLE_OPTIONS;
  readonly anchorOptions = CG_ANCHOR_OPTIONS;
  readonly unitOptions = CG_LAYOUT_UNIT_OPTIONS;
  readonly backdrops = CgPreviewBackdrop;
  readonly logoAccept = CG_LOGO_ACCEPT;
  readonly returnUrl = '/cg/list';

  item = signal<Partial<CgPackage> | null>(null);
  layers = signal<CgLayerDraft[]>([]);
  selectedClientId = signal<string | null>(null);
  currentId: string | null = null;
  originalDataStr = signal('');
  isDirty = signal(false);
  isSaveDisabled = signal(true);
  backdrop = signal(CgPreviewBackdrop.Studio);

  readonly selectedLayer = computed(() => {
    const id = this.selectedClientId();
    return this.layers().find((layer) => layer.clientId === id) ?? null;
  });

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.cg.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  ngDoCheck(): void {
    const current = this.snapshot();
    const original = this.originalDataStr();
    if (!current || !original) return;
    const currentlyDirty = JSON.stringify(current) !== original;
    if (this.isDirty() !== currentlyDirty) {
      this.isDirty.set(currentlyDirty);
    }
    const invalid =
      !current.package || packageHasUnsavedIdentity(current.package);
    const disabled = !currentlyDirty || invalid || this.cg.loading();
    if (this.isSaveDisabled() !== disabled) {
      this.isSaveDisabled.set(disabled);
    }
  }

  async ngOnInit(): Promise<void> {
    this.currentId = this.route.snapshot.paramMap.get('id');
    this.bindHeader();

    if (this.currentId) {
      const cachedPackage = this.cg
        .packages()
        .find((pkg) => pkg.tb_tyapp_cgpk_id === this.currentId);
      if (cachedPackage) {
        this.applyLoaded(
          cachedPackage,
          this.cg
            .layers()
            .filter((layer) => layer.package_id === this.currentId)
            .map((layer) => layerToDraft(layer)),
        );
      }

      const fresh = await this.cg.fetchPackageById(this.currentId);
      this.zone.run(() => {
        if (fresh) {
          this.applyLoaded(
            fresh.package,
            fresh.layers.map((layer) => layerToDraft(layer)),
          );
        } else if (!cachedPackage) {
          this.router.navigateByUrl(this.returnUrl);
        }
      });
      return;
    }

    const logo = createEmptyLogoLayer(0);
    const created: Partial<CgPackage> = {
      name: '',
      role: CgPackageRole.Channel,
      public_token: createCgPublicToken(),
      status: RecordStatus.Active,
    };
    this.item.set(created);
    this.layers.set([logo]);
    this.selectedClientId.set(logo.clientId);
    this.originalDataStr.set(JSON.stringify(this.snapshot()));
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
        `${def?.label ?? type} is next — Logo is the one on this Panel.`,
      );
      return;
    }
    if (type !== CgElementType.Logo) return;
    const layer = createEmptyLogoLayer(this.layers().length);
    this.layers.update((list) => [...list, layer]);
    this.selectedClientId.set(layer.clientId);
  }

  selectLayer(clientId: string): void {
    this.selectedClientId.set(clientId);
  }

  toggleVisible(layer: CgLayerDraft, event: Event): void {
    event.stopPropagation();
    layer.visible = !layer.visible;
    this.selectedClientId.set(layer.clientId);
    this.touchPreview();
  }

  setRole(role: CgPackageRole): void {
    const pkg = this.item();
    if (!pkg) return;
    pkg.role = role;
  }

  useSampleLogo(layer: CgLayerDraft): void {
    layer.payload.imageUrl = CG_SAMPLE_LOGO_URL;
    delete layer.payload.fileName;
    this.touchPreview();
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
    this.touchPreview();
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
      this.notification.handleError(
        'Logo',
        'Keep the file under 1.5 MB for now.',
      );
      return;
    }
    try {
      layer.payload.imageUrl = await readImageFileAsDataUrl(file);
      layer.payload.fileName = file.name;
      this.touchPreview();
    } catch (error: unknown) {
      this.notification.handleError('Logo', error);
    }
  }

  removeLayer(clientId: string): void {
    if (!confirm('Remove this layer from the package?')) return;
    this.layers.update((list) => list.filter((layer) => layer.clientId !== clientId));
    if (this.selectedClientId() === clientId) {
      this.selectedClientId.set(this.layers()[0]?.clientId ?? null);
    }
  }

  packageOutputUrl(): string {
    const token = this.item()?.public_token;
    if (!token || !this.currentId) return '';
    return buildCgOverlayUrl(token, window.location);
  }

  layerOutputUrl(layer: CgLayerDraft): string {
    if (!this.currentId) return '';
    return buildCgOverlayUrl(layer.public_token, window.location);
  }

  layoutSnapshot(layer: CgLayerDraft): CgLayerDraft['layout'] {
    return { ...layer.layout };
  }

  payloadSnapshot(layer: CgLayerDraft): CgLayerDraft['payload'] {
    return { ...layer.payload };
  }

  touchPreview(): void {
    this.layers.update((list) =>
      list.map((layer) => ({
        ...layer,
        layout: { ...layer.layout },
        payload: { ...layer.payload },
      })),
    );
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

  async onSave(): Promise<void> {
    const data = this.item();
    if (!data || packageHasUnsavedIdentity(data as Pick<CgPackage, 'name'>)) {
      return;
    }
    const id = await this.cg.savePackage(data, this.layers());
    if (!id) return;
    this.currentId = id;
    const fresh = await this.cg.fetchPackageById(id);
    this.zone.run(() => {
      if (fresh) {
        this.applyLoaded(
          fresh.package,
          fresh.layers.map((layer) => layerToDraft(layer)),
        );
      } else {
        this.originalDataStr.set(JSON.stringify(this.snapshot()));
        this.isDirty.set(false);
      }
      this.bindHeader();
    });
    if (!this.route.snapshot.paramMap.get('id')) {
      await this.router.navigate(['/cg/edit', id], { replaceUrl: true });
    }
  }

  async onDelete(): Promise<void> {
    if (!this.currentId) return;
    if (!confirm('Delete this package and its layers?')) return;
    const ok = await this.cg.deletePackage(this.currentId);
    if (ok) {
      this.isDirty.set(false);
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  private applyLoaded(pkg: CgPackage, drafts: CgLayerDraft[]): void {
    this.item.set(structuredClone(pkg));
    this.layers.set(structuredClone(drafts));
    const keep = this.selectedClientId();
    this.selectedClientId.set(
      drafts.find((layer) => layer.clientId === keep)?.clientId ??
        drafts[0]?.clientId ??
        null,
    );
    this.originalDataStr.set(JSON.stringify(this.snapshot()));
    this.isDirty.set(false);
  }

  private snapshot(): {
    package: Partial<CgPackage> | null;
    layers: CgLayerDraft[];
  } {
    return {
      package: this.item(),
      layers: this.layers(),
    };
  }

  private bindHeader(): void {
    const actions: HeaderAction[] = [];
    if (this.currentId) {
      actions.push({
        label: 'Delete',
        icon: 'delete',
        type: 'secondary',
        onClick: () => void this.onDelete(),
      });
    }
    actions.push({
      label: this.currentId ? 'Save changes' : 'Create package',
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
