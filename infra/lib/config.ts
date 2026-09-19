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
 * The Amplify branch, which IS a git branch and must match one that exists in
 * the repository — this repo's default is `master`, not `main`.
 *
 * It was `main` while the web tier shipped through the Amplify deployment
 * specification with no repository connected. That path does not work: AWS
 * documents that "Amplify Hosting does not support manual deploys for
 * server-side rendered (SSR) apps", and `CreateDeployment` silently deploys
 * only `.amplify-hosting/static`, ignoring the compute primitive, so every
 * route is served from S3 and the app 404s. Confirmed against three real
 * deployments on 2026-09-19.
 */
export const WEB_BRANCH = 'master';

/** The repository Amplify builds the web tier from. */
export const WEB_REPOSITORY = 'https://github.com/rxshabN/first-commit-lockedin';

/**
 * The GitHub personal access token Amplify uses to clone and to register its
 * webhook, resolved by CloudFormation at deploy time so the value never enters
 * this repository, the template or a CDK context file.
 *
 * `AWS::Amplify::App.AccessToken` is write-only, so it is never readable back
 * out of the stack either.
 *
 * Referenced by NAME rather than by ARN, unlike `SARVAM_SECRET_ARN`. Secrets
 * Manager appends a random six-character suffix to every ARN, so an ARN for a
 * secret this repository does not create cannot be written down correctly in
 * advance — and a `{{resolve:}}` reference accepts the bare name for a secret in
 * the same account and region. App Runner has no such shortcut, which is why
 * the Sarvam key is pinned to its full ARN instead.
 */
export const GITHUB_TOKEN_SECRET = process.env.GITHUB_TOKEN_SECRET ?? 'github-amplify';

/**
 * The field inside the secret's JSON, which is what the console's "Key/value"
 * type produces. Set `GITHUB_TOKEN_SECRET_JSON_KEY=''` if the secret is ever
 * replaced with a plaintext one — a `{{resolve:}}` reference with a key suffix
 * against a plaintext secret fails the deploy, and without the suffix against a
 * JSON secret Amplify receives the whole document as the token.
 */
export const GITHUB_TOKEN_SECRET_JSON_KEY =
  process.env.GITHUB_TOKEN_SECRET_JSON_KEY ?? 'GithubAmplifyToken';

/** `{{resolve:secretsmanager:<secret>:SecretString[:<key>]}}`, per the above. */
export const githubTokenRef = () =>
  GITHUB_TOKEN_SECRET_JSON_KEY
    ? `{{resolve:secretsmanager:${GITHUB_TOKEN_SECRET}:SecretString:${GITHUB_TOKEN_SECRET_JSON_KEY}}}`
    : `{{resolve:secretsmanager:${GITHUB_TOKEN_SECRET}:SecretString}}`;

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
