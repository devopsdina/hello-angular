// Runs the real SDK through the thin Angular layer: provideLaunchDarklyClient() and flagSignal().
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { flagSignal, launchDarklyStatus, provideLaunchDarklyClient } from './flag-signal';
import { closeLaunchDarkly, getLaunchDarkly, identifyContext } from './ld-client';
import {
  FakeLaunchDarkly,
  expectAboutTimeout,
  startFakeLaunchDarkly,
  timed,
} from './testing/fake-launchdarkly-server.node';

let fake: FakeLaunchDarkly;

beforeAll(async () => {
  fake = await startFakeLaunchDarkly();
});

afterAll(() => fake.close());

beforeEach(() => {
  fake.mode = 'respond';
  fake.flags = { default: { 'demo-flag': true } };
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  TestBed.resetTestingModule();
  await closeLaunchDarkly();
  fake.dropConnections();
  vi.restoreAllMocks();
});

// Configures the app providers and waits for app startup, like bootstrapApplication() does.
async function startApp(): Promise<void> {
  TestBed.configureTestingModule({
    providers: [
      provideLaunchDarklyClient({
        clientSideID: 'test-client-side-id',
        context: { kind: 'user', key: 'user-1' },
        options: fake.options,
      }),
    ],
  });
  await TestBed.inject(ApplicationInitStatus).donePromise;
}

describe('provideLaunchDarklyClient', () => {
  it('starts the client during app startup', async () => {
    await startApp();

    expect(getLaunchDarkly()).not.toBeNull();
    expect(launchDarklyStatus()).toBe('complete');
  });

  it('holds app startup for at most 500ms when LaunchDarkly never answers', async () => {
    fake.mode = 'hang';

    const { ms } = await timed(startApp());

    expectAboutTimeout(ms);
    expect(launchDarklyStatus()).toBe('timeout');
  });
});

describe('flagSignal', () => {
  it('returns the served value', async () => {
    await startApp();

    const value = TestBed.runInInjectionContext(() => flagSignal('demo-flag', false));

    expect(value()).toBe(true);
  });

  it('returns the fallback after a startup timeout', async () => {
    fake.mode = 'hang';
    await startApp();

    const value = TestBed.runInInjectionContext(() => flagSignal('demo-flag', false));

    expect(value()).toBe(false);
  });

  it('updates when the flag changes, for example after identifyContext()', async () => {
    fake.flags['user-2'] = { 'demo-flag': false };
    await startApp();
    const value = TestBed.runInInjectionContext(() => flagSignal('demo-flag', true));
    expect(value()).toBe(true);

    await identifyContext({ kind: 'user', key: 'user-2' });

    expect(value()).toBe(false);
  });

  it('stops listening when its component or injector is destroyed', async () => {
    await startApp();
    const client = getLaunchDarkly()!;
    const off = vi.spyOn(client, 'off');
    TestBed.runInInjectionContext(() => flagSignal('demo-flag', false));

    TestBed.resetTestingModule();

    expect(off).toHaveBeenCalledWith('change:demo-flag', expect.any(Function));
  });
});
