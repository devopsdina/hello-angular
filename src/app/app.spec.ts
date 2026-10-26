import { TestBed } from '@angular/core/testing';

import { flagKey } from '../environments/environment';
import { App } from './app';
import { closeLaunchDarkly } from './launchdarkly/ld-client';
import {
  MockLaunchDarklyClient,
  useMockLaunchDarkly,
} from './launchdarkly/testing/mock-launchdarkly-client';

describe('App', () => {
  afterEach(() => closeLaunchDarkly());

  it('shows the flag value and updates when it changes', async () => {
    const client = new MockLaunchDarklyClient({ [flagKey]: false });
    useMockLaunchDarkly(client);
    TestBed.configureTestingModule({ imports: [App] });

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
