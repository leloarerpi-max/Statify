// Relais Statify : lit une page de basketusa.com à ta place (un navigateur ne peut pas le faire seul).
// Il n'accepte QUE les pages de basketusa.com, et ne répond qu'à ton site Statify.
const ALLOWED_HOSTS = ['www.basketusa.com', 'basketusa.com'];
const ALLOWED_ORIGINS = ['https://leloarerpi-max.github.io'];

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const u = new URL(req.url);
    const wanted = u.searchParams.get('url');
    if (!wanted) return new Response('Relais Statify : en marche ✓', { headers: { ...cors, 'content-type': 'text/plain; charset=utf-8' } });

    let target;
    try { target = new URL(wanted); } catch (e) { return new Response('adresse invalide', { status: 400, headers: cors }); }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.includes(target.hostname)) {
      return new Response('site non autorisé', { status: 403, headers: cors });
    }

    try {
      const r = await fetch(target.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9'
        },
        redirect: 'follow',
        cf: { cacheTtl: 300, cacheEverything: true }
      });
      return new Response(await r.text(), {
        status: r.status,
        headers: { ...cors, 'content-type': r.headers.get('content-type') || 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
      });
    } catch (e) {
      return new Response('relais : ' + (e && e.message || e), { status: 502, headers: cors });
    }
  }
};
