import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config.js';
import { keys } from '../lib/keys.js';

/**
 * The employer's own SOPs, for one question.
 *
 * One Bedrock Knowledge Base per org, created at org provisioning against that
 * org's `org=<orgId>/docs/` prefix (ai-stack.ts). Its id is read from the org's
 * `ORG#<orgId>` / `META` item as `kbId`. The orgId comes ONLY from the verified
 * token — never from anything the client sends — so one tenant can never
 * retrieve another's documents.
 *
 * An org with no KB yet answers ungrounded, and the prompt makes the tutor say
 * so. Retrieval is bounded by RETRIEVE_TIMEOUT_MS: a slow KB costs the worker a
 * less specific answer, never silence.
 */

const RETRIEVE_TIMEOUT_MS = 1500;
const RESULTS = 4;
const MAX_SOURCE_CHARS = 3500;
const KB_ID_TTL_MS = 5 * 60 * 1000;

const agent = new BedrockAgentRuntimeClient({ region: config.region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }));

const kbIds = new Map<string, { id: string | null; at: number }>();

/** Looked up at channel open (see channel.ts) so the read is off the turn's critical path. */
export async function knowledgeBaseFor(orgId: string): Promise<string | null> {
  const hit = kbIds.get(orgId);
  if (hit && Date.now() - hit.at < KB_ID_TTL_MS) return hit.id;
  try {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: config.tableName,
        Key: keys.org(orgId),
        ProjectionExpression: 'kbId',
      })
    );
    const id = typeof Item?.kbId === 'string' && Item.kbId ? Item.kbId : null;
    kbIds.set(orgId, { id, at: Date.now() });
    return id;
  } catch (e) {
    console.warn('[voice/grounding] org lookup failed:', (e as Error).message);
    return null;
  }
}

/**
 * Deliberately takes no abort signal: results are shared between the early
 * start and the one at release, so a discarded guess must not cancel a lookup
 * the real answer is about to reuse. The timeout bounds it instead.
 */
export type Grounder = (question: string) => Promise<string | null>;

/** A retriever bound to one org, memoised per question within a channel. */
export function grounderFor(orgId: string): Grounder {
  const memo = new Map<string, Promise<string | null>>();
  void knowledgeBaseFor(orgId);

  return (question) => {
    const key = question.trim().toLowerCase();
    let found = memo.get(key);
    if (!found) {
      found = retrieve(orgId, question);
      memo.set(key, found);
      if (memo.size > 20) memo.delete(memo.keys().next().value!);
    }
    return found;
  };
}

async function retrieve(orgId: string, question: string): Promise<string | null> {
  const kbId = await knowledgeBaseFor(orgId);
  if (!kbId || !question.trim()) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RETRIEVE_TIMEOUT_MS);
  try {
    const out = await agent.send(
      new RetrieveCommand({
        knowledgeBaseId: kbId,
        retrievalQuery: { text: question.slice(0, 1000) },
        retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: RESULTS } },
      }),
      { abortSignal: ctrl.signal }
    );
    let text = '';
    for (const r of out.retrievalResults ?? []) {
      const chunk = r.content?.text?.trim();
      if (!chunk) continue;
      const next = `${text}${text ? '\n---\n' : ''}${chunk}`;
      if (next.length > MAX_SOURCE_CHARS) break;
      text = next;
    }
    return text || null;
  } catch (e) {
    if (!ctrl.signal.aborted) console.warn('[voice/grounding] retrieve failed:', (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
