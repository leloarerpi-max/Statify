// Statify - robot de notifications (Cloudflare Worker, gratuit).
// - Se réveille toutes les minutes (déclencheur « Cron »).
// - Hors match : il ne contacte même pas ESPN (il connaît le calendrier en mémoire).
// - Quand un de tes matchs approche (30 min avant) ou est en cours : il interroge ESPN toutes les ~20 s pendant la minute.
// - Envoie les alertes via ntfy.sh : coup d'envoi, buts, score final, multiplex avec évolution du classement.
// - Statify lui envoie directement tes étoiles dorées (adresse /sync) : aucun fichier à modifier.
//
// Réglages à connaître (tout le reste se fait depuis l'appli Statify) :
const SETTINGS = {
  everySeconds: 20,                                   // délai entre deux vérifications pendant un match (min. 10)
  multiplex: true,                                    // alertes « Multiplex » (3 matchs ou plus qui démarrent ensemble)
  multiplexLeagues: ['fra.1', 'uefa.champions'],      // championnats concernés
  alerts: { kickoff: true, score: true, final: true } // types d'alertes
};
// Secrets à créer dans Cloudflare : NTFY_TOPIC (nom secret ntfy), SYNC_KEY (mot de passe partagé avec Statify) et NTFY_TOKEN (jeton de ton compte ntfy).
// Espace de stockage (KV) à lier sous le nom : STATE.

const LGN = { 'fra.1': 'Ligue 1', 'eng.1': 'Premier League', 'esp.1': 'Liga', 'ita.1': 'Serie A', 'ger.1': 'Bundesliga', 'uefa.champions': 'Ligue des champions', 'uefa.europa': 'Europa League', 'uefa.europa.conf': 'Conférence League' };
const ESPN_TRI = { WSH: 'WAS', NO: 'NOP', UTAH: 'UTA', SA: 'SAS', NY: 'NYK', GS: 'GSW' };   // codes ESPN -> codes de l'appli
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-key', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const reply = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hm = iso => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const clean = (a, re, max = 400) => (Array.isArray(a) ? a : []).map(String).filter(x => re.test(x)).slice(0, max);

/* ------------------------------------------------------------------ */
/* Partie « appli » : réception des étoiles et test                    */
/* ------------------------------------------------------------------ */
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const u = new URL(req.url);
    if (u.pathname === '/') return new Response('Statify robot : en marche ✓', { headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });
    if (!env.SYNC_KEY || req.headers.get('x-key') !== env.SYNC_KEY) return reply({ ok: false, error: 'Clé refusée' }, 401);
    if (u.pathname === '/sync' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return reply({ ok: false, error: 'Données illisibles' }, 400); }
      const cfg = {
        nba: clean(b.nba, /^[A-Z]{2,4}$/, 40),
        foot: {
          teams: clean(b.foot?.teams, /^.{1,80}$/, 200),
          ids: clean(b.foot?.ids, /^\d{1,8}$/),
          leagues: clean(b.foot?.leagues, /^[a-z0-9.]{3,30}$/, 30),
          matches: clean(b.foot?.matches, /^\d{1,12}$/)
        },
        maj: Date.now()
      };
      const old = await env.STATE.get('cfg');
      await env.STATE.put('cfg', JSON.stringify(cfg));
      await env.STATE.delete('sched');                       // calendrier à reconstruire avec les nouvelles équipes
      return reply({ ok: true, nba: cfg.nba.length, clubs: cfg.foot.ids.length || cfg.foot.teams.length, matches: cfg.foot.matches.length, changed: old !== JSON.stringify(cfg) });
    }
    if (u.pathname === '/test') {
      const ok = await ntfy(env, '✅ Statify : test', 'Le robot est bien relié à ton téléphone.');
      return reply({ ok }, ok ? 200 : 502);
    }
    if (u.pathname === '/status') {
      const cfg = JSON.parse((await env.STATE.get('cfg')) || 'null');
      return reply({ ok: true, configured: !!cfg, nba: cfg?.nba?.length || 0, clubs: cfg?.foot?.ids?.length || 0, majLe: cfg?.maj ? new Date(cfg.maj).toISOString() : null });
    }
    return reply({ ok: false, error: 'Inconnu' }, 404);
  },
  async scheduled(_ev, env, ctx) { ctx.waitUntil(run(env).catch(e => console.error('Erreur robot :', e && e.stack || e))); }
};

// Jeton ntfy (secret NTFY_TOKEN, facultatif mais conseillé) : sans lui, ntfy limite les envois venant de Cloudflare (erreur 429)
const hdrNtfy = env => ({ 'Content-Type': 'application/json', ...((env.NTFY_TOKEN || '').trim() ? { Authorization: 'Bearer ' + env.NTFY_TOKEN.trim() } : {}) });
async function ntfy(env, title, message) {
  const topic = (env.NTFY_TOPIC || '').trim();
  if (topic.length < 8) { console.error('NTFY_TOPIC manquant ou trop court'); return false; }
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: hdrNtfy(env), body: JSON.stringify({ topic, title, message }) });
      if (r.ok) return true;
      console.log('ntfy a répondu', r.status);
    } catch (e) { console.log('ntfy injoignable :', e.message); }
    await sleep(1200);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Partie « robot »                                                    */
/* ------------------------------------------------------------------ */
async function run(env) {
  // la limite gratuite est de 50 requêtes par réveil : on les compte
  let reqs = 0;
  const F = (u, o) => { reqs++; return fetch(u, o); };

  const cfg = JSON.parse((await env.STATE.get('cfg')) || 'null'); reqs++;
  if (!cfg) { console.log("Aucune équipe reçue : ouvre Statify > Cloud > Alertes et touche « Activer »."); return; }
  if (!(env.NTFY_TOPIC || '').trim() || env.NTFY_TOPIC.trim().length < 8) { console.error('NTFY_TOPIC manquant ou trop court'); return; }
  let st = JSON.parse((await env.STATE.get('st')) || '{}'); reqs++;
  let sched = JSON.parse((await env.STATE.get('sched')) || '{}'); reqs++;
  let savedSt = JSON.stringify(st);

  const alerts = SETTINGS.alerts, mx = { enabled: SETTINGS.multiplex, leagues: SETTINGS.multiplexLeagues };
  const favF = (cfg.foot.teams || []).map(norm);
  const favIds = new Set((cfg.foot.ids || []).map(String));
  const pickF = new Set((cfg.foot.matches || []).map(String));
  let now = Date.now(), msgs = [], blocked = false, act = new Map();
  const push = (title, body, undo) => msgs.push([title, body, undo]);
  const sides = e => { const c = e.competitions?.[0]; return c && ['home', 'away'].map(s => c.competitors.find(x => x.homeAway === s)); };

  const footLg = cfg.foot.leagues || [];
  const mxLeagues = new Set(mx.enabled ? mx.leagues : []);
  const PATHS = [];
  if ((cfg.nba || []).length) PATHS.push({ path: 'basketball/nba', kind: 'nba', code: 'NBA', foot: true, mx: false });
  for (const lg of new Set([...footLg, ...mxLeagues])) PATHS.push({ path: `soccer/${lg}`, kind: 'foot', code: lg, foot: footLg.includes(lg), mx: mxLeagues.has(lg) });
  if (!PATHS.length) return;

  function isMine(e, kind) {
    const [h, a] = sides(e) || []; if (!h || !a) return false;
    return kind === 'nba'
      ? [h, a].some(t => (cfg.nba || []).includes(ESPN_TRI[t.team.abbreviation] || t.team.abbreviation))
      : pickF.has(String(e.id)) || [h, a].some(t => favIds.has(String(t.team.id)) || (!favIds.size && favF.some(f => norm(t.team.displayName) === f || norm(t.team.shortDisplayName) === f || (f.length > 4 && norm(t.team.displayName).includes(f)))));
  }

  // --- lecture d'un tableau de scores ESPN (une requête par jour) ---
  async function board(path, ds, failed) {
    const out = [];
    for (const d of ds) {
      try {
        const r = await F(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${d}`);
        if (r.status === 429 || r.status === 403) { blocked = true; failed?.add(d); }
        else if (r.ok) out.push(...((await r.json()).events || []).map(e => { e._d = d; return e; }));
        else failed?.add(d);
      } catch { failed?.add(d); }
    }
    return [...new Map(out.map(e => [e.id, e])).values()];
  }

  // --- calendrier gardé en mémoire : évite d'interroger ESPN quand rien ne se passe ---
  async function refreshOneSchedule() {
    const stale = PATHS.filter(p => !sched[p.path] || now - sched[p.path].t > 45 * 60e3).sort((a, b) => (sched[a.path]?.t || 0) - (sched[b.path]?.t || 0))[0];
    if (!stale) return;
    const ds = [ymd(new Date(now - 864e5)), ymd(new Date(now)), ymd(new Date(now + 864e5))], failed = new Set();
    const ev = await board(stale.path, ds, failed);
    if (failed.size === ds.length) return;      // échec total : on réessaiera à la prochaine minute
    sched[stale.path] = { t: now, evs: ev.filter(e => stale.mx || (stale.foot && isMine(e, stale.kind))).map(e => ({ id: String(e.id), date: e.date, d: e._d })) };
    await env.STATE.put('sched', JSON.stringify(sched)); reqs++;
  }
  function activeFromSchedule() {
    const m = new Map();
    for (const p of PATHS) for (const e of sched[p.path]?.evs || []) {
      const t = Date.parse(e.date); if (!t || st[e.id]?.f || st[e.id]?.x) continue;
      if (t - now <= 30 * 60e3 && now - t < 5 * 3600e3) { if (!m.has(p.path)) m.set(p.path, new Set()); m.get(p.path).add(e.d); }
    }
    return m;
  }
  // un match est « actif » s'il est en cours ou démarre dans moins de 30 min : le robot reste alors allumé
  function mark(path, e) {
    const state = e.status?.type?.state, t = Date.parse(e.date);
    if ((state === 'in' && now - t < 5 * 3600e3) || (state === 'pre' && t - now <= 30 * 60e3 && t - now > -10 * 60e3)) {
      if (!act.has(path)) act.set(path, new Set()); act.get(path).add(e._d);
    }
  }

  // --- alertes d'un match de mes équipes ---
  function handle(e, kind, label) {
    const lgName = kind === 'nba' ? 'NBA' : (LGN[label] || label), ico = kind === 'nba' ? '🏀' : '⚽';
    const [h, a] = sides(e) || []; if (!h || !a) return;
    if (!isMine(e, kind)) return;
    const name = t => t.team.shortDisplayName || t.team.displayName;
    const state = e.status?.type?.state, start = Date.parse(e.date);
    const score = `${name(h)} ${h.score ?? 0} - ${a.score ?? 0} ${name(a)}`;
    const s = (st[e.id] ||= {});
    if (alerts.kickoff && state === 'pre' && !s.k && start - now <= 20 * 60e3 && start - now > -5 * 60e3) {
      s.k = 1; push(`⏰ Coup d'envoi à ${hm(e.date)} · ${lgName}`, `${ico} ${name(h)} - ${name(a)}`, () => { delete s.k; });
    }
    // le multiplex ne couvre que les matchs de son groupe : les autres matchs de mes clubs gardent leur alerte « BUT ! »
    const inMx = mx.enabled && mx.leagues.includes(label) && Object.keys(st).some(k => k.startsWith(`mx:${label}:`) && (st[k].ids || []).includes(String(e.id)) && now - Number(k.split(':')[2]) < 3.5 * 3600e3 && now >= Number(k.split(':')[2]) - 5 * 60e3);
    if (alerts.score && kind === 'foot' && state === 'in' && !inMx) {
      const sc = `${h.score}-${a.score}`, old = s.sc;
      if (old !== undefined && old !== sc) push(`⚽ BUT ! · ${lgName}`, `${score}${e.status?.displayClock ? ` (${e.status.displayClock})` : ''}`, () => { s.sc = old; });
      s.sc = sc;
    }
    if (alerts.final && state === 'post' && !s.f && now - start < 8 * 3600e3) {
      s.f = 1; push(`🏁 Terminé · ${lgName}`, `${ico} ${score}`, () => { delete s.f; });
    }
  }

  // --- multiplex : >= 3 matchs d'un même championnat qui démarrent à moins de 30 min d'écart ---
  function clusters(evs) {
    const L = evs.map(e => ({ e, t: Date.parse(e.date) })).filter(x => x.t).sort((a, b) => a.t - b.t), out = [];
    for (let i = 0; i < L.length; i++) { const c = L.filter(x => x.t >= L[i].t && x.t <= L[i].t + 30 * 60e3); if (c.length >= 3) { out.push({ start: L[i].t, evs: c.map(x => x.e) }); i += c.length - 1; } }
    return out;
  }
  async function standings(lg) {
    try {
      const r = await F(`https://site.api.espn.com/apis/v2/sports/soccer/${lg}/standings`); if (!r.ok) return null;
      const ent = ((await r.json()).children || []).flatMap(c => c.standings?.entries || []);
      const g = (e, n) => +(e.stats || []).find(x => x.name === n)?.value || 0;
      return ent.map(e => ({ id: String(e.team.id), n: e.team.shortDisplayName || e.team.displayName, pts: g(e, 'points'), gd: g(e, 'pointDifferential'), gf: g(e, 'pointsFor'), rank: g(e, 'rank') }));
    } catch { return null; }
  }
  function project(base, evs, prev) {
    const rows = base.map(r => ({ ...r })), by = Object.fromEntries(rows.map(r => [r.id, r]));
    for (const e of evs) { if (e.status?.type?.state !== 'in') continue; const [h, a] = sides(e) || []; if (!h || !a) continue;
      const sc = prev?.[e.id] ?? [+h.score || 0, +a.score || 0];
      for (const [t, gf, ga] of [[h, sc[0], sc[1]], [a, sc[1], sc[0]]]) { const r = by[String(t.team.id)]; if (!r) continue; r.pts += gf > ga ? 3 : gf === ga ? 1 : 0; r.gd += gf - ga; r.gf += gf; } }
    rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.rank - b.rank); rows.forEach((r, i) => { r.nr = i + 1; });
    return by;
  }
  async function multiplexAlerts(lg, evs) {
    if (!mx.enabled) return;
    const cl = clusters(evs); if (!cl.length) return;
    const label = LGN[lg] || lg;
    for (const c of cl) {
      const key = `mx:${lg}:${c.start}`, s = (st[key] ||= {});
      s.ids = c.evs.map(e => String(e.id));      // les matchs couverts par ce multiplex
      if (!s.k && c.start - now <= 25 * 60e3 && c.start - now > -5 * 60e3) {
        s.k = 1; push(`🔥 Multiplex ${label} dans ${Math.max(0, Math.round((c.start - now) / 60e3))} min`, `${c.evs.length} matchs à ${hm(c.evs[0].date)} : ` + c.evs.map(e => { const [h, a] = sides(e) || []; return h && a ? `${h.team.shortDisplayName || h.team.displayName}-${a.team.shortDisplayName || a.team.displayName}` : ''; }).join(', '), () => { delete s.k; });
      }
      // pendant le multiplex : chaque but de TOUS les matchs, avec l'évolution au classement
      if (now >= c.start - 5 * 60e3 && now <= c.start + 3.5 * 3600e3) {
        const live = c.evs.filter(e => e.status?.type?.state === 'in'); if (!live.length) continue;
        const prev = (s.prev ||= {}), changes = [];
        for (const e of live) { const [h, a] = sides(e) || []; if (!h || !a) continue; const cur = [+h.score || 0, +a.score || 0], p = prev[e.id];
          if (p && (p[0] !== cur[0] || p[1] !== cur[1])) changes.push({ e, h, a, p, cur }); }
        let base = null; if (changes.length) base = await standings(lg);
        for (const ch of changes) {
          const { e, h, a, p, cur } = ch, scorer = cur[0] > p[0] ? h : a, nm = t => t.team.shortDisplayName || t.team.displayName;
          let rk = '';
          if (base && base.length) { const before = project(base, [e], { [e.id]: p }), after = project(base, [e]), id = String(scorer.team.id);
            const o = n => n === 1 ? '1er' : n + 'e';
            if (before[id] && after[id]) rk = before[id].nr !== after[id].nr ? ` · ${nm(scorer)} ${after[id].nr < before[id].nr ? 'passe' : 'tombe'} ${o(before[id].nr)} → ${o(after[id].nr)}` : ` · ${nm(scorer)} ${o(after[id].nr)}`; }
          push(`🚨 But à ${nm(scorer)} (${label})`, `${nm(h)} ${cur[0]} - ${cur[1]} ${nm(a)}${e.status?.displayClock ? ` (${e.status.displayClock})` : ''}${rk}`, () => { prev[e.id] = p; });
        }
        for (const e of live) { const [h, a] = sides(e) || []; if (h && a) prev[e.id] = [+h.score || 0, +a.score || 0]; }
      }
    }
  }

  // --- un passage : on lit les matchs actifs, on prépare les alertes ---
  async function pass(plan) {
    now = Date.now(); msgs = []; act = new Map();
    await Promise.all(plan.map(async p => {
      const failed = new Set(), ev = await board(p.path, p.ds, failed);
      // requête en échec : on garde ce chemin actif pour réessayer, au lieu d'arrêter le suivi en plein match
      if (failed.size) { if (!act.has(p.path)) act.set(p.path, new Set()); failed.forEach(d => act.get(p.path).add(d)); }
      if (p.foot) ev.forEach(e => handle(e, p.kind, p.code));
      if (p.mx) await multiplexAlerts(p.code, ev);
      ev.forEach(e => {
        if (e.status?.type?.state === 'post' && !isMine(e, p.kind)) (st[e.id] ||= {}).x = 1;   // match terminé qui ne me concerne pas : on ne le suit plus
        if ((p.foot && isMine(e, p.kind)) || p.mx) mark(p.path, e);
      });
    }));
  }
  async function flush() {
    let sent = 0;
    for (const [title, body, undo] of msgs) {
      let ok = false;
      for (let i = 0; i < 3 && !ok && reqs < 48; i++) {
        try {
          const r = await F('https://ntfy.sh/', { method: 'POST', headers: hdrNtfy(env), body: JSON.stringify({ topic: env.NTFY_TOPIC.trim(), title, message: body }) });
          ok = r.ok; if (!ok) console.log('ntfy a répondu', r.status);
        } catch (e) { console.log('ntfy injoignable :', e.message); }
        if (!ok) await sleep(1000);
      }
      if (ok) { sent++; console.log('envoyé :', title, '|', body); }
      else { undo?.(); console.log('NON envoyé (sera retenté) :', title); }   // on oublie qu'on l'a envoyé -> nouvelle tentative au prochain réveil
    }
    return sent;
  }
  async function save() {
    for (const k of Object.keys(st)) { if (!st[k].t) st[k].t = now; if (now - st[k].t > 3 * 864e5) delete st[k]; }   // on oublie les vieux matchs
    const s = JSON.stringify(st);
    if (s !== savedSt) { await env.STATE.put('st', s); reqs++; savedSt = s; }
  }

  // ---------------- boucle principale ----------------
  now = Date.now();
  let plan = [];
  const first = activeFromSchedule();
  if (!first.size) { await refreshOneSchedule(); return; }        // rien d'actif : on met juste le calendrier à jour
  const mkPlan = m => PATHS.filter(p => m.has(p.path)).map(p => ({ ...p, ds: [...m.get(p.path)] }));
  plan = mkPlan(first);
  const EVERY = Math.max(10, +SETTINGS.everySeconds || 20) * 1000, BUDGET = 52e3, t0 = Date.now();
  for (;;) {
    await pass(plan);
    await flush(); await save();
    if (blocked) { console.log('ESPN limite les requêtes : on arrête, nouvel essai à la prochaine minute'); break; }
    if (!act.size) break;                                          // plus rien d'actif
    plan = mkPlan(act);
    const nextCost = plan.reduce((n, p) => n + p.ds.length, 0) + 6;
    if (Date.now() - t0 + EVERY + 4000 > BUDGET || reqs + nextCost > 48) break;   // la minute suivante reprendra
    await sleep(EVERY);
  }
}
