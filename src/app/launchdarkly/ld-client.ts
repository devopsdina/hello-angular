// The LaunchDarkly client for the page, with the PS preflight checklist rules applied. This file
// has no Angular code; it's the same module as hello-js's ld-client.js, typed.
//
// 1. The SDK is initialized once, as a singleton. Calling initLaunchDarkly() again logs a warning
//    and returns the existing client instead of creating a second one.
//    https://launchdarkly-labs.github.io/ps-flag-book/sdk/preflight-checklist/init-and-config.html#sdk-is-initialized-once-as-a-singleton-early-in-the-applications-lifecycle
//
// 2. Initialization never blocks for more than 500ms. The SDK keeps connecting in the background
//    and fires 'change' events when flags arrive.
//    https://launchdarkly-labs.github.io/ps-flag-book/sdk/preflight-checklist/init-and-config.html#application-does-not-block-indefinitely-for-initialization
//
// 3. identify() never blocks for more than 500ms either.
//    https://launchdarkly-labs.github.io/ps-flag-book/cookbook/identify-timeout/index.html#javascript-client-side
//
// The v4 SDK takes a native `timeout` option on start() and identify(), in seconds, defaulting to
// 5s. We set it explicitly.
import {
  createClient as sdkCreateClient,
  type LDClient,
  type LDContext,
  type LDIdentifyResult,
  type LDOptions,
  type LDWaitForInitializationResult,
} from '@launchdarkly/js-client-sdk';

// SDK timeouts are in seconds: 0.5 = 500ms.
export const INIT_TIMEOUT_SECONDS = 0.5;
export const IDENTIFY_TIMEOUT_SECONDS = 0.5;

export interface LaunchDarklyClientConfig {
  /** Your LaunchDarkly client-side ID. */
  clientSideID: string;
  /** The evaluation context to start with. Call `identifyContext()` to change it later. */
  context: LDContext;
  /** Any JavaScript SDK options, passed straight through to `createClient()`. */
  options?: LDOptions;
  /** Override the SDK's `createClient`, for example to supply a mock client in tests. */
  createClient?: typeof sdkCreateClient;
  logger?: Pick<Console, 'warn'>;
}

/** 'initializing' until start() resolves, then the SDK's result. */
export type LaunchDarklyStatus = 'initializing' | LDWaitForInitializationResult['status'];

export interface LaunchDarklyInstance {
  client: LDClient;
  /** The SDK's start() promise. Resolves within INIT_TIMEOUT_SECONDS and never rejects. */
  ready: Promise<LDWaitForInitializationResult>;
}

let instance: LaunchDarklyInstance | null = null;

/** Creates and starts the LaunchDarkly client, once. */
export function initLaunchDarkly({
  clientSideID,
  context,
  options = {},
  createClient = sdkCreateClient,
  logger = console,
}: LaunchDarklyClientConfig): LaunchDarklyInstance {
  if (instance) {
    logger.warn(
      '[LaunchDarkly] initLaunchDarkly() was called again. Reusing the existing client; the SDK is not re-initialized.',
    );
    return instance;
  }

  // Streaming keeps flags live, so signals update when a flag changes in LaunchDarkly.
  const client = createClient(clientSideID, context, { streaming: true, ...options });
  instance = { client, ready: client.start({ timeout: INIT_TIMEOUT_SECONDS }) };
  return instance;
}

/** Returns the client created by initLaunchDarkly(), or null before init. */
export function getLaunchDarkly(): LDClient | null {
  return instance ? instance.client : null;
}

/**
 * Switches the client to a new context. The SDK resolves within IDENTIFY_TIMEOUT_SECONDS; if it
 * times out, the SDK keeps identifying in the background and fires 'change' events when the new
 * context's flags arrive.
 */
export function identifyContext(context: LDContext): Promise<LDIdentifyResult> {
  if (!instance) {
    throw new Error('[LaunchDarkly] initLaunchDarkly() must be called before identifyContext().');
  }
  return instance.client.identify(context, { timeout: IDENTIFY_TIMEOUT_SECONDS });
}

/** Closes the client, flushing pending events, so a later initLaunchDarkly() starts fresh. */
export async function closeLaunchDarkly(): Promise<void> {
  const closing = instance;
  instance = null;
  await closing?.client.close();
}
