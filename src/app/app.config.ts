import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

import { clientSideID } from '../environments/environment';
import { provideLaunchDarkly } from './launchdarkly/launchdarkly.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideLaunchDarkly({
      clientSideID,
      // Set up the evaluation context. This context should appear on your LaunchDarkly
      // contexts dashboard soon after you run the demo.
      context: {
        kind: 'user',
        key: 'example-user-key',
        name: 'Sandy',
      },
    }),
  ],
};
