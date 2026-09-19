import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { DynamoEventSource, SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { APP_NAME, EMBEDDING_MODELS, MODELS, UNDERLYING_MODELS, VECTOR_BUCKET } from './config';

export interface AiStackProps extends cdk.StackProps {
  readonly table: dynamodb.ITable;
  readonly orgDocsBucket: s3.IBucket;
}

/**
 * The four agents (FEATURES.md §13), each with its own IAM role so that no agent
 * can reach another's resources. Workflows are never merged: only the voice tutor
 * orchestrator is synchronous, everything else is queue- or stream-driven, so
 * batch work can never bottleneck a live voice turn.
 *
 * NOT DEFINED HERE — left for the development session:
 *   - Bedrock Knowledge Base + its vector store (one KB per org, created at
 *     org-provisioning time against that org's `org=<orgId>/docs/` S3 prefix)
 *   - AgentCore Gateway + Identity, and the Cedar policy store
 *   - The Strands agent definitions themselves
 */
export class AiStack extends cdk.Stack {
  readonly voiceOrchestratorRole: iam.Role;
  readonly learningPlanRole: iam.Role;
  readonly assessmentScorerRole: iam.Role;
  readonly skillProfilerRole: iam.Role;
  /** Shared by every per-org Knowledge Base; see the comment at its creation. */
  readonly knowledgeBaseRole: iam.Role;
  /** A route enqueues here after writing a pending attempt. */
  readonly assessmentScorerQueue: sqs.Queue;
  /** A route enqueues here after writing a pending plan. */
  readonly learningPlanQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: AiStackProps) {
    super(scope, id, props);

    // An inference profile needs invoke permission on the profile AND on the
    // underlying foundation model in every region the profile may route to.
    // Granting only the profile ARN fails at call time with AccessDenied.
    const bedrockInvoke = (profileId: string) =>
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${profileId}`,
          ...UNDERLYING_MODELS.map((m) => `arn:aws:bedrock:*::foundation-model/${m}`),
        ],
      });

    const agentRole = (name: string, modelId: string) => {
      const role = new iam.Role(this, `${name}Role`, {
        assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
        description: `Isolated execution role for the ${name} agent`,
      });
      role.addToPolicy(bedrockInvoke(modelId));
      return role;
    };

    this.voiceOrchestratorRole = agentRole('VoiceOrchestrator', MODELS.voiceOrchestrator);
    this.learningPlanRole = agentRole('LearningPlanGenerator', MODELS.learningPlanGenerator);
    this.assessmentScorerRole = agentRole('AssessmentScorer', MODELS.assessmentScorer);
    this.skillProfilerRole = agentRole('SkillProfiler', MODELS.skillProfiler);

    /**
     * The role every per-org Knowledge Base assumes during ingestion.
     *
     * Shared on purpose. The per-org KB, its vector index, its CMK and its
     * prefix-scoped data source are all created per tenant by
     * `infra/scripts/provision-org.mjs`, because putting them in CDK would make
     * onboarding a customer require a deploy. The *role* is different: it exists
     * before any tenant does, which is exactly what this stack is for. Creating
     * one role per org would instead require handing the provisioning identity
     * `iam:CreateRole`, and that identity deliberately holds no IAM write at all
     * so that it cannot escalate itself.
     *
     * Isolation does not rest on this role. It rests on each data source's
     * `inclusionPrefixes`, scoped to `org=<orgId>/docs/` — a KB ingests only the
     * prefix it was pointed at, so a shared reader cannot mix tenants.
     */
    this.knowledgeBaseRole = new iam.Role(this, 'KnowledgeBaseRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
        // Confused-deputy guards: assumable only on behalf of this account, and
        // only for a Bedrock knowledge base in it.
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: {
            'aws:SourceArn': `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`,
          },
        },
      }),
      description: 'Ingestion role assumed by every per-org Bedrock Knowledge Base',
    });

    this.knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EmbedDocuments',
        actions: ['bedrock:InvokeModel'],
        // Both embedders, so swapping to the multilingual one later is a
        // provisioning change rather than a stack redeploy.
        resources: EMBEDDING_MODELS.map(
          (m) => `arn:aws:bedrock:${this.region}::foundation-model/${m}`
        ),
      })
    );

    // Only under `org=`, and only documents. Never the bucket root.
    props.orgDocsBucket.grantRead(this.knowledgeBaseRole, 'org=*/docs/*');

    this.knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DecryptPerOrgKeys',
        actions: ['kms:Decrypt', 'kms:DescribeKey'],
        resources: ['*'],
        // Per-org CMKs are created by the provisioning script and tagged. The
        // tag is what keeps this from being account-wide KMS access.
        conditions: { StringEquals: { 'aws:ResourceTag/Project': APP_NAME } },
      })
    );

    this.knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WriteOrgVectors',
        actions: [
          's3vectors:PutVectors',
          's3vectors:GetVectors',
          's3vectors:QueryVectors',
          's3vectors:DeleteVectors',
          's3vectors:ListVectors',
          's3vectors:GetIndex',
        ],
        // S3 Vectors rather than OpenSearch Serverless: aoss idles at roughly
        // USD 175/month, which alone exceeds the entire hackathon budget.
        resources: [
          `arn:aws:s3vectors:${this.region}:${this.account}:bucket/${VECTOR_BUCKET}/index/*`,
        ],
      })
    );

    new cdk.CfnOutput(this, 'KnowledgeBaseRoleArn', {
      value: this.knowledgeBaseRole.roleArn,
    });

    props.table.grantReadData(this.voiceOrchestratorRole);
    props.table.grantReadWriteData(this.learningPlanRole);
    props.table.grantReadWriteData(this.assessmentScorerRole);
    props.table.grantReadWriteData(this.skillProfilerRole);
    props.orgDocsBucket.grantRead(this.learningPlanRole);

    /* ── skill profiler pipeline: stream → queue → worker ──────────────────────
       Debounced through a queue rather than invoked per stream record: a worker
       generates many events per session and the profile only needs to be
       recomputed periodically. Nothing in this chain is on a request path. */

    const profilerDlq = new sqs.Queue(this, 'SkillProfilerDlq', {
      retentionPeriod: cdk.Duration.days(14),
    });

    const profilerQueue = new sqs.Queue(this, 'SkillProfilerQueue', {
      visibilityTimeout: cdk.Duration.minutes(6),
      deadLetterQueue: { queue: profilerDlq, maxReceiveCount: 3 },
    });

    const lambdaSrc = path.join(__dirname, '..', 'lambda');

    /**
     * Bundle the AWS SDK rather than take the runtime's copy.
     *
     * CDK's default marks `@aws-sdk/*` external, on the assumption the managed
     * runtime provides it. The Node.js runtime documentation promises only "a
     * specific minor version of the AWS SDK for JavaScript v3" and never
     * enumerates the packages, so whether `@aws-sdk/lib-dynamodb` is present is
     * undocumented — and if it is not, the function fails at import with no
     * warning until it runs. Bundling costs a larger artifact and a slower cold
     * start, neither of which matters on a stream/queue-driven background path,
     * and it pins the SDK version to the one this repo was built against.
     */
    const bundling = { externalModules: [] };

    const streamFanout = new NodejsFunction(this, 'EventStreamFanout', {
      entry: path.join(lambdaSrc, 'event-stream-fanout', 'index.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      bundling,
      environment: { QUEUE_URL: profilerQueue.queueUrl },
      description: 'Filters EVT# stream records and enqueues profiling work',
    });

    streamFanout.addEventSource(
      new DynamoEventSource(props.table, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 100,
        maxBatchingWindow: cdk.Duration.minutes(1),
        retryAttempts: 2,
        // Without this, a partial-batch response from the handler is ignored and
        // one poison record replays the whole batch.
        reportBatchItemFailures: true,
      })
    );
    profilerQueue.grantSendMessages(streamFanout);

    const skillProfiler = new NodejsFunction(this, 'SkillProfilerWorker', {
      entry: path.join(lambdaSrc, 'skill-profiler', 'index.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(5),
      bundling,
      environment: {
        TABLE_NAME: props.table.tableName,
        MODEL_ID: MODELS.skillProfiler,
      },
      description:
        'Derives the worker skill profile and updates materialized department aggregates',
    });

    skillProfiler.addEventSource(
      new SqsEventSource(profilerQueue, { batchSize: 10, reportBatchItemFailures: true })
    );
    props.table.grantReadWriteData(skillProfiler);
    skillProfiler.addToRolePolicy(bedrockInvoke(MODELS.skillProfiler));

    /* ── the two on-demand agents ──────────────────────────────────────────────
       Both are triggered by a request but must not hold one open (CLAUDE.md):
       the route writes a pending item, enqueues, and returns; the client
       re-fetches. A queue each, never a shared one — FEATURES.md §13 keeps one
       flow per agent so no agent can reach another's work. */

    const agentWorker = (
      name: string,
      entry: string,
      modelId: string,
      timeout: cdk.Duration
    ) => {
      const dlq = new sqs.Queue(this, `${name}Dlq`, {
        retentionPeriod: cdk.Duration.days(14),
      });
      const queue = new sqs.Queue(this, `${name}Queue`, {
        // Must exceed the worker timeout or a slow run is redelivered while it
        // is still going, and the model is billed twice for one job.
        visibilityTimeout: cdk.Duration.seconds(timeout.toSeconds() + 60),
        deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
      });

      const fn = new NodejsFunction(this, `${name}Worker`, {
        entry: path.join(lambdaSrc, entry, 'index.ts'),
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout,
        bundling,
        environment: { TABLE_NAME: props.table.tableName, MODEL_ID: modelId },
        description: `${name} agent — async tier, queue-driven`,
      });

      fn.addEventSource(
        new SqsEventSource(queue, { batchSize: 5, reportBatchItemFailures: true })
      );
      props.table.grantReadWriteData(fn);
      fn.addToRolePolicy(bedrockInvoke(modelId));

      return queue;
    };

    this.assessmentScorerQueue = agentWorker(
      'AssessmentScorer',
      'assessment-scorer',
      MODELS.assessmentScorer,
      cdk.Duration.minutes(2)
    );

    this.learningPlanQueue = agentWorker(
      'LearningPlanGenerator',
      'learning-plan-generator',
      MODELS.learningPlanGenerator,
      cdk.Duration.minutes(3)
    );

    new cdk.CfnOutput(this, 'SkillProfilerQueueUrl', { value: profilerQueue.queueUrl });
    new cdk.CfnOutput(this, 'AssessmentScorerQueueUrl', {
      value: this.assessmentScorerQueue.queueUrl,
    });
    new cdk.CfnOutput(this, 'LearningPlanQueueUrl', {
      value: this.learningPlanQueue.queueUrl,
    });
  }
}
