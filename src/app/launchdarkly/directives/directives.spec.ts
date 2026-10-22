import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  MockLaunchDarklyClient,
  provideMockLaunchDarkly,
} from '../testing/mock-launchdarkly-client';
import { LD_DIRECTIVES } from './index';

@Component({
  imports: [LD_DIRECTIVES],
  template: `
    <p id="if" *ldIf="'feature'; else off">on</p>
    <ng-template #off><p id="if">off</p></ng-template>

    <p id="if-value" *ldIf="'theme'; value: 'dark'">dark only</p>

    <p id="flag" *ldFlag="'banner'; fallback: 'Welcome'; let text">{{ text }}</p>

    <p id="class" [ldClassIf]="'feature'" ldClassIfClass="new big" ldClassIfElseClass="old"></p>

    <p
      id="style"
      [ldStyleIf]="{ flag: 'feature', style: { 'fontSize.px': 20 }, elseStyle: { color: 'red' } }"
    ></p>

    <div [ldSwitch]="'theme'">
      <p id="switch" *ldSwitchCase="'dark'">dark</p>
      <p id="switch" *ldSwitchCase="'light'">light</p>
      <p id="switch" *ldSwitchDefault>default</p>
    </div>

    <button ldTrack="clicked" [ldTrackData]="data()" [ldTrackValue]="3">Go</button>
  `,
})
class Host {
  readonly data = signal({ page: 'home' });
}

describe('LaunchDarkly directives', () => {
  let client: MockLaunchDarklyClient;
  let fixture: ComponentFixture<Host>;
  const el = (selector: string) =>
    fixture.nativeElement.querySelector(selector) as HTMLElement | null;

  beforeEach(async () => {
    client = new MockLaunchDarklyClient({ feature: true, theme: 'dark', banner: 'Hello!' });
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideMockLaunchDarkly(client)],
    });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  async function change(flags: Record<string, unknown>) {
    client.setFlags(flags);
    await fixture.whenStable();
  }

  it('ldIf shows content or the else template', async () => {
    expect(el('#if')?.textContent).toBe('on');
    await change({ feature: false });
    expect(el('#if')?.textContent).toBe('off');
  });

  it('ldIf with a value only shows on an exact match', async () => {
    expect(el('#if-value')).not.toBeNull();
    await change({ theme: 'light' });
    expect(el('#if-value')).toBeNull();
  });

  it('ldFlag exposes the value to the template', async () => {
    expect(el('#flag')?.textContent).toBe('Hello!');
    await change({ banner: 'Sale today' });
    expect(el('#flag')?.textContent).toBe('Sale today');
  });

  it('ldClassIf swaps classes', async () => {
    expect(el('#class')?.className).toBe('new big');
    await change({ feature: false });
    expect(el('#class')?.className).toBe('old');
  });

  it('ldStyleIf swaps styles, including unit keys', async () => {
    expect(el('#style')?.style.fontSize).toBe('20px');
    await change({ feature: false });
    expect(el('#style')?.style.fontSize).toBe('');
    expect(el('#style')?.style.color).toBe('red');
  });

  it('ldSwitch shows the matching case, or the default', async () => {
    expect(el('#switch')?.textContent).toBe('dark');
    await change({ theme: 'light' });
    expect(el('#switch')?.textContent).toBe('light');
    await change({ theme: 'sepia' });
    expect(el('#switch')?.textContent).toBe('default');
    expect(fixture.nativeElement.querySelectorAll('#switch').length).toBe(1);
  });

  it('ldTrack sends an event on click', () => {
    el('button')?.click();
    expect(client.trackedEvents).toEqual([
      { key: 'clicked', data: { page: 'home' }, metricValue: 3 },
    ]);
  });
});
