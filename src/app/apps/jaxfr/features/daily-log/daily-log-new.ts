import { CommonModule } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import 'emoji-picker-element';

import { HeaderService } from '../../../../core/services/header.service';
import { formatDate } from '../../../../core/utils/date-time.util';
import { DL_COLOUR_PRESETS, DlColourPresetKey } from './daily-log.model';
import { DailyLogChrome, DailyLogChromeAction } from './daily-log-chrome';
import { DailyLogIcon } from './daily-log-icon';
import { DailyLogService } from './daily-log.service';
import {
  colourClass,
  confirmDiscardEdits,
  findLibraryItemByName,
  isEditDraftDirty,
  normalizeLogDateParam,
} from './daily-log.util';

@Component({
  selector: 'app-daily-log-new',
  standalone: true,
  imports: [CommonModule, FormsModule, DailyLogChrome, DailyLogIcon],
  templateUrl: './daily-log-new.html',
  styleUrl: './daily-log-new.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyLogNew implements OnInit, OnDestroy {
  readonly service = inject(DailyLogService);
  private headerService = inject(HeaderService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly colourPresets = DL_COLOUR_PRESETS;
  readonly logDate = signal(formatDate(new Date()));
  readonly itemText = signal('');
  readonly emoji = signal<string | null>(null);
  readonly colour = signal<DlColourPresetKey>('slate');
  readonly remarks = signal('');
  readonly showEmojiPicker = signal(false);
  private origin: {
    text: string;
    emoji: string | null;
    colour: DlColourPresetKey;
    remarks: string;
  } | null = null;

  readonly existingMatch = computed(() =>
    findLibraryItemByName(this.service.libraryItems(), this.itemText()),
  );

  readonly chromeActions = computed<DailyLogChromeAction[]>(() => [
    {
      label: 'Save',
      icon: 'save',
      disabled: this.service.busy() || !this.itemText().trim(),
      onClick: () => void this.save(),
    },
    {
      label: 'Cancel',
      icon: 'cancel',
      disabled: this.service.busy(),
      onClick: () => this.cancel(),
    },
  ]);

  readonly onBack = () => this.cancel();

  ngOnInit() {
    this.headerService.clear();
    const params = this.route.snapshot.queryParamMap;
    const date = normalizeLogDateParam(params.get('date'));
    this.logDate.set(date);
    this.itemText.set(params.get('name')?.trim() ?? '');
    this.origin = {
      text: this.itemText(),
      emoji: null,
      colour: 'slate',
      remarks: '',
    };
    void this.service.fetchLibraryItems();
    void this.service.fetchItemsForRange(date, date, date, { merge: true });
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  colourChipClasses(key: DlColourPresetKey, selected: boolean): string[] {
    const classes = [colourClass(key)];
    if (selected) classes.push('selected');
    return classes;
  }

  selectColour(key: DlColourPresetKey) {
    this.colour.set(key);
  }

  openEmojiPicker() {
    this.showEmojiPicker.set(true);
  }

  closeEmojiPicker() {
    this.showEmojiPicker.set(false);
  }

  onPickerEmoji(event: Event) {
    const unicode = (event as CustomEvent<{ unicode?: string }>).detail?.unicode;
    const next = unicode?.trim() ?? '';
    if (next) this.emoji.set(next);
    this.closeEmojiPicker();
  }

  clearEmoji() {
    this.emoji.set(null);
  }

  async save() {
    const text = this.itemText().trim();
    if (!text || this.service.busy()) return;
    const date = this.logDate();
    await Promise.all([
      this.service.fetchLibraryItems(),
      this.service.fetchItemsForRange(date, date, date, { merge: true }),
    ]);
    const existing = findLibraryItemByName(this.service.libraryItems(), text);
    const ok = existing
      ? await this.service.addExistingItemToDate(
          date,
          existing.tb_tyapp_dl_itm_id,
          this.remarks(),
        )
      : await this.service.createLibraryItemAndAddToDate(date, {
          itemText: text,
          emoji: this.emoji(),
          colourPresetKey: this.colour(),
          remarks: this.remarks(),
        });
    if (ok) this.goToLog();
  }

  cancel() {
    if (!confirmDiscardEdits(this.isDirty())) return;
    this.goToLog();
  }

  private isDirty(): boolean {
    return isEditDraftDirty(
      {
        text: this.itemText(),
        emoji: this.emoji(),
        colour: this.colour(),
        remarks: this.remarks(),
      },
      this.origin,
    );
  }

  private goToLog() {
    void this.router.navigate(['/daily-log'], {
      queryParams: { date: this.logDate() },
    });
  }
}
