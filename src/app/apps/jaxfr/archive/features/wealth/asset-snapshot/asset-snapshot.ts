import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { WealthService } from '../wealth.service';
import { HeaderService } from '../../../../../../core/services/header.service';

@Component({
  selector: 'app-asset-snapshot',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './asset-snapshot.html',
})
export class AssetSnapshotComponent implements OnInit {
  private wealthService = inject(WealthService);
  private headerService = inject(HeaderService);

  snapshots = this.wealthService.snapshots;
  loading = this.wealthService.loading;

  displayedColumns: string[] = [
    'date',
    'institution',
    'type',
    'value',
    'reference',
  ];

  ngOnInit() {
    this.headerService.setConfig({
      title: 'Asset Snapshots',
    });
    this.wealthService.fetchAllSnapshots();
  }
}
