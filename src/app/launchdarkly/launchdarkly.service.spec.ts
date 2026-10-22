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

  it('returns evaluation details that update', () => {
    const detail = TestBed.runInInjectionContext(() =>
      service.boolVariationDetail('my-flag', false),
    );
    expect(detail()).toEqual({ value: true, variationIndex: 0, reason: { kind: 'FALLTHROUGH' } });
    client.setFlags({ 'my-flag': false });
    expect(detail().value).toBe(false);

    const missing = TestBed.runInInjectionContext(() => service.variationDetail('missing', 'x'));
    expect(missing().reason).toEqual({ kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' });
  });

  it('waitUntilReady$ emits false on timeout, then true once flags load', async () => {
    vi.useFakeTimers();
    const values: boolean[] = [];
    service.waitUntilReady$(100).subscribe((v) => values.push(v));
    vi.advanceTimersByTime(100);
    expect(values).toEqual([false]);
    await service.start();
    expect(values).toEqual([false, true]);
    vi.useRealTimers();
  });

  it('waitUntilReady$ emits only true when flags are already loaded', async () => {
    await service.start();
    const values: boolean[] = [];
    service.waitUntilReady$(100).subscribe((v) => values.push(v));
    expect(values).toEqual([true]);
    expect(service.ready()).toBe(true);
  });

  it('emits changed flag keys on flagChanges$', () => {
    const changes: string[][] = [];
    service.flagChanges$.subscribe((keys) => changes.push(keys));
    client.setFlags({ 'my-flag': false, 'my-string': 'green' });
    expect(changes).toEqual([['my-flag', 'my-string']]);
  });

  it('updates context after identify()', async () => {
    const context = { kind: 'user', key: 'user-2', name: 'Alex' };
    await service.identify(context);
    expect(service.context()).toEqual(context);
  });

  it('passes track() through to the client', () => {
    service.track('button-clicked', { page: 'home' }, 1);
    expect(client.trackedEvents).toEqual([
      { key: 'button-clicked', data: { page: 'home' }, metricValue: 1 },
    ]);
  });
});
