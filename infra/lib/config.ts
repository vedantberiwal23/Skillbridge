export const REGION = 'ap-northeast-1';

export const APP_NAME = 'skillbridge';

export const stackName = (suffix: string) => `${APP_NAME}-${suffix}`;

/**
 * Bedrock models, tiered by latency need (see FEATURES.md §13).
 *
 * These are INFERENCE PROFILE ids, not bare foundation-model ids. Verified
 * 2026-09-17: invoking a bare model id in ap-northeast-1 fails with
 * "Invocation of model ID ... with on-demand throughput isn't supported. Retry
 * your request with the ID or ARN of an inference profile."
 *
 * `jp.` profiles keep inference inside the Japan region rather than routing
 * globally, which matters most for the one synchronous agent.
 *
 * Claude Sonnet 5 is NOT entitled on this account (AccessDeniedException:
 * "not available for this account"), so the three asynchronous agents run
 * Sonnet 4.6 — confirmed invoking.
 */
export const MODELS = {
  voiceOrchestrator: 'jp.anthropic.claude-haiku-4-5-20251001-v1:0',
  learningPlanGenerator: 'jp.anthropic.claude-sonnet-4-6',
  assessmentScorer: 'jp.anthropic.claude-sonnet-4-6',
  skillProfiler: 'jp.anthropic.claude-sonnet-4-6',
} as const;

/**
 * The foundation models behind those profiles. A cross-region inference profile
 * needs invoke permission on BOTH the profile and the underlying foundation
 * model in every region the profile may route to — granting only the profile
 * ARN produces an AccessDenied at call time.
 */
export const UNDERLYING_MODELS = [
  'anthropic.claude-haiku-4-5-20251001-v1:0',
  'anthropic.claude-sonnet-4-6',
] as const;

export const ROLES = ['worker', 'manager', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Raw tutor queries and activity events are profiler input, not a permanent record. */
export const EVENT_TTL_DAYS = 90;

/**
 * The Amplify deployment target. Not a git branch: the web tier deploys through
 * the Amplify deployment specification (`infra/scripts/deploy-web.mjs`), so no
 * repository is connected and Amplify never runs a build of its own.
 */
export const WEB_BRANCH = 'main';

/**
 * Embedding model for the per-org Knowledge Bases.
 *
 * `cohere.embed-multilingual-v3`, enabled in the Bedrock console on 2026-09-19.
 * Cohere's embedders sit behind an AWS Marketplace subscription; before it was
 * granted, ingestion failed with an error that reads like an IAM problem.
 * `amazon.titan-embed-text-v2:0` is the first-party fallback needing no
 * subscription. CLAUDE.md requires the voice
 * transcript reach retrieval verbatim in whatever language the worker spoke, so
 * a Hindi or Marathi question is matched against SOPs written in English. A
 * multilingual embedder scores that cross-language match far better, and this is
 * precisely the workforce the product exists for. Both output 1024 dimensions,
 * so the vector index does not change — but the KB does: an existing KB must be
 * recreated to change its embedding model.
 */
export const EMBEDDING_MODEL = 'cohere.embed-multilingual-v3';
export const EMBEDDING_DIMENSIONS = 1024;

/** Both are granted to the KB role so switching needs no stack redeploy. */
export const EMBEDDING_MODELS = [
  'amazon.titan-embed-text-v2:0',
  'cohere.embed-multilingual-v3',
] as const;

export const VECTOR_BUCKET = `${APP_NAME}-vectors`;

/**
 * The Sarvam API key, the only vendor credential in the system.
 *
 * Created by hand rather than by CDK, so the six-character suffix is not
 * derivable and the complete ARN has to be named here: App Runner rejects the
 * wildcard ARN that `Secret.fromSecretNameV2` produces. The value is never read
 * by this repository — App Runner resolves it at container start and injects it
 * as an environment variable.
 *
 * `SARVAM_SECRET_JSON_KEY` is the field inside the secret's JSON, which is what
 * the console's "Key/value" secret type produces. Set it to `undefined` if the
 * secret is ever replaced with a plaintext one.
 */
export const SARVAM_SECRET_ARN =
  'arn:aws:secretsmanager:ap-northeast-1:975585942816:secret:Sarvam-Gdl7YQ';
export const SARVAM_SECRET_JSON_KEY = 'SARVAM_API_KEY';
