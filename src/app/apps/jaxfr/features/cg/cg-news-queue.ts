import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CgWheelSelect } from '../../../../core/domains/cg/cg-wheel.directive';
import {
  CG_BREAKING_WARN_CHARS,
  CG_NEWS_INSERT_OPTIONS,
} from '../../../../core/domains/cg/cg.constants';
import { CgNewsInsertAt, CgNewsItem } from '../../../../core/domains/cg/cg.model';
import {
  breakingTextIsTight,
  createNewsItem,
  editNewsItem,
  insertNewsItems,
  newsCharCount,
  newsSkipMessage,
  parseNewsLines,
} from '../../../../core/domains/cg/cg.util';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-cg-news-queue',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CgWheelSelect,
  ],
  templateUrl: './cg-news-queue.html',
  styleUrl: './cg-news-queue.scss',
})
export class CgNewsQueue {
  private readonly notification = inject(NotificationService);

  readonly items = input.required<CgNewsItem[]>();
  /** Breaking passes the hard limit. Ticker passes null (no limit). */
  readonly maxChars = input<number | null>(null);
  readonly onAir = input(false);
  readonly itemsChange = output<CgNewsItem[]>();

  readonly insertOptions = CG_NEWS_INSERT_OPTIONS;
  readonly insertValues = CG_NEWS_INSERT_OPTIONS.map((option) => option.value);
  readonly selectedId = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly notice = signal('');

  lineText = '';
  bulkText = '';
  editText = '';
  insertAt: CgNewsInsertAt = 'bottom';

  readonly charCount = newsCharCount;
  readonly isTight = breakingTextIsTight;

  addLine(event?: Event): void {
    event?.preventDefault();
    const text = this.lineText.trim();
    if (!text) return;
    if (!this.accepts(text)) return;
    const item = createNewsItem(text);
    this.publish(insertNewsItems(this.items(), [item], this.insertAt, this.selectedId()));
    this.lineText = '';
    this.selectedId.set(item.id);
    this.notice.set('');
  }

  appendBulk(): void {
    this.loadText(this.bulkText, false);
  }

  replaceAll(): void {
    this.loadText(this.bulkText, true);
  }

  onFile(event: Event): void {
    const inputEl = event.target;
    if (!(inputEl instanceof HTMLInputElement) || !inputEl.files?.length) return;
    const file = inputEl.files[0];
    inputEl.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        this.notification.handleError('News', 'Could not read that file.');
        return;
      }
      this.loadText(reader.result, false);
    };
    reader.onerror = () => this.notification.handleError('News', 'Could not read that file.');
    reader.readAsText(file);
  }

  clearAll(): void {
    if (this.items().length === 0) return;
    if (!confirm('Clear all news lines?')) return;
    this.selectedId.set(null);
    this.editingId.set(null);
    this.notice.set('');
    this.publish([]);
  }

  beginEdit(item: CgNewsItem, event: Event): void {
    event.stopPropagation();
    this.selectedId.set(item.id);
    this.editingId.set(item.id);
    this.editText = item.text;
  }

  cancelEdit(event?: Event): void {
    event?.stopPropagation();
    this.editingId.set(null);
  }

  commitEdit(mode: 'now' | 'next', event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const id = this.editingId();
    if (!id) return;
    const text = this.editText.trim();
    if (!text) {
      this.notification.handleError('News', 'Enter the line text.');
      return;
    }
    if (!this.accepts(text)) return;
    const current = this.items().find((item) => item.id === id);
    if (current && current.text === text) {
      this.editingId.set(null);
      return;
    }
    const apply = this.onAir() ? mode : 'now';
    this.publish(editNewsItem(this.items(), id, text, apply));
    this.editingId.set(null);
    this.notice.set('');
  }

  toggleEnabled(item: CgNewsItem, event: Event): void {
    event.stopPropagation();
    this.publish(
      this.items().map((row) =>
        row.id === item.id ? { ...row, enabled: !row.enabled } : row,
      ),
    );
  }

  move(index: number, delta: number, event: Event): void {
    event.stopPropagation();
    const target = index + delta;
    const next = [...this.items()];
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    if (!row) return;
    next.splice(target, 0, row);
    this.publish(next);
  }

  remove(item: CgNewsItem, event: Event): void {
    event.stopPropagation();
    this.publish(this.items().filter((row) => row.id !== item.id));
    if (this.selectedId() === item.id) this.selectedId.set(null);
    if (this.editingId() === item.id) this.editingId.set(null);
  }

  onDrop(event: CdkDragDrop<CgNewsItem[]>): void {
    const next = [...this.items()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.publish(next);
  }

  onInsert(value: string): void {
    if (value === 'top' || value === 'after' || value === 'bottom') {
      this.insertAt = value;
    }
  }

  private publish(items: CgNewsItem[]): void {
    this.itemsChange.emit(items);
  }

  private accepts(text: string): boolean {
    const max = this.maxChars();
    if (max != null && newsCharCount(text) > max) {
      this.notification.handleError(
        'Breaking',
        `Keep each line to ${max} characters (every letter and digit counts).`,
      );
      return false;
    }
    return true;
  }

  private loadText(raw: string, replace: boolean): void {
    const max = this.maxChars();
    const parsed = parseNewsLines(raw, max);
    const skip = max != null ? newsSkipMessage(parsed.skipped, max) : '';
    if (parsed.accepted.length === 0) {
      if (skip) this.notification.handleError('News', skip);
      else if (replace) this.notification.handleError('News', 'Enter at least one line.');
      this.notice.set(skip);
      return;
    }
    const incoming = parsed.accepted.map((text) => createNewsItem(text));
    const next = replace
      ? incoming
      : insertNewsItems(this.items(), incoming, this.insertAt, this.selectedId());
    this.publish(next);
    this.bulkText = '';
    this.notice.set(skip);
    if (skip) {
      const verb = replace ? 'Loaded' : 'Added';
      this.notification.showSuccess(`${verb} ${parsed.accepted.length}. ${skip}`);
    }
    if (replace) this.selectedId.set(incoming[0]?.id ?? null);
  }

  readonly warnAt = CG_BREAKING_WARN_CHARS;
}
