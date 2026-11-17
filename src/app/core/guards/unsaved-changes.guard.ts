import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { CanDeactivateFn } from '@angular/router';
import {
  ConfirmDialogTone,
  openConfirmDialog,
} from '../components/confirm-dialog/confirm-dialog';

export interface HasUnsavedChanges {
  isDirty: () => boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (
  component,
) => {
  if (component.isDirty && component.isDirty()) {
    return openConfirmDialog(inject(MatDialog), {
      message: 'You have unsaved changes. Are you sure you want to leave?',
      tone: ConfirmDialogTone.Confirm,
    });
  }
  return true;
};
