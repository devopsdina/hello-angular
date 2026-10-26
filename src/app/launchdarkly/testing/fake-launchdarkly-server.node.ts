// A local HTTP server standing in for LaunchDarkly, for specs that run the real SDK. It runs in
// Node, so it's excluded from the app build (tsconfig.app.json excludes *.node.ts).
import http from 'node:http';
import { basicLogger, type LDFlagSet, type LDOptions } from '@launchdarkly/js-client-sdk';

export interface FakeLaunchDarkly {
  /** 'respond' serves flags; 'hang' accepts connections and never answers, like a blocked network. */
  mode: 'respond' | 'hang';
  /** Flags to serve, by context key. Contexts not listed get `default`. */
  flags: Record<string, LDFlagSet>;
  /** SDK options that point the client at this server and keep it quiet. */
  options: LDOptions;
  /** Drops open connections, so a hung request from one test doesn't leak into the next. */
  dropConnections(): void;
  close(): void;
}

export async function startFakeLaunchDarkly(): Promise<FakeLaunchDarkly> {
  const fake = { mode: 'respond', flags: { default: {} } } as unknown as FakeLaunchDarkly;

  const server = http.createServer((req, res) => {
    if (fake.mode === 'hang') return;
    res.setHeader('content-type', 'application/json');
    res.setHeader('access-control-allow-origin', '*');
    // Flag requests look like /sdk/evalx/<client-side-id>/contexts/<base64url context JSON>.
    const match = req.url?.match(/^\/sdk\/evalx\/[^/]+\/contexts\/([^/?]+)/);
    if (!match) {
      res.end('[]');
      return;
    }
    const key = contextKey(match[1]);
    const flags = fake.flags[key] ?? fake.flags['default'] ?? {};
    const body = Object.fromEntries(
      Object.entries(flags).map(([flag, value]) => [
        flag,
        { value, variation: 0, version: 1, flagVersion: 1 },
      ]),
    );
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  fake.options = {
    baseUri: endpoint,
    streamUri: endpoint,
    eventsUri: endpoint,
    // jsdom has no EventSource. Flags load with a plain request either way, and identify() fetches
    // the new context's flags the same way.
    streaming: false,
    sendEvents: false,
    // The goals URL watcher polls on an interval that close() doesn't stop. Goals aren't under test.
    fetchGoals: false,
    logger: basicLogger({ level: 'none' }),
  };
  fake.dropConnections = () => server.closeAllConnections();
  fake.close = () => {
    server.closeAllConnections();
    server.close();
  };
  return fake;
}

function contextKey(encoded: string): string {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    return (JSON.parse(json) as { key?: string }).key ?? 'default';
  } catch {
    return 'default';
  }
}

/** Times a promise, in milliseconds. */
export async function timed<T>(promise: Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await promise;
  return { value, ms: performance.now() - start };
}

/** A timeout should resolve close to 500ms: no earlier, and not much later (timer jitter). */
export function expectAboutTimeout(ms: number): void {
  expect(ms).toBeGreaterThanOrEqual(450);
  expect(ms).toBeLessThan(750);
}
