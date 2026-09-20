/**
 * The SOP retrieval chain, end to end, with nothing about it stubbed.
 *
 * `voice.test.ts` passes a fake grounder, which proves the turn USES whatever it
 * is handed. This file proves the real thing: the module under test makes real
 * SDK calls — a DynamoDB `GetItem` for the org's `kbId`, then a Bedrock
 * `Retrieve` against that knowledge base — to local servers standing in for AWS.
 *
 * Worth pinning down because every failure here is silent by design: grounding
 * that breaks does not raise, it just answers from general knowledge, and the
 * product's claim is that answers come from the employer's own SOPs.
 *
 * DynamoDB is served over HTTP/1.1 and Bedrock agent runtime over HTTP/2 —
 * that client speaks h2, and an h1 server fails it with "Protocol error".
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createServer as createH2, type Http2Server } from 'node:http2';
import type { AddressInfo } from 'node:net';

interface DdbCall {
  TableName?: string;
  Key?: Record<string, { S?: string }>;
  ProjectionExpression?: string;
}
interface RetrieveCall {
  url: string;
  body: { retrievalQuery?: { text?: string }; retrievalConfiguration?: unknown };
}

const ddbCalls: DdbCall[] = [];
const retrieveCalls: RetrieveCall[] = [];

/** `kbId` as `provision-org.mjs` writes it onto ORG#<orgId> / META. */
const KB_FOR_ORG: Record<string, string | null> = {
  'org-acme': 'KB-ACME-01',
  // Provisioned, but no knowledge base yet: the attribute is simply absent.
  'org-nokb': null,
  'org-broken': 'KB-BROKEN-01',
};

const SOP_TEXT =
  'SOP-HYD-042: The relief valve must be set to 210 bar. Torque the locknut to 35 Nm.';

let ddb: Server;
let kb: Http2Server;
let grounding: typeof import('../src/voice/grounding.js');

before(async () => {
  ddb = createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const parsed = JSON.parse(body) as DdbCall;
    ddbCalls.push(parsed);
    const orgId = (parsed.Key?.PK?.S ?? '').replace('ORG#', '');
    const kbId = KB_FOR_ORG[orgId];
    res.writeHead(200, { 'content-type': 'application/x-amz-json-1.0' });
    res.end(JSON.stringify(kbId ? { Item: { kbId: { S: kbId } } } : { Item: {} }));
  });
  await new Promise<void>((r) => ddb.listen(0, '127.0.0.1', r));

  kb = createH2(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const url = req.url ?? '';
    retrieveCalls.push({ url, body: JSON.parse(body) });
    if (url.includes('KB-BROKEN-01')) {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ message: 'internal failure' }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ retrievalResults: [{ content: { text: SOP_TEXT }, score: 0.9 }] }));
  });
  await new Promise<void>((r) => kb.listen(0, '127.0.0.1', r));

  Object.assign(process.env, {
    NODE_ENV: 'development',
    AWS_REGION: 'ap-northeast-1',
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
    AWS_ENDPOINT_URL_DYNAMODB: `http://127.0.0.1:${(ddb.address() as AddressInfo).port}`,
    AWS_ENDPOINT_URL_BEDROCK_AGENT_RUNTIME: `http://127.0.0.1:${(kb.address() as AddressInfo).port}`,
    APP_TABLE_NAME: 'skillbridge-app-table',
    SARVAM_API_KEY: 'test-key',
    COGNITO_USER_POOL_ID: 'ap-northeast-1_testpool',
    COGNITO_CLIENT_ID: 'testclient',
    ALLOWED_ORIGINS: 'https://app.example',
  });
  // After the env: config.ts and both SDK clients read it at module load.
  grounding = await import('../src/voice/grounding.js');
});

after(() => {
  ddb.close();
  kb.close();
  setTimeout(() => process.exit(0), 50).unref();
});

test("the org's own knowledge base is found and queried", async () => {
  ddbCalls.length = 0;
  retrieveCalls.length = 0;

  const sources = await grounding.grounderFor('org-acme')('relief valve ka pressure setting?');

  // The kbId is read from this org's META item, and only that attribute.
  const lookup = ddbCalls.at(-1)!;
  assert.equal(lookup.TableName, 'skillbridge-app-table');
  assert.equal(lookup.Key?.PK?.S, 'ORG#org-acme');
  assert.equal(lookup.Key?.SK?.S, 'META');
  assert.equal(lookup.ProjectionExpression, 'kbId');

  // Retrieval goes to THAT knowledge base, carrying the worker's question.
  assert.equal(retrieveCalls.length, 1);
  assert.match(retrieveCalls[0]!.url, /\/knowledgebases\/KB-ACME-01\/retrieve/);
  assert.equal(retrieveCalls[0]!.body.retrievalQuery?.text, 'relief valve ka pressure setting?');

  // And the SOP text comes back for the prompt.
  assert.equal(sources, SOP_TEXT);
});

test('a question is retrieved once per channel, not once per generation', async () => {
  retrieveCalls.length = 0;
  const ground = grounding.grounderFor('org-acme');
  // A turn asks twice: the speculative start, then the restart at release.
  const [a, b] = await Promise.all([ground('same question'), ground('same question')]);
  assert.equal(a, SOP_TEXT);
  assert.equal(b, SOP_TEXT);
  assert.equal(retrieveCalls.length, 1, 'the second ask must reuse the first lookup');
});

test('an org with no knowledge base answers ungrounded rather than failing', async () => {
  retrieveCalls.length = 0;
  const sources = await grounding.grounderFor('org-nokb')('anything');
  assert.equal(sources, null);
  assert.equal(retrieveCalls.length, 0, 'nothing to retrieve from, so nothing is called');
});

test('a knowledge base that errors degrades to ungrounded, and never throws', async () => {
  retrieveCalls.length = 0;
  const sources = await grounding.grounderFor('org-broken')('anything');
  assert.equal(sources, null);
  // It did try — and the SDK retried the 5xx on its own (3 attempts by
  // default). Those retries share the module's 1.5s budget, so a knowledge
  // base that is down costs the worker a less specific answer, never silence.
  assert.ok(retrieveCalls.length >= 1, 'it did try');
  assert.ok(retrieveCalls.length <= 3, `unexpected retry count: ${retrieveCalls.length}`);
});

test('one org can never be handed another org\'s documents', async () => {
  retrieveCalls.length = 0;
  await grounding.grounderFor('org-acme')('q1');
  await grounding.grounderFor('org-nokb')('q1');
  // Same question text, different tenants: only the org with a KB retrieves,
  // and it retrieves from its own. A grounder is bound to the orgId it was
  // built with — channel.ts builds it from the verified token.
  assert.deepEqual(
    retrieveCalls.map((c) => c.url.match(/knowledgebases\/([^/]+)/)?.[1]),
    ['KB-ACME-01']
  );
});
