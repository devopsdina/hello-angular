import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { clientSideID } from './environments/environment';

if (clientSideID === '' || clientSideID.startsWith('<')) {
  document.body.textContent =
    'Please edit src/environments/environment.ts to set clientSideID to your LaunchDarkly client-side ID first.';
} else {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
}
