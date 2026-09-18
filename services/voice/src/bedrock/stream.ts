import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config.js';

/**
 * The model behind the tutor's replies. Bedrock, via SigV4 on the App Runner
 * task role — no API keys anywhere in this service.
 *
 * Claude Haiku 4.5 is used here specifically because this is the one synchronous
 * agent path (FEATURES.md §13); the other three agents run Sonnet 5 off the
 * request path.
 */

export const client = new BedrockRuntimeClient({ region: config.region });

export interface StreamRequest {
  readonly system: string;
  readonly messages: { role: 'user' | 'assistant'; content: string }[];
  readonly maxTokens: number;
}

export type ModelErrorCode = 'RATE_LIMITED' | 'MODEL_UNAVAILABLE' | 'UPSTREAM';

export class ModelError extends Error {
  constructor(
    message: string,
    readonly code: ModelErrorCode
  ) {
    super(message);
  }
}

/** Named, never swallowed: a throttled turn tells the worker to wait rather than going quiet. */
function classify(e: unknown): ModelError {
  const name = (e as { name?: string }).name ?? '';
  const message = (e as Error).message ?? String(e);
  if (name === 'ThrottlingException' || name === 'ServiceQuotaExceededException') {
    return new ModelError('the tutor is busy — try again in a few seconds', 'RATE_LIMITED');
  }
  if (
    name === 'AccessDeniedException' ||
    name === 'ResourceNotFoundException' ||
    name === 'ModelNotReadyException'
  ) {
    // AccessDenied here almost always means the task role lacks invoke on the
    // UNDERLYING foundation model, not just the inference profile.
    console.error('[voice/bedrock]', name, message);
    return new ModelError('voice unavailable — the reply model is not available right now', 'MODEL_UNAVAILABLE');
  }
  return new ModelError(`model call failed: ${message.slice(0, 160)}`, 'UPSTREAM');
}

/**
 * Stream a reply as text deltas.
 *
 * Do NOT translate the question into English before the model — it is pure
 * latency for no benefit, since Claude reads Devanagari and Hinglish directly.
 * The system prompt pins the OUTPUT language instead.
 *
 * Aborting the signal cancels the HTTP stream, so a discarded speculative start
 * stops spending tokens at once.
 */
export async function* streamText(
  request: StreamRequest,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const command = new InvokeModelWithResponseStreamCommand({
    modelId: config.bedrock.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: request.maxTokens,
      temperature: 0.4,
      system: request.system,
      messages: request.messages,
    }),
  });

  let response;
  try {
    response = await client.send(command, { abortSignal: signal });
  } catch (e) {
    if (signal?.aborted) return;
    throw classify(e);
  }
  if (!response.body) throw new ModelError('model returned no stream', 'UPSTREAM');

  const decoder = new TextDecoder();
  try {
    for await (const event of response.body) {
      if (signal?.aborted) return;
      if (event.chunk?.bytes) {
        const payload = JSON.parse(decoder.decode(event.chunk.bytes)) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta' && payload.delta.text) {
          yield payload.delta.text;
        }
        continue;
      }
      // Mid-stream exceptions arrive as union members rather than throws.
      const failure =
        event.throttlingException ??
        event.modelStreamErrorException ??
        event.internalServerException ??
        event.validationException ??
        event.serviceUnavailableException ??
        event.modelTimeoutException;
      if (failure) throw classify(failure);
    }
  } catch (e) {
    if (signal?.aborted) return;
    throw e instanceof ModelError ? e : classify(e);
  }
}
