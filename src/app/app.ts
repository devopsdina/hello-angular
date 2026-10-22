import { Component, computed, inject } from '@angular/core';

import { flagKey } from '../environments/environment';
import { LaunchDarklyService } from './launchdarkly/launchdarkly.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '[style.background-color]': 'background()' },
})
export class App {
  private readonly ld = inject(LaunchDarklyService);

  protected readonly flagKey = flagKey;
  protected readonly status = this.ld.status;
  // A signal that updates whenever the flag changes in LaunchDarkly.
  protected readonly flagValue = this.ld.boolVariation(flagKey, false);
  protected readonly background = computed(() => (this.flagValue() ? '#00844B' : '#373841'));
}
