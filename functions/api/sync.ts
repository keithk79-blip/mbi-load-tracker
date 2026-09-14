interface Env {
  DB: D1Database;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const key = url.searchParams.get('key');
  if (key) {
    const row = await context.env.DB.prepare('SELECT value, updated_at FROM kv_store WHERE key = ?').bind(key).first();
    if (!row) return json({ error: 'not found' }, 404);
    return json({ key, value: row.value, updated_at: row.updated_at });
  }
  const since = url.searchParams.get('since') || '1970-01-01T00:00:00Z';
  const results = await context.env.DB.prepare('SELECT key, value, updated_at FROM kv_store WHERE updated_at > ? ORDER BY updated_at ASC').bind(since).all();
  return json({ items: results.results, server_time: new Date().toISOString() });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json<{ items?: Array<{ key: string; value: string; device_id?: string }>; key?: string; value?: string; device_id?: string }>();
  if (body.key && body.value !== undefined) {
    await context.env.DB.prepare(`INSERT INTO kv_store (key, value, updated_at, device_id) VALUES (?, ?, datetime('now'), ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now'), device_id = excluded.device_id`).bind(body.key, body.value, body.device_id || null).run();
    return json({ ok: true, key: body.key });
  }
  const items = body.items || [];
  if (items.length === 0) return json({ ok: true, upserted: 0 });
  const stmt = context.env.DB.prepare(`INSERT INTO kv_store (key, value, updated_at, device_id) VALUES (?, ?, datetime('now'), ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now'), device_id = excluded.device_id`);
  await context.env.DB.batch(items.map((item) => stmt.bind(item.key, item.value, item.device_id || null)));
  return json({ ok: true, upserted: items.length });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const key = url.searchParams.get('key');
  if (!key) return json({ error: 'key required' }, 400);
  await context.env.DB.prepare('DELETE FROM kv_store WHERE key = ?').bind(key).run();
  return json({ ok: true, deleted: key });
};
