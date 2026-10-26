### LaunchDarkly sample Angular application

We've built a simple Angular application that demonstrates how to use LaunchDarkly's [JavaScript client-side SDK](https://launchdarkly.com/docs/sdk/client-side/javascript) (`@launchdarkly/js-client-sdk` v4) in Angular.

LaunchDarkly doesn't ship an Angular SDK. Angular apps use the JavaScript SDK directly. This app shows two ways to do that:

- **The thin version (start here).** Two small files: [`ld-client.ts`](src/app/launchdarkly/ld-client.ts) creates the SDK client and applies the PS preflight checklist rules, and [`flag-signal.ts`](src/app/launchdarkly/flag-signal.ts) connects it to Angular. Together they're about 200 lines, most of it comments, and `ld-client.ts` is the same module as the [hello-js](https://github.com/devopsdina/hello-js) example.
- **`LaunchDarklyService` (optional).** A larger layer on top of the thin version. It adds observables, evaluation details, template directives and a mockable client. It reuses the thin version's client and rules, so adding it later doesn't change how the SDK starts.

This demo requires Node.js v20.19 or later and uses Angular 21.

#### Angular terms used in this README

If you're new to Angular, these are the two ideas you need.

**Signal.** A value that Angular watches. You read it by calling it like a function: `showBanner()`. When the value changes, Angular redraws the parts of the page that used it. You don't have to tell it to. `flagSignal('show-banner', false)` gives you a signal holding the flag's value. When the flag changes in LaunchDarkly, the signal changes, and so does the page.

```ts
readonly showBanner = flagSignal('show-banner', false); // a signal
```

```html
@if (showBanner()) { <app-banner /> }  <!-- redraws when the flag changes -->
```

**Observable.** A stream of values over time, from the [RxJS](https://rxjs.dev) library that Angular uses for events, HTTP requests and similar things. Instead of reading a current value, you `subscribe` and get a callback each time a new value arrives. Observables can be combined and transformed: filtered, delayed, merged with other streams. Angular apps that are built around RxJS (many older or larger ones are) often prefer flags as observables, so they fit into existing streams. Methods that return an observable end in `$` by convention, like `boolVariation$`.

```ts
ld.boolVariation$('show-banner', false).subscribe((on) => console.log('banner is', on));
```

Signals are the newer, simpler option, and the thin version uses only signals. Use the service if your app needs observables.

#### Preflight checklist

`ld-client.ts` applies three rules from the PS preflight checklist. They're the only code that creates, starts or identifies the client, so both the thin version and the service follow them.

| Rule | How it's met |
| --- | --- |
| [Initialize the SDK once, as a singleton](https://launchdarkly-labs.github.io/ps-flag-book/sdk/preflight-checklist/init-and-config.html#sdk-is-initialized-once-as-a-singleton-early-in-the-applications-lifecycle) | `initLaunchDarkly()` creates one client for the page. Calling it again logs `initLaunchDarkly() was called again… the SDK is not re-initialized` and returns the existing client. The service reuses that client too. |
| [Don't block indefinitely on initialization](https://launchdarkly-labs.github.io/ps-flag-book/sdk/preflight-checklist/init-and-config.html#application-does-not-block-indefinitely-for-initialization): an explicit timeout of 500ms or less | The client starts with `start({ timeout: 0.5 })`. The SDK measures timeouts in seconds and defaults to 5. `provideLaunchDarklyClient()` holds the first render for at most 500ms. If LaunchDarkly is slow or unreachable, the app renders with fallback values and updates when flags arrive. |
| [Don't block on identify](https://launchdarkly-labs.github.io/ps-flag-book/cookbook/identify-timeout/index.html#javascript-client-side) | `identifyContext()` calls `identify(context, { timeout: 0.5 })`. On timeout the app keeps its current flags. The SDK keeps going in the background, and flags update when it finishes. |

The specs check these against the real SDK, using a local server that stands in for LaunchDarkly and either answers or never does. With the timeouts or the singleton check removed, those specs fail.

#### Why not just call the SDK from components?

You can, and the thin version is close to that. It adds only what the SDK can't know about Angular:

- **When the app starts.** Without an app initializer, components render before flags load and show fallback values that then change. `provideLaunchDarklyClient()` waits for flags, for at most 500ms, before the first render.
- **That a value changed.** `client.variation()` returns the value at that moment. To update the page when a flag changes, a component has to listen for the SDK's `change:<flag-key>` event, update something Angular watches, and stop listening when the component is removed, or the listener leaks. `flagSignal()` does all three.
- **One client for the whole app.** Each `createClient()` call opens its own connection to LaunchDarkly. `ld-client.ts` keeps one client and warns instead of creating a second.

Here is the same flag read both ways:

```ts
// Calling the SDK directly. `client` is a shared instance you created and started yourself.
export class BannerComponent implements OnDestroy {
  readonly showBanner = signal(client.boolVariation('show-banner', false));
  private readonly update = () => this.showBanner.set(client.boolVariation('show-banner', false));
  constructor() { client.on('change:show-banner', this.update); }
  ngOnDestroy() { client.off('change:show-banner', this.update); }
}

// With the thin version.
export class BannerComponent {
  readonly showBanner = flagSignal('show-banner', false);
}
```

#### When to add the service

Add `LaunchDarklyService` when you need one of these. Otherwise the thin version is less code to own.

| You need | The service gives you |
| --- | --- |
| Flags as observables, for an app built around RxJS | `boolVariation$()` and the other `$` methods, plus `flagChanges$`, `status$`, `ready$` and `context$` |
| Why a flag has its value, for debugging or display | `boolVariationDetail()` and the other `...Detail` methods, with the evaluation reason |
| Flags directly in templates | The [directives](#directives): `*ldIf`, `*ldFlag`, `[ldClassIf]`, `[ldStyleIf]`, `[ldSwitch]` and `[ldTrack]` |
| To wait for flags in a route guard or resolver | `waitUntilReady$(timeoutMs)` |
| A warning when a flag isn't available to client-side SDKs | The service logs which flag, and which setting to change |
| To swap the client for a mock through dependency injection | The `LAUNCHDARKLY_CLIENT` token (the thin version can use a mock too, see [Testing](#testing-your-components)) |

This demo uses both: the main flag on the page uses the thin version, and the "Optional: LaunchDarklyService add-ons" box below it uses the service.

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

You should receive the message "The <flagKey> feature flag evaluates to <flagValue>." The application will run continuously and react to the flag changes in LaunchDarkly. Below it, a box shows the service add-ons: the evaluation reason and a few directives using the same flag.

To run the tests, which never call LaunchDarkly:

```bash
npm test
```

Specs ending in `ld-client.spec.ts`, `flag-signal.spec.ts` and `launchdarkly.sdk.spec.ts` run the real SDK against a local server standing in for LaunchDarkly. The rest use an in-memory mock client.

#### How it works

| File | What it does |
| --- | --- |
| [`ld-client.ts`](src/app/launchdarkly/ld-client.ts) | Creates the one client for the page and applies the preflight rules. No Angular code. **Copy this.** |
| [`flag-signal.ts`](src/app/launchdarkly/flag-signal.ts) | `provideLaunchDarklyClient()` and `flagSignal()`: the thin Angular layer. **Copy this.** |
| [`launchdarkly.service.ts`](src/app/launchdarkly/launchdarkly.service.ts) | Optional. The service, plus `provideLaunchDarkly()` to use it on its own. |
| [`directives/`](src/app/launchdarkly/directives) | Optional template directives. They need the service. |
| [`testing/mock-launchdarkly-client.ts`](src/app/launchdarkly/testing/mock-launchdarkly-client.ts) | An in-memory client for unit tests. |
| [`app.config.ts`](src/app/app.config.ts) | Starts the client with your client-side ID and evaluation context. |
| [`app.ts`](src/app/app.ts) | The demo component that reads the flag. |

#### Thin version reference

Start the client once in your app config:

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideLaunchDarklyClient({
      clientSideID: 'myClientSideID',
      context: { kind: 'user', key: 'example-user-key' },
      options: {}, // any JavaScript SDK option, passed straight through
    }),
  ],
};
```

Then read flags in any component:

```ts
export class MyComponent {
  readonly showBanner = flagSignal('show-banner', false); // Signal<boolean>
  readonly theme = flagSignal('theme', 'light'); // Signal<string>
}
```

| Function | What it does |
| --- | --- |
| `provideLaunchDarklyClient(config)` | Creates and starts the client during app startup, waiting at most 500ms for flags |
| `flagSignal(key, fallback)` | The flag's value as a signal that updates when the flag changes. Call it in a field initializer or constructor; it stops listening when the component is destroyed |
| `launchDarklyStatus` | A signal with the startup result: `'initializing'`, then `'complete'`, `'timeout'` or `'failed'`. After a timeout, it changes to `'complete'` if flags arrive within the next 5 seconds (the SDK's `waitForInitialization()` default). Flag signals update whenever flags arrive |
| `identifyContext(context)` | Switches context, for example after login. Waits at most 500ms; flag signals update when the new context's flags arrive |
| `getLaunchDarkly()` | The SDK client, for anything else: `track()`, `flush()`, `allFlags()` and so on |

`flagSignal()` reads flags untyped. If a flag serves a different type than your fallback, you get that value, not the fallback. The service's typed methods (`boolVariation` and so on) return the fallback instead.

#### Service reference

To use the service without the thin provider, register it with `provideLaunchDarkly()` instead of `provideLaunchDarklyClient()`. It takes the same `clientSideID`, `context` and `options`. If the thin provider already started a client, the service reuses it and needs no configuration of its own.

```ts
export class MyComponent {
  private readonly ld = inject(LaunchDarklyService);
  readonly showBanner = this.ld.boolVariation('show-banner', false); // a signal
  readonly theme$ = this.ld.stringVariation$('theme', 'light'); // an observable
}
```

Every flag method has a signal version and an observable version ending in `$`. Call the signal versions in a field initializer or constructor.

| Method | Returns |
| --- | --- |
| `boolVariation`, `stringVariation`, `numberVariation`, `jsonVariation`, `variation` | The flag value. The typed ones return your fallback if the flag serves the wrong type |
| `boolVariationDetail`, `stringVariationDetail`, `numberVariationDetail`, `jsonVariationDetail`, `variationDetail` | The value plus the reason for it, for example a targeting rule match, the default rule, or `FLAG_NOT_FOUND` |
| `status` / `status$` | `'initializing'`, `'complete'`, `'timeout'`, or `'failed'`. If the thin provider started the client, the service picks up its result |
| `ready` / `ready$` | `true` once flags have loaded |
| `waitUntilReady$(timeoutMs)` | Emits `false` if flags haven't loaded by the timeout, then `true` once they do. It never errors, so it's safe in route guards and resolvers |
| `context` / `context$` | The current evaluation context |
| `flagChanges$` | The keys of flags that just changed |
| `identify(context)` | Switches context, for example after login. Waits at most 500ms; flags re-evaluate and update |
| `track(key, data?, metricValue?)` | Sends a custom event for metrics and experiments |
| `flush()` | Sends pending analytics events now |
| `ldClient` | The underlying SDK client, for anything else |

Evaluation reasons are only included when you set `withReasons: true` in `options`, as this demo does. Without it, `reason` is empty.

#### Directives

The directives let you use flags directly in templates, without adding a signal to the component. They're optional: copy [`directives/`](src/app/launchdarkly/directives) only if you want them. Each one is a standalone directive. Import them all with `LD_DIRECTIVES`, or import only the ones you need:

```ts
@Component({ imports: [LD_DIRECTIVES], ... })        // all of them
@Component({ imports: [LdIfDirective, LdTrackDirective], ... }) // or just these
```

They're part of the optional service. They work with either `provideLaunchDarklyClient()` or `provideLaunchDarkly()` in your app config.

| Directive | Use it to |
| --- | --- |
| [`*ldIf`](#ldif) | Show or hide content, like `*ngIf` for a flag |
| [`*ldFlag`](#ldflag) | Show content with the flag's value available in the template |
| [`[ldClassIf]`](#ldclassif) | Add or swap CSS classes |
| [`[ldStyleIf]`](#ldstyleif) | Set inline styles |
| [`[ldSwitch]`, `*ldSwitchCase`, `*ldSwitchDefault`](#ldswitch) | Show one of several templates for a multivariate flag, like `ngSwitch` |
| [`[ldTrack]`](#ldtrack) | Send a custom event for metrics, experiments and guarded rollouts |

##### How the directives decide whether a flag matches

Every directive except `[ldTrack]` follows the same rules:

- **No `value` set:** the flag matches when its value is truthy. A boolean flag matches when it's `true`. A string flag matches when it's non-empty, and a number flag when it's non-zero.
- **`value` set:** the flag matches only when it equals `value`. JSON values are compared by their JSON form, so `{ a: 1 }` equals `{ a: 1 }` (key order counts).
- **Flag not loaded or not found:** the directive uses its `fallback`. That happens when LaunchDarkly doesn't answer within the 500ms startup timeout, or when a flag isn't available to client-side SDKs. A returning visitor may see flag values the SDK cached on an earlier visit instead.
- **Live updates:** when the flag changes in LaunchDarkly, the directive updates. It only touches the DOM when the result changes, and it stops listening when its element is destroyed.

The directives read flags untyped. Unlike `boolVariation()`, they don't swap in the fallback when a flag serves an unexpected type.

##### `*ldIf`

Renders its content when the flag matches, and the `else` template, if any, when it doesn't.

| Input | Default | Meaning |
| --- | --- | --- |
| `ldIf` (the flag key) | required | The flag to watch |
| `value` | none | Match only this value |
| `else` | none | Template to show when the flag doesn't match |
| `fallback` | `false` | Value to use when the flag can't be evaluated, so content is hidden by default |

```html
<new-checkout *ldIf="'new-checkout'; else oldCheckout" />
<ng-template #oldCheckout><old-checkout /></ng-template>

<p *ldIf="'theme'; value: 'dark'">Dark mode is on</p>
```

##### `*ldFlag`

Renders its content with the flag's value as a template variable. Use it when the template needs the value itself, such as a string or a number from a flag.

| Input | Default | Meaning |
| --- | --- | --- |
| `ldFlag` (the flag key) | required | The flag to watch |
| `value` | none | Show the content only when the flag equals this value. Without it, the content always shows |
| `else` | none | Template to show when the flag doesn't equal `value`. It gets the same variables |
| `fallback` | `undefined` | Value to use when the flag can't be evaluated |

The template gets `$implicit` (via `let x`) and `flagValue`, both the flag's value, plus `isMatch`.

```html
<p *ldFlag="'banner-text'; fallback: 'Welcome'; let text">{{ text }}</p>

<p *ldFlag="'plan'; value: 'pro'; else basic; let plan">You're on {{ plan }}</p>
<ng-template #basic let-plan>Upgrade from {{ plan }}</ng-template>
```

##### `[ldClassIf]`

Adds classes when the flag matches, and optional other classes when it doesn't. When the result changes, it removes the classes it added before. Classes can be a space-separated string or an array.

| Input | Default | Meaning |
| --- | --- | --- |
| `ldClassIf` | required | The flag key, or a config object with all the options (below) |
| `ldClassIfClass` | none | Classes to add when the flag matches |
| `ldClassIfElseClass` | none | Classes to add when it doesn't |
| `ldClassIfValue` | none | Match only this value |
| `ldClassIfFallback` | `undefined` | Value to use when the flag can't be evaluated, so the else classes apply by default |

```html
<button [ldClassIf]="'new-styles'" ldClassIfClass="btn-new" ldClassIfElseClass="btn-old">Buy</button>

<!-- The same options as one object -->
<div [ldClassIf]="{ flag: 'theme', value: 'dark', class: 'dark', elseClass: 'light' }"></div>
```

##### `[ldStyleIf]`

Sets inline styles when the flag matches, and optional other styles when it doesn't. Style keys can be camelCase or kebab-case, and can carry a unit: `{ 'fontSize.px': 48 }` sets `font-size: 48px`. When the result changes, it removes the styles it set before.

| Input | Default | Meaning |
| --- | --- | --- |
| `ldStyleIf` | required | The flag key, or a config object with all the options |
| `ldStyleIfStyle` | none | Styles to set when the flag matches |
| `ldStyleIfElseStyle` | none | Styles to set when it doesn't |
| `ldStyleIfValue` | none | Match only this value |
| `ldStyleIfFallback` | `undefined` | Value to use when the flag can't be evaluated |

```html
<h1 [ldStyleIf]="'big-title'" [ldStyleIfStyle]="{ 'fontSize.px': 48 }">Hello</h1>

<div [ldStyleIf]="{ flag: 'theme', value: 'dark', style: { background: '#000' }, elseStyle: { background: '#fff' } }"></div>
```

##### `[ldSwitch]`

Shows the `*ldSwitchCase` whose value equals the flag's value, or `*ldSwitchDefault` when none does. Use it for multivariate flags with more than two outcomes. The default case waits for the flag's first value, so it doesn't flash before a real case appears.

| Input | Default | Meaning |
| --- | --- | --- |
| `ldSwitch` (the flag key) | required | The flag to watch |
| `ldSwitchFallback` | `undefined` | Value to use when the flag can't be evaluated, so the default case shows |
| `*ldSwitchCase` | required | The value this case matches |

```html
<div [ldSwitch]="'checkout-layout'">
  <one-page *ldSwitchCase="'one-page'" />
  <multi-step *ldSwitchCase="'multi-step'" />
  <classic *ldSwitchDefault />
</div>
```

##### `[ldTrack]`

Sends a LaunchDarkly custom event when the element is clicked, or when another DOM event fires. The event key must match the event key of a metric in LaunchDarkly. The metric then feeds experiments and guarded rollouts.

| Input | Default | Meaning |
| --- | --- | --- |
| `ldTrack` (the event key) | required | The event to send. If it's empty, nothing is sent and a warning is logged |
| `ldTrackData` | none | Extra data sent with the event, as is |
| `ldTrackValue` | none | A number for numeric metrics, such as revenue or duration |
| `ldTrackEvent` | `click` | The DOM event that sends it, such as `focus` or `submit` |

```html
<button ldTrack="checkout-clicked">Checkout</button>
<button ldTrack="purchase" [ldTrackData]="{ plan: 'pro' }" [ldTrackValue]="49">Buy</button>
<input ldTrack="search-focused" ldTrackEvent="focus" />
```

Events are batched and sent in the background. Call `flush()` on the service to send them right away, for example before a full-page navigation.

##### Directives or signals?

Use a directive when the flag only changes what the template shows. Use a signal (`flagSignal(...)` or the service's `boolVariation(...)`) when the component's code needs the value: in a `computed`, in an event handler, or to pass to a child component. They all read the same client and update the same way.

##### Coming from the unofficial Angular SDK

The selectors and inputs match the [unofficial Angular SDK](https://github.com/launchdarkly-labs/launchdarkly-angular-sdk-unofficial), so most templates written for it carry over. One difference: `ldTrack` sends your `ldTrackData` as is, without adding details about the element.

#### Troubleshooting

Open your browser's developer console. The SDK and this code log `[LaunchDarkly]` messages when something is off.

- **The flag always shows `false` and doesn't change when you toggle it.** The console shows `Unknown feature flag "<flagKey>"` (from the SDK) or `Flag "<flagKey>" wasn't found` (from the service). Browser apps only receive flags that are marked available to client-side SDKs. In LaunchDarkly, open the flag's **Settings**, check **SDKs using Client-side ID** under **Client-side SDK availability**, save, and refresh the page. Also check that `clientSideID` belongs to the environment you're toggling the flag in.
- **"SDK failed to initialize."** The client-side ID is wrong, or the browser can't reach LaunchDarkly (an ad blocker, proxy, or firewall can block it). Use the client-side ID, not the SDK key or mobile key.
- **"LaunchDarkly didn't respond within 500ms."** Flags didn't load within the startup timeout, so the page shows fallback values. The SDK keeps retrying, and the page updates once it connects.

#### Testing your components

Use the in-memory mock client so component tests never call LaunchDarkly, then change flags during the test.

For components that use `flagSignal()`, make the mock the page's client. The service picks it up too:

```ts
const client = new MockLaunchDarklyClient({ 'show-banner': false });
useMockLaunchDarkly(client);
TestBed.configureTestingModule({ imports: [MyComponent] });

client.setFlags({ 'show-banner': true }); // fires change events, just like LaunchDarkly would

afterEach(() => closeLaunchDarkly());
```

For code that only uses the service, you can provide the mock through dependency injection instead:

```ts
TestBed.configureTestingModule({ imports: [MyComponent], providers: [provideMockLaunchDarkly(client)] });
```

See [`app.spec.ts`](src/app/app.spec.ts), [`launchdarkly.service.spec.ts`](src/app/launchdarkly/launchdarkly.service.spec.ts), and [`directives.spec.ts`](src/app/launchdarkly/directives/directives.spec.ts) for full examples. [`ld-client.spec.ts`](src/app/launchdarkly/ld-client.spec.ts) and [`flag-signal.spec.ts`](src/app/launchdarkly/flag-signal.spec.ts) show how to test against the real SDK with a local stand-in for LaunchDarkly.
