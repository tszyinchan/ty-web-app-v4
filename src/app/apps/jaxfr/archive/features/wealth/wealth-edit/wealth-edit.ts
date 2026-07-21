import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { WealthService } from '../wealth.service';
import { WealthTransaction, TransactionType } from '../wealth.model';
import { HeaderService } from '../../../../../../core/services/header.service';
import { AuthService } from '../../../../../../core/services/auth.service';

@Component({
  selector: 'app-wealth-edit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './wealth-edit.html',
})
export class WealthEdit implements OnInit {
  private fb = inject(FormBuilder);
  private wealthService = inject(WealthService);
  private authService = inject(AuthService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  txnForm: FormGroup;
  isEdit = false;
  txnId: string | null = null;
  loading = this.wealthService.loading;

  transactionTypes: { value: TransactionType; label: string }[] = [
    { value: 'term_deposit', label: 'Term Deposit' },
    { value: 'fx_exchange', label: 'FX Exchange' },
    { value: 'cash_flow', label: 'Cash Flow' },
    { value: 'investment', label: 'Investment' },
  ];

  constructor() {
    this.txnForm = this.fb.group({
      user_id: [this.authService.userProfile()?.user_id, Validators.required],
      seq_major: [0, Validators.required],
      seq_minor: [0],
      transaction_type: ['cash_flow' as TransactionType, Validators.required],
      institution_name: ['', Validators.required],
      currency: ['CAD', Validators.required],
      deposit_amount: [0, Validators.required],
      start_date: [new Date(), Validators.required],
      
      // Term Deposit fields
      duration_months: [null],
      annual_interest_rate: [null],
      end_date: [null],
      earned_interest: [null],
      return_amount: [null],

      // FX fields
      fx_source_currency: [null],
      fx_source_amount: [null],

      status: [1, Validators.required],
    });
  }

  ngOnInit() {
    this.txnId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.txnId;

    this.headerService.setConfig({
      title: this.isEdit ? 'Edit Transaction' : 'New Transaction',
      backLink: '/wealth/list',
    });

    if (this.isEdit && this.txnId) {
      this.loadTransaction(this.txnId);
    }
  }

  private async loadTransaction(id: string) {
    const txn = await this.wealthService.fetchTransactionById(id);
    if (txn) {
      this.txnForm.patchValue({
        ...txn,
        start_date: new Date(txn.start_date),
        end_date: txn.end_date ? new Date(txn.end_date) : null,
      });
    }
  }

  async onSave() {
    if (this.txnForm.invalid) return;

    const formValue = this.txnForm.value;
    const payload: Partial<WealthTransaction> = {
      ...formValue,
      start_date: (formValue.start_date as Date).toISOString().split('T')[0],
      end_date: formValue.end_date ? (formValue.end_date as Date).toISOString().split('T')[0] : null,
    };

    if (this.isEdit && this.txnId) {
      payload.tb_tyapp_fin_txn_id = this.txnId;
    }

    const success = await this.wealthService.saveTransaction(payload);
    if (success) {
      this.txnForm.markAsPristine();
      this.router.navigate(['/wealth/list']);
    }
  }

  get showTermFields(): boolean {
    return this.txnForm.get('transaction_type')?.value === 'term_deposit';
  }

  get showFxFields(): boolean {
    return this.txnForm.get('transaction_type')?.value === 'fx_exchange';
  }
}
