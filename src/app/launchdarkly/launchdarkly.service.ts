import {
  EnvironmentProviders,
  Injectable,
  InjectionToken,
  NgZone,
  OnDestroy,
  Signal,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  createClient,
  type LDClient,
  type LDContext,
  type LDIdentifyResult,
  type LDOptions,
} from '@launchdarkly/js-client-sdk';
import { Observable, Subject, distinctUntilChanged, filter, map, startWith } from 'rxjs';

export interface LaunchDarklyConfig {
  /** Your LaunchDarkly client-side ID. */
  clientSideID: string;
  /** The evaluation context to start with. Call `identify()` to change it later, for example on login. */
  context: LDContext;
  /** Any JavaScript SDK options. They are passed straight through to `createClient()`. */
  options?: LDOptions;
  /**
   * How long app startup waits for flags, in seconds. If the SDK is not ready in time, the app
   * renders with fallback values and updates once flags arrive. Defaults to 5.
   */
  timeout?: number;
}

export const LAUNCHDARKLY_CONFIG = new InjectionToken<LaunchDarklyConfig>('LAUNCHDARKLY_CONFIG');

/**
 * The LaunchDarkly client instance. Override this token in tests to supply a mock client
 * (see `testing/mock-launchdarkly-client.ts`).
 */
export const LAUNCHDARKLY_CLIENT = new InjectionToken<LDClient>('LAUNCHDARKLY_CLIENT', {
  providedIn: 'root',
  factory: () => {
    const { clientSideID, context, options } = inject(LAUNCHDARKLY_CONFIG);
    return createClient(clientSideID, context, { streaming: true, ...options });
  },
});

export type LaunchDarklyStatus = 'initializing' | 'complete' | 'timeout' | 'failed';

/**
 * Registers the LaunchDarkly service and starts the SDK during app startup.
 *
 * @example
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [provideLaunchDarkly({ clientSideID, context })],
 * };
 * ```
 */
export function provideLaunchDarkly(config: LaunchDarklyConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: LAUNCHDARKLY_CONFIG, useValue: config },
    // Hold the first render until flags are ready (or the timeout passes) so users don't see
    // fallback values flash before the real ones load. start() never rejects, so a LaunchDarkly
    // outage can't stop the app from booting.
    provideAppInitializer(() => inject(LaunchDarklyService).start()),
  ]);
}

/**
 * A thin Angular wrapper around the LaunchDarkly JavaScript client-side SDK.
 *
 * Every flag is available two ways:
 *   - as a signal:     `enabled = this.ld.boolVariation('my-flag', false);`
 *   - as an observable: `this.ld.boolVariation$('my-flag', false).subscribe(...)`
 *
 * Both start with the current value and only emit again when that flag's value actually changes.
 */
@Injectable({ providedIn: 'root' })
export class LaunchDarklyService implements OnDestroy {
  private readonly client = inject(LAUNCHDARKLY_CLIENT);
  private readonly config = inject(LAUNCHDARKLY_CONFIG, { optional: true });
  private readonly zone = inject(NgZone);

  // Emits the keys of flags whose values changed. `null` means "re-check every flag".
  private readonly changes$ = new Subject<string[] | null>();
  private readonly statusSignal = signal<LaunchDarklyStatus>('initializing');
  private readonly missingFlagWarnings = new Set<string>();

  /** The SDK's initialization status. */
  readonly status: Signal<LaunchDarklyStatus> = this.statusSignal.asReadonly();

  constructor() {
    // SDK callbacks run outside Angular. Re-entering the zone keeps change detection working in
    // zone-based apps; in zoneless apps (the Angular 21 default) this is a harmless no-op.
    this.client.on('change', (_context: LDContext, changedKeys: string[]) => {
      this.zone.run(() => this.changes$.next(changedKeys));
    });
  }

  /** Starts the SDK and waits for flags. Resolves with the result status and never rejects. */
  async start(): Promise<LaunchDarklyStatus> {
    const timeout = this.config?.timeout ?? 5;
    const result = await this.client.start({ timeout });
    this.setStatus(result.status);
    if (result.status === 'timeout') {
      console.warn(
        `[LaunchDarkly] Flags didn't load within ${timeout}s, so the app is showing fallback values. ` +
          'The SDK keeps trying in the background and will update flags when it connects.',
      );
      this.client.waitForInitialization().then((later) => this.setStatus(later.status));
    } else if (result.status === 'failed') {
      console.error(
        '[LaunchDarkly] The SDK failed to initialize, so the app is showing fallback values. ' +
          'Check that your client-side ID is correct.',
        result.error,
      );
    }
    return result.status;
  }

  // --- Observables -----------------------------------------------------------------------------

  boolVariation$(key: string, fallback: boolean): Observable<boolean> {
    return this.watch(key, () => this.client.boolVariation(key, fallback));
  }

  stringVariation$(key: string, fallback: string): Observable<string> {
    return this.watch(key, () => this.client.stringVariation(key, fallback));
  }

  numberVariation$(key: string, fallback: number): Observable<number> {
    return this.watch(key, () => this.client.numberVariation(key, fallback));
  }

  jsonVariation$<T>(key: string, fallback: T): Observable<T> {
    return this.watch(key, () => this.client.jsonVariation(key, fallback) as T);
  }

  // --- Signals ---------------------------------------------------------------------------------
  // Call these in a field initializer or constructor (an injection context). The underlying
  // subscription is cleaned up automatically when the component is destroyed.

  boolVariation(key: string, fallback: boolean): Signal<boolean> {
    return toSignal(this.boolVariation$(key, fallback), { requireSync: true });
  }

  stringVariation(key: string, fallback: string): Signal<string> {
    return toSignal(this.stringVariation$(key, fallback), { requireSync: true });
  }

  numberVariation(key: string, fallback: number): Signal<number> {
    return toSignal(this.numberVariation$(key, fallback), { requireSync: true });
  }

  jsonVariation<T>(key: string, fallback: T): Signal<T> {
    return toSignal(this.jsonVariation$(key, fallback), { requireSync: true });
  }

  // --- Context and events ----------------------------------------------------------------------

  /** Switches to a new evaluation context, for example after login. Flags re-evaluate and update. */
  identify(context: LDContext): Promise<LDIdentifyResult> {
    return this.client.identify(context);
  }

  /** Sends a custom event, for metrics and experiments. */
  track(key: string, data?: unknown, metricValue?: number): void {
    this.client.track(key, data, metricValue);
  }

  /** Escape hatch for SDK features this wrapper doesn't expose. */
  get ldClient(): LDClient {
    return this.client;
  }

  ngOnDestroy(): void {
    // Flushes pending analytics events and closes the streaming connection.
    this.client.close();
  }

  private setStatus(status: LaunchDarklyStatus): void {
    this.zone.run(() => {
      this.statusSignal.set(status);
      this.changes$.next(null);
    });
  }

  // Evaluate now, then re-evaluate whenever this key changes. distinctUntilChanged stops
  // re-renders when an update arrives but the value we'd show is the same.
  private watch<T>(key: string, evaluate: () => T): Observable<T> {
    return this.changes$.pipe(
      filter((keys) => keys === null || keys.includes(key)),
      startWith(null),
      map((keys) => {
        if (keys === null) this.warnIfMissing(key);
        return evaluate();
      }),
      distinctUntilChanged<T>(sameValue),
    );
  }

  // Once flags have loaded, a key that LaunchDarkly didn't send will only ever return its fallback.
  // This is almost always a flag that isn't marked available to client-side SDKs.
  private warnIfMissing(key: string): void {
    if (this.statusSignal() !== 'complete' || this.missingFlagWarnings.has(key)) return;
    if (key in this.client.allFlags()) return;
    this.missingFlagWarnings.add(key);
    console.warn(
      `[LaunchDarkly] Flag "${key}" wasn't found, so it will always return its fallback value. ` +
        'Check that the flag exists in this environment and that "SDKs using Client-side ID" is ' +
        "checked under Client-side SDK availability in the flag's settings.",
    );
  }
}

// Flag values are JSON, so comparing their serialized form is enough to catch JSON flags that
// are equal but are different objects.
function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
