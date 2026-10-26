import { Provider } from '@angular/core';
import type { LDClient, LDContext, LDFlagSet } from '@launchdarkly/js-client-sdk';

import { LAUNCHDARKLY_CLIENT } from '../launchdarkly.service';
import { initLaunchDarkly } from '../ld-client';

type Listener = (context: LDContext, keys?: string[]) => void;

/**
 * An in-memory stand-in for the LaunchDarkly client, so component tests never call LaunchDarkly.
 * Set flag values up front, change them with `setFlags()`, and check `trackedEvents`.
 */
export class MockLaunchDarklyClient {
  readonly trackedEvents: { key: string; data?: unknown; metricValue?: number }[] = [];
  private flags: LDFlagSet;
  private context: LDContext = { kind: 'user', key: 'test-user' };
  private listeners = new Map<string, Listener[]>();

  constructor(flags: LDFlagSet = {}) {
    this.flags = { ...flags };
  }

  /**
   * Updates flag values and fires `change` and `change:<flag-key>` events, as if they had changed
   * in LaunchDarkly.
   */
  setFlags(flags: LDFlagSet): void {
    this.flags = { ...this.flags, ...flags };
    const keys = Object.keys(flags);
    this.emit('change', keys);
    keys.forEach((key) => this.emit(`change:${key}`));
  }

  start = async () => ({ status: 'complete' as const });
  waitForInitialization = async () => ({ status: 'complete' as const });
  identify = async (context: LDContext) => {
    this.context = context;
    return { status: 'completed' as const };
  };
  track = (key: string, data?: unknown, metricValue?: number) => {
    this.trackedEvents.push({ key, data, metricValue });
  };
  close = async () => {};

  on = (event: string, listener: Listener) => {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  };
  off = (event: string, listener: Listener) => {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((l) => l !== listener),
    );
  };

  private emit(event: string, keys?: string[]): void {
    (this.listeners.get(event) ?? []).forEach((listener) => listener(this.context, keys));
  }

  variation = (key: string, fallback?: unknown) => (key in this.flags ? this.flags[key] : fallback);
  boolVariation = (key: string, fallback: boolean) => this.typed(key, fallback, 'boolean');
  stringVariation = (key: string, fallback: string) => this.typed(key, fallback, 'string');
  numberVariation = (key: string, fallback: number) => this.typed(key, fallback, 'number');
  jsonVariation = (key: string, fallback: unknown) => this.variation(key, fallback);
  allFlags = () => ({ ...this.flags });

  variationDetail = (key: string, fallback?: unknown) =>
    this.detail(key, this.variation(key, fallback));
  boolVariationDetail = (key: string, fallback: boolean) =>
    this.detail(key, this.boolVariation(key, fallback));
  stringVariationDetail = (key: string, fallback: string) =>
    this.detail(key, this.stringVariation(key, fallback));
  numberVariationDetail = (key: string, fallback: number) =>
    this.detail(key, this.numberVariation(key, fallback));
  jsonVariationDetail = (key: string, fallback: unknown) =>
    this.detail(key, this.jsonVariation(key, fallback));

  flush = async () => ({ result: true });
  getContext = () => this.context;

  // Reports FALLTHROUGH for known flags, and FLAG_NOT_FOUND for missing ones, like the real SDK.
  private detail<T>(key: string, value: T) {
    return key in this.flags
      ? { value, variationIndex: 0, reason: { kind: 'FALLTHROUGH' as const } }
      : {
          value,
          variationIndex: null,
          reason: { kind: 'ERROR' as const, errorKind: 'FLAG_NOT_FOUND' as const },
        };
  }

  // Like the real SDK, a typed variation returns the fallback when the value is the wrong type.
  private typed<T>(key: string, fallback: T, type: string): T {
    const value = this.flags[key];
    return typeof value === type ? (value as T) : fallback;
  }
}

/** Provides a mock client in place of the real one. Use it in `TestBed.configureTestingModule`. */
export function provideMockLaunchDarkly(client: MockLaunchDarklyClient): Provider {
  return { provide: LAUNCHDARKLY_CLIENT, useValue: client as unknown as LDClient };
}

/**
 * Makes a mock the page's client in ld-client.ts, for components that use `flagSignal()`. The
 * service reuses it too. Call `closeLaunchDarkly()` after each test.
 */
export function useMockLaunchDarkly(client: MockLaunchDarklyClient): void {
  initLaunchDarkly({
    clientSideID: 'mock-client-side-id',
    context: { kind: 'user', key: 'test-user' },
    createClient: () => client as unknown as LDClient,
  });
}
