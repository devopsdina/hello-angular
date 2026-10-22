import { Directive, TemplateRef, ViewContainerRef, inject, input } from '@angular/core';
import type { LDFlagValue } from '@launchdarkly/js-client-sdk';

import { TemplateSwitcher, matches, watchFlag } from './flag-watcher';

/**
 * Renders its content when a flag is on (or equals `value`), like `*ngIf` for flags.
 *
 * @example
 * ```html
 * <div *ldIf="'new-checkout'">New checkout</div>
 * <div *ldIf="'theme'; value: 'dark'; else lightTheme">Dark theme</div>
 * <ng-template #lightTheme>Light theme</ng-template>
 * ```
 */
@Directive({ selector: '[ldIf]' })
export class LdIfDirective {
  /** The flag key. */
  readonly ldIf = input.required<string>();
  /** Show the content only when the flag equals this value. Without it, any truthy value shows it. */
  readonly ldIfValue = input<LDFlagValue>(undefined);
  /** Template to show when the flag doesn't match. */
  readonly ldIfElse = input<TemplateRef<unknown> | null>(null);
  /** Value to use when the flag can't be evaluated. */
  readonly ldIfFallback = input<LDFlagValue>(false);

  private readonly template = inject(TemplateRef<unknown>);
  private readonly views = new TemplateSwitcher(inject(ViewContainerRef));

  constructor() {
    watchFlag(this.ldIf, this.ldIfFallback).subscribe((value) =>
      this.views.show(matches(value, this.ldIfValue()) ? this.template : this.ldIfElse()),
    );
  }
}
