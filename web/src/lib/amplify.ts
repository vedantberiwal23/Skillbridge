'use client';

import { Amplify } from 'aws-amplify';
import { amplifyConfig } from './amplify-config';

/**
 * Amplify handles token storage and refresh rotation (DATA-MODEL.md Decision 3).
 *
 * Sign-up is disabled at the Cognito pool level — accounts exist only via an org
 * admin's invite, so there is no registration flow to configure here.
 */
let configured = false;

export function configureAmplify() {
  if (!configured) {
    try {
      Amplify.configure(amplifyConfig, { ssr: true });
      configured = true;
    } catch {
      // ignore re-configuration errors
    }
  }
}
