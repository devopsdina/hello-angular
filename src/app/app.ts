import { Component, computed, inject } from '@angular/core';

import { flagKey } from '../environments/environment';
import { LD_DIRECTIVES } from './launchdarkly/directives';
import { flagSignal, launchDarklyStatus } from './launchdarkly/flag-signal';
import { LaunchDarklyService } from './launchdarkly/launchdarkly.service';

@Component({
  selector: 'app-root',
  imports: [LD_DIRECTIVES],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '[style.background-color]': 'background()' },
})
export class App {
  protected readonly flagKey = flagKey;
  protected readonly status = launchDarklyStatus;
  // A signal that updates whenever the flag changes in LaunchDarkly. This is the thin version:
  // flag-signal.ts on top of ld-client.ts.
  protected readonly flagValue = flagSignal(flagKey, false);
  protected readonly background = computed(() => (this.flagValue() ? '#00844B' : '#373841'));

  // Optional: LaunchDarklyService reuses the same client and adds evaluation details and the
  // template directives. Remove this and the directives if you don't need them.
  private readonly ld = inject(LaunchDarklyService);
  private readonly detail = this.ld.boolVariationDetail(flagKey, false);
  protected readonly reason = computed(() => this.detail().reason?.kind ?? 'unknown');
}
