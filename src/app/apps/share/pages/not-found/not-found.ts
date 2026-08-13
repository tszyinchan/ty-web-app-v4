import { Component } from '@angular/core';

/**
 * Generic "nothing here" page for the share subdomain. Shown for both a
 * genuinely unmatched URL and a wrong/expired access key - deliberately
 * identical in both cases so a wrong guess never reveals that a password
 * mechanism exists.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [],
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
})
export class NotFound {}
