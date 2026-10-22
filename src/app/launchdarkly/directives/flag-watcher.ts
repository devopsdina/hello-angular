import { TemplateRef, ViewContainerRef, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import type { LDFlagValue } from '@launchdarkly/js-client-sdk';
import { EMPTY, Observable, switchMap } from 'rxjs';

import { LaunchDarklyService, sameValue } from '../launchdarkly.service';

/**
 * Watches the flag named by a directive's inputs. Re-subscribes when the key or fallback input
 * changes and unsubscribes when the directive is destroyed. Call it in a directive's constructor.
 */
export function watchFlag(
  key: () => string | undefined,
  fallback: () => LDFlagValue,
): Observable<LDFlagValue> {
  const ld = inject(LaunchDarklyService);
  return toObservable(computed(() => ({ key: key(), fallback: fallback() }))).pipe(
    switchMap(({ key, fallback }) => (key ? ld.variation$(key, fallback) : EMPTY)),
    takeUntilDestroyed(),
  );
}

/** With no expected value, any truthy flag value matches. Otherwise the value must be equal. */
export function matches(value: LDFlagValue, expected: LDFlagValue): boolean {
  return expected === undefined ? Boolean(value) : sameValue(value, expected);
}

/** Shows or hides a template, only touching the DOM when the visible template changes. */
export class TemplateSwitcher {
  private current?: TemplateRef<unknown> | null;

  constructor(private readonly viewContainer: ViewContainerRef) {}

  show(template: TemplateRef<unknown> | null | undefined, context?: object): void {
    if (template === this.current && !context) return;
    this.current = template;
    this.viewContainer.clear();
    if (template) this.viewContainer.createEmbeddedView(template, context);
  }
}
