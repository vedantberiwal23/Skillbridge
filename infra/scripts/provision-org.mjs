#!/usr/bin/env node
/**
 * Provision one organization. This is work order item 5b — the producer side of
 * the Knowledge Base, whose consumer (`services/voice/src/voice/grounding.ts`)
 * is already built and waiting for a `kbId`.
 *
 *   node infra/scripts/provision-org.mjs --org-id acme --name "Acme Industrial"
 *
 * Deliberately a script and not CDK. CLAUDE.md: per-org KMS keys, Knowledge
 * Bases and their `org=<orgId>/docs/` data sources are created by the
 * application at org-provisioning time, because putting them in a stack would
 * make onboarding a customer require a `cdk deploy` and grow the template once
 * per tenant. It is committed rather than clicked so a teardown is reproducible.
 *
 * What it creates, in dependency order:
 *   1. a per-org KMS CMK, tagged Project=skillbridge
 *   2. an S3 Vectors index in the shared vector bucket  (no idle cost, unlike
 *      OpenSearch Serverless, which alone would exceed the whole budget)
 *   3. an IAM role the Knowledge Base assumes
 *   4. the Knowledge Base itself, backed by that index
 *   5. a data source scoped by `inclusionPrefixes` to org=<orgId>/docs/ ONLY —
 *      this prefix is the isolation mechanism, not a retrieval-time filter
 *   6. ORG#<orgId> / META carrying `kbId`, and / SUB carrying entitlements
 *
 * Re-running is safe: every step checks for an existing resource first.
 */
import { execFileSync } from 'node:child_process';

const AWS =
  process.env.AWS_CLI ??
  'C:/Users/nagwa/AppData/Local/Programs/Amazon/AWSCLIV2/aws.exe';
const PROFILE = process.env.AWS_PROFILE ?? 'skillbridge';
const REGION = 'ap-northeast-1';

// Keep in step with EMBEDDING_MODEL in infra/lib/config.ts.
const EMBEDDING_MODEL = 'cohere.embed-multilingual-v3';
const EMBEDDING_DIMENSIONS = 1024;
const VECTOR_BUCKET = 'skillbridge-vectors';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const orgId = arg('org-id');
const orgName = arg('name', orgId);
if (!orgId || !/^[a-z0-9-]+$/.test(orgId)) {
  console.error('usage: --org-id <lowercase-slug> [--name "Display Name"]');
  process.exit(1);
}

function aws(args, { json = true, allowFail = false } = {}) {
  try {
    const out = execFileSync(AWS, [...args, '--profile', PROFILE, '--region', REGION], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return json ? (out.trim() ? JSON.parse(out) : null) : out.trim();
  } catch (e) {
    if (allowFail) return null;
    console.error(e.stderr?.toString() ?? e.message);
    throw e;
  }
}

const stackOutput = (stack, key) => {
  const res = aws(['cloudformation', 'describe-stacks', '--stack-name', stack]);
  const o = res.Stacks[0].Outputs.find((x) => x.OutputKey === key);
  if (!o) throw new Error(`${stack} has no output ${key}`);
  return o.OutputValue;
};

const ACCOUNT = aws(['sts', 'get-caller-identity']).Account;
const TABLE = stackOutput('skillbridge-data', 'TableName');
const DOCS_BUCKET = stackOutput('skillbridge-data', 'OrgDocsBucketName');
const DOCS_PREFIX = `org=${orgId}/docs/`;

console.log(`provisioning org "${orgId}" in ${ACCOUNT}/${REGION}`);

/* 1 ─ per-org CMK ─────────────────────────────────────────────────────────── */
const ALIAS = `alias/skillbridge-org-${orgId}`;
let keyArn = aws(['kms', 'describe-key', '--key-id', ALIAS], { allowFail: true })
  ?.KeyMetadata?.Arn;

if (!keyArn) {
  keyArn = aws([
    'kms', 'create-key',
    '--description', `SkillBridge per-org CMK for ${orgId}`,
    '--key-spec', 'SYMMETRIC_DEFAULT',
    '--key-usage', 'ENCRYPT_DECRYPT',
    '--origin', 'AWS_KMS',
    // The tag is what our IAM policy conditions on. Without it the key exists
    // but this identity cannot administer it.
    '--tags', `TagKey=Project,TagValue=skillbridge`,
  ]).KeyMetadata.Arn;
  aws(['kms', 'create-alias', '--alias-name', ALIAS, '--target-key-id', keyArn]);
  console.log(`  created CMK ${ALIAS}`);
  // KMS tag and alias changes take up to five minutes to affect authorization.
  console.log('  (tag propagation can take up to 5 minutes)');
} else {
  console.log(`  CMK ${ALIAS} exists`);
}

/* 2 ─ S3 Vectors bucket + per-org index ───────────────────────────────────── */
let vectorBucketArn = aws(
  ['s3vectors', 'get-vector-bucket', '--vector-bucket-name', VECTOR_BUCKET],
  { allowFail: true }
)?.vectorBucket?.vectorBucketArn;

if (!vectorBucketArn) {
  aws(['s3vectors', 'create-vector-bucket', '--vector-bucket-name', VECTOR_BUCKET]);
  vectorBucketArn = aws([
    's3vectors', 'get-vector-bucket', '--vector-bucket-name', VECTOR_BUCKET,
  ]).vectorBucket.vectorBucketArn;
  console.log(`  created vector bucket ${VECTOR_BUCKET}`);
}

const indexName = `org-${orgId}`;
let indexArn = aws(
  ['s3vectors', 'get-index', '--vector-bucket-name', VECTOR_BUCKET, '--index-name', indexName],
  { allowFail: true }
)?.index?.indexArn;

if (!indexArn) {
  aws([
    's3vectors', 'create-index',
    '--vector-bucket-name', VECTOR_BUCKET,
    '--index-name', indexName,
    '--data-type', 'float32',
    '--dimension', String(EMBEDDING_DIMENSIONS),
    '--distance-metric', 'cosine',
    // Bedrock stores each chunk's text as metadata on the vector, and S3 Vectors
    // caps FILTERABLE metadata at 2048 bytes. Without this, ingestion reports
    // COMPLETE while silently failing almost every document with
    // "Filterable metadata must have at most 2048 bytes".
    '--metadata-configuration', JSON.stringify({
      // All of Bedrock's reserved keys. The one that actually holds the chunk
      // text is AMAZON_BEDROCK_TEXT on current versions (older docs and many
      // examples say AMAZON_BEDROCK_TEXT_CHUNK), and naming the wrong one makes
      // ingestion report COMPLETE while failing every document larger than
      // 2048 bytes. Listing a key that does not exist is harmless.
      nonFilterableMetadataKeys: [
        'AMAZON_BEDROCK_TEXT',
        'AMAZON_BEDROCK_TEXT_CHUNK',
        'AMAZON_BEDROCK_METADATA',
      ],
    }),
  ]);
  indexArn = aws([
    's3vectors', 'get-index',
    '--vector-bucket-name', VECTOR_BUCKET, '--index-name', indexName,
  ]).index.indexArn;
  console.log(`  created vector index ${indexName}`);
}

/* 3 ─ the shared Knowledge Base role (from skillbridge-ai) ───────────────── */
/**
 * Not created here. One role is shared by every per-org KB and lives in CDK,
 * because it exists before any tenant does. Creating a role per org would need
 * `iam:CreateRole` on the provisioning identity, and that identity deliberately
 * holds no IAM write so it cannot escalate itself.
 *
 * Isolation is unaffected: it comes from each data source's `inclusionPrefixes`
 * below, not from the reader's identity.
 */
const roleArn = stackOutput('skillbridge-ai', 'KnowledgeBaseRoleArn');
console.log(`  using shared KB role ${roleArn.split('/').pop()}`);

/* 4 ─ the Knowledge Base ──────────────────────────────────────────────────── */
const kbName = `skillbridge-${orgId}`;
const existing = (aws(['bedrock-agent', 'list-knowledge-bases'])?.knowledgeBaseSummaries ?? [])
  .find((k) => k.name === kbName);

let kbId = existing?.knowledgeBaseId;
if (!kbId) {
  kbId = aws([
    'bedrock-agent', 'create-knowledge-base',
    '--name', kbName,
    '--description', `Private SOPs for ${orgName}`,
    '--role-arn', roleArn,
    '--knowledge-base-configuration', JSON.stringify({
      type: 'VECTOR',
      vectorKnowledgeBaseConfiguration: {
        embeddingModelArn: `arn:aws:bedrock:${REGION}::foundation-model/${EMBEDDING_MODEL}`,
        // Only sent for models that actually accept it. Cohere's embedders have a
        // fixed width and reject the block outright:
        //   "does not support configurable dimensions"
        // Titan v2 does accept it (256/512/1024). Either way the vector index is
        // created at EMBEDDING_DIMENSIONS and the two must agree.
        ...(EMBEDDING_MODEL.startsWith('amazon.titan-embed')
          ? {
              embeddingModelConfiguration: {
                bedrockEmbeddingModelConfiguration: {
                  dimensions: EMBEDDING_DIMENSIONS,
                  embeddingDataType: 'FLOAT32',
                },
              },
            }
          : {}),
      },
    }),
    '--storage-configuration', JSON.stringify({
      type: 'S3_VECTORS',
      // indexArn alone. Supplying vectorBucketArn/indexName alongside it is
      // rejected: "Vector index name should not be present with namespace arn."
      s3VectorsConfiguration: { indexArn },
    }),
  ]).knowledgeBase.knowledgeBaseId;
  console.log(`  created knowledge base ${kbId}`);
} else {
  console.log(`  knowledge base ${kbId} exists`);
}

/* 5 ─ the data source, scoped to this org's prefix and nothing else ───────── */
const sources = aws(['bedrock-agent', 'list-data-sources', '--knowledge-base-id', kbId])
  ?.dataSourceSummaries ?? [];

let dataSourceId = sources.find((d) => d.name === `org-${orgId}-docs`)?.dataSourceId;
if (!dataSourceId) {
  dataSourceId = aws([
    'bedrock-agent', 'create-data-source',
    '--knowledge-base-id', kbId,
    '--name', `org-${orgId}-docs`,
    '--data-source-configuration', JSON.stringify({
      type: 'S3',
      s3Configuration: {
        bucketArn: `arn:aws:s3:::${DOCS_BUCKET}`,
        // THE isolation mechanism. Never the bucket root, never bare `org=`.
        inclusionPrefixes: [DOCS_PREFIX],
      },
    }),
    // Chunking must be explicit. Without it a whole lesson becomes one vector,
    // its text exceeds S3 Vectors' 2048-byte metadata limit, and ingestion
    // reports COMPLETE while failing nearly every document. Smaller chunks also
    // retrieve better: the tutor wants the paragraph about one component, not a
    // whole lesson.
    '--vector-ingestion-configuration', JSON.stringify({
      chunkingConfiguration: {
        chunkingStrategy: 'FIXED_SIZE',
        fixedSizeChunkingConfiguration: { maxTokens: 300, overlapPercentage: 10 },
      },
    }),
  ]).dataSource.dataSourceId;
  console.log(`  created data source ${dataSourceId} scoped to ${DOCS_PREFIX}`);
} else {
  console.log(`  data source ${dataSourceId} exists`);
}

/* 6 ─ the org records the app reads ───────────────────────────────────────── */
const now = new Date().toISOString();
aws([
  'dynamodb', 'put-item',
  '--table-name', TABLE,
  '--item', JSON.stringify({
    PK: { S: `ORG#${orgId}` },
    SK: { S: 'META' },
    orgId: { S: orgId },
    name: { S: orgName },
    // grounding.ts reads exactly this attribute, off the turn's critical path.
    kbId: { S: kbId },
    dataSourceId: { S: dataSourceId },
    kmsKeyArn: { S: keyArn },
    // Bumping this invalidates every cached RAG answer for the org without a
    // purge path, which is the documented invalidation mechanism.
    kbVersion: { S: '1' },
    createdAt: { S: now },
  }),
], { json: false });

aws([
  'dynamodb', 'put-item',
  '--table-name', TABLE,
  '--item', JSON.stringify({
    PK: { S: `ORG#${orgId}` },
    SK: { S: 'SUB' },
    orgId: { S: orgId },
    tier: { S: 'paid' },
    // Free vs paid is an entitlement value read at the point of use, never a
    // structural branch. `certificates` exists as a field and stays false.
    entitlements: { M: { certificates: { BOOL: false }, seats: { N: '50' } } },
  }),
], { json: false });

console.log(`  wrote ORG#${orgId} / META and / SUB`);
console.log('');
console.log('done. next:');
console.log(`  1. upload SOPs:  node infra/scripts/seed-content.mjs --org-id ${orgId}`);
console.log(`  2. ingest:       aws bedrock-agent start-ingestion-job \\`);
console.log(`       --knowledge-base-id ${kbId} --data-source-id ${dataSourceId} \\`);
console.log(`       --profile ${PROFILE} --region ${REGION}`);
