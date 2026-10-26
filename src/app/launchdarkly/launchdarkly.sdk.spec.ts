// Runs the real SDK through the optional LaunchDarklyService. The service reuses ld-client.ts for
// the client, the singleton and the timeouts; these tests check that it does.
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideLaunchDarklyClient } from './flag-signal';
import {
  LAUNCHDARKLY_CONFIG,
  LaunchDarklyConfig,
  LaunchDarklyService,
} from './launchdarkly.service';
import { closeLaunchDarkly, getLaunchDarkly, initLaunchDarkly } from './ld-client';
import {
  FakeLaunchDarkly,
  expectAboutTimeout,
  startFakeLaunchDarkly,
  timed,
} from './testing/fake-launchdarkly-server.node';

let fake: FakeLaunchDarkly;
let warn: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  fake = await startFakeLaunchDarkly();
});

afterAll(() => fake.close());

beforeEach(() => {
  fake.mode = 'respond';
  fake.flags = { default: { 'demo-flag': true } };
  localStorage.clear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  TestBed.resetTestingModule();
  await closeLaunchDarkly();
  fake.dropConnections();
  vi.restoreAllMocks();
});

function config(): LaunchDarklyConfig {
  return {
    clientSideID: 'test-client-side-id',
    context: { kind: 'user', key: 'user-1' },
    options: fake.options,
  };
}

function setup(): LaunchDarklyService {
  TestBed.configureTestingModule({
    providers: [{ provide: LAUNCHDARKLY_CONFIG, useValue: config() }],
  });
  return TestBed.inject(LaunchDarklyService);
}

describe('LaunchDarklyService with the real SDK', () => {
  it('reuses the client ld-client.ts already created, without re-initializing', () => {
    const { client } = initLaunchDarkly(config());

    const service = setup();

    expect(service.ldClient).toBe(client);
    expect(warn).not.toHaveBeenCalled();
  });

  it('picks up the startup result when provideLaunchDarklyClient() started the client', async () => {
    TestBed.configureTestingModule({ providers: [provideLaunchDarklyClient(config())] });
    await TestBed.inject(ApplicationInitStatus).donePromise;

    const service = TestBed.inject(LaunchDarklyService);

    expect(service.status()).toBe('complete');
    expect(service.ldClient).toBe(getLaunchDarkly());
  });

  it('creates the page client through ld-client.ts when none exists', () => {
    const service = setup();

    expect(service.ldClient).toBe(getLaunchDarkly());
  });

  it('stops waiting at 500ms on start() when LaunchDarkly never answers', async () => {
    fake.mode = 'hang';
    const service = setup();

    const { value, ms } = await timed(service.start());

    expect(value).toBe('timeout');
    expectAboutTimeout(ms);
    expect(service.status()).toBe('timeout');
  });

  it('stops waiting at 500ms on identify() and keeps the current context', async () => {
    const service = setup();
    await service.start();
    fake.mode = 'hang';

    const { value, ms } = await timed(service.identify({ kind: 'user', key: 'user-2' }));

    expect(value.status).toBe('timeout');
    expectAboutTimeout(ms);
    expect(service.context()).toEqual({ kind: 'user', key: 'user-1' });
  });
});
