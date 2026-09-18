import * as cdk from 'aws-cdk-lib/core';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { APP_NAME, WEB_BRANCH } from './config';

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
}

/**
 * Amplify Hosting for the Next.js app.
 *
 * Platform is WEB_COMPUTE, not WEB: CRUD runs through Next.js server routes
 * (DATA-MODEL.md Decision 2), so the app is not a static export. A static `WEB`
 * platform breaks every server route at once.
 *
 * NO REPOSITORY IS CONNECTED, and that is the design rather than an omission.
 * The web tier ships through the Amplify **deployment specification**:
 * `infra/scripts/deploy-web.mjs` builds `web/` locally, assembles a bundle that
 * already conforms to the spec, and uploads it with CreateDeployment /
 * StartDeployment. Amplify runs no build of its own.
 *
 * That removes three problems at once rather than working around them:
 *   - no GitHub OAuth token, so nothing secret has to live in CDK, an env var,
 *     Secrets Manager or the console, and no GitHub App install is needed
 *   - no build spec, so the monorepo layout (the app lives in `web/`) never
 *     raises AWS's `AMPLIFY_MONOREPO_APP_ROOT`-in-the-console requirement, which
 *     would have contradicted this repo's "never set one in the console" rule
 *   - no dependence on Amplify supporting a particular Next.js version. AWS
 *     documents Next.js 15; this app is 16.3.5. Under the deployment spec
 *     Amplify only runs a Node server on port 3000 and never parses the build,
 *     so the question does not arise.
 *
 * A git connection can still be added later if auto-deploy is wanted:
 * `AWS::Amplify::App` has no create-only properties, so `Repository` and the
 * token can be attached to this same app by a plain update.
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
      environmentVariables: [
        { name: 'NEXT_PUBLIC_COGNITO_USER_POOL_ID', value: props.userPool.userPoolId },
        { name: 'NEXT_PUBLIC_COGNITO_CLIENT_ID', value: props.userPoolClientId },
        { name: 'NEXT_PUBLIC_AWS_REGION', value: this.region },
        { name: 'APP_TABLE_NAME', value: props.table.tableName },
        { name: 'ASSESSMENT_SCORER_QUEUE_URL', value: props.assessmentScorerQueue.queueUrl },
        { name: 'LEARNING_PLAN_QUEUE_URL', value: props.learningPlanQueue.queueUrl },
      ],
    });

    /**
     * A deployment target for the manual (deployment-specification) path.
     *
     * This is not a git branch — nothing is connected to a repository. Amplify
     * requires a branch to deploy *into*, and `infra/scripts/deploy-web.mjs`
     * uploads a bundle to this one. `framework` is left unset deliberately:
     * Amplify never inspects the build, because the bundle already conforms to
     * the deployment specification.
     */
    this.branch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: this.app.attrAppId,
      branchName: WEB_BRANCH,
      stage: 'PRODUCTION',
      // Branch-level role wins over the app-level default; set both so the
      // branch is correct even if the app-level value is later changed.
      computeRoleArn: this.computeRole.roleArn,
      enableAutoBuild: false,
    });

    new cdk.CfnOutput(this, 'AmplifyAppId', { value: this.app.attrAppId });
    new cdk.CfnOutput(this, 'AmplifyBranchName', { value: WEB_BRANCH });
    new cdk.CfnOutput(this, 'SsrComputeRoleArn', { value: this.computeRole.roleArn });
    new cdk.CfnOutput(this, 'WebUrl', {
      value: `https://${WEB_BRANCH}.${this.app.attrDefaultDomain}`,
    });
  }
}
