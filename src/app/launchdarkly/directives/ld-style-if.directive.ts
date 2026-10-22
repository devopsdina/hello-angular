import {
  Directive,
  ElementRef,
  Renderer2,
  RendererStyleFlags2,
  computed,
  inject,
  input,
} from '@angular/core';
import type { LDFlagValue } from '@launchdarkly/js-client-sdk';

import { matches, watchFlag } from './flag-watcher';

/** CSS properties to values. Keys can be camelCase or kebab-case, and can carry a unit: `'width.px'`. */
type Styles = Record<string, string | number>;

export interface LdStyleIfConfig {
  flag: string;
  style?: Styles;
  elseStyle?: Styles;
  value?: LDFlagValue;
  fallback?: LDFlagValue;
}

/**
 * Sets inline styles based on a flag.
 *
 * @example
 * ```html
 * <h1 [ldStyleIf]="'big-title'" [ldStyleIfStyle]="{ 'fontSize.px': 48 }">Hello</h1>
 * <div [ldStyleIf]="{ flag: 'theme', value: 'dark', style: { background: '#000' }, elseStyle: { background: '#fff' } }"></div>
 * ```
 */
@Directive({ selector: '[ldStyleIf]' })
export class LdStyleIfDirective {
  /** The flag key, or a config object with all the options. */
  readonly ldStyleIf = input.required<string | LdStyleIfConfig>();
  readonly ldStyleIfStyle = input<Styles>();
  readonly ldStyleIfElseStyle = input<Styles>();
  readonly ldStyleIfValue = input<LDFlagValue>(undefined);
  readonly ldStyleIfFallback = input<LDFlagValue>(undefined);

  private readonly element = inject(ElementRef).nativeElement as HTMLElement;
  private readonly renderer = inject(Renderer2);
  private readonly config = computed<LdStyleIfConfig>(() => {
    const flagOrConfig = this.ldStyleIf();
    return typeof flagOrConfig === 'string'
      ? {
          flag: flagOrConfig,
          style: this.ldStyleIfStyle(),
          elseStyle: this.ldStyleIfElseStyle(),
          value: this.ldStyleIfValue(),
          fallback: this.ldStyleIfFallback(),
        }
      : flagOrConfig;
  });
  private applied: string[] = [];

  constructor() {
    watchFlag(
      () => this.config().flag,
      () => this.config().fallback,
    ).subscribe((value) => {
      const { style, elseStyle, value: expected } = this.config();
      this.applied.forEach((property) => this.renderer.removeStyle(this.element, property, DASH));
      const styles = toCss(matches(value, expected) ? style : elseStyle);
      this.applied = Object.keys(styles);
      this.applied.forEach((property) =>
        this.renderer.setStyle(this.element, property, styles[property], DASH),
      );
    });
  }
}

const DASH = RendererStyleFlags2.DashCase;

// { 'fontSize.px': 48 } becomes { 'font-size': '48px' }.
function toCss(styles: Styles | undefined): Record<string, string> {
  const css: Record<string, string> = {};
  for (const [key, value] of Object.entries(styles ?? {})) {
    const [property, unit = ''] = key.split('.');
    css[property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)] = `${value}${unit}`;
  }
  return css;
}
