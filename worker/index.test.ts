import { describe, expect, it } from 'vitest';

import worker, { handleEvent, type Env } from './index';

function fakeDb() {
  const calls: { sql: string; values: unknown[] }[] = [];
  const env: Env = {
    DB: {
      prepare: (sql) => ({
        bind: (...values) => ({
          run: async () => {
            calls.push({ sql, values });
            return {};
          },
        }),
      }),
    },
  };
  return { env, calls };
}

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://wattsplain.com/api/e', {
    method: 'POST',
    body,
    headers: {
      'user-agent': 'Mozilla/5.0 Chrome/140.0',
      origin: 'https://wattsplain.com',
      ...headers,
    },
  });
const now = new Date('2026-10-29T12:00:00Z');

describe('handleEvent', () => {
  it('adds one to the daily row for a valid event', async () => {
    const { env, calls } = fakeDb();
    const res = await handleEvent(post('{"e":"view","p":"/","s":"search","a":0}'), env, now);
    expect(res.status).toBe(204);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/ON CONFLICT .* DO UPDATE SET count = count \+ 1/s);
    expect(calls[0]!.values).toEqual(['2026-10-29', '/', 'view', 'search', 'real']);
  });

  it('rejects other origins, oversized and malformed bodies without writing', async () => {
    const { env, calls } = fakeDb();
    const valid = '{"e":"view","p":"/","s":"direct","a":0}';
    expect((await handleEvent(post(valid, { origin: 'https://evil.example' }), env)).status).toBe(
      403,
    );
    expect((await handleEvent(post('x'.repeat(600)), env)).status).toBe(413);
    expect((await handleEvent(post('{not json'), env)).status).toBe(400);
    expect((await handleEvent(post('{"e":"view","p":"/x","s":"direct"}'), env)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('accepts events but stores nothing while no database is bound', async () => {
    const res = await handleEvent(
      post('{"e":"tool","p":"/tools/space-heater-cost/","s":"internal","a":0}'),
      {},
    );
    expect(res.status).toBe(204);
  });

  it('answers 404 for other API paths and 405 for GET', async () => {
    expect((await worker.fetch(new Request('https://wattsplain.com/api/other'), {})).status).toBe(
      404,
    );
    expect((await worker.fetch(new Request('https://wattsplain.com/api/e'), {})).status).toBe(405);
  });
});
