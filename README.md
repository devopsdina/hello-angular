### LaunchDarkly sample Angular application

We've built a simple Angular application that demonstrates how to use LaunchDarkly's [JavaScript client-side SDK](https://launchdarkly.com/docs/sdk/client-side/javascript) (`@launchdarkly/js-client-sdk` v4) in Angular.

LaunchDarkly doesn't ship an Angular SDK. Angular apps use the JavaScript SDK, which knows nothing about Angular: it doesn't know when your app starts, its callbacks don't trigger change detection, and reading a flag gives you the value at that moment, not one that updates. This app wraps the SDK in a small Angular service, `LaunchDarklyService`. The service connects the SDK to Angular's dependency injection, app startup and change detection, and exposes flags as **signals** and **RxJS observables**. Copy [`src/app/launchdarkly/`](src/app/launchdarkly) into your own app and you're set up.

This demo requires Node.js v20.19 or later and uses Angular 21.

#### Why use a service instead of calling the SDK directly

You can call the JavaScript SDK straight from your components, and for one flag on one page that works. As an app grows, each component ends up repeating the same Angular plumbing, and small mistakes in it cause real problems: duplicate connections, views that don't update, leaked listeners, or a page that waits 5 seconds on startup. The service does that plumbing once.

| | Calling the SDK directly | With `LaunchDarklyService` |
| --- | --- | --- |
| **Creating the client** | Each `createClient()` call opens its own connection to LaunchDarkly and sends its own events. To share one client, you manage a module-level variable yourself. | One client per page, provided through dependency injection. A second `start()`, or a second Angular app on the same page, logs a warning and reuses the existing client. |
| **App startup** | You decide where to wait for `start()`. Wait in a component and users see fallback values flash, then change. Leave out the timeout and the SDK waits up to 5 seconds. | `provideLaunchDarkly()` holds the first render until flags load, for at most 500ms (`timeout`). If LaunchDarkly is slow or unreachable, the app renders with fallback values and updates when flags arrive. |
| **Reading flags** | `variation()` returns the value at that moment. To react to changes, each component subscribes to `change:<flag-key>` and must unsubscribe when destroyed, or the listener leaks. | `boolVariation()` and the other methods return a signal (or an observable, with `$`) that updates when the flag changes. The subscription ends when the component is destroyed. |
| **Change detection** | SDK callbacks run outside Angular. In zone-based apps, views don't refresh unless you wrap updates in `NgZone.run()`. In zoneless apps (the Angular 21 default), only a signal change or an explicit trigger refreshes the view. | The service re-enters Angular's zone and feeds signals, so views update in both zone-based and zoneless apps. |
| **Re-renders** | The `change` event fires for any flag. Your handler runs even when the flag you care about didn't change. | A signal or observable emits only when *that* flag's value changes. |
| **Switching users** | `identify()` with no timeout waits up to 5 seconds, the SDK default. | `identify()` waits at most 500ms (`identifyTimeout`). On timeout the app keeps its current flags, which update when the SDK finishes. The `context` signal tracks the current context. |
| **Missing flags** | A flag that isn't marked available to client-side SDKs silently returns its fallback value. | Logs a warning naming the flag and the setting to change. |
| **Shutdown** | You call `close()` yourself, or pending analytics events can be lost. | The client closes, flushing pending events, when the app is destroyed. |
| **Testing** | Components that import the SDK need module-level mocking. | Components inject the service. Tests swap in `MockLaunchDarklyClient` through the `LAUNCHDARKLY_CLIENT` token, so they never call LaunchDarkly. |
| **Templates** | No template support. | Optional directives (`*ldIf`, `[ldClassIf]`, `[ldTrack]` and others) use flags directly in templates. |

The timeouts and the singleton follow the PS preflight checklist: [explicit init timeout](https://launchdarkly-labs.github.io/ps-flag-book/sdk/preflight-checklist/init-and-config.html#application-does-not-block-indefinitely-for-initialization), [singleton](https://launchdarkly-labs.github.io/ps-flag-book/sdk/preflight-checklist/init-and-config.html#sdk-is-initialized-once-as-a-singleton-early-in-the-applications-lifecycle), and [non-blocking identify](https://launchdarkly-labs.github.io/ps-flag-book/cookbook/identify-timeout/index.html#javascript-client-side).

Here is the same flag read both ways:

```ts
// Calling the SDK directly: a one-time value, plus a listener you must add, re-enter the zone for, and remove.
// `client` is a shared instance you created with createClient() and started yourself.
export class BannerComponent implements OnDestroy {
  private readonly zone = inject(NgZone);
  showBanner = client.boolVariation('show-banner', false);
  private readonly onChange = () => this.zone.run(() => {
    this.showBanner = client.boolVariation('show-banner', false);
  });
  constructor() { client.on('change:show-banner', this.onChange); }
  ngOnDestroy() { client.off('change:show-banner', this.onChange); }
}

// With the service: a signal that stays current and cleans up after itself.
export class BannerComponent {
  readonly showBanner = inject(LaunchDarklyService).boolVariation('show-banner', false);
}
```

In a zoneless app, the direct version also needs `ChangeDetectorRef.markForCheck()` or a signal for the view to refresh.

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

You should receive the message "The <flagKey> feature flag evaluates to <flagValue>." The application will run continuously and react to the flag changes in LaunchDarkly. Below it, the page shows the evaluation reason and a few of the directives using the same flag.

To run the unit tests, which never call LaunchDarkly. Most use a mock client; `launchdarkly.sdk.spec.ts` runs the real SDK against a local server standing in for LaunchDarkly, to measure the startup and identify timeouts:

```bash
npm test
```

#### How it works

| File | What it does |
| --- | --- |
| [`launchdarkly.service.ts`](src/app/launchdarkly/launchdarkly.service.ts) | The service, plus `provideLaunchDarkly()` to register it. This is the part to copy into your app. |
| [`directives/`](src/app/launchdarkly/directives) | Optional template directives (`*ldIf`, `[ldTrack]`, and others). Copy them too if you want them. |
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

String, number, and JSON flags work the same way (`stringVariation`, `numberVariation`, `jsonVariation`). `variation` is untyped and returns whatever the flag serves.

#### Service reference

Every flag method has a signal version and an observable version ending in `$`. Call the signal versions in a field initializer or constructor.

| Method | Returns |
| --- | --- |
| `boolVariation`, `stringVariation`, `numberVariation`, `jsonVariation`, `variation` | The flag value |
| `boolVariationDetail`, `stringVariationDetail`, `numberVariationDetail`, `jsonVariationDetail`, `variationDetail` | The value plus the reason for it, for example a targeting rule match, the default rule, or `FLAG_NOT_FOUND` |
| `status` / `status$` | `'initializing'`, `'complete'`, `'timeout'`, or `'failed'` |
| `ready` / `ready$` | `true` once flags have loaded |
| `waitUntilReady$(timeoutMs)` | Emits `false` if flags haven't loaded by the timeout, then `true` once they do. It never errors, so it's safe in route guards and resolvers |
| `context` / `context$` | The current evaluation context |
| `flagChanges$` | The keys of flags that just changed |
| `identify(context)` | Switches context, for example after login. Waits up to `identifyTimeout` (default 0.5 seconds); flags re-evaluate and update |
| `track(key, data?, metricValue?)` | Sends a custom event for metrics and experiments |
| `flush()` | Sends pending analytics events now |
| `ldClient` | The underlying SDK client, for anything else |

Evaluation reasons are only included when you set `withReasons: true` in `options`, as this demo does. Without it, `reason` is empty.

#### Directives

The directives are optional. They let you use flags directly in templates. Import them all with `LD_DIRECTIVES`, or import only the ones you need:

```ts
@Component({ imports: [LD_DIRECTIVES], ... })
```

| Directive | What it does |
| --- | --- |
| `*ldIf` | Renders content when a flag is on, or equals `value`. Supports `else`. |
| `*ldFlag` | Renders content with the flag's value available as a template variable. |
| `[ldClassIf]` | Adds CSS classes when a flag is on, and optional other classes when it's off. |
| `[ldStyleIf]` | Sets inline styles when a flag is on. Keys can include a unit, like `'fontSize.px'`. |
| `[ldSwitch]`, `*ldSwitchCase`, `*ldSwitchDefault` | Shows the case that matches a multivariate flag's value. |
| `[ldTrack]` | Sends a custom event on click, or on another DOM event with `ldTrackEvent`. |

```html
<!-- Show or hide content -->
<new-checkout *ldIf="'new-checkout'; else oldCheckout" />
<ng-template #oldCheckout><old-checkout /></ng-template>

<!-- Match a specific value -->
<p *ldIf="'theme'; value: 'dark'">Dark mode is on</p>

<!-- Use the flag's value in the template -->
<p *ldFlag="'banner-text'; fallback: 'Welcome'; let text">{{ text }}</p>

<!-- Classes and styles -->
<button [ldClassIf]="'new-styles'" ldClassIfClass="btn-new" ldClassIfElseClass="btn-old">Buy</button>
<h1 [ldStyleIf]="'big-title'" [ldStyleIfStyle]="{ 'fontSize.px': 48 }">Hello</h1>

<!-- Multivariate flags -->
<div [ldSwitch]="'checkout-layout'">
  <one-page *ldSwitchCase="'one-page'" />
  <multi-step *ldSwitchCase="'multi-step'" />
  <classic *ldSwitchDefault />
</div>

<!-- Custom events -->
<button ldTrack="purchase" [ldTrackData]="{ plan: 'pro' }" [ldTrackValue]="49">Buy</button>
```

Each directive only updates the DOM when its flag's value changes, and cleans up when it's destroyed. The selectors and inputs match the [unofficial Angular SDK](https://github.com/launchdarkly-labs/launchdarkly-angular-sdk-unofficial), so most templates written for it carry over. One difference: `ldTrack` sends your `ldTrackData` as is, without adding details about the element.

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

See [`app.spec.ts`](src/app/app.spec.ts), [`launchdarkly.service.spec.ts`](src/app/launchdarkly/launchdarkly.service.spec.ts), and [`directives.spec.ts`](src/app/launchdarkly/directives/directives.spec.ts) for full examples.
