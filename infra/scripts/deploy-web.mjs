#!/usr/bin/env node
/**
 * Deploy the Next.js web tier to Amplify Hosting via the deployment
 * specification, with no repository connected and no Amplify-side build.
 *
 *   node infra/scripts/deploy-web.mjs [--app-id <id>] [--branch <name>]
 *
 * App id and branch default to the `skillbridge-web` stack outputs.
 *
 * Why this rather than a git connection:
 *   - No GitHub token. Nothing secret enters CDK, Secrets Manager or the console.
 *   - No build spec, so the monorepo layout never triggers AWS's
 *     "set AMPLIFY_MONOREPO_APP_ROOT in the console" requirement.
 *   - No dependence on Amplify supporting a given Next.js version. AWS documents
 *     Next 15; this app is 16.3.5. Under the spec Amplify only runs a Node HTTP
 *     server on port 3000 and never inspects the build output.
 *
 * The bundle shape is fixed by AWS:
 *   .amplify-hosting/
 *     compute/default/   a self-contained Node server listening on port 3000
 *     static/            served by the static primitive, straight off the CDN
 *     deploy-manifest.json
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const WEB = join(REPO, 'web');
const OUT = join(WEB, '.amplify-hosting');
const ZIP = join(WEB, '.amplify-hosting.zip');
const PROFILE = process.env.AWS_PROFILE ?? 'skillbridge';
const REGION = 'ap-northeast-1';

// `aws` is a user-level install and is not on PATH for spawned shells.
const AWS =
  process.env.AWS_CLI ??
  'C:/Users/nagwa/AppData/Local/Programs/Amazon/AWSCLIV2/aws.exe';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const aws = (args, { json = true } = {}) => {
  const out = execFileSync(AWS, [...args, '--profile', PROFILE, '--region', REGION], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return json ? JSON.parse(out) : out.trim();
};

function stackOutput(key) {
  const res = aws(['cloudformation', 'describe-stacks', '--stack-name', 'skillbridge-web']);
  const found = res.Stacks[0].Outputs.find((o) => o.OutputKey === key);
  if (!found) throw new Error(`skillbridge-web has no output ${key} — is the stack deployed?`);
  return found.OutputValue;
}

/**
 * Zip a directory's CONTENTS, with POSIX separators in the entry names.
 *
 * NOT `Compress-Archive`: it writes Windows separators into the entry names
 * (`compute\default\server.js`), and the ZIP spec requires `/`. Amplify still
 * parses the root-level `deploy-manifest.json` — no separator in that name — so
 * the deployment reports SUCCEED, but it cannot resolve the compute
 * entrypoint. Every route then falls through to the static primitive and the
 * whole app is served from S3, returning 404 for every SSR route and 301 for
 * the rest. Verified against a real deploy, not theorised.
 *
 * `tar.exe` is bsdtar and has shipped in Windows since 1803. Passing the
 * top-level names rather than `.` keeps entries unprefixed; with `.` every
 * name gains a `./`.
 */
function zipDirectory(source, destination) {
  rmSync(destination, { force: true });
  if (process.platform === 'win32') {
    const names = readdirSync(source);
    execFileSync(
      join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe'),
      ['-a', '-c', '-f', destination, '-C', source, ...names],
      { stdio: 'inherit' }
    );
  } else {
    execFileSync('zip', ['-qr', destination, '.'], { cwd: source, stdio: 'inherit' });
  }

  assertPosixEntries(destination);
}

/**
 * Fail loudly rather than shipping a bundle Amplify will silently half-ignore.
 * Reads the central directory: 4-byte signature, then the name length at +28
 * and the name at +46.
 */
function assertPosixEntries(zipPath) {
  const buf = readFileSync(zipPath);
  const SIG = 0x02014b50;
  let entries = 0;
  let manifest = false;
  let entrypoint = false;
  for (let i = 0; i + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(i) !== SIG) continue;
    const nameLen = buf.readUInt16LE(i + 28);
    const name = buf.toString('utf8', i + 46, i + 46 + nameLen);
    entries += 1;
    if (name.includes('\\')) {
      throw new Error(`zip entry has a Windows separator, Amplify will not resolve it: ${name}`);
    }
    if (name === 'deploy-manifest.json') manifest = true;
    if (name === 'compute/default/server.js') entrypoint = true;
    i += 46 + nameLen - 1;
  }
  if (!manifest) throw new Error('deploy-manifest.json is not at the zip root');
  if (!entrypoint) throw new Error('compute/default/server.js is missing from the zip');
  console.log(`  ${entries} entries, manifest and compute entrypoint at the expected paths`);
}

/**
 * The app's environment variables, read back off the Amplify app itself.
 *
 * Amplify's own variables reach the SSR compute at runtime, which is enough for
 * server-only values like APP_TABLE_NAME. It is NOT enough for `NEXT_PUBLIC_*`:
 * Next inlines those into the client bundle at build time, and the build runs
 * here, on this machine. Without this, `NEXT_PUBLIC_VOICE_URL` is absent from
 * the build, the browser falls back to `http://localhost:3002`, and voice is
 * dead in the deployed app while the Amplify console shows the value set
 * correctly — which is the worst version of this bug.
 *
 * Reading them from the app rather than a local `.env` keeps `web-stack.ts` the
 * single authority CLAUDE.md requires. No secret is ever in this list.
 */
function amplifyEnv(appId) {
  if (!appId) return {};
  const vars = aws(['amplify', 'get-app', '--app-id', appId]).app?.environmentVariables ?? {};
  const names = Object.keys(vars);
  console.log(`> build env from Amplify app ${appId}: ${names.join(', ') || '(none)'}`);
  const missing = names.filter((n) => n.startsWith('NEXT_PUBLIC_') && !vars[n]);
  if (missing.length) {
    console.warn(`  WARNING: empty in the app, so absent from the bundle: ${missing.join(', ')}`);
  }
  return vars;
}

function buildBundle(env = {}) {
  console.log('> building web (output: standalone)');
  // Node refuses to spawn a .cmd directly since v20, so npm needs a shell on
  // Windows. Arguments here are literals, not user input.
  execFileSync('npm', ['run', 'build'], {
    cwd: WEB,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // The app's values win over whatever this machine happens to have in
    // `web/.env.local`, so a deploy cannot pick up a stale local override.
    env: { ...process.env, ...env },
  });

  const standalone = join(WEB, '.next', 'standalone');
  if (!existsSync(join(standalone, 'server.js'))) {
    throw new Error(
      '.next/standalone/server.js is missing — next.config.ts must set output: "standalone"'
    );
  }

  console.log('> assembling .amplify-hosting');
  rmSync(OUT, { recursive: true, force: true });
  const compute = join(OUT, 'compute', 'default');
  mkdirSync(compute, { recursive: true });
  mkdirSync(join(OUT, 'static'), { recursive: true });

  // The compute bundle must be self-contained: nothing in it may reference a
  // module outside the directory.
  cpSync(standalone, compute, { recursive: true });

  // Next does not copy these into standalone; the server still needs them on
  // disk to serve any request the CDN misses.
  cpSync(join(WEB, '.next', 'static'), join(compute, '.next', 'static'), { recursive: true });
  if (existsSync(join(WEB, 'public'))) {
    cpSync(join(WEB, 'public'), join(compute, 'public'), { recursive: true });
  }

  // The same assets again, for the static primitive. Serving them from the CDN
  // keeps hashed bundles off the compute path entirely.
  cpSync(join(WEB, '.next', 'static'), join(OUT, 'static', '_next', 'static'), { recursive: true });
  if (existsSync(join(WEB, 'public'))) {
    cpSync(join(WEB, 'public'), join(OUT, 'static'), { recursive: true });
  }

  const nextVersion = JSON.parse(
    readFileSync(join(WEB, 'node_modules', 'next', 'package.json'), 'utf8')
  ).version;

  writeFileSync(
    join(OUT, 'deploy-manifest.json'),
    JSON.stringify(
      {
        version: 1,
        framework: { name: 'next', version: nextVersion },
        computeResources: [
          { name: 'default', entrypoint: 'server.js', runtime: 'nodejs22.x' },
        ],
        routes: [
          // Content-hashed and immutable — cache forever.
          {
            path: '/_next/static/*',
            target: { kind: 'Static', cacheControl: 'public, max-age=31536000, immutable' },
          },
          // Anything with an extension is probably a public/ asset. Falling back
          // to compute covers files the static primitive does not have.
          {
            path: '/*.*',
            target: { kind: 'Static' },
            fallback: { kind: 'Compute', src: 'default' },
          },
          // Catch-all must be compute: SSR routes are not known at build time.
          { path: '/*', target: { kind: 'Compute', src: 'default' } },
        ],
      },
      null,
      2
    ) + '\n'
  );

  console.log('> zipping');
  zipDirectory(OUT, ZIP);
  const mb = (statSync(ZIP).size / 1024 / 1024).toFixed(1);
  console.log(`  bundle ${mb} MB`);
}

async function deploy(appId, branchName) {
  console.log(`> CreateDeployment app=${appId} branch=${branchName}`);
  const created = aws([
    'amplify', 'create-deployment',
    '--app-id', appId,
    '--branch-name', branchName,
  ]);

  console.log('> uploading bundle');
  const body = readFileSync(ZIP);
  const res = await fetch(created.zipUploadUrl, {
    method: 'PUT',
    body,
    headers: { 'content-type': 'application/zip' },
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);

  console.log('> StartDeployment');
  aws([
    'amplify', 'start-deployment',
    '--app-id', appId,
    '--branch-name', branchName,
    '--job-id', created.jobId,
  ]);

  // Poll rather than assume: a deployment can fail after StartDeployment returns.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const job = aws([
      'amplify', 'get-job',
      '--app-id', appId,
      '--branch-name', branchName,
      '--job-id', created.jobId,
    ]);
    const status = job.job.summary.status;
    process.stdout.write(`  ${status}\r`);
    if (['SUCCEED', 'FAILED', 'CANCELLED'].includes(status)) {
      console.log(`\n> ${status}`);
      if (status !== 'SUCCEED') process.exitCode = 1;
      return;
    }
  }
  console.log('\n> still running after 5 minutes; check the Amplify console');
  process.exitCode = 1;
}

// `--bundle-only` builds and validates the bundle without touching AWS, so the
// shape can be checked before the stack exists.
/**
 * This script no longer deploys, and refuses rather than pretending to.
 *
 * Amplify Hosting does not support manual deploys for SSR apps. The
 * CreateDeployment path below uploads the bundle, reports SUCCEED, deploys only
 * `static/`, and leaves the site 404ing from S3 — so running it against a
 * working app would silently replace it with a broken one. The web tier now
 * builds from the connected repository; see `infra/lib/web-stack.ts`.
 *
 * `--bundle-only` still works and is still useful: it is the fastest way to
 * check that `output: 'standalone'` is intact and the bundle assembles.
 */
if (!process.argv.includes('--bundle-only')) {
  console.error(
    [
      'deploy-web.mjs no longer deploys.',
      '',
      'Amplify Hosting does not support manual deploys for server-side rendered',
      'apps: CreateDeployment deploys only .amplify-hosting/static, ignores the',
      'compute primitive, and still reports SUCCEED. Running it would replace a',
      'working site with one that 404s from S3.',
      '',
      'The web tier builds from the connected repository. To ship a change:',
      '  git push origin master        # Amplify builds on push',
      '  npx cdk deploy skillbridge-web   # for stack or env-var changes',
      '',
      'To validate the bundle locally without deploying: --bundle-only',
    ].join('\n')
  );
  process.exit(1);
}

if (process.argv.includes('--bundle-only')) {
  // Still resolve the app when it exists, so `--bundle-only` validates the same
  // bundle a real deploy would produce rather than a differently-configured one.
  let env = {};
  try {
    env = amplifyEnv(arg('app-id') ?? stackOutput('AmplifyAppId'));
  } catch {
    console.warn('> no skillbridge-web stack yet; building without the app env');
  }
  buildBundle(env);
  console.log(`> bundle ready at ${OUT} (not deployed)`);
} else {
  const appId = arg('app-id') ?? stackOutput('AmplifyAppId');
  const branchName = arg('branch') ?? stackOutput('AmplifyBranchName');
  buildBundle(amplifyEnv(appId));
  await deploy(appId, branchName);
}
