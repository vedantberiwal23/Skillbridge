#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { REGION, stackName, ALLOWED_WEB_ORIGINS } from '../lib/config';
import { SecurityStack } from '../lib/security-stack';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { AiStack } from '../lib/ai-stack';
import { ComputeStack } from '../lib/compute-stack';
import { WebStack } from '../lib/web-stack';

const app = new cdk.App();

// Single region for everything (HANDOFF.md): no service needs ap-south-1, and
// splitting would add cross-region auth/state complexity for no benefit.
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION };

const security = new SecurityStack(app, stackName('security'), { env });

const data = new DataStack(app, stackName('data'), {
  env,
  dataKey: security.dataKey,
});

const auth = new AuthStack(app, stackName('auth'), { env });

const ai = new AiStack(app, stackName('ai'), {
  env,
  table: data.table,
  orgDocsBucket: data.orgDocsBucket,
});

const compute = new ComputeStack(app, stackName('compute'), {
  env,
  table: data.table,
  userPoolId: auth.userPool.userPoolId,
  userPoolClientId: auth.userPoolClient.userPoolClientId,
  // The deployed web origin plus local development. The voice socket checks
  // this in its upgrade handler, before any frame is read. Defaults to the real
  // origins rather than localhost: see ALLOWED_WEB_ORIGINS for why.
  allowedOrigins: app.node.tryGetContext('allowedOrigins') ?? ALLOWED_WEB_ORIGINS,
});

new WebStack(app, stackName('web'), {
  env,
  // Constructs, not ids: the SSR compute role is granted against both, and a
  // name string cannot mutate a resource policy.
  userPool: auth.userPool,
  userPoolClientId: auth.userPoolClient.userPoolClientId,
  table: data.table,
  assessmentScorerQueue: ai.assessmentScorerQueue,
  learningPlanQueue: ai.learningPlanQueue,
  /**
   * Taken straight off the compute stack rather than typed in.
   *
   * It used to be a context value, which meant the endpoint — a 32-character
   * hex hostname — had to be copied by hand on every deploy. That is not a
   * theoretical risk: a terminal masked the hex as bullets, the bullets were
   * pasted back in, and the app shipped pointing at
   * `xn--sk-31f02-ur3daaa...` — a punycode hostname of exactly the right
   * length, so nothing looked wrong until the browser failed to open the
   * socket. A CloudFormation reference cannot be mistyped.
   *
   * The context value still overrides, for pointing the web tier at a voice
   * service this app does not define (a local tunnel, say).
   */
  voiceServiceUrl:
    (app.node.tryGetContext('voiceServiceUrl') as string | undefined) ??
    (compute.voiceService ? `https://${compute.voiceService.attrEndpoint}` : undefined),
});
