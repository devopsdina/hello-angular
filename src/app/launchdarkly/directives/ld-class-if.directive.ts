import { Directive, ElementRef, Renderer2, computed, inject, input } from '@angular/core';
import type { LDFlagValue } from '@launchdarkly/js-client-sdk';

import { matches, watchFlag } from './flag-watcher';

type ClassNames = string | string[];

export interface LdClassIfConfig {
  flag: string;
  class?: ClassNames;
  elseClass?: ClassNames;
  value?: LDFlagValue;
  fallback?: LDFlagValue;
}

/**
 * Adds CSS classes based on a flag.
 *
 * @example
 * ```html
 * <button [ldClassIf]="'new-styles'" ldClassIfClass="btn-new" ldClassIfElseClass="btn-old">Buy</button>
 * <div [ldClassIf]="{ flag: 'theme', value: 'dark', class: 'dark', elseClass: 'light' }"></div>
 * ```
 */
@Directive({ selector: '[ldClassIf]' })
export class LdClassIfDirective {
  /** The flag key, or a config object with all the options. */
  readonly ldClassIf = input.required<string | LdClassIfConfig>();
  readonly ldClassIfClass = input<ClassNames>();
  readonly ldClassIfElseClass = input<ClassNames>();
  readonly ldClassIfValue = input<LDFlagValue>(undefined);
  readonly ldClassIfFallback = input<LDFlagValue>(undefined);

  private readonly element = inject(ElementRef).nativeElement as HTMLElement;
  private readonly renderer = inject(Renderer2);
  private readonly config = computed<LdClassIfConfig>(() => {
    const flagOrConfig = this.ldClassIf();
    return typeof flagOrConfig === 'string'
      ? {
          flag: flagOrConfig,
          class: this.ldClassIfClass(),
          elseClass: this.ldClassIfElseClass(),
          value: this.ldClassIfValue(),
          fallback: this.ldClassIfFallback(),
        }
      : flagOrConfig;
  });
  private applied: string[] = [];

  constructor() {
    watchFlag(
      () => this.config().flag,
      () => this.config().fallback,
    ).subscribe((value) => {
      const { class: onClass, elseClass, value: expected } = this.config();
      this.applied.forEach((name) => this.renderer.removeClass(this.element, name));
      this.applied = splitClasses(matches(value, expected) ? onClass : elseClass);
      this.applied.forEach((name) => this.renderer.addClass(this.element, name));
    });
  }
}

function splitClasses(names: ClassNames | undefined): string[] {
  const list = Array.isArray(names) ? names : (names ?? '').split(' ');
  return list.map((name) => name.trim()).filter(Boolean);
}
