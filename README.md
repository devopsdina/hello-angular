### LaunchDarkly sample Angular application

We've built a simple Angular application that demonstrates how to use LaunchDarkly's [JavaScript client-side SDK](https://launchdarkly.com/docs/sdk/client-side/javascript) (`@launchdarkly/js-client-sdk` v4) in Angular.

LaunchDarkly doesn't ship a separate Angular SDK because the JavaScript SDK works in Angular directly. This app shows the recommended pattern: a small Angular service around the SDK that exposes flags as **signals** and **RxJS observables**. Copy [`src/app/launchdarkly/`](src/app/launchdarkly) into your own app and you're set up.

This demo requires Node.js v20.19 or later and uses Angular 21.

#### Build instructions

1. Edit `src/environments/environment.ts` and set `clientSideID` to your LaunchDarkly client-side ID. If there is an existing boolean feature flag in your LaunchDarkly project that you want to evaluate, set `flagKey` to the flag key.

```ts
export const clientSideID: string = 'myClientSideID';
export const flagKey: string = 'my-flag-key';
```

2. Install dependencies and start the app:

```bash
npm install
npm start
```

3. Open [http://localhost:4200](http://localhost:4200).

You should receive the message "The <flagKey> feature flag evaluates to <flagValue>." The application will run continuously and react to the flag changes in LaunchDarkly.

To run the unit tests, which use a mock client and never call LaunchDarkly:

```bash
npm test
```

#### How it works

| File | What it does |
| --- | --- |
| [`launchdarkly.service.ts`](src/app/launchdarkly/launchdarkly.service.ts) | The service, plus `provideLaunchDarkly()` to register it. This is the part to copy into your app. |
| [`testing/mock-launchdarkly-client.ts`](src/app/launchdarkly/testing/mock-launchdarkly-client.ts) | An in-memory client for unit tests. |
| [`app.config.ts`](src/app/app.config.ts) | Registers the service with your client-side ID and evaluation context. |
| [`app.ts`](src/app/app.ts) | The demo component that reads the flag. |

Register the service once in your app config:

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideLaunchDarkly({
      clientSideID: 'myClientSideID',
      context: { kind: 'user', key: 'example-user-key' },
      options: {}, // any JavaScript SDK option, passed straight through
    }),
  ],
};
```

Then read flags in any component, as a signal:

```ts
export class MyComponent {
  private readonly ld = inject(LaunchDarklyService);
  readonly showBanner = this.ld.boolVariation('show-banner', false); // Signal<boolean>
}
```

or as an observable:

```ts
this.ld.stringVariation$('theme', 'light').subscribe((theme) => applyTheme(theme));
```

String, number, and JSON flags work the same way (`stringVariation`, `numberVariation`, `jsonVariation`). Use `identify()` to switch context, for example after login, and `track()` to send custom events. `ldClient` gives you the underlying SDK client for anything else.

#### Things the service handles for you

These are the details the React SDK takes care of automatically and that you need to handle yourself in Angular:

- **Live updates.** The service listens for the SDK's `change` event, so flag values update without a page reload.
- **No extra re-renders.** A signal or observable only emits when *that* flag's value actually changes.
- **No fallback flash.** App startup waits for flags (up to `timeout`, default 5 seconds) before the first render. If LaunchDarkly is slow or unreachable, the app still starts with fallback values and updates once flags arrive.
- **Change detection.** SDK callbacks re-enter Angular's zone, so this works in both zone-based and zoneless apps.
- **Typed evaluations.** `boolVariation` and the other typed methods return your fallback when a flag's value is the wrong type.
- **Cleanup.** Signal subscriptions end when their component is destroyed, and the SDK client closes (flushing pending events) when the app shuts down.

#### Troubleshooting

Open your browser's developer console. The service logs a `[LaunchDarkly]` warning when something is off.

- **The flag always shows `false` and doesn't change when you toggle it.** The console shows `Flag "<flagKey>" wasn't found`. Browser apps only receive flags that are marked available to client-side SDKs. In LaunchDarkly, open the flag's **Settings**, check **SDKs using Client-side ID** under **Client-side SDK availability**, save, and refresh the page. Also check that `clientSideID` belongs to the environment you're toggling the flag in.
- **"SDK failed to initialize."** The client-side ID is wrong, or the browser can't reach LaunchDarkly (an ad blocker, proxy, or firewall can block it). Use the client-side ID, not the SDK key or mobile key.
- **"Initializing…" stays on screen.** Flags didn't load within the startup timeout. The SDK keeps retrying, and the page updates once it connects.

#### Testing your components

Swap the real client for the mock in `TestBed`, then change flags during the test:

```ts
const client = new MockLaunchDarklyClient({ 'show-banner': false });
TestBed.configureTestingModule({ imports: [MyComponent], providers: [provideMockLaunchDarkly(client)] });

client.setFlags({ 'show-banner': true }); // fires a change event, just like LaunchDarkly would
```

See [`app.spec.ts`](src/app/app.spec.ts) and [`launchdarkly.service.spec.ts`](src/app/launchdarkly/launchdarkly.service.spec.ts) for full examples.
