// Tally's Cloudflare Worker. It does two small jobs and stores nothing else:
//   1. Sync proxy  — lets Tally talk to SimpleFIN from a browser (only forwards to simplefin.org).
//   2. Widget box  — holds one small budget summary (totals per category, no transactions or
//                    account numbers) so the Scriptable home-screen widget can read it.
//
// Setup (dash.cloudflare.com):
//   • Workers & Pages → your worker → Edit code → paste this file → Deploy.
//   • Settings → Variables and Secrets → add a *Secret* named WIDGET_KEY (copy it from Tally → Settings → Widget).
//   • Storage & Databases → KV → Create namespace "tally". Then worker → Settings → Bindings →
//     Add binding → KV namespace → Variable name TALLY_KV → namespace "tally" → Deploy.
//   • Set ALLOWED_ORIGIN below to your GitHub Pages origin (no path).

const ALLOWED_ORIGIN = 'https://peekmeek.github.io';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Tally-Key',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

    if (request.method === 'OPTIONS') {
      return origin === ALLOWED_ORIGIN ? new Response(null, { status: 204, headers: cors }) : new Response('Forbidden', { status: 403 });
    }

    /* ---------- Widget summary ---------- */
    if (url.pathname === '/summary') {
      if (!env.WIDGET_KEY || !env.TALLY_KV) return json({ error: 'Widget storage not set up on the worker (WIDGET_KEY / TALLY_KV).' }, 500);
      if (!safeEqual(request.headers.get('X-Tally-Key') || '', env.WIDGET_KEY)) return json({ error: 'Wrong widget key' }, 401);
      if (request.method === 'GET') {
        const body = await env.TALLY_KV.get('summary');
        return body ? new Response(body, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }) : json({ error: 'No summary yet — open Tally once.' }, 404);
      }
      if (request.method === 'PUT') {
        const text = await request.text();
        if (text.length > 20000) return json({ error: 'Too large' }, 413);
        try { JSON.parse(text); } catch { return json({ error: 'Not JSON' }, 400); }
        await env.TALLY_KV.put('summary', text);
        return json({ ok: true });
      }
      return json({ error: 'Method not allowed' }, 405);
    }

    /* ---------- SimpleFIN proxy ---------- */
    if (origin !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });
    const target = url.searchParams.get('target');
    let dest;
    try { dest = new URL(target); } catch { return new Response('Bad target', { status: 400, headers: cors }); }
    if (dest.protocol !== 'https:' || !(dest.hostname === 'simplefin.org' || dest.hostname.endsWith('.simplefin.org'))) {
      return new Response('Target not allowed', { status: 403, headers: cors });
    }
    const headers = {};
    const auth = request.headers.get('Authorization');
    if (auth) headers.Authorization = auth;
    if (request.method === 'POST') headers['Content-Length'] = '0';
    const upstream = await fetch(dest.toString(), { method: request.method, headers });
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') || 'text/plain', 'Cache-Control': 'no-store' },
    });
  },
};

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
