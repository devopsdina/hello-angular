import { Directive, ElementRef, Renderer2, effect, inject, input, untracked } from '@angular/core';

import { LaunchDarklyService } from '../launchdarkly.service';

/**
 * Sends a LaunchDarkly custom event when the element is clicked (or another DOM event fires).
 * Use it to feed metrics for experiments and guarded rollouts.
 *
 * @example
 * ```html
 * <button ldTrack="checkout-clicked">Checkout</button>
 * <button ldTrack="purchase" [ldTrackData]="{ plan: 'pro' }" [ldTrackValue]="49">Buy</button>
 * <input ldTrack="search-focused" ldTrackEvent="focus" />
 * ```
 */
@Directive({ selector: '[ldTrack]' })
export class LdTrackDirective {
  /** The event key. It must match the event key of a metric in LaunchDarkly. */
  readonly ldTrack = input.required<string>();
  readonly ldTrackData = input<unknown>();
  readonly ldTrackValue = input<number>();
  /** The DOM event that sends the LaunchDarkly event. Defaults to `click`. */
  readonly ldTrackEvent = input('click');

  private readonly ld = inject(LaunchDarklyService);
  private readonly element = inject(ElementRef).nativeElement as HTMLElement;
  private readonly renderer = inject(Renderer2);

  constructor() {
    effect((onCleanup) => {
      const domEvent = this.ldTrackEvent();
      const stopListening = this.renderer.listen(this.element, domEvent, () =>
        untracked(() => this.send()),
      );
      onCleanup(stopListening);
    });
  }

  private send(): void {
    const key = this.ldTrack();
    if (!key) {
      console.warn('[LaunchDarkly] ldTrack has no event key, so no event was sent.');
      return;
    }
    this.ld.track(key, this.ldTrackData(), this.ldTrackValue());
  }
}
