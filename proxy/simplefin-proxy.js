// Tiny Cloudflare Worker that lets Tally talk to SimpleFIN from a browser.
// It only forwards to simplefin.org, only answers your own site, and stores nothing.
//
// Deploy: dash.cloudflare.com → Workers & Pages → Create → "Hello World" worker →
// Edit code → paste this file → set ALLOWED_ORIGIN below → Deploy.
// Then paste the worker's URL into Tally → Settings → Sync proxy.

const ALLOWED_ORIGIN = 'https://peekmeek.github.io'; // your GitHub Pages origin (no path)

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (origin !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const target = new URL(request.url).searchParams.get('target');
    let url;
    try { url = new URL(target); } catch { return new Response('Bad target', { status: 400, headers: cors }); }
    if (url.protocol !== 'https:' || !(url.hostname === 'simplefin.org' || url.hostname.endsWith('.simplefin.org'))) {
      return new Response('Target not allowed', { status: 403, headers: cors });
    }

    const headers = {};
    const auth = request.headers.get('Authorization');
    if (auth) headers.Authorization = auth;
    if (request.method === 'POST') headers['Content-Length'] = '0';

    const upstream = await fetch(url.toString(), { method: request.method, headers });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') || 'text/plain', 'Cache-Control': 'no-store' },
    });
  },
};
