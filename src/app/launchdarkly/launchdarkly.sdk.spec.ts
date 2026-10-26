// These tests run the real LaunchDarkly SDK, not the mock client, against a local HTTP server
// standing in for LaunchDarkly, so the timeouts are measured rather than assumed.
import http from 'node:http';
import { TestBed } from '@angular/core/testing';
import { basicLogger } from '@launchdarkly/js-client-sdk';

import {
  DEFAULT_TIMEOUT_SECONDS,
  LAUNCHDARKLY_CONFIG,
  LaunchDarklyConfig,
  LaunchDarklyService,
  createPageClient,
} from './launchdarkly.service';

const TIMEOUT_MS = 500;
// Upper bound on how late a timeout may resolve, to absorb timer jitter.
const SLACK_MS = 250;

// 'respond' serves one flag; 'hang' accepts connections and never answers, like a network that
// blocks LaunchDarkly.
let mode: 'respond' | 'hang' = 'respond';
const server = http.createServer((req, res) => {
  if (mode === 'hang') return;
  res.setHeader('content-type', 'application/json');
  res.setHeader('access-control-allow-origin', '*');
  if (req.url?.startsWith('/sdk/evalx/')) {
    res.end(
      JSON.stringify({ 'demo-flag': { value: true, variation: 0, version: 1, flagVersion: 1 } }),
    );
  } else {
    res.end('[]');
  }
});
let endpoint: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

function setup(config: Partial<LaunchDarklyConfig> = {}): LaunchDarklyService {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: LAUNCHDARKLY_CONFIG,
        useValue: {
          clientSideID: 'test-client-side-id',
          context: { kind: 'user', key: 'user-1' },
          options: {
            baseUri: endpoint,
            streamUri: endpoint,
            eventsUri: endpoint,
            // jsdom has no EventSource; the initial flag load is a plain request either way.
            streaming: false,
            sendEvents: false,
            fetchGoals: false,
            logger: basicLogger({ level: 'none' }),
          },
          ...config,
        } satisfies LaunchDarklyConfig,
      },
    ],
  });
  return TestBed.inject(LaunchDarklyService);
}

async function timed<T>(promise: Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await promise;
  return { value, ms: performance.now() - start };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mode = 'respond';
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  // The SDK caches flags in localStorage and serves them when LaunchDarkly is unreachable.
  // Clear it so each test starts as a first-time visitor.
  localStorage.clear();
});

afterEach(() => {
  // Destroys the service, which closes the client and frees the page's client slot.
  TestBed.resetTestingModule();
  server.closeAllConnections();
  warn.mockRestore();
});

describe('LaunchDarklyService with the real SDK', () => {
  describe('singleton initialization', () => {
    it('starts once; a second start() warns and returns the first result', async () => {
      const service = setup();

      const first = service.start();
      const second = service.start();

      expect(second).toBe(first);
      expect(await first).toBe('complete');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('start() was called again'));
    });

    it('reuses the page client instead of creating a second one, with a warning', () => {
      const service = setup();

      const again = TestBed.runInInjectionContext(() => createPageClient());

      expect(again).toBe(service.ldClient);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('already exists on this page'));
    });
  });

  describe('initialization timeout', () => {
    it('defaults to 500ms', () => {
      expect(DEFAULT_TIMEOUT_SECONDS).toBe(0.5);
    });

    it('completes and serves flags when LaunchDarkly answers', async () => {
      const service = setup();

      expect(await service.start()).toBe('complete');
      expect(service.ldClient.boolVariation('demo-flag', false)).toBe(true);
    });

    it('stops waiting at 500ms when LaunchDarkly never answers, and serves fallbacks', async () => {
      mode = 'hang';
      const service = setup();

      const { value, ms } = await timed(service.start());

      expect(value).toBe('timeout');
      expect(ms).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
      expect(ms).toBeLessThan(TIMEOUT_MS + SLACK_MS);
      expect(service.status()).toBe('timeout');
      expect(service.ldClient.boolVariation('demo-flag', false)).toBe(false);
    });
  });

  describe('identify timeout', () => {
    it('completes and updates the context when LaunchDarkly answers', async () => {
      const service = setup();
      await service.start();
      const context = { kind: 'user', key: 'user-2' };

      expect((await service.identify(context)).status).toBe('completed');
      expect(service.context()).toEqual(context);
    });

    it('stops waiting at 500ms when LaunchDarkly never answers, and keeps current flags', async () => {
      const service = setup();
      await service.start();
      mode = 'hang';

      const { value, ms } = await timed(service.identify({ kind: 'user', key: 'user-2' }));

      expect(value.status).toBe('timeout');
      expect(ms).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
      expect(ms).toBeLessThan(TIMEOUT_MS + SLACK_MS);
      expect(service.context()).toEqual({ kind: 'user', key: 'user-1' });
      expect(service.ldClient.boolVariation('demo-flag', false)).toBe(true);
    });
  });
});
