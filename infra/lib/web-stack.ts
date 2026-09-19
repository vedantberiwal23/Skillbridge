import * as cdk from 'aws-cdk-lib/core';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import {
  APP_NAME,
  WEB_BRANCH,
  WEB_REPOSITORY,
  githubTokenRef,
} from './config';

export interface WebStackProps extends cdk.StackProps {
  /**
   * The construct, not an id — the SSR compute role is granted against it, and a
   * name string cannot mutate a resource policy. Passing the construct is also
   * what makes the KMS grant happen: `grantReadWriteData` follows the table's
   * `encryptionKey` and adds Decrypt/Encrypt/GenerateDataKey on the CMK, which a
   * `tableName: string` prop silently could not do.
   */
  readonly table: dynamodb.ITable;
  /** Likewise a construct: invite redemption calls Cognito admin APIs on it. */
  readonly userPool: cognito.IUserPool;
  readonly userPoolClientId: string;
  /**
   * The two on-demand agents. A route writes a pending item and enqueues here,
   * then returns — CLAUDE.md forbids holding a response open while an async-tier
   * model runs.
   */
  readonly assessmentScorerQueue: sqs.IQueue;
  readonly learningPlanQueue: sqs.IQueue;
  /**
   * Public origin of the voice service, e.g. `https://xxxx.ap-northeast-1.awsapprunner.com`.
   *
   * Optional only because the App Runner service is created once an image
   * exists, so there is nothing to point at on a first deploy. It is still
   * declared in `environmentVariables` when absent: `CfnApp` replaces that
   * whole list on update, so a value added in the console later would be wiped
   * by the next `cdk deploy` with no diff to show for it.
   *
   * The browser reads this to build the `/voice/stream` websocket URL. Empty
   * leaves the client on its localhost default, which is correct for `next dev`
   * and visibly broken in Amplify — which is the honest failure mode.
   */
  readonly voiceServiceUrl?: string;
}

/**
 * Amplify Hosting for the Next.js app.
 *
 * Platform is WEB_COMPUTE, not WEB: CRUD runs through Next.js server routes
 * (DATA-MODEL.md Decision 2), so the app is not a static export. A static `WEB`
 * platform breaks every server route at once.
 *
 * THE REPOSITORY IS CONNECTED AND AMPLIFY RUNS THE BUILD. This replaces an
 * earlier design in which `infra/scripts/deploy-web.mjs` built `web/` locally,
 * assembled a bundle conforming to the Amplify Hosting deployment
 * specification, and uploaded it with CreateDeployment / StartDeployment.
 *
 * That design does not work, and fails silently rather than loudly. AWS
 * documents that "Amplify Hosting does not support manual deploys for
 * server-side rendered (SSR) apps": the CreateDeployment path deploys only
 * `.amplify-hosting/static` and ignores the compute primitive entirely, so
 * every route falls through to the static primitive and is served by S3 — `/`
 * returns 404, everything else 301s to a trailing slash — while the job still
 * reports SUCCEED and the console shows a healthy deployment. Confirmed against
 * three real deployments on 2026-09-19, including one with the branch framework
 * forced to `Next.js - SSR`.
 *
 * What the old design was right about is the cost of the alternative, and those
 * costs are now paid rather than avoided:
 *   - a GitHub token is required. It lives in Secrets Manager and reaches the
 *     template only as a `{{resolve:}}` dynamic reference — see config.ts.
 *   - the monorepo layout needs `AMPLIFY_MONOREPO_APP_ROOT`, declared in
 *     `environmentVariables` below rather than in the console, which keeps the
 *     "never set one in the console" rule intact.
 *   - the app now DOES depend on Amplify supporting its Next.js version. AWS
 *     documents Amplify Hosting compute as supporting Next.js 12 through 15;
 *     this app is 16.3.5. That is the open risk in this stack. If an Amplify
 *     build cannot produce a working Next 16 app, the fallbacks are Next 15 or
 *     hosting the standalone server on App Runner beside the voice service.
 */
export class WebStack extends cdk.Stack {
  readonly app: amplify.CfnApp;
  readonly branch: amplify.CfnBranch;
  readonly computeRole: iam.Role;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    /**
     * The SSR compute role. Without it the first deployed server route fails with
     * AccessDenied, because Amplify's compute environment has no identity of its
     * own — `web/src/lib/ddb.ts` builds a client expecting ambient credentials.
     *
     * Trust policy is the documented one, verbatim and with no condition block:
     * AWS warns that an incorrectly defined trust relationship makes attaching
     * the role fail outright.
     */
    this.computeRole = new iam.Role(this, 'SsrComputeRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: 'Runtime identity for Next.js server routes on Amplify Hosting compute',
    });

    // Covers the base table, both indexes, and the customer managed key.
    props.table.grantReadWriteData(this.computeRole);

    /**
     * Invite redemption creates the Cognito account server-side. These four are
     * exactly what `web/src/lib/cognito.ts` calls — `AdminDeleteUser` included,
     * because it is the rollback when provisioning fails after the account
     * exists, and without it a half-created user blocks every retry.
     *
     * Note this is deliberately more than the browser can do: the app client's
     * `WriteAttributes` allowlist constrains token-authorized
     * `updateUserAttributes`, while this IAM path is what lets the server set
     * tenant claims a signed-in worker must never set for themselves.
     */
    this.computeRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminAddUserToGroup',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminDeleteUser',
          // Department moves in the manager/admin console keep custom:deptId in step.
          'cognito-idp:AdminUpdateUserAttributes',
        ],
        resources: [props.userPool.userPoolArn],
      })
    );

    // Send only. The routes enqueue work; the workers in skillbridge-ai are the
    // only consumers, so the web tier never needs receive or delete.
    props.assessmentScorerQueue.grantSendMessages(this.computeRole);
    props.learningPlanQueue.grantSendMessages(this.computeRole);

    this.app = new amplify.CfnApp(this, 'WebApp', {
      name: `${APP_NAME}-web`,
      platform: 'WEB_COMPUTE',
      // App-level default. AWS recommends a per-branch role instead when the
      // repository is public and auto-branch-creation or PR previews are on;
      // revisit when the repository connection is decided.
      computeRoleArn: this.computeRole.roleArn,
      /**
       * Amplify builds the app itself from this repository. A connection is
       * required, not optional: manual deploys cannot host SSR, so the only
       * supported route to Amplify Hosting compute is a repository build.
       *
       * The token is a CloudFormation dynamic reference, so the value is
       * resolved at deploy time and appears in neither this source, the
       * synthesised template, nor `cdk.context.json`.
       */
      repository: WEB_REPOSITORY,
      accessToken: githubTokenRef(),
      /**
       * The app lives in `web/`, so the build spec declares an application at
       * that root and `AMPLIFY_MONOREPO_APP_ROOT` tells Amplify's compute where
       * the built output is. Declared here rather than in the console, per the
       * same rule that governs `environmentVariables`.
       *
       * Node is pinned: Next 16 requires >= 20, and the build image's default
       * is older than that on some Amplify image versions.
       */
      buildSpec: [
        'version: 1',
        'applications:',
        '  - appRoot: web',
        '    frontend:',
        '      phases:',
        '        preBuild:',
        '          commands:',
        '            - nvm install 22',
        '            - nvm use 22',
        '            - npm ci',
        '        build:',
        '          commands:',
        // Amplify's environment variables reach the BUILD, not the SSR runtime.
        // Next inlines `NEXT_PUBLIC_*` at build time, so those survive — but a
        // server-only value like APP_TABLE_NAME is read from `process.env` when
        // a request runs, and there it is undefined. `ddb.ts` falls back to `''`,
        // so every DynamoDB call fails and every data route answers 500 while
        // auth still works, because Cognito falls back to the NEXT_PUBLIC_ copy.
        // Writing them into `.env.production` before the build is AWS's
        // documented fix. Keep the list in step with `environmentVariables`.
        "            - env | grep -E '^(APP_TABLE_NAME|ASSESSMENT_SCORER_QUEUE_URL|LEARNING_PLAN_QUEUE_URL|MACHINE_TWIN_URL|COGNITO_USER_POOL_ID|COGNITO_CLIENT_ID)=' >> .env.production || true",
        '            - npm run build',
        '      artifacts:',
        '        baseDirectory: .next',
        '        files:',
        "          - '**/*'",
        '      cache:',
        '        paths:',
        '          - node_modules/**/*',
        '',
      ].join('\n'),
      environmentVariables: [
        { name: 'AMPLIFY_MONOREPO_APP_ROOT', value: 'web' },
        { name: 'NEXT_PUBLIC_COGNITO_USER_POOL_ID', value: props.userPool.userPoolId },
        { name: 'NEXT_PUBLIC_COGNITO_CLIENT_ID', value: props.userPoolClientId },
        { name: 'NEXT_PUBLIC_AWS_REGION', value: this.region },
        { name: 'APP_TABLE_NAME', value: props.table.tableName },
        { name: 'ASSESSMENT_SCORER_QUEUE_URL', value: props.assessmentScorerQueue.queueUrl },
        { name: 'LEARNING_PLAN_QUEUE_URL', value: props.learningPlanQueue.queueUrl },
        { name: 'NEXT_PUBLIC_VOICE_URL', value: props.voiceServiceUrl ?? '' },
      ],
    });

    /**
     * The tracked git branch. `WEB_BRANCH` must name a branch that exists in
     * the repository — this one's default is `master` — or Amplify connects the
     * branch and every build fails to find a ref.
     */
    this.branch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: this.app.attrAppId,
      branchName: WEB_BRANCH,
      stage: 'PRODUCTION',
      // Branch-level role wins over the app-level default; set both so the
      // branch is correct even if the app-level value is later changed.
      computeRoleArn: this.computeRole.roleArn,
      // Build on push. The repository is the source of truth for the web tier
      // now that there is no manual upload path.
      enableAutoBuild: true,
      framework: 'Next.js - SSR',
    });

    new cdk.CfnOutput(this, 'AmplifyAppId', { value: this.app.attrAppId });
    new cdk.CfnOutput(this, 'AmplifyBranchName', { value: WEB_BRANCH });
    new cdk.CfnOutput(this, 'SsrComputeRoleArn', { value: this.computeRole.roleArn });
    new cdk.CfnOutput(this, 'WebUrl', {
      value: `https://${WEB_BRANCH}.${this.app.attrDefaultDomain}`,
    });
  }
}
