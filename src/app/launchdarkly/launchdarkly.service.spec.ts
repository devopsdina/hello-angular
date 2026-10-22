import { TestBed } from '@angular/core/testing';

import { LaunchDarklyService } from './launchdarkly.service';
import {
  MockLaunchDarklyClient,
  provideMockLaunchDarkly,
} from './testing/mock-launchdarkly-client';

describe('LaunchDarklyService', () => {
  let client: MockLaunchDarklyClient;
  let service: LaunchDarklyService;

  beforeEach(() => {
    client = new MockLaunchDarklyClient({ 'my-flag': true, 'my-string': 'blue' });
    TestBed.configureTestingModule({ providers: [provideMockLaunchDarkly(client)] });
    service = TestBed.inject(LaunchDarklyService);
  });

  it('reports the status from start()', async () => {
    expect(service.status()).toBe('initializing');
    await service.start();
    expect(service.status()).toBe('complete');
  });

  it('emits the current value, then only when the flag changes', () => {
    const values: boolean[] = [];
    service.boolVariation$('my-flag', false).subscribe((v) => values.push(v));

    client.setFlags({ 'my-flag': false });
    client.setFlags({ 'my-flag': false }); // same value: no emission
    client.setFlags({ 'other-flag': 1 }); // different flag: no emission
    client.setFlags({ 'my-flag': true });

    expect(values).toEqual([true, false, true]);
  });

  it('returns the fallback for missing or wrongly typed flags', () => {
    expect(TestBed.runInInjectionContext(() => service.boolVariation('missing', false))()).toBe(
      false,
    );
    expect(TestBed.runInInjectionContext(() => service.numberVariation('my-string', 7))()).toBe(7);
  });

  it('exposes flags as signals that update', () => {
    const color = TestBed.runInInjectionContext(() => service.stringVariation('my-string', 'red'));
    expect(color()).toBe('blue');
    client.setFlags({ 'my-string': 'green' });
    expect(color()).toBe('green');
  });

  it('warns once when a flag is missing after flags load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await service.start();

    service.boolVariation$('missing', false).subscribe();
    service.boolVariation$('missing', false).subscribe();
    service.boolVariation$('my-flag', false).subscribe();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Flag "missing" wasn\'t found');
    warn.mockRestore();
  });

  it('passes track() through to the client', () => {
    service.track('button-clicked', { page: 'home' }, 1);
    expect(client.trackedEvents).toEqual([
      { key: 'button-clicked', data: { page: 'home' }, metricValue: 1 },
    ]);
  });
});
