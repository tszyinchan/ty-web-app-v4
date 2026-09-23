import { CommonModule } from '@angular/common';
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
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CgLogo } from '../../../../core/domains/cg/cg-logo';
import { CgStage } from '../../../../core/domains/cg/cg-stage';
import {
  CG_ANCHOR_OPTIONS,
  CG_LAYOUT_UNIT_OPTIONS,
  CG_LOGO_ACCEPT,
  CG_LOGO_MAX_BYTES,
  CG_PACKAGE_ROLE_OPTIONS,
  CG_SAMPLE_LOGO_URL,
  CgComponentType,
  CgPackageRole,
  CgPreviewBackdrop,
} from '../../../../core/domains/cg/cg.constants';
import { CgPackage, CgSlotDraft } from '../../../../core/domains/cg/cg.model';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  buildCgOverlayUrl,
  createEmptyLogoSlot,
  isEmbeddedImageUrl,
  isLocalFilesystemPath,
  packageHasUnsavedIdentity,
  readImageFileAsDataUrl,
  slotToDraft,
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
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    CgStage,
    CgLogo,
  ],
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

  readonly RecordStatus = RecordStatus;
  readonly Logo = CgComponentType.Logo;
  readonly roleOptions = CG_PACKAGE_ROLE_OPTIONS;
  readonly anchorOptions = CG_ANCHOR_OPTIONS;
  readonly unitOptions = CG_LAYOUT_UNIT_OPTIONS;
  readonly backdrops = CgPreviewBackdrop;
  readonly sampleLogoUrl = CG_SAMPLE_LOGO_URL;
  readonly logoAccept = CG_LOGO_ACCEPT;

  item = signal<Partial<CgPackage> | null>(null);
  slots = signal<CgSlotDraft[]>([]);
  currentId: string | null = null;
  originalDataStr = signal('');
  isDirty = signal(false);
  isSaveDisabled = signal(true);
  backdrop = signal(CgPreviewBackdrop.Checkerboard);
  readonly returnUrl = '/cg/list';

  logoSlots = computed(() =>
    this.slots().filter((slot) => slot.component_type === CgComponentType.Logo),
  );

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
            .slots()
            .filter((slot) => slot.package_id === this.currentId)
            .map((slot) => slotToDraft(slot)),
        );
      }

      const fresh = await this.cg.fetchPackageById(this.currentId);
      this.zone.run(() => {
        if (fresh) {
          this.applyLoaded(fresh.package, fresh.slots.map((slot) => slotToDraft(slot)));
        } else if (!cachedPackage) {
          this.router.navigateByUrl(this.returnUrl);
        }
      });
      return;
    }

    const created: Partial<CgPackage> = {
      name: '',
      role: CgPackageRole.Channel,
      status: RecordStatus.Active,
    };
    this.item.set(created);
    this.slots.set([]);
    this.originalDataStr.set(JSON.stringify(this.snapshot()));
  }

  ngOnDestroy(): void {
    this.headerService.clear();
  }

  addLogo(): void {
    this.slots.update((list) => [...list, createEmptyLogoSlot(list.length)]);
  }

  useSampleLogo(slot: CgSlotDraft): void {
    slot.payload.imageUrl = CG_SAMPLE_LOGO_URL;
    delete slot.payload.fileName;
    this.touchPreview();
  }

  isEmbeddedLogo(slot: CgSlotDraft): boolean {
    return isEmbeddedImageUrl(slot.payload.imageUrl);
  }

  onImageUrlChange(slot: CgSlotDraft): void {
    if (isLocalFilesystemPath(slot.payload.imageUrl)) {
      this.notification.handleError(
        'Local path',
        'The browser cannot open a disk path. Use Choose local image.',
      );
      slot.payload.imageUrl = '';
    }
    delete slot.payload.fileName;
    this.touchPreview();
  }

  async onLogoFile(slot: CgSlotDraft, event: Event): Promise<void> {
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
      slot.payload.imageUrl = await readImageFileAsDataUrl(file);
      slot.payload.fileName = file.name;
      this.touchPreview();
    } catch (error: unknown) {
      this.notification.handleError('Logo', error);
    }
  }

  removeSlot(clientId: string): void {
    if (!confirm('Remove this logo slot?')) return;
    this.slots.update((list) => list.filter((slot) => slot.clientId !== clientId));
  }

  overlayUrl(slot: CgSlotDraft): string {
    return buildCgOverlayUrl(slot.public_token, window.location);
  }

  layoutSnapshot(slot: CgSlotDraft): CgSlotDraft['layout'] {
    return { ...slot.layout };
  }

  touchPreview(): void {
    this.slots.update((list) =>
      list.map((slot) => ({
        ...slot,
        layout: { ...slot.layout },
        payload: { ...slot.payload },
      })),
    );
  }

  async copyOverlayUrl(slot: CgSlotDraft): Promise<void> {
    try {
      await copyTextToClipboard(this.overlayUrl(slot));
      this.notification.showSuccess('OBS URL copied');
    } catch (error: unknown) {
      this.notification.handleError('Copy failed', error);
    }
  }

  async onSave(): Promise<void> {
    const data = this.item();
    if (!data || packageHasUnsavedIdentity(data as Pick<CgPackage, 'name'>)) {
      return;
    }
    const id = await this.cg.savePackage(data, this.slots());
    if (!id) return;
    this.currentId = id;
    this.originalDataStr.set(JSON.stringify(this.snapshot()));
    this.isDirty.set(false);
    if (!this.route.snapshot.paramMap.get('id')) {
      await this.router.navigate(['/cg/edit', id], { replaceUrl: true });
    }
  }

  async onDelete(): Promise<void> {
    if (!this.currentId) return;
    if (!confirm('Delete this package and its slots?')) return;
    const ok = await this.cg.deletePackage(this.currentId);
    if (ok) {
      this.isDirty.set(false);
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  private applyLoaded(pkg: CgPackage, drafts: CgSlotDraft[]): void {
    this.item.set(structuredClone(pkg));
    this.slots.set(structuredClone(drafts));
    this.originalDataStr.set(JSON.stringify(this.snapshot()));
    this.isDirty.set(false);
  }

  private snapshot(): { package: Partial<CgPackage> | null; slots: CgSlotDraft[] } {
    return {
      package: this.item(),
      slots: this.slots(),
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
