#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { REGION, stackName } from '../lib/config';
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

new ComputeStack(app, stackName('compute'), {
  env,
  table: data.table,
  userPoolId: auth.userPool.userPoolId,
  userPoolClientId: auth.userPoolClient.userPoolClientId,
  // The deployed web origin plus local development. The voice socket checks
  // this in its upgrade handler, before any frame is read.
  allowedOrigins: app.node.tryGetContext('allowedOrigins') ?? 'http://localhost:3000',
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
  // Set once the App Runner service exists:
  //   cdk deploy skillbridge-web -c voiceServiceUrl=https://<id>.ap-northeast-1.awsapprunner.com
  voiceServiceUrl: app.node.tryGetContext('voiceServiceUrl') as string | undefined,
});
