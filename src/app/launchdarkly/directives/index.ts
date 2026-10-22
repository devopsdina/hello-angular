import { LdClassIfDirective } from './ld-class-if.directive';
import { LdFlagDirective } from './ld-flag.directive';
import { LdIfDirective } from './ld-if.directive';
import { LdStyleIfDirective } from './ld-style-if.directive';
import {
  LdSwitchCaseDirective,
  LdSwitchDefaultDirective,
  LdSwitchDirective,
} from './ld-switch.directive';
import { LdTrackDirective } from './ld-track.directive';

export * from './ld-class-if.directive';
export * from './ld-flag.directive';
export * from './ld-if.directive';
export * from './ld-style-if.directive';
export * from './ld-switch.directive';
export * from './ld-track.directive';

/** Every LaunchDarkly directive. Add it to a component's `imports` to use them all. */
export const LD_DIRECTIVES = [
  LdIfDirective,
  LdFlagDirective,
  LdClassIfDirective,
  LdStyleIfDirective,
  LdSwitchDirective,
  LdSwitchCaseDirective,
  LdSwitchDefaultDirective,
  LdTrackDirective,
] as const;
