import { TestBed } from '@angular/core/testing';

import { flagKey } from '../environments/environment';
import { App } from './app';
import {
  MockLaunchDarklyClient,
  provideMockLaunchDarkly,
} from './launchdarkly/testing/mock-launchdarkly-client';

describe('App', () => {
  it('shows the flag value and updates when it changes', async () => {
    const client = new MockLaunchDarklyClient({ [flagKey]: false });
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideMockLaunchDarkly(client)],
    });

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain(`The ${flagKey} feature flag evaluates to false.`);

    client.setFlags({ [flagKey]: true });
    await fixture.whenStable();
    expect(el.textContent).toContain(`The ${flagKey} feature flag evaluates to true.`);
    expect(el.style.backgroundColor).toBe('rgb(0, 132, 75)');
  });
});
