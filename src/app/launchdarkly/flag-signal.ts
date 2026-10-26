// The thin Angular layer over ld-client.ts: start the client during app startup, and read flags
// as signals. This is all most apps need. LaunchDarklyService adds observables, evaluation details
// and template directives on top, if you want them.
import {
  DestroyRef,
  EnvironmentProviders,
  Signal,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  signal,
} from '@angular/core';
import type { LDClient, LDFlagValue } from '@launchdarkly/js-client-sdk';

import {
  INIT_TIMEOUT_SECONDS,
  LaunchDarklyClientConfig,
  LaunchDarklyStatus,
  getLaunchDarkly,
  initLaunchDarkly,
} from './ld-client';

const status = signal<LaunchDarklyStatus>('initializing');

/** The SDK's startup result as a signal: 'initializing', then 'complete', 'timeout' or 'failed'. */
export const launchDarklyStatus: Signal<LaunchDarklyStatus> = status.asReadonly();

/**
 * Creates and starts the LaunchDarkly client during app startup. The first render waits for flags
 * for at most INIT_TIMEOUT_SECONDS (500ms); after that the app renders with fallback values and
 * updates when flags arrive.
 *
 * @example
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [provideLaunchDarklyClient({ clientSideID, context })],
 * };
 * ```
 */
export function provideLaunchDarklyClient(config: LaunchDarklyClientConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => waitForFlags(initLaunchDarkly(config).client)),
  ]);
}

/**
 * Waits for the client's startup result, at most INIT_TIMEOUT_SECONDS, logs what happened, and
 * updates `launchDarklyStatus`. Never rejects. `onStatus` also receives each status, including a
 * later 'complete' if flags arrive after the timeout.
 */
export async function waitForFlags(
  client: LDClient,
  onStatus: (status: LaunchDarklyStatus) => void = () => {},
): Promise<LaunchDarklyStatus> {
  const report = (next: LaunchDarklyStatus) => {
    status.set(next);
    onStatus(next);
  };
  // start() returns the same promise each time, so this waits on the one initLaunchDarkly() began.
  const result = await client.start({ timeout: INIT_TIMEOUT_SECONDS });
  report(result.status);
  if (result.status === 'timeout') {
    console.warn(
      `[LaunchDarkly] Flags didn't load within ${INIT_TIMEOUT_SECONDS}s, so the app is showing fallback values. ` +
        'The SDK keeps trying in the background and will update flags when it connects.',
    );
    // Not awaited: the app has already started. This only updates the status.
    client.waitForInitialization().then((later) => report(later.status));
  } else if (result.status === 'failed') {
    console.error(
      '[LaunchDarkly] The SDK failed to initialize, so the app is showing fallback values. ' +
        'Check that your client-side ID is correct.',
      result.error,
    );
  }
  return result.status;
}

/**
 * A flag's value as a signal that updates when the flag changes in LaunchDarkly or after
 * identifyContext(). Call it in a field initializer or constructor; the listener is removed when the
 * component is destroyed.
 *
 * @example
 * ```ts
 * readonly showBanner = flagSignal('show-banner', false);
 * ```
 */
export function flagSignal<T extends LDFlagValue>(key: string, fallback: T): Signal<T> {
  const client = getLaunchDarkly();
  if (!client) {
    throw new Error('[LaunchDarkly] Add provideLaunchDarklyClient() to your app config first.');
  }
  const read = () => client.variation(key, fallback) as T;
  const value = signal(read());
  const update = () => value.set(read());
  client.on(`change:${key}`, update);
  inject(DestroyRef).onDestroy(() => client.off(`change:${key}`, update));
  return value.asReadonly();
}
