#!/usr/bin/env node
/**
 * Mint a real Cognito ID token for poking at the API by hand.
 *
 *   node web/scripts/dev-token.mjs                       # worker in the demo org
 *   node web/scripts/dev-token.mjs --role admin          # admin
 *   node web/scripts/dev-token.mjs --curl                # also print ready-to-run curl
 *
 * Why this exists: every `/api/*` route goes through `requireSession`, which
 * verifies a Cognito **ID token** (the access token carries no `custom:*`, so it
 * has no tenant). Cognito signs in over SRP, which Postman cannot perform — so
 * there is no way to get a token by hand in Postman's UI. This does the SRP
 * exchange with `aws-amplify` (already a dependency) and prints the token.
 *
 * The user is created if missing and is disposable: it exists only so a human
 * can look at the API. Delete it with
 *   aws cognito-idp admin-delete-user --user-pool-id <pool> --username <email>
 *
 * Tokens last 1 hour (`accessTokenValidity`/`idTokenValidity` in auth-stack.ts).
 */
import { execFileSync } from 'node:child_process';
import { Amplify } from 'aws-amplify';
import { signIn, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';

const AWS =
  process.env.AWS_CLI ??
  'C:/Users/nagwa/AppData/Local/Programs/Amazon/AWSCLIV2/aws.exe';
const PROFILE = process.env.AWS_PROFILE ?? 'skillbridge';
const REGION = 'ap-northeast-1';
const POOL = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? 'ap-northeast-1_mVCiV8Voi';
const CLIENT = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '7un8m28bpsocodffvliup91blb';
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3123';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : d;
};

const role = arg('role', 'worker');
const orgId = arg('org-id', 'demo-industrial');
const deptId = arg('dept-id', 'dept-maint');
if (!['worker', 'manager', 'admin'].includes(role)) {
  console.error('--role must be worker, manager or admin');
  process.exit(1);
}

const username = `demo-${role}@skillbridge.test`;
const password = `Demo${role}pass1`;

/**
 * `probe: true` tolerates failure (used to ask "does this user exist?").
 * Everything else fails LOUDLY: a swallowed error here leaves a half-created
 * user with no password, and the only symptom is a confusing
 * "Incorrect username or password" from the sign-in several steps later.
 */
const aws = (args, { probe = false } = {}) => {
  try {
    return execFileSync(AWS, [...args, '--profile', PROFILE, '--region', REGION], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    if (probe) return null;
    const msg = (e.stderr?.toString() || e.message || '').trim();
    console.error(`\naws ${args[0]} ${args[1]} failed:\n  ${msg}`);
    if (/session has expired|ExpiredToken|InvalidClientTokenId/i.test(msg)) {
      console.error('\n  Run:  aws login --profile skillbridge');
    }
    process.exit(1);
  }
};

/* ── ensure the user exists, mirroring what invite redemption does ─────────── */

const exists = aws(['cognito-idp', 'admin-get-user', '--user-pool-id', POOL, '--username', username], { probe: true });

if (!exists) {
  console.error(`creating ${username} (${role}) in org ${orgId}`);
  aws([
    'cognito-idp', 'admin-create-user',
    '--user-pool-id', POOL,
    '--username', username,
    '--message-action', 'SUPPRESS',
    '--user-attributes',
    `Name=name,Value=Demo ${role}`,
    `Name=custom:orgId,Value=${orgId}`,
    `Name=custom:role,Value=${role}`,
    `Name=custom:deptId,Value=${deptId}`,
    `Name=email,Value=${username}`,
    'Name=email_verified,Value=true',
  ]);
  aws(['cognito-idp', 'admin-add-user-to-group', '--user-pool-id', POOL, '--username', username, '--group-name', role]);
}

/**
 * Always set the password, even for a user that already exists.
 *
 * It is idempotent, and it repairs the case where a previous run created the
 * account but died before setting one — leaving a user stuck in
 * FORCE_CHANGE_PASSWORD whose only symptom is "Incorrect username or password"
 * at sign-in, which points at entirely the wrong thing.
 *
 * `--permanent` matters: without it the next signIn returns a challenge rather
 * than a session.
 */
aws([
  'cognito-idp', 'admin-set-user-password',
  '--user-pool-id', POOL, '--username', username,
  '--password', password, '--permanent',
]);

/* ── SRP sign-in ───────────────────────────────────────────────────────────── */

const mem = new Map();
cognitoUserPoolsTokenProvider.setKeyValueStorage({
  setItem: async (k, v) => { mem.set(k, v); },
  getItem: async (k) => (mem.has(k) ? mem.get(k) : null),
  removeItem: async (k) => { mem.delete(k); },
  clear: async () => { mem.clear(); },
});
Amplify.configure({ Auth: { Cognito: { userPoolId: POOL, userPoolClientId: CLIENT } } });

try { await signOut(); } catch { /* no session to clear */ }
await signIn({ username, password });
const token = (await fetchAuthSession()).tokens.idToken.toString();
await signOut();

const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

console.error(`\nsigned in as ${username}`);
console.error(`  custom:orgId  ${claims['custom:orgId']}`);
console.error(`  custom:role   ${claims['custom:role']}`);
console.error(`  cognito:groups ${JSON.stringify(claims['cognito:groups'])}`);
console.error(`  expires       ${new Date(claims.exp * 1000).toISOString()} (1 hour)`);

if (process.argv.includes('--curl')) {
  console.error('\n--- paste into a terminal ---');
  console.error(`TOKEN='${token}'`);
  for (const r of ['me', 'plan', 'lessons', 'assessments']) {
    console.error(`curl -s -H "authorization: Bearer $TOKEN" ${BASE}/api/${r} | jq`);
  }
  console.error('\n--- Postman ---');
  console.error('Authorization tab -> Type: Bearer Token -> paste the token printed below.');
}

// stdout is the token alone, so it pipes cleanly:
//   TOKEN=$(node web/scripts/dev-token.mjs)
console.log(token);
