import { CommonModule } from '@angular/common';
import {
  Component,
  DoCheck,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  NgZone,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { COMMA, ENTER } from '@angular/cdk/keycodes';

import { RecordStatus } from '../../../../core/models/status.enum';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { AuthService } from '../../../../core/services/auth.service';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { formatDate } from '../../../../core/utils/date-time.util';
import { UserService } from '../user/user.service';
import {
  DocsignDocumentView,
  DocsignSignerSlot,
} from './docsign-document';
import { DOCSIGN_LEASE_HEARTBEAT_MS } from './docsign.constants';
import { DocsignDocumentDetail, DocsignEditVm } from './docsign.model';
import { DocsignService } from './docsign.service';
import {
  MarkdownEditResult,
  bodyContent,
  currentVersion,
  documentNo,
  docsignLifecycle,
  insertAtCursor,
  prefixSelectedLines,
  signaturesForVersion,
  wrapMarkdownSelection,
} from './docsign.util';

@Component({
  selector: 'app-docsign-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatAutocompleteModule,
    MatChipsModule,
    DocsignDocumentView,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './docsign-edit.html',
  styleUrl: './docsign-edit.scss',
})
export class DocsignEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);
  private notification = inject(NotificationService);

  public docsignService = inject(DocsignService);
  public userService = inject(UserService);
  public authService = inject(AuthService);

  readonly separatorKeysCodes = [ENTER, COMMA] as const;
  private bodyInput = viewChild<ElementRef<HTMLTextAreaElement>>('bodyInput');
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private claimedId: string | null = null;

  item = signal<DocsignEditVm | null>(null);
  loaded = signal<DocsignDocumentDetail | null>(null);
  currentId: string | null = null;
  originalDataStr = signal('');
  returnUrl = '/docsign/list';

  isDirty = signal(false);
  isSaveDisabled = signal(true);
  userSearch = signal('');
  workspacePane = signal<'form' | 'paper'>('form');
  printing = signal(false);

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.docsignService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  isOwner = computed(() => {
    const me = this.authService.userProfile()?.user_id;
    const createdBy = this.item()?.created_by;
    return !!me && me === createdBy;
  });

  isLocked = computed(() => !!this.item()?.locked_at);
  isSent = computed(() => !!this.item()?.sent_at);

  otherSignerIds = computed(() => {
    const item = this.item();
    if (!item) return [];
    return item.signer_user_ids.filter((id) => id !== item.created_by);
  });

  filteredUsers = computed(() => {
    const q = this.userSearch().toLowerCase();
    const item = this.item();
    const owner = item?.created_by || this.authService.userProfile()?.user_id || '';
    const selected = item?.signer_user_ids || [];
    return this.userService
      .usersSharingOneGroupWith([owner, ...selected])
      .map((user) => ({
        value: user.user_id,
        label: this.displayNamePipe.transform(user),
      }))
      .filter((opt) => (q ? opt.label.toLowerCase().includes(q) : true));
  });

  paperSigners = computed<DocsignSignerSlot[]>(() => {
    const item = this.item();
    const loaded = this.loaded();
    if (!item) return [];
    const version = loaded ? currentVersion(loaded) : undefined;
    const sigs = loaded
      ? signaturesForVersion(loaded.signatures, version?.tb_tyapp_dsgn_ver_id)
      : [];
    return item.signer_user_ids.map((id) => {
      const user = this.userService.users().find((u) => u.user_id === id);
      const sig = sigs.find((s) => s.user_id === id);
      return {
        userId: id,
        name: user ? this.displayNamePipe.transform(user) : 'Unknown',
        signedName: sig?.signed_name ?? null,
        signedMark: sig?.signed_mark ?? null,
        signedAt: sig?.signed_at ?? null,
        signedSvg: sig?.signed_svg ?? null,
      };
    });
  });

  paperLifecycle = computed(() =>
    docsignLifecycle(this.item()?.sent_at, this.item()?.locked_at),
  );

  paperDocumentNo = computed(() =>
    documentNo(this.loaded()?.tb_tyapp_dsgn_seq_no),
  );

  hasSignedCurrent = computed(() => {
    const me = this.authService.userProfile()?.user_id;
    if (!me) return false;
    return this.paperSigners().some((slot) => slot.userId === me && !!slot.signedAt);
  });

  isFormLocked = computed(() => this.isLocked() || this.hasSignedCurrent());

  headerDirty = computed(() => {
    const data = this.item();
    if (!data || !this.originalDataStr()) return false;
    const original = JSON.parse(this.originalDataStr()) as DocsignEditVm;
    return (
      data.title !== original.title ||
      data.doc_date !== original.doc_date ||
      data.remarks !== original.remarks ||
      JSON.stringify(data.signer_user_ids) !==
        JSON.stringify(original.signer_user_ids)
    );
  });

  contentDirty = computed(() => {
    const data = this.item();
    if (!data || !this.originalDataStr()) return false;
    const original = JSON.parse(this.originalDataStr()) as DocsignEditVm;
    return data.content !== original.content;
  });

  canSignAndSend = computed(() => {
    const me = this.authService.userProfile()?.user_id;
    const item = this.item();
    if (!me || !item || !item.title.trim()) return false;
    if (this.isFormLocked()) return false;
    if (this.docsignService.loading()) return false;
    if (!item.sent_at) return this.isOwner();
    if (!item.signer_user_ids.includes(me)) return false;
    return true;
  });

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  @HostListener('window:pagehide')
  onPageHide() {
    void this.releaseClaim();
  }

  @HostListener('window:beforeprint')
  onBeforePrint() {
    this.printing.set(true);
  }

  @HostListener('window:afterprint')
  onAfterPrint() {
    this.printing.set(false);
  }

  ngDoCheck() {
    const current = this.item();
    const original = this.originalDataStr();
    if (!current || !original) return;

    const currentlyDirty = JSON.stringify(current) !== original;
    if (this.isDirty() !== currentlyDirty) {
      this.isDirty.set(currentlyDirty);
    }

    const disabled =
      this.docsignService.loading() ||
      this.isFormLocked() ||
      !current.title.trim() ||
      (!currentlyDirty && !!this.currentId);

    if (this.isSaveDisabled() !== disabled) {
      this.isSaveDisabled.set(disabled);
    }
  }

  onPaneChange(event: MatButtonToggleChange) {
    this.workspacePane.set(event.value === 'paper' ? 'paper' : 'form');
  }

  displayUserName(id: string): string {
    const user = this.userService.users().find((item) => item.user_id === id);
    return user ? this.displayNamePipe.transform(user) : 'Unknown';
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');
    this.returnUrl =
      this.route.snapshot.queryParamMap.get('returnUrl') || '/docsign/list';

    await Promise.all([
      this.docsignService.fetchAllDocuments(),
      this.docsignService.fetchMySignatures(),
      this.userService.fetchAllUsers(),
      this.userService.fetchGroups(),
    ]);

    if (this.currentId) {
      const opened = await this.openExclusive(this.currentId);
      if (!opened) {
        this.router.navigate(['/docsign/list']);
        return;
      }
      if (this.isFormLocked()) this.workspacePane.set('paper');
      this.applyHeader();
    } else {
      const me = this.authService.userProfile()?.user_id || '';
      const blank: DocsignEditVm = {
        title: '',
        doc_date: formatDate(new Date()),
        remarks: '',
        content: '',
        created_by: me,
        signer_user_ids: me ? [me] : [],
        sent_at: null,
        current_version_no: 0,
        locked_at: null,
        status: RecordStatus.Active,
      };
      this.item.set(blank);
      this.originalDataStr.set(JSON.stringify(blank));
      this.applyHeader();
    }
  }

  addSigner(event: MatAutocompleteSelectedEvent): void {
    const userId = String(event.option.value);
    this.userSearch.set('');
    const curr = this.item();
    if (!curr || this.isFormLocked() || !this.isOwner()) {
      return;
    }
    if (curr.signer_user_ids.includes(userId)) return;
    if (!this.userService.idsShareAGroup([...curr.signer_user_ids, userId])) {
      this.notification.handleError(
        'Add Signer Failed',
        'Everyone on the signer list must belong to the same user group',
      );
      return;
    }
    this.item.set({
      ...curr,
      signer_user_ids: [...curr.signer_user_ids, userId],
    });
  }

  removeSigner(userId: string): void {
    const curr = this.item();
    if (!curr || this.isFormLocked() || !this.isOwner()) {
      return;
    }
    if (userId === curr.created_by) return;
    this.item.set({
      ...curr,
      signer_user_ids: curr.signer_user_ids.filter((id) => id !== userId),
    });
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.title.trim() || this.isFormLocked()) return;

    if (!this.userService.idsShareAGroup(data.signer_user_ids)) {
      this.notification.handleError(
        'Save Failed',
        'Everyone on the signer list must belong to the same user group',
      );
      return;
    }

    if (!data.sent_at) {
      const saved = await this.docsignService.saveDraft({
        id: data.tb_tyapp_dsgn_id ?? null,
        title: data.title.trim(),
        docDate: this.optionalDate(data.doc_date),
        remarks: data.remarks,
        content: data.content,
        signerUserIds: data.signer_user_ids,
      });
      if (saved) {
        this.currentId = saved.tb_tyapp_dsgn_id;
        this.applyLoaded(saved);
        await this.claimExclusive(saved.tb_tyapp_dsgn_id);
        this.applyHeader();
        if (!this.route.snapshot.paramMap.get('id')) {
          await this.router.navigate(['/docsign/edit', saved.tb_tyapp_dsgn_id], {
            replaceUrl: true,
          });
        }
      }
      return;
    }

    if (!this.isOwner() || !data.tb_tyapp_dsgn_id || !this.headerDirty()) return;
    const saved = await this.docsignService.saveHeader({
      id: data.tb_tyapp_dsgn_id,
      title: data.title.trim(),
      docDate: this.optionalDate(data.doc_date),
      remarks: data.remarks,
      signerUserIds: data.signer_user_ids,
    });
    if (saved) {
      this.applyLoaded(saved);
      this.applyHeader();
    }
  }

  async onSignAndSend() {
    const data = this.item();
    if (!data || !this.canSignAndSend()) return;

    if (!this.docsignService.mySignature()) {
      this.notification.handleError(
        'Sign & Send Failed',
        'Set up your signature first.',
      );
      await this.router.navigate(['/docsign/signature']);
      return;
    }

    if (!this.userService.idsShareAGroup(data.signer_user_ids)) {
      this.notification.handleError(
        'Sign & Send Failed',
        'Everyone on the signer list must belong to the same user group',
      );
      return;
    }

    if (!data.sent_at) {
      if (this.isDirty() || !data.tb_tyapp_dsgn_id) {
        await this.onSave();
      }
    } else if (this.headerDirty() && this.isOwner()) {
      await this.onSave();
    }

    const latest = this.item();
    if (!latest?.tb_tyapp_dsgn_id) return;

    if (!latest.sent_at) {
      if (
        !confirm('Sign this document and send it to the other signers?')
      ) {
        return;
      }
    } else if (this.contentDirty()) {
      const nextNo = (latest.current_version_no || 0) + 1;
      if (
        !confirm(
          `This will create version ${nextNo}. Other people will need to sign the new version. You will be signed.`,
        )
      ) {
        return;
      }
    } else if (!confirm('Sign the current version of this document?')) {
      return;
    }

    const saved = await this.docsignService.signAndSend(
      latest.tb_tyapp_dsgn_id,
      latest.content,
    );
    if (saved) {
      this.isDirty.set(false);
      this.router.navigate(['/docsign/list']);
    }
  }

  async onDelete() {
    if (!this.currentId || !this.isOwner()) return;
    if (!confirm('Are you sure you want to delete this document?')) return;
    const success = await this.docsignService.deleteDocument(this.currentId);
    if (success) {
      this.claimedId = null;
      this.isDirty.set(false);
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  onCompare() {
    if (!this.currentId) return;
    this.router.navigate(['/docsign/compare', this.currentId]);
  }

  onPrint() {
    window.print();
  }

  ngOnDestroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    void this.releaseClaim();
    this.headerService.clear();
  }

  private async openExclusive(id: string): Promise<boolean> {
    const fresh = await this.docsignService.fetchDocumentById(id);
    if (!fresh) return false;
    if (fresh.locked_at) {
      this.applyLoaded(fresh);
      return true;
    }
    const claimed = await this.docsignService.claimEdit(id);
    if (!claimed) return false;
    this.applyLoaded(claimed);
    this.claimedId = id;
    this.startHeartbeat();
    return true;
  }

  private async claimExclusive(id: string): Promise<void> {
    if (this.loaded()?.locked_at || this.claimedId === id) return;
    const claimed = await this.docsignService.claimEdit(id);
    if (!claimed) return;
    this.loaded.set(claimed);
    this.claimedId = id;
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (!this.claimedId) return;
    this.heartbeatTimer = setInterval(() => {
      if (!this.claimedId) return;
      void this.docsignService.heartbeatEdit(this.claimedId).then((row) => {
        this.zone.run(() => {
          if (!row) return;
          const me = this.authService.userProfile()?.user_id;
          if (row.editing_by && me && row.editing_by !== me) {
            this.claimedId = null;
            this.notification.handleError(
              'Document Closed',
              'Another user opened this document.',
            );
            this.router.navigate(['/docsign/list']);
            return;
          }
          this.loaded.set(row);
        });
      });
    }, DOCSIGN_LEASE_HEARTBEAT_MS);
  }

  private async releaseClaim() {
    const id = this.claimedId;
    this.claimedId = null;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (id) await this.docsignService.releaseEdit(id);
  }

  private applyLoaded(doc: DocsignDocumentDetail) {
    this.loaded.set(doc);
    const vm: DocsignEditVm = {
      tb_tyapp_dsgn_id: doc.tb_tyapp_dsgn_id,
      title: doc.title,
      doc_date: doc.doc_date ?? '',
      remarks: doc.remarks ?? '',
      content: bodyContent(doc),
      created_by: doc.created_by,
      signer_user_ids: [...doc.signer_user_ids],
      sent_at: doc.sent_at ?? null,
      current_version_no: doc.current_version_no,
      locked_at: doc.locked_at ?? null,
      status: doc.status,
    };
    this.item.set(vm);
    this.originalDataStr.set(JSON.stringify(vm));
    this.isDirty.set(false);
  }

  private applyHeader() {
    const sent = this.isSent();
    const locked = this.isLocked();
    const isOwner = this.isOwner();
    const actions: HeaderAction[] = [];

    const versionCount = this.loaded()?.versions.length ?? 0;
    if (sent && this.currentId && versionCount > 1) {
      actions.push({
        label: 'Compare',
        icon: 'difference',
        type: 'secondary',
        onClick: () => this.onCompare(),
      });
    }
    if (locked && this.currentId) {
      actions.push({
        label: 'Print',
        icon: 'print',
        type: 'secondary',
        onClick: () => this.onPrint(),
      });
    }
    if (isOwner && this.currentId) {
      actions.push({
        label: 'Delete',
        icon: 'delete_outline',
        type: 'secondary',
        onClick: () => this.onDelete(),
      });
    }
    if (!this.isFormLocked()) {
      if (!sent) {
        actions.push({
          label: 'Save draft',
          icon: 'check',
          type: 'secondary',
          disabled: this.isSaveDisabled,
          onClick: () => this.onSave(),
        });
      }
      actions.push({
        label: 'Sign & send',
        icon: 'draw',
        type: 'primary',
        disabled: computed(
          () => this.docsignService.loading() || !this.canSignAndSend(),
        ),
        onClick: () => this.onSignAndSend(),
      });
    }

    this.headerService.setConfig({
      backLink: this.returnUrl,
      syncStatus: this.syncStatus,
      actions,
    });
  }

  formatBold() {
    this.applyBodyEdit((source, start, end) =>
      wrapMarkdownSelection(source, start, end, '**', '**'),
    );
  }

  formatItalic() {
    this.applyBodyEdit((source, start, end) =>
      wrapMarkdownSelection(source, start, end, '*', '*'),
    );
  }

  formatCode() {
    this.applyBodyEdit((source, start, end) =>
      wrapMarkdownSelection(source, start, end, '`', '`'),
    );
  }

  formatLink() {
    this.applyBodyEdit((source, start, end) =>
      wrapMarkdownSelection(source, start, end, '[', '](url)'),
    );
  }

  formatHeading1() {
    this.applyLinePrefix('# ', /^#{1,6}\s+/);
  }

  formatHeading2() {
    this.applyLinePrefix('## ', /^#{1,6}\s+/);
  }

  formatBulletList() {
    this.applyLinePrefix('- ', /^\s*(?:[-*]|\d+\.)\s+/);
  }

  formatNumberedList() {
    this.applyLinePrefix('1. ', /^\s*(?:[-*]|\d+\.)\s+/);
  }

  formatQuote() {
    this.applyLinePrefix('> ', /^\s*>\s+/);
  }

  insertTable() {
    this.applyBodyEdit((source, start, end) =>
      insertAtCursor(
        source,
        start,
        end,
        '\n\n| Column A | Column B |\n| --- | --- |\n|  |  |\n\n',
      ),
    );
  }

  insertRule() {
    this.applyBodyEdit((source, start, end) =>
      insertAtCursor(source, start, end, '\n\n---\n\n'),
    );
  }

  private applyLinePrefix(prefix: string, stripLeading?: RegExp) {
    this.applyBodyEdit((source, start, end) =>
      prefixSelectedLines(source, start, end, prefix, stripLeading),
    );
  }

  private applyBodyEdit(
    transform: (
      source: string,
      start: number,
      end: number,
    ) => MarkdownEditResult,
  ) {
    const curr = this.item();
    const el = this.bodyInput()?.nativeElement;
    if (!curr || !el || this.isFormLocked()) return;
    const result = transform(
      curr.content,
      el.selectionStart ?? curr.content.length,
      el.selectionEnd ?? curr.content.length,
    );
    this.item.set({ ...curr, content: result.next });
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(result.cursorStart, result.cursorEnd);
    });
  }

  private optionalDate(value: string): string | null {
    const date = (value ?? '').trim();
    return date ? date : null;
  }
}
