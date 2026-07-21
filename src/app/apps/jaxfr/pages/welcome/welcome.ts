import { Component, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { APP_CONFIG } from '../../../../app.constants';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss',
})
export class Welcome {
  appName = signal(APP_CONFIG.appName);
  
  versionDate = signal(APP_CONFIG.versionDate);
  
  currentDate = signal(new Date());

  appVersion = computed(() => {
    const { major, minor, patch } = APP_CONFIG.version;
    return `${major}.${minor}.${patch}`;
  });
}