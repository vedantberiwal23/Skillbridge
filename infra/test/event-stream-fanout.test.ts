import { collectJobs } from '../lambda/event-stream-fanout';

/**
 * The fanout's filter is the one place in the profiler chain where a mistake is
 * completely silent: a record wrongly skipped means nobody is ever profiled, and
 * nothing appears in any log to say so. So it is tested directly rather than
 * inferred from a deploy.
 */

const evt = (over: Record<string, unknown> = {}) => ({
  eventName: 'INSERT',
  dynamodb: {
    SequenceNumber: '100',
    Keys: { PK: { S: 'USER#u1' }, SK: { S: 'EVT#2026-09-18T10:00:00.000Z#abc' } },
    NewImage: { orgId: { S: 'org1' } },
  },
  ...over,
});

test('an EVT# insert produces one job carrying the tenant from the item', () => {
  const { jobs } = collectJobs([evt()]);

  expect(jobs.size).toBe(1);
  expect(jobs.get('u1')).toMatchObject({
    userId: 'u1',
    orgId: 'org1',
    from: '2026-09-18T10:00:00.000Z',
    to: '2026-09-18T10:00:00.000Z',
    events: 1,
  });
});

test('many events for one worker collapse to a single job — this is the debounce', () => {
  const { jobs, contributing } = collectJobs([
    evt({ dynamodb: { ...evt().dynamodb, SequenceNumber: '1', Keys: { PK: { S: 'USER#u1' }, SK: { S: 'EVT#2026-09-18T10:00:00.000Z#a' } } } }),
    evt({ dynamodb: { ...evt().dynamodb, SequenceNumber: '2', Keys: { PK: { S: 'USER#u1' }, SK: { S: 'EVT#2026-09-18T11:00:00.000Z#b' } } } }),
    evt({ dynamodb: { ...evt().dynamodb, SequenceNumber: '3', Keys: { PK: { S: 'USER#u1' }, SK: { S: 'EVT#2026-09-18T09:00:00.000Z#c' } } } }),
  ]);

  expect(jobs.size).toBe(1);
  const job = jobs.get('u1')!;
  expect(job.events).toBe(3);
  // The window spans the batch, regardless of the order records arrive in.
  expect(job.from).toBe('2026-09-18T09:00:00.000Z');
  expect(job.to).toBe('2026-09-18T11:00:00.000Z');
  expect(contributing.get('u1')).toEqual(['1', '2', '3']);
});

test('distinct workers stay distinct', () => {
  const { jobs } = collectJobs([
    evt(),
    evt({ dynamodb: { ...evt().dynamodb, Keys: { PK: { S: 'USER#u2' }, SK: { S: 'EVT#2026-09-18T10:00:00.000Z#d' } } } }),
  ]);

  expect([...jobs.keys()].sort()).toEqual(['u1', 'u2']);
});

test('a TTL expiry is ignored — it arrives as a REMOVE from the DynamoDB service', () => {
  const { jobs } = collectJobs([
    evt({
      eventName: 'REMOVE',
      userIdentity: { type: 'Service', principalId: 'dynamodb.amazonaws.com' },
    }),
  ]);

  // EVT# items carry a 90-day ttl, so without this the profiler would re-run
  // for every worker as their old events aged out.
  expect(jobs.size).toBe(0);
});

test('MODIFY is ignored — EVT# items are append-only', () => {
  expect(collectJobs([evt({ eventName: 'MODIFY' })]).jobs.size).toBe(0);
});

test('non-EVT# items in the same table are ignored', () => {
  const others = ['PROFILE', 'SETTINGS', 'PLAN#p1', 'ATTEMPT#a1#2026-09-18T10:00:00.000Z', 'SESSION#2026-09-18T10:00:00.000Z#s1'];
  for (const sk of others) {
    const { jobs } = collectJobs([
      evt({ dynamodb: { ...evt().dynamodb, Keys: { PK: { S: 'USER#u1' }, SK: { S: sk } } } }),
    ]);
    expect(jobs.size).toBe(0);
  }
});

test('an item on a non-USER partition is ignored', () => {
  const { jobs } = collectJobs([
    evt({ dynamodb: { ...evt().dynamodb, Keys: { PK: { S: 'ORG#org1' }, SK: { S: 'EVT#2026-09-18T10:00:00.000Z#x' } } } }),
  ]);
  expect(jobs.size).toBe(0);
});

test('a record with no orgId is skipped rather than guessed at', () => {
  const { jobs } = collectJobs([evt({ dynamodb: { ...evt().dynamodb, NewImage: {} } })]);

  // Inferring the tenant here would cross an organization boundary, which is the
  // one thing this design never does.
  expect(jobs.size).toBe(0);
});

test('a malformed EVT# sort key with no id segment is skipped', () => {
  const { jobs } = collectJobs([
    evt({ dynamodb: { ...evt().dynamodb, Keys: { PK: { S: 'USER#u1' }, SK: { S: 'EVT#2026-09-18T10:00:00.000Z' } } } }),
  ]);
  expect(jobs.size).toBe(0);
});
