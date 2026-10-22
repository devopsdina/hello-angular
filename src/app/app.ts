import { Component, computed, inject } from '@angular/core';

import { flagKey } from '../environments/environment';
import { LD_DIRECTIVES } from './launchdarkly/directives';
import { LaunchDarklyService } from './launchdarkly/launchdarkly.service';

@Component({
  selector: 'app-root',
  imports: [LD_DIRECTIVES],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '[style.background-color]': 'background()' },
})
export class App {
  private readonly ld = inject(LaunchDarklyService);

  protected readonly flagKey = flagKey;
  protected readonly status = this.ld.status;
  // A signal that updates whenever the flag changes in LaunchDarkly. The detail version also
  // includes the reason for the value, such as a targeting rule or the default rule.
  protected readonly detail = this.ld.boolVariationDetail(flagKey, false);
  protected readonly flagValue = computed(() => this.detail().value);
  protected readonly reason = computed(() => this.detail().reason?.kind ?? 'unknown');
  protected readonly background = computed(() => (this.flagValue() ? '#00844B' : '#373841'));
}
