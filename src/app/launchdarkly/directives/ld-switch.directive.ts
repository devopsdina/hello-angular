import {
  Directive,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { LDFlagValue } from '@launchdarkly/js-client-sdk';

import { sameValue } from '../launchdarkly.service';
import { TemplateSwitcher, watchFlag } from './flag-watcher';

const PENDING = Symbol('pending');

/**
 * Shows the case that matches a flag's value, like `ngSwitch` for flags. Handy for multivariate
 * flags.
 *
 * @example
 * ```html
 * <div [ldSwitch]="'checkout-layout'">
 *   <one-page *ldSwitchCase="'one-page'" />
 *   <multi-step *ldSwitchCase="'multi-step'" />
 *   <classic *ldSwitchDefault />
 * </div>
 * ```
 */
@Directive({ selector: '[ldSwitch]' })
export class LdSwitchDirective {
  /** The flag key. */
  readonly ldSwitch = input.required<string>();
  /** Value to use when the flag can't be evaluated. */
  readonly ldSwitchFallback = input<LDFlagValue>(undefined);

  // PENDING until the first value arrives, so the default case doesn't flash on first render.
  readonly value = toSignal(watchFlag(this.ldSwitch, this.ldSwitchFallback), {
    initialValue: PENDING,
  });
  private readonly caseValues = signal<LDFlagValue[]>([]);
  readonly hasMatch = computed(() => this.caseValues().some((v) => sameValue(v, this.value())));

  registerCase(value: LDFlagValue): void {
    this.caseValues.update((values) => [...values, value]);
  }

  unregisterCase(value: LDFlagValue): void {
    this.caseValues.update((values) => values.filter((v) => v !== value));
  }

  isPending(): boolean {
    return this.value() === PENDING;
  }
}

/** A case inside `[ldSwitch]`. Shown when the flag equals this value. */
@Directive({ selector: '[ldSwitchCase]' })
export class LdSwitchCaseDirective implements OnDestroy {
  readonly ldSwitchCase = input.required<LDFlagValue>();

  private readonly parent = inject(LdSwitchDirective);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly views = new TemplateSwitcher(inject(ViewContainerRef));
  private registered?: LDFlagValue;

  constructor() {
    effect(() => {
      const caseValue = this.ldSwitchCase();
      if (this.registered !== caseValue) {
        if (this.registered !== undefined) this.parent.unregisterCase(this.registered);
        this.parent.registerCase(caseValue);
        this.registered = caseValue;
      }
      const show = !this.parent.isPending() && sameValue(this.parent.value(), caseValue);
      this.views.show(show ? this.template : null);
    });
  }

  ngOnDestroy(): void {
    if (this.registered !== undefined) this.parent.unregisterCase(this.registered);
  }
}

/** The fallback case inside `[ldSwitch]`. Shown when no `*ldSwitchCase` matches. */
@Directive({ selector: '[ldSwitchDefault]' })
export class LdSwitchDefaultDirective {
  private readonly parent = inject(LdSwitchDirective);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly views = new TemplateSwitcher(inject(ViewContainerRef));

  constructor() {
    effect(() => {
      const show = !this.parent.isPending() && !this.parent.hasMatch();
      this.views.show(show ? this.template : null);
    });
  }
}
