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
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../../../core/utils/date-time.util';
import { UserService } from '../user/user.service';
import {
  DocsignDocumentView,
  DocsignSignerSlot,
} from './docsign-document';
import { DocsignDocumentDetail, DocsignEditVm } from './docsign.model';
import { DocsignService } from './docsign.service';
import {
  MarkdownEditResult,
  bodyContent,
  currentVersion,
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

  item = signal<DocsignEditVm | null>(null);
  loaded = signal<DocsignDocumentDetail | null>(null);
  currentId: string | null = null;
  originalDataStr = signal('');
  returnUrl = '/docsign/list';

  isDirty = signal(false);
  isSaveDisabled = signal(true);
  userSearch = signal('');

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
        signedAt: sig?.signed_at ?? null,
      };
    });
  });

  paperLifecycle = computed(() =>
    docsignLifecycle(this.item()?.sent_at, this.item()?.locked_at),
  );

  hasSignedCurrent = computed(() => {
    const me = this.authService.userProfile()?.user_id;
    if (!me) return false;
    return this.paperSigners().some((slot) => slot.userId === me && !!slot.signedAt);
  });

  canSign = computed(() => {
    const me = this.authService.userProfile()?.user_id;
    const item = this.item();
    if (!me || !item?.sent_at || item.locked_at) return false;
    if (!item.signer_user_ids.includes(me)) return false;
    return !this.hasSignedCurrent();
  });

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      return false;
    }
    return true;
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
      this.isLocked() ||
      (!!this.currentId && !currentlyDirty) ||
      !current.title.trim();

    if (this.isSaveDisabled() !== disabled) {
      this.isSaveDisabled.set(disabled);
    }
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
      this.userService.fetchAllUsers(),
      this.userService.fetchGroups(),
    ]);

    if (this.currentId) {
      const cached = this.docsignService
        .documents()
        .find((doc) => doc.tb_tyapp_dsgn_id === this.currentId);
      if (cached) this.applyLoaded(cached);

      const fresh = await this.docsignService.fetchDocumentById(this.currentId);
      this.zone.run(() => {
        if (fresh) {
          this.applyLoaded(fresh);
        } else if (!cached) {
          this.router.navigate(['/docsign/list']);
        }
        this.applyHeader();
      });
    } else {
      const me = this.authService.userProfile()?.user_id || '';
      const blank: DocsignEditVm = {
        title: '',
        doc_date: '',
        doc_datetime: '',
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
    if (!curr || this.isLocked() || !this.isOwner()) return;
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
    if (!curr || this.isLocked() || !this.isOwner()) return;
    if (userId === curr.created_by) return;
    this.item.set({
      ...curr,
      signer_user_ids: curr.signer_user_ids.filter((id) => id !== userId),
    });
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.title.trim()) return;

    if (!this.userService.idsShareAGroup(data.signer_user_ids)) {
      this.notification.handleError(
        'Save Failed',
        'Everyone on the signer list must belong to the same user group',
      );
      return;
    }

    if (!data.sent_at) {
      const dates = this.payloadDates(data);
      const saved = await this.docsignService.saveDraft({
        id: data.tb_tyapp_dsgn_id ?? null,
        title: data.title.trim(),
        docDate: dates.docDate,
        docDatetime: dates.docDatetime,
        remarks: data.remarks,
        content: data.content,
        signerUserIds: data.signer_user_ids,
      });
      if (saved) {
        this.currentId = saved.tb_tyapp_dsgn_id;
        this.applyLoaded(saved);
        this.applyHeader();
        if (!this.route.snapshot.paramMap.get('id')) {
          await this.router.navigate(['/docsign/edit', saved.tb_tyapp_dsgn_id], {
            replaceUrl: true,
          });
        }
      }
      return;
    }

    const original = JSON.parse(this.originalDataStr()) as DocsignEditVm;
    const headerChanged =
      data.title !== original.title ||
      data.doc_date !== original.doc_date ||
      data.doc_datetime !== original.doc_datetime ||
      data.remarks !== original.remarks ||
      JSON.stringify(data.signer_user_ids) !==
        JSON.stringify(original.signer_user_ids);
    const contentChanged = data.content !== original.content;

    if (contentChanged) {
      const loaded = this.loaded();
      const version = loaded ? currentVersion(loaded) : undefined;
      const signedCount = loaded
        ? signaturesForVersion(loaded.signatures, version?.tb_tyapp_dsgn_ver_id)
            .length
        : 0;
      if (signedCount > 0) {
        const nextNo = (data.current_version_no || 0) + 1;
        if (
          !confirm(
            `This will create version ${nextNo} and clear all current signatures.`,
          )
        ) {
          return;
        }
      }
    }

    let saved: DocsignDocumentDetail | null = this.loaded();
    if (headerChanged && this.isOwner() && data.tb_tyapp_dsgn_id) {
      const dates = this.payloadDates(data);
      saved = await this.docsignService.saveHeader({
        id: data.tb_tyapp_dsgn_id,
        title: data.title.trim(),
        docDate: dates.docDate,
        docDatetime: dates.docDatetime,
        remarks: data.remarks,
        signerUserIds: data.signer_user_ids,
      });
      if (!saved) return;
    }

    if (contentChanged && data.tb_tyapp_dsgn_id) {
      saved = await this.docsignService.saveVersion(
        data.tb_tyapp_dsgn_id,
        data.content,
      );
      if (!saved) return;
    }

    if (saved) {
      this.applyLoaded(saved);
      this.applyHeader();
    }
  }

  async onSend() {
    const data = this.item();
    if (!data || !data.title.trim()) return;

    if (this.isDirty()) {
      await this.onSave();
    }
    const id = this.item()?.tb_tyapp_dsgn_id;
    if (!id || this.item()?.sent_at) return;

    if (!confirm('Send this document to the signers? They will be able to see it.')) {
      return;
    }

    const saved = await this.docsignService.sendDocument(id);
    if (saved) {
      this.applyLoaded(saved);
      this.applyHeader();
    }
  }

  async onSign() {
    const data = this.item();
    const me = this.authService.userProfile();
    if (!data?.tb_tyapp_dsgn_id || !me || !this.canSign()) return;
    if (this.isDirty()) {
      this.notification.handleError(
        'Sign Failed',
        'Save your changes before signing.',
      );
      return;
    }
    if (!confirm('Sign the current version of this document?')) return;

    const saved = await this.docsignService.signDocument(
      data.tb_tyapp_dsgn_id,
      this.displayNamePipe.transform(me),
    );
    if (saved) {
      this.applyLoaded(saved);
      this.applyHeader();
    }
  }

  async onDelete() {
    if (!this.currentId || !this.isOwner()) return;
    if (!confirm('Are you sure you want to delete this document?')) return;
    const success = await this.docsignService.deleteDocument(this.currentId);
    if (success) {
      this.isDirty.set(false);
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  onCompare() {
    if (!this.currentId) return;
    this.router.navigate(['/docsign/compare', this.currentId]);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  private applyLoaded(doc: DocsignDocumentDetail) {
    this.loaded.set(doc);
    const vm: DocsignEditVm = {
      tb_tyapp_dsgn_id: doc.tb_tyapp_dsgn_id,
      title: doc.title,
      doc_date: doc.doc_date ?? '',
      doc_datetime: toDateTimeLocalValue(doc.doc_datetime),
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

    if (sent && this.currentId) {
      actions.push({
        label: 'Compare',
        icon: 'difference',
        type: 'secondary',
        onClick: () => this.onCompare(),
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
    if (!locked) {
      actions.push({
        label: sent ? 'Save' : 'Save draft',
        icon: 'check',
        type: sent ? 'secondary' : 'primary',
        disabled: this.isSaveDisabled,
        onClick: () => this.onSave(),
      });
    }
    if (!sent) {
      actions.push({
        label: 'Send to signers',
        icon: 'send',
        type: 'primary',
        disabled: computed(
          () =>
            this.docsignService.loading() ||
            !this.item()?.title.trim() ||
            this.isSent(),
        ),
        onClick: () => this.onSend(),
      });
    } else if (!locked) {
      actions.push({
        label: 'Sign',
        icon: 'draw',
        type: 'primary',
        disabled: computed(
          () => this.docsignService.loading() || this.isDirty() || !this.canSign(),
        ),
        onClick: () => this.onSign(),
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
    if (!curr || !el || this.isLocked()) return;
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

  private payloadDates(data: DocsignEditVm): {
    docDate: string | null;
    docDatetime: string | null;
  } {
    const date = (data.doc_date ?? '').trim();
    return {
      docDate: date ? date : null,
      docDatetime: fromDateTimeLocalValue(data.doc_datetime),
    };
  }
}
