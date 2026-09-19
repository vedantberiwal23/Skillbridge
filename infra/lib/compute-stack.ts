import * as cdk from 'aws-cdk-lib/core';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import {
  APP_NAME,
  MODELS,
  UNDERLYING_MODELS,
  SARVAM_SECRET_ARN,
  SARVAM_SECRET_JSON_KEY,
} from './config';

export interface ComputeStackProps extends cdk.StackProps {
  readonly table: dynamodb.ITable;
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  /** Comma-separated origins the voice socket accepts an upgrade from. */
  readonly allowedOrigins: string;
}

/**
 * Hosting for the voice service, on ECS Express Mode.
 *
 * The voice path needs a persistent process holding WebSocket connections to
 * both the browser and Sarvam's realtime endpoints at once, which fits neither
 * Lambda nor Amplify Hosting compute.
 *
 * It did not fit App Runner either, which is what this originally used and what
 * FEATURES/HANDOFF chose for lower ops overhead. **App Runner does not support
 * WebSockets.** Its Envoy front door answers a valid RFC 6455 upgrade with a
 * bare `403 Forbidden` — `server: envoy`, no `x-envoy-upstream-service-time`,
 * no `x-powered-by` — while ordinary HTTP on the same host reaches Express
 * normally. The request never arrives at the application, so no amount of
 * origin-allowlist or application configuration can fix it. Verified on the
 * deployed service with both curl and a real `ws` client on 2026-09-19.
 *
 * ECS Express Mode is the replacement AWS itself recommends now that App Runner
 * is closed to new customers, and crucially it fronts the service with a real
 * Application Load Balancer, which supports WebSockets natively. Express Mode
 * provisions the ALB, target group, security groups, log group and autoscaling
 * itself, so this stays far closer to App Runner's ops overhead than a
 * hand-built Fargate service would.
 *
 * The container image is unchanged — this was a hosting problem, not an
 * application one.
 */
export class ComputeStack extends cdk.Stack {
  readonly voiceRepo: ecr.Repository;
  readonly voiceServiceRole: iam.Role;
  /** Only present when deployed with `-c voiceImageTag=<tag>`. */
  readonly voiceService?: ecs.CfnExpressGatewayService;

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
      // The TASK role: the identity the running container itself has. Changed
      // from `tasks.apprunner.amazonaws.com` with the move to Express Mode; a
      // stale trust policy fails at task start, not at deploy.
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Runtime role for the voice service container',
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
        // Per-org Knowledge Bases are created by the application at
        // org-provisioning time, so no kbId exists to name here. Account- and
        // region-scoped is as tight as this can be declared; it is not a bare
        // wildcard, and it cannot reach another account's KBs.
        resources: [`arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`],
      })
    );

    props.table.grantReadWriteData(this.voiceServiceRole);

    /**
     * The Express Mode service, created only once an image exists.
     *
     * Gated on CDK context rather than declared unconditionally: the service
     * validates the image, so pointing at a tag that has not been pushed fails
     * the deploy and would leave `skillbridge-compute` permanently undeployable.
     * Keeping it optional means the stack — and the ECR repo and roles the voice
     * track needs in order to push in the first place — can be deployed and
     * tested standalone.
     *
     *   cdk deploy skillbridge-compute -c voiceImageTag=<tag>
     */
    const imageTag = this.node.tryGetContext('voiceImageTag');

    if (imageTag) {
      /**
       * The EXECUTION role: what ECS itself uses to pull the image, write logs
       * and resolve secrets before the container starts. Distinct from the task
       * role above, which is the identity the running container has.
       *
       * The Sarvam grant belongs here, not on the task role — in ECS the agent
       * resolves `secrets` and injects them as environment variables, so the
       * container never calls Secrets Manager itself and the value stays out of
       * the image, the template and this repository. Putting it on the task role
       * instead produces a ResourceInitializationError at task start.
       */
      const executionRole = new iam.Role(this, 'VoiceExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        description: 'Pulls the voice image, writes logs and resolves the Sarvam secret',
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AmazonECSTaskExecutionRolePolicy'
          ),
        ],
      });
      executionRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [SARVAM_SECRET_ARN],
        })
      );

      /**
       * The INFRASTRUCTURE role: what Express Mode assumes to create and manage
       * the ALB, target group, security groups and autoscaling on our behalf.
       * Used only during service create, update and delete — never at runtime.
       */
      const infrastructureRole = new iam.Role(this, 'VoiceInfrastructureRole', {
        assumedBy: new iam.ServicePrincipal('ecs.amazonaws.com'),
        description: 'Lets ECS Express Mode manage the load balancer and scaling',
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AmazonECSInfrastructureRoleforExpressGatewayServices'
          ),
        ],
      });

      this.voiceService = new ecs.CfnExpressGatewayService(this, 'VoiceService', {
        serviceName: `${APP_NAME}-voice`,
        executionRoleArn: executionRole.roleArn,
        infrastructureRoleArn: infrastructureRole.roleArn,
        taskRoleArn: this.voiceServiceRole.roleArn,
        cpu: '1024',
        memory: '2048',
        // Not `/`, which this service does not serve. A health check on a path
        // that 404s never lets a task go healthy and the deployment rolls back.
        healthCheckPath: '/healthz',
        primaryContainer: {
          image: `${this.voiceRepo.repositoryUri}:${imageTag}`,
          containerPort: 3001,
          environment: [
            { name: 'NODE_ENV', value: 'production' },
            { name: 'PORT', value: '3001' },
            // Set explicitly. `config.ts` falls back to a hardcoded region and
            // the SDK would resolve its own, so a mismatch would surface as a
            // Bedrock or DynamoDB error pointing at the wrong region.
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
          // Resolved by the execution role at task start. Never in the
          // environment array above, in the Dockerfile, or in a committed .env.
          // The `:<key>::` suffix selects one field out of the secret's JSON;
          // without it the container receives the whole JSON document.
          secrets: [
            {
              name: 'SARVAM_API_KEY',
              valueFrom: SARVAM_SECRET_JSON_KEY
                ? `${SARVAM_SECRET_ARN}:${SARVAM_SECRET_JSON_KEY}::`
                : SARVAM_SECRET_ARN,
            },
          ],
        },
      });

      new cdk.CfnOutput(this, 'VoiceServiceUrl', {
        value: `wss://${this.voiceService.attrEndpoint}/voice/stream`,
      });
      new cdk.CfnOutput(this, 'VoiceServiceEndpoint', {
        value: this.voiceService.attrEndpoint,
      });
    }

    new cdk.CfnOutput(this, 'VoiceRepoUri', { value: this.voiceRepo.repositoryUri });
  }
}
