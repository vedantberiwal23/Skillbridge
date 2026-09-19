import * as cdk from 'aws-cdk-lib/core';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { APP_NAME, MODELS, UNDERLYING_MODELS } from './config';

export interface ComputeStackProps extends cdk.StackProps {
  readonly table: dynamodb.ITable;
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  /** Comma-separated origins the voice socket accepts an upgrade from. */
  readonly allowedOrigins: string;
}

/**
 * Hosting for the voice service.
 *
 * The voice path needs a persistent process holding WebSocket connections to
 * both the browser and Sarvam's realtime endpoints, which does not fit Lambda or
 * Amplify Hosting — hence App Runner (FEATURES/HANDOFF: chosen over ECS Fargate
 * for lower ops overhead).
 *
 * The App Runner service itself is created in the development session once an
 * image exists in this repository; this stack provides the registry and the
 * runtime role it will assume.
 */
export class ComputeStack extends cdk.Stack {
  readonly voiceRepo: ecr.Repository;
  readonly voiceServiceRole: iam.Role;
  /** Only present when deployed with `-c voiceImageTag=<tag>`. */
  readonly voiceService?: apprunner.CfnService;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    this.voiceRepo = new ecr.Repository(this, 'VoiceServiceRepo', {
      repositoryName: 'skillbridge-voice',
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [{ maxImageCount: 5 }],
    });

    this.voiceServiceRole = new iam.Role(this, 'VoiceServiceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Runtime role for the voice service on App Runner',
    });

    this.voiceServiceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        // Profile ARN plus the underlying foundation models the profile routes to.
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${MODELS.voiceOrchestrator}`,
          ...UNDERLYING_MODELS.map((m) => `arn:aws:bedrock:*::foundation-model/${m}`),
        ],
      })
    );

    this.voiceServiceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:Retrieve'],
        resources: ['*'],
      })
    );

    props.table.grantReadWriteData(this.voiceServiceRole);

    /**
     * The App Runner service, created only once an image exists.
     *
     * Gated on CDK context rather than declared unconditionally: App Runner
     * validates the image at CreateService, so pointing at a tag that has not
     * been pushed fails the deploy and would leave `skillbridge-compute`
     * permanently undeployable. Keeping it optional means the stack — and the
     * ECR repo and roles the voice track needs in order to push in the first
     * place — can be deployed and tested standalone today.
     *
     *   cdk deploy skillbridge-compute -c voiceImageTag=<tag>
     *
     * Note App Runner stopped accepting new customers on 2026-04-30 and this
     * account has never created a service. List/describe calls answer normally,
     * but CreateService is the real eligibility test — if it is refused, switch
     * to ECS Express Mode (BACKEND.md).
     */
    const imageTag = this.node.tryGetContext('voiceImageTag');

    if (imageTag) {
      // App Runner assumes this to pull from a PRIVATE ECR repo. It is separate
      // from the instance role: one fetches the image, the other is what the
      // running container is.
      const ecrAccessRole = new iam.Role(this, 'VoiceEcrAccessRole', {
        assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
        description: 'Lets App Runner pull the voice image from private ECR',
      });
      this.voiceRepo.grantPull(ecrAccessRole);

      this.voiceService = new apprunner.CfnService(this, 'VoiceService', {
        serviceName: `${APP_NAME}-voice`,
        sourceConfiguration: {
          authenticationConfiguration: { accessRoleArn: ecrAccessRole.roleArn },
          // The voice image is built and pushed by the voice track; nothing here
          // should redeploy it implicitly.
          autoDeploymentsEnabled: false,
          imageRepository: {
            imageRepositoryType: 'ECR',
            imageIdentifier: `${this.voiceRepo.repositoryUri}:${imageTag}`,
            imageConfiguration: {
              port: '3001',
              runtimeEnvironmentVariables: [
                { name: 'NODE_ENV', value: 'production' },
                { name: 'PORT', value: '3001' },
                { name: 'AWS_REGION', value: this.region },
                { name: 'APP_TABLE_NAME', value: props.table.tableName },
                { name: 'COGNITO_USER_POOL_ID', value: props.userPoolId },
                { name: 'COGNITO_CLIENT_ID', value: props.userPoolClientId },
                { name: 'ALLOWED_ORIGINS', value: props.allowedOrigins },
                // Must come from MODELS: services/voice/src/config.ts otherwise
                // falls back to a hardcoded profile id while IAM above is pinned
                // to whatever MODELS says, and the drift surfaces as an
                // AccessDenied that reads like a permissions problem.
                { name: 'VOICE_MODEL_ID', value: MODELS.voiceOrchestrator },
              ],
              // SARVAM_API_KEY is injected from Secrets Manager, never from
              // source, apprunner.yaml or this array. Wired when the secret
              // exists — see BACKEND.md.
            },
          },
        },
        instanceConfiguration: {
          cpu: '1 vCPU',
          memory: '2 GB',
          instanceRoleArn: this.voiceServiceRole.roleArn,
        },
        healthCheckConfiguration: { protocol: 'TCP' },
      });

      new cdk.CfnOutput(this, 'VoiceServiceUrl', {
        value: `wss://${this.voiceService.attrServiceUrl}/voice/stream`,
      });
    }

    new cdk.CfnOutput(this, 'VoiceRepoUri', { value: this.voiceRepo.repositoryUri });
  }
}
