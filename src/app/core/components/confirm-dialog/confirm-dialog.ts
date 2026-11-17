import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

/** Affirmative button. Confirm is glossy primary; Delete is glossy danger. */
export enum ConfirmDialogTone {
  Confirm = 'confirm',
  Delete = 'delete',
}

export interface ConfirmDialogData {
  message: string;
  tone?: ConfirmDialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * Shared yes/no dialog. Resolves true only when the affirmative button is pressed.
 * Cancel, backdrop, and Escape resolve false.
 */
export function openConfirmDialog(
  dialog: MatDialog,
  data: ConfirmDialogData,
): Promise<boolean> {
  const ref = dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(
    ConfirmDialog,
    {
      data,
      width: 'min(420px, 92vw)',
      maxWidth: '92vw',
      autoFocus: 'dialog',
      restoreFocus: true,
      enterAnimationDuration: 0,
      exitAnimationDuration: 0,
      panelClass: 'app-confirm-dialog-panel',
      ariaLabel: data.message,
    },
  );
  return firstValueFrom(ref.afterClosed()).then((result) => result === true);
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ConfirmDialog, boolean>);

  constructor() {
    // Keep Escape inside this dialog so page-level Escape handlers do not also run.
    this.dialogRef
      .keydownEvents()
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event.key === 'Escape') event.stopPropagation();
      });
  }

  readonly isDelete = this.data.tone === ConfirmDialogTone.Delete;
  readonly confirmLabel =
    this.data.confirmLabel ?? (this.isDelete ? 'Delete' : 'Confirm');
  readonly cancelLabel = this.data.cancelLabel ?? 'Cancel';

  confirm(): void {
    this.dialogRef.close(true);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
