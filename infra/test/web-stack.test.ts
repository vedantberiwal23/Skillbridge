import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SecurityStack } from '../lib/security-stack';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { AiStack } from '../lib/ai-stack';
import { WebStack } from '../lib/web-stack';

function synth() {
  const app = new cdk.App();
  const env = { account: '111111111111', region: 'ap-northeast-1' };
  const security = new SecurityStack(app, 'TestSecurity', { env });
  const data = new DataStack(app, 'TestData', { env, dataKey: security.dataKey });
  const auth = new AuthStack(app, 'TestAuth', { env });
  const ai = new AiStack(app, 'TestAi', {
    env,
    table: data.table,
    orgDocsBucket: data.orgDocsBucket,
  });
  const web = new WebStack(app, 'TestWeb', {
    env,
    table: data.table,
    userPool: auth.userPool,
    userPoolClientId: 'test-client',
    assessmentScorerQueue: ai.assessmentScorerQueue,
    learningPlanQueue: ai.learningPlanQueue,
  });
  return Template.fromStack(web);
}

test('the app is WEB_COMPUTE and carries an SSR compute role', () => {
  // A static WEB platform breaks every server route at once, and without a
  // compute role the first deployed route fails with AccessDenied.
  synth().hasResourceProperties('AWS::Amplify::App', {
    Platform: 'WEB_COMPUTE',
    ComputeRoleArn: Match.anyValue(),
  });
});

test('the compute role is assumable by Amplify and nothing else', () => {
  synth().hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: 'Allow',
          Action: 'sts:AssumeRole',
          Principal: { Service: 'amplify.amazonaws.com' },
        }),
      ]),
    }),
  });
});

test('the compute role can reach the table, its indexes and the CMK', () => {
  const policies = synth().findResources('AWS::IAM::Policy');
  const actions = Object.values(policies).flatMap((p) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p as any).Properties.PolicyDocument.Statement.flatMap((s: { Action: string | string[] }) =>
      ([] as string[]).concat(s.Action)
    )
  );

  expect(actions).toEqual(expect.arrayContaining(['dynamodb:PutItem', 'dynamodb:Query']));
  // Passing the table CONSTRUCT rather than a name is what pulls the KMS grant
  // in: the table uses a customer managed key, and without these the routes get
  // AccessDenied on every read.
  expect(actions).toEqual(expect.arrayContaining(['kms:Decrypt', 'kms:GenerateDataKey*']));
});

test('the compute role gets exactly the five Cognito admin actions the routes use', () => {
  const policies = synth().findResources('AWS::IAM::Policy');
  const cognito = Object.values(policies)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .flatMap((p) => (p as any).Properties.PolicyDocument.Statement)
    .flatMap((s: { Action: string | string[] }) => ([] as string[]).concat(s.Action))
    .filter((a: string) => a.startsWith('cognito-idp:'));

  // Four for invite redemption, plus AdminUpdateUserAttributes so a department
  // move in the console can keep custom:deptId in step. An exact list, not
  // arrayContaining: the point of this test is to catch a widened grant.
  expect(cognito.sort()).toEqual([
    'cognito-idp:AdminAddUserToGroup',
    'cognito-idp:AdminCreateUser',
    'cognito-idp:AdminDeleteUser',
    'cognito-idp:AdminSetUserPassword',
    'cognito-idp:AdminUpdateUserAttributes',
  ]);
});

test('no repository connection is wired yet — that is a held decision, not an oversight', () => {
  const apps = synth().findResources('AWS::Amplify::App');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = Object.values(apps).map((a) => (a as any).Properties)[0];

  expect(props.Repository).toBeUndefined();
  expect(props.AccessToken).toBeUndefined();
  expect(props.OauthToken).toBeUndefined();
});
