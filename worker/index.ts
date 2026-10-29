// Worker for /api/* only (wrangler.jsonc run_worker_first); every page is a static asset.
// POST /api/e records one analytics event as +1 on a daily aggregate row in D1.
import { parseEvent } from '../src/analytics/event';

// The two D1 methods we use (avoids a dependency on @cloudflare/workers-types).
interface D1Statement {
  bind(...values: unknown[]): { run(): Promise<unknown> };
}
export interface Env {
  DB?: { prepare(sql: string): D1Statement };
}

const ORIGIN = 'https://wattsplain.com';
const MAX_BODY = 512;

export async function handleEvent(req: Request, env: Env, now = new Date()): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  // Only our own pages may send events.
  const origin = req.headers.get('origin');
  if (origin !== null && origin !== ORIGIN) return new Response(null, { status: 403 });
  const text = await req.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const ev = parseEvent(body, req.headers.get('user-agent') ?? '');
  if (!ev) return new Response(null, { status: 400 });
  // Analytics is off until the database is bound; the page never notices.
  if (env.DB) {
    await env.DB.prepare(
      `INSERT INTO daily_events (day, path, event, source, segment, count) VALUES (?1, ?2, ?3, ?4, ?5, 1)
       ON CONFLICT (day, path, event, source, segment) DO UPDATE SET count = count + 1`,
    )
      .bind(now.toISOString().slice(0, 10), ev.path, ev.event, ev.source, ev.segment)
      .run();
  }
  return new Response(null, { status: 204 });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/e') return handleEvent(req, env);
    return new Response('Not found', { status: 404 });
  },
};
