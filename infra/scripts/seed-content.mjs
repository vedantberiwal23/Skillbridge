#!/usr/bin/env node
/**
 * Seed one org's Knowledge Base source documents, then kick off ingestion.
 *
 *   node infra/scripts/seed-content.mjs --org-id demo-industrial [--limit 60]
 *
 * Source: `reference/LunchboxSessions-Data/lessons.json`. The LunchBox Sessions
 * developers gave permission to use their content for this hackathon entry
 * (FEATURES.md); it is not licensed for a commercial product. Credit
 * CD Industrial Group Inc. in the demo.
 *
 * Content is filtered to this platform's vertical — industrial hydraulics,
 * electrical and mechanical maintenance — because retrieval quality is better
 * from a focused corpus than a broad one, and because that is the vertical
 * FEATURES.md locks the demo to.
 *
 * Two rules from CLAUDE.md are load-bearing here:
 *   - the S3 key is `org=<orgId>/docs/<docId>/<filename>` and nothing else; that
 *     prefix is what the KB data source is scoped to, and it is the isolation
 *     mechanism
 *   - PutObject names the org's own CMK explicitly. `SSEKMSKeyId` alone is not
 *     honoured without `ServerSideEncryption: aws:kms`, and an unspecified key
 *     silently lands the object under the shared bucket-default key instead
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const AWS =
  process.env.AWS_CLI ??
  'C:/Users/nagwa/AppData/Local/Programs/Amazon/AWSCLIV2/aws.exe';
const PROFILE = process.env.AWS_PROFILE ?? 'skillbridge';
const REGION = 'ap-northeast-1';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const orgId = arg('org-id');
const limit = Number(arg('limit', '60'));
if (!orgId) {
  console.error('usage: --org-id <slug> [--limit N]');
  process.exit(1);
}

function aws(args, { json = true, allowFail = false } = {}) {
  try {
    const out = execFileSync(AWS, [...args, '--profile', PROFILE, '--region', REGION], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return json ? (out.trim() ? JSON.parse(out) : null) : out.trim();
  } catch (e) {
    if (allowFail) return null;
    console.error(e.stderr?.toString() ?? e.message);
    throw e;
  }
}

const stackOutput = (stack, key) =>
  aws(['cloudformation', 'describe-stacks', '--stack-name', stack])
    .Stacks[0].Outputs.find((o) => o.OutputKey === key).OutputValue;

const TABLE = stackOutput('skillbridge-data', 'TableName');
const BUCKET = stackOutput('skillbridge-data', 'OrgDocsBucketName');

const org = aws([
  'dynamodb', 'get-item',
  '--table-name', TABLE,
  '--key', JSON.stringify({ PK: { S: `ORG#${orgId}` }, SK: { S: 'META' } }),
]);
if (!org?.Item?.kbId) {
  console.error(`org ${orgId} has no kbId — run provision-org.mjs first`);
  process.exit(1);
}
const kbId = org.Item.kbId.S;
const dataSourceId = org.Item.dataSourceId.S;
const orgKeyArn = org.Item.kmsKeyArn.S;

/* ── select the corpus ─────────────────────────────────────────────────────── */

const VERTICAL = /hydraulic|electric|motor|pump|valve|cylinder|relay|circuit|schematic|plc|ladder|contactor|solenoid|bearing|seal|filter|actuator|troubleshoot|lockout|safety|pressure|flow/i;

const lessons = JSON.parse(
  readFileSync(join(REPO, 'reference', 'LunchboxSessions-Data', 'lessons.json'), 'utf8')
);

/** `complete_instructional_content` is an array of {tag,text}; flatten to prose. */
function toDocument(lesson) {
  const blocks = Array.isArray(lesson.complete_instructional_content)
    ? lesson.complete_instructional_content
    : [];
  const body = blocks
    .filter((b) => b && typeof b.text === 'string' && b.text.trim())
    .map((b) => (/^h[1-6]$/.test(b.tag) ? `\n## ${b.text.trim()}\n` : b.text.trim()))
    .join('\n');

  const objectives = Array.isArray(lesson.learning_objectives) && lesson.learning_objectives.length
    ? `\n## Learning objectives\n${lesson.learning_objectives.map((o) => `- ${o}`).join('\n')}\n`
    : '';
  const terms = Array.isArray(lesson.terminology) && lesson.terminology.length
    ? `\n## Terminology\n${lesson.terminology
        .map((t) => (typeof t === 'string' ? `- ${t}` : `- ${t.term ?? ''}: ${t.definition ?? ''}`))
        .join('\n')}\n`
    : '';

  return [
    `# ${lesson.title ?? lesson.slug}`,
    lesson.subtitle ? `\n${lesson.subtitle}\n` : '',
    objectives,
    body,
    terms,
    `\n---\nSource: LunchBox Sessions, © CD Industrial Group Inc. Used with permission for the First Commit Hackathon.`,
  ].join('\n');
}

const selected = lessons
  .filter((l) => {
    const hay = `${l.title ?? ''} ${l.slug ?? ''} ${l.parent_session ?? ''}`;
    if (!VERTICAL.test(hay)) return false;
    const blocks = l.complete_instructional_content;
    // A title with no body embeds to noise and pollutes retrieval.
    return Array.isArray(blocks) && blocks.length >= 3;
  })
  .slice(0, limit);

console.log(`selected ${selected.length} of ${lessons.length} lessons for org ${orgId}`);

/* ── upload, each under this org's prefix and this org's key ───────────────── */

const staging = mkdtempSync(join(tmpdir(), 'skillbridge-seed-'));
let uploaded = 0;

try {
  for (const lesson of selected) {
    const docId = String(lesson.slug ?? lesson.id).replace(/[^a-z0-9-]/gi, '-').slice(0, 80);
    const filename = `${docId}.txt`;
    const local = join(staging, filename);
    writeFileSync(local, toDocument(lesson), 'utf8');

    aws([
      's3api', 'put-object',
      '--bucket', BUCKET,
      '--key', `org=${orgId}/docs/${docId}/${filename}`,
      '--body', local,
      // Both are required. SSEKMSKeyId alone is ignored and the object lands
      // under the bucket's default (shared) key.
      '--server-side-encryption', 'aws:kms',
      '--ssekms-key-id', orgKeyArn,
      '--content-type', 'text/plain; charset=utf-8',
    ], { json: false });

    aws([
      'dynamodb', 'put-item',
      '--table-name', TABLE,
      '--item', JSON.stringify({
        PK: { S: `ORG#${orgId}` },
        SK: { S: `DOC#${docId}` },
        orgId: { S: orgId },
        docId: { S: docId },
        title: { S: String(lesson.title ?? docId).slice(0, 200) },
        s3Key: { S: `org=${orgId}/docs/${docId}/${filename}` },
        source: { S: 'lunchbox-sessions' },
        // FEATURES.md §4: managers are prompted to re-verify uploaded material.
        // Imported content starts unverified rather than silently trusted.
        verified: { BOOL: false },
      }),
    ], { json: false });

    uploaded += 1;
    if (uploaded % 10 === 0) process.stdout.write(`  uploaded ${uploaded}\r`);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}

console.log(`  uploaded ${uploaded} documents to org=${orgId}/docs/`);

/* ── a lesson and an assessment, so the plan generator has a catalogue ─────── */
/**
 * The learning plan generator builds a plan by choosing from the org's REAL
 * lesson catalogue and refuses to invent a lessonId, so an org with no lessons
 * produces no plan. These two are the minimum for the demo spine to run end to
 * end; they live here rather than being created by hand so a teardown is
 * reproducible.
 *
 * `kind` is one of the three in the AssessmentKind union and nothing else —
 * there is deliberately no generic multiple-choice fallback.
 */
const seedItems = [
  {
    PK: { S: `ORG#${orgId}` }, SK: { S: 'LESSON#dcv-intro' },
    orgId: { S: orgId }, lessonId: { S: 'dcv-intro' },
    title: { S: 'Intro to Directional Control Valves' },
    body: { S: 'A directional control valve routes fluid to actuators and sets the direction of travel.' },
    assetId: { NULL: true },
  },
  {
    PK: { S: `ORG#${orgId}` }, SK: { S: 'ASMT#diag-cylinder-drift' },
    orgId: { S: orgId }, assessmentId: { S: 'diag-cylinder-drift' },
    kind: { S: 'diagnose-by-voice' },
    title: { S: 'Diagnose: cylinder drifts under load' },
    lessonId: { S: 'dcv-intro' },
  },
];

for (const Item of seedItems) {
  aws(['dynamodb', 'put-item', '--table-name', TABLE, '--item', JSON.stringify(Item)], { json: false });
}
console.log(`  seeded ${seedItems.length} catalogue items (1 lesson, 1 assessment)`);

/* ── ingest ────────────────────────────────────────────────────────────────── */

const job = aws([
  'bedrock-agent', 'start-ingestion-job',
  '--knowledge-base-id', kbId,
  '--data-source-id', dataSourceId,
]);
const jobId = job.ingestionJob.ingestionJobId;
console.log(`  started ingestion job ${jobId}`);

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const status = aws([
    'bedrock-agent', 'get-ingestion-job',
    '--knowledge-base-id', kbId,
    '--data-source-id', dataSourceId,
    '--ingestion-job-id', jobId,
  ]).ingestionJob;
  process.stdout.write(`  ${status.status}\r`);
  if (['COMPLETE', 'FAILED', 'STOPPED'].includes(status.status)) {
    console.log(`\n  ingestion ${status.status}`);
    if (status.statistics) console.log('  ', JSON.stringify(status.statistics));
    if (status.failureReasons?.length) console.log('  failures:', status.failureReasons.slice(0, 3));
    process.exitCode = status.status === 'COMPLETE' ? 0 : 1;
    break;
  }
}
