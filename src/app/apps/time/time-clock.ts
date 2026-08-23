import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import {
  ANALOG_HOUR_NUMBERS,
  ANALOG_MINUTE_MARKS,
  ClockFace,
  PINNED_TIME_ZONES,
  formatClock,
  listTimeZones,
  persistClockFace,
  persistTimeZone,
  resolveInitialClockFace,
  resolveInitialTimeZone,
} from './time.util';

@Component({
  selector: 'app-time-clock',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './time-clock.html',
  styleUrl: './time-clock.scss',
})
export class TimeClock implements OnDestroy {
  private readonly title = inject(Title);

  readonly pinnedZones = PINNED_TIME_ZONES;
  readonly allZones = listTimeZones();
  readonly minuteMarks = ANALOG_MINUTE_MARKS;
  readonly hourNumbers = ANALOG_HOUR_NUMBERS;
  readonly selectedZone = signal(
    resolveInitialTimeZone(this.allZones.map((zone) => zone.id)),
  );
  readonly face = signal<ClockFace>(resolveInitialClockFace());
  readonly now = signal(new Date());
  readonly clock = computed(() => formatClock(this.now(), this.selectedZone()));

  private timerId = 0;

  constructor() {
    this.tick();
    this.scheduleNextTick();
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.timerId);
  }

  onZoneChange(event: Event): void {
    const zone = (event.target as HTMLSelectElement).value;
    this.selectedZone.set(zone);
    persistTimeZone(zone);
    this.syncTitle();
  }

  setFace(face: ClockFace): void {
    this.face.set(face);
    persistClockFace(face);
  }

  private tick(): void {
    this.now.set(new Date());
    this.syncTitle();
  }

  private scheduleNextTick(): void {
    const delay = 1000 - (Date.now() % 1000);
    this.timerId = window.setTimeout(() => {
      this.tick();
      this.scheduleNextTick();
    }, delay);
  }

  private syncTitle(): void {
    this.title.setTitle(this.clock().time);
  }
}
