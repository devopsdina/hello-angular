import { Directive, TemplateRef, ViewContainerRef, inject, input } from '@angular/core';
import type { LDFlagValue } from '@launchdarkly/js-client-sdk';

import { TemplateSwitcher, matches, watchFlag } from './flag-watcher';

export interface LdFlagContext {
  $implicit: LDFlagValue;
  flagValue: LDFlagValue;
  isMatch: boolean;
}

/**
 * Renders its content with the flag's value available in the template.
 *
 * @example
 * ```html
 * <p *ldFlag="'banner-text'; fallback: 'Welcome'; let text">{{ text }}</p>
 * <p *ldFlag="'plan'; value: 'pro'; else basic; let plan">You're on {{ plan }}</p>
 * ```
 */
@Directive({ selector: '[ldFlag]' })
export class LdFlagDirective {
  /** The flag key. */
  readonly ldFlag = input.required<string>();
  /** Show the content only when the flag equals this value. Without it, the content always shows. */
  readonly ldFlagValue = input<LDFlagValue>(undefined);
  /** Template to show when the flag doesn't equal `value`. It gets the same context. */
  readonly ldFlagElse = input<TemplateRef<LdFlagContext> | null>(null);
  /** Value to use when the flag can't be evaluated. */
  readonly ldFlagFallback = input<LDFlagValue>(undefined);

  private readonly template = inject<TemplateRef<LdFlagContext>>(TemplateRef);
  private readonly views = new TemplateSwitcher(inject(ViewContainerRef));

  constructor() {
    watchFlag(this.ldFlag, this.ldFlagFallback).subscribe((value) => {
      const expected = this.ldFlagValue();
      const isMatch = expected === undefined || matches(value, expected);
      const context: LdFlagContext = { $implicit: value, flagValue: value, isMatch };
      this.views.show(isMatch ? this.template : this.ldFlagElse(), context);
    });
  }

  static ngTemplateContextGuard(_dir: LdFlagDirective, ctx: unknown): ctx is LdFlagContext {
    return true;
  }
}
