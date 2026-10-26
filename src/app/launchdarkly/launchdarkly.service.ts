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
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type {
  LDClient,
  LDContext,
  LDEvaluationDetail,
  LDEvaluationDetailTyped,
  LDFlagValue,
  LDIdentifyResult,
} from '@launchdarkly/js-client-sdk';
import {
  BehaviorSubject,
  Observable,
  Subject,
  distinctUntilChanged,
  filter,
  map,
  merge,
  startWith,
  take,
  takeUntil,
  timer,
} from 'rxjs';

import { launchDarklyStatus, waitForFlags } from './flag-signal';
import {
  IDENTIFY_TIMEOUT_SECONDS,
  LaunchDarklyClientConfig,
  LaunchDarklyStatus,
  closeLaunchDarkly,
  getLaunchDarkly,
  initLaunchDarkly,
} from './ld-client';

export type { LaunchDarklyStatus } from './ld-client';

// The service is an optional layer over ld-client.ts, which owns the client, the singleton and the
// 500ms timeouts. Use the service if you want observables, evaluation details, the template
// directives, or a client you can swap for a mock through dependency injection.

export type LaunchDarklyConfig = Pick<
  LaunchDarklyClientConfig,
  'clientSideID' | 'context' | 'options'
>;

export const LAUNCHDARKLY_CONFIG = new InjectionToken<LaunchDarklyConfig>('LAUNCHDARKLY_CONFIG');

/**
 * The LaunchDarkly client instance: the one ld-client.ts already created, if any (for example by
 * provideLaunchDarklyClient()), or a new one from LAUNCHDARKLY_CONFIG. Override this token in tests
 * to supply a mock client (see `testing/mock-launchdarkly-client.ts`).
 */
export const LAUNCHDARKLY_CLIENT = new InjectionToken<LDClient>('LAUNCHDARKLY_CLIENT', {
  providedIn: 'root',
  factory: () => getLaunchDarkly() ?? initLaunchDarkly(inject(LAUNCHDARKLY_CONFIG)).client,
});

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
 * The `...Detail` versions also return why the flag evaluated the way it did.
 */
@Injectable({ providedIn: 'root' })
export class LaunchDarklyService implements OnDestroy {
  private readonly client = inject(LAUNCHDARKLY_CLIENT);
  private readonly config = inject(LAUNCHDARKLY_CONFIG, { optional: true });
  private readonly zone = inject(NgZone);

  // Emits the keys of flags whose values changed. `null` means "re-check every flag".
  private readonly changes$ = new Subject<string[] | null>();
  private readonly statusSubject$ = new BehaviorSubject<LaunchDarklyStatus>('initializing');
  private readonly contextSubject$ = new BehaviorSubject<LDContext | undefined>(
    this.config?.context,
  );
  private readonly missingFlagWarnings = new Set<string>();

  /** The SDK's initialization status. */
  readonly status$: Observable<LaunchDarklyStatus> = this.statusSubject$.asObservable();
  readonly status: Signal<LaunchDarklyStatus> = toSignal(this.status$, { requireSync: true });

  /** Emits `true` once flags have loaded. Starts as `false`. */
  readonly ready$: Observable<boolean> = this.status$.pipe(
    map((status) => status === 'complete'),
    distinctUntilChanged(),
  );
  readonly ready: Signal<boolean> = toSignal(this.ready$, { requireSync: true });

  /** The current evaluation context. Updates after `identify()`. */
  readonly context$: Observable<LDContext | undefined> = this.contextSubject$.asObservable();
  readonly context: Signal<LDContext | undefined> = toSignal(this.context$, { requireSync: true });

  /** Emits the keys of flags whose values just changed, for example after a toggle or `identify()`. */
  readonly flagChanges$: Observable<string[]> = this.changes$.pipe(
    filter((keys): keys is string[] => keys !== null),
  );

  constructor() {
    // Re-entering the zone makes sure change detection runs in zone-based apps, even if an SDK
    // callback fires outside it. In zoneless apps (the Angular 21 default) this is a no-op.
    this.client.on('change', (_context: LDContext, changedKeys: string[]) => {
      this.zone.run(() => this.changes$.next(changedKeys));
    });
    // If provideLaunchDarklyClient() already started this client, pick up its startup result.
    if (this.client === getLaunchDarkly() && launchDarklyStatus() !== 'initializing') {
      this.statusSubject$.next(launchDarklyStatus());
    }
  }

  /** Waits for flags, at most 500ms. Resolves with the result status and never rejects. */
  start(): Promise<LaunchDarklyStatus> {
    return waitForFlags(this.client, (status) => this.setStatus(status));
  }

  /**
   * Waits up to `timeoutMs` for flags to load. Emits `false` if the timeout passes first, then
   * `true` once flags load. Never errors, so it's safe to use in guards and resolvers.
   */
  waitUntilReady$(timeoutMs: number): Observable<boolean> {
    const loaded$ = this.ready$.pipe(filter(Boolean), take(1));
    return merge(
      timer(timeoutMs).pipe(
        map(() => false),
        takeUntil(loaded$),
      ),
      loaded$,
    );
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

  /** Untyped: returns whatever the flag serves. Prefer the typed methods when you know the type. */
  variation$(key: string, fallback?: LDFlagValue): Observable<LDFlagValue> {
    return this.watch(key, () => this.client.variation(key, fallback));
  }

  // Evaluation details include the reason a flag evaluated the way it did (a targeting rule, the
  // fallthrough, an error, and so on). Set `withReasons: true` in the SDK options to get reasons.

  boolVariationDetail$(
    key: string,
    fallback: boolean,
  ): Observable<LDEvaluationDetailTyped<boolean>> {
    return this.watch(key, () => this.client.boolVariationDetail(key, fallback));
  }

  stringVariationDetail$(
    key: string,
    fallback: string,
  ): Observable<LDEvaluationDetailTyped<string>> {
    return this.watch(key, () => this.client.stringVariationDetail(key, fallback));
  }

  numberVariationDetail$(
    key: string,
    fallback: number,
  ): Observable<LDEvaluationDetailTyped<number>> {
    return this.watch(key, () => this.client.numberVariationDetail(key, fallback));
  }

  jsonVariationDetail$<T>(key: string, fallback: T): Observable<LDEvaluationDetailTyped<T>> {
    return this.watch(
      key,
      () => this.client.jsonVariationDetail(key, fallback) as LDEvaluationDetailTyped<T>,
    );
  }

  variationDetail$(key: string, fallback?: LDFlagValue): Observable<LDEvaluationDetail> {
    return this.watch(key, () => this.client.variationDetail(key, fallback));
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

  variation(key: string, fallback?: LDFlagValue): Signal<LDFlagValue> {
    return toSignal(this.variation$(key, fallback), { requireSync: true });
  }

  boolVariationDetail(key: string, fallback: boolean): Signal<LDEvaluationDetailTyped<boolean>> {
    return toSignal(this.boolVariationDetail$(key, fallback), { requireSync: true });
  }

  stringVariationDetail(key: string, fallback: string): Signal<LDEvaluationDetailTyped<string>> {
    return toSignal(this.stringVariationDetail$(key, fallback), { requireSync: true });
  }

  numberVariationDetail(key: string, fallback: number): Signal<LDEvaluationDetailTyped<number>> {
    return toSignal(this.numberVariationDetail$(key, fallback), { requireSync: true });
  }

  jsonVariationDetail<T>(key: string, fallback: T): Signal<LDEvaluationDetailTyped<T>> {
    return toSignal(this.jsonVariationDetail$(key, fallback), { requireSync: true });
  }

  variationDetail(key: string, fallback?: LDFlagValue): Signal<LDEvaluationDetail> {
    return toSignal(this.variationDetail$(key, fallback), { requireSync: true });
  }

  // --- Context and events ----------------------------------------------------------------------

  /**
   * Switches to a new evaluation context, for example after login. Waits at most 500ms; on timeout
   * the SDK keeps going in the background and flags update when it finishes.
   */
  async identify(context: LDContext): Promise<LDIdentifyResult> {
    const result = await this.client.identify(context, { timeout: IDENTIFY_TIMEOUT_SECONDS });
    if (result.status === 'completed') {
      this.zone.run(() => this.contextSubject$.next(context));
    } else {
      console.warn(`[LaunchDarkly] identify() didn't complete (status: ${result.status}).`);
    }
    return result;
  }

  /** Sends a custom event, for metrics and experiments. */
  track(key: string, data?: unknown, metricValue?: number): void {
    this.client.track(key, data, metricValue);
  }

  /** Sends any pending analytics events now, for example before navigating away. */
  async flush(): Promise<void> {
    await this.client.flush();
  }

  /** Escape hatch for SDK features this wrapper doesn't expose. */
  get ldClient(): LDClient {
    return this.client;
  }

  ngOnDestroy(): void {
    // Flushes pending analytics events and closes the streaming connection.
    if (getLaunchDarkly() === this.client) {
      closeLaunchDarkly();
    } else {
      this.client.close();
    }
  }

  private setStatus(status: LaunchDarklyStatus): void {
    this.zone.run(() => {
      this.statusSubject$.next(status);
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
    if (this.statusSubject$.value !== 'complete' || this.missingFlagWarnings.has(key)) return;
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
export function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
