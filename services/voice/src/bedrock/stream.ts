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
 * agent path (FEATURES.md §13); the other three agents run Sonnet 4.6 off the
 * request path.
 */
export const client = new BedrockRuntimeClient({ region: config.region });

export interface StreamRequest {
  readonly system: string;
  readonly messages: { role: 'user' | 'assistant'; content: string }[];
  readonly maxTokens: number;
}

/**
 * Stream a reply as text deltas.
 *
 * Do NOT translate the question into English before the model — it is pure
 * latency for no benefit, since Claude reads Devanagari and Hinglish directly.
 * The system prompt pins the OUTPUT language instead.
 */
export async function* streamText(
  request: StreamRequest,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: request.maxTokens,
    system: request.system,
    messages: request.messages,
  };

  const command = new InvokeModelWithResponseStreamCommand({
    modelId: config.bedrock.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  const response = await client.send(command, { abortSignal: signal });

  if (!response.body) {
    return;
  }

  const decoder = new TextDecoder();

  for await (const event of response.body) {
    if (signal?.aborted) {
      break;
    }

    if (event.chunk?.bytes) {
      const decoded = decoder.decode(event.chunk.bytes);
      try {
        const parsed = JSON.parse(decoded);
        if (
          parsed.type === 'content_block_delta' &&
          parsed.delta?.type === 'text_delta' &&
          typeof parsed.delta.text === 'string'
        ) {
          yield parsed.delta.text;
        }
      } catch {
        // Skip malformed chunks if any
      }
    }
  }
}
