import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `infra/lambda/shared/keys.ts` is a verbatim copy of `web/src/lib/keys.ts`.
 *
 * The Lambdas cannot import across package boundaries, and CLAUDE.md requires the
 * module be vendored rather than re-typed: a drifted literal — `SKILLPROFILE`
 * instead of `SKILLPROFILE#CURRENT`, an unpadded `MOD#10` — writes an item that
 * nothing ever reads back, with no error anywhere to show for it.
 *
 * Byte equality is the only check that catches that, so this test asserts it
 * rather than trusting the copy to stay in step by hand.
 */
const repo = (...segments: string[]) => join(__dirname, '..', '..', ...segments);

/** Every vendored copy, checked against `web/src/lib/keys.ts` as the original. */
const VENDORED = [
  ['infra Lambdas', repo('infra', 'lambda', 'shared', 'keys.ts')],
  ['voice service', repo('services', 'voice', 'src', 'lib', 'keys.ts')],
] as const;

test.each(VENDORED)('the %s copy of keys.ts has not drifted from the web original', (_label, path) => {
  const original = readFileSync(repo('web', 'src', 'lib', 'keys.ts'), 'utf8');
  expect(readFileSync(path, 'utf8')).toBe(original);
});

/**
 * EVENT_TTL_DAYS is duplicated in `infra/lib/config.ts` and in keys.ts, and
 * CLAUDE.md says to change both together. Nothing enforces that, so this does.
 */
test('EVENT_TTL_DAYS agrees between config.ts and the vendored keys.ts', () => {
  // Read the literals out of the source rather than importing: the project
  // resolves modules as node16, which wants `.js` specifiers that the jest
  // transform will not resolve back to `.ts`. The source text is also the more
  // honest target here — what matters is that the two declarations agree.
  const read = (...segments: string[]) =>
    readFileSync(join(__dirname, '..', ...segments), 'utf8');

  const declared = (source: string, where: string) => {
    const match = source.match(/EVENT_TTL_DAYS\s*=\s*(\d+)/);
    if (!match) throw new Error(`EVENT_TTL_DAYS not declared in ${where}`);
    return Number(match[1]);
  };

  const fromConfig = declared(read('lib', 'config.ts'), 'config.ts');
  const fromKeys = declared(read('lambda', 'shared', 'keys.ts'), 'keys.ts');

  expect(fromKeys).toBe(fromConfig);
});
