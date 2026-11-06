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
  alerts: {                                           // types d'alertes (true = activée, false = coupée)
    kickoff: true,                                    //   coup d'envoi (≈ 20 min avant)
    score: true,                                      //   buts, buts annulés (VAR), score actuel si le robot arrive en cours de match
    final: true,                                      //   score final
    redCard: true,                                    //   cartons rouges (foot)
    halfTime: true,                                   //   mi-temps (foot)
    extraTime: true                                   //   prolongations et tirs au but (foot)
  }
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
    if (u.pathname === '/') return new Response('Statify robot : en marche ✓ (version 5, tennis ATP + détails)', { headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });
    const p0 = t => t.slice(2200, 3200);
    if (u.pathname === '/rdj-diag') {                      // diagnostic RueDesJoueurs (lecture seule, isolé ; clé en ?key=)
      if (!env.SYNC_KEY || u.searchParams.get('key') !== env.SYNC_KEY) return reply({ ok: false, error: 'Clé refusée' }, 401);
      try {
        const chemin = (u.searchParams.get('p') || '/').replace(/[^\w\-./?=&%]/g, '');
        const r = await fetch('https://www.ruedesjoueurs.com' + (chemin.startsWith('/') ? chemin : '/' + chemin), { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Statify)', 'accept-language': 'fr-FR,fr;q=0.9' } });
        const html = await r.text();
        const liens = [...new Set([...html.matchAll(/href="([^"#]*(?:tennis|pronostic)[^"#]*)"/gi)].map(m => m[1]))].slice(0, 60);
        const texte = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const autour = []; for (const m of texte.matchAll(/(pronostic|cote|favori|conseil|notre avis|mise)/gi)) { if (autour.length >= 14) break; const i = m.index; if (autour.some(a => Math.abs(a.i - i) < 500)) continue; autour.push({ i, t: texte.slice(Math.max(0, i - 150), i + 350) }); }
        const jsonld = [...html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].slice(0, 800)).slice(0, 3);
        const ctx = (u.searchParams.get('ctx') || '').replace(/[^\w\s\-éèàç]/g, '').slice(0, 30);
        const motif = ctx ? html.split(ctx).slice(1, 4).map(x => x.slice(0, 700)) : [];
        const g = (u.searchParams.get('grep') || '').replace(/[^\w\s\-éèàç]/g, '').slice(0, 30);
        const trouves = []; if (g) { const re = new RegExp(g, 'gi'); let mm; while ((mm = re.exec(html)) && trouves.length < 400) trouves.push(mm.index); }
        const extraits = trouves.slice(-8).map(i => html.slice(Math.max(0, i - 300), i + 400));
        return reply({ ok: r.ok, status: r.status, taille: html.length, titre: (html.match(/<title>([^<]*)/i) || [])[1] || '', grep: g, nbTrouves: trouves.length, extraits });
      } catch (e) { return reply({ ok: false, error: String(e && e.message || e) }, 502); }
    }
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
    if (u.pathname === '/rdj') {                           // pronostic d'expert RueDesJoueurs pour un match (lecture seule, isolé)
      try { return reply(await rdjMatch(u.searchParams.get('a'), u.searchParams.get('b'), u.searchParams.get('debug') === '1')); }
      catch (e) { return reply({ ok: false, error: String(e && e.message || e) }, 502); }
    }
    if (u.pathname === '/tennis-detail') {
      try { return reply(await tennisDetail(u.searchParams.get('id'), u.searchParams.get('debug') === '1')); }
      catch (e) { return reply({ ok: false, error: String(e && e.message || e) }, 502); }
    }
    if (u.pathname === '/tennis') {
      try { return reply(await tennisDuJour(u.searchParams.get('date'), u.searchParams.get('debug') === '1', env)); }
      catch (e) { return reply({ ok: false, error: String(e && e.message || e) }, 502); }
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

  // --- événements du match (buteur, minute, penalty, csc, cartons) : ESPN les range dans competitions[0].details ---
  const frDe = n => /^Le /.test(n) ? 'du ' + n.slice(3) : /^Les /.test(n) ? 'des ' + n.slice(4) : /^[AEIOUÉÈÂÎHaeiouéèh]/.test(n) ? "d'" + n : 'de ' + n;
  const tname = t => t.team.shortDisplayName || t.team.displayName;
  const detailsOf = e => e.competitions?.[0]?.details || [];
  const who = x => { const ai = (x.athletesInvolved || [])[0] || {}; return ai.shortName || ai.displayName || ''; };
  const tag = x => x.ownGoal ? ' (csc)' : x.penaltyKick ? ' (pen.)' : '';
  // dernier but d'une équipe, uniquement si le nombre de buts listés colle avec le score (sinon on ne devine pas le buteur)
  function lastGoal(e, team, n) {
    const gl = detailsOf(e).filter(x => x.scoringPlay && !x.shootout && String(x.team?.id) === String(team.team.id));
    return gl.length && gl.length === n ? gl[gl.length - 1] : null;
  }
  const goalLine = g => g ? `⚽ ${who(g)} ${g.clock?.displayValue || ''}${tag(g)}`.replace(/\s+/g, ' ').trim() : '';
  // compare l'ancien et le nouveau score : [{ type: 'void' }] si un score a baissé (but annulé), puis un { type: 'goal', t, g } par équipe qui a marqué
  function scoreChanges(e, h, a, old, cur) {
    const out = [];
    if (cur[0] < old[0] || cur[1] < old[1]) out.push({ type: 'void' });
    [[h, old[0], cur[0]], [a, old[1], cur[1]]].forEach(([t, o, n]) => { if (n > o) out.push({ type: 'goal', t, g: lastGoal(e, t, n) }); });
    return out;
  }
  const parseSc = v => { const m = /^(\d+)-(\d+)$/.exec(v || ''); return m ? [+m[1], +m[2]] : null; };

  // --- alertes d'un match de mes équipes ---
  function handle(e, kind, label) {
    const lgName = kind === 'nba' ? 'NBA' : (LGN[label] || label), ico = kind === 'nba' ? '🏀' : '⚽';
    const [h, a] = sides(e) || []; if (!h || !a) return;
    if (!isMine(e, kind)) return;
    const name = t => t.team.shortDisplayName || t.team.displayName;
    const state = e.status?.type?.state, start = Date.parse(e.date);
    const score = `${name(h)} ${h.score ?? 0} - ${a.score ?? 0} ${name(a)}`;
    const s = (st[e.id] ||= {});
    const clk = e.status?.displayClock ? ` (${e.status.displayClock})` : '', sn = e.status?.type?.name || '';
    if (kind === 'foot' && state === 'pre') { s.sc ??= '0-0'; s.rc ??= 0; }     // match pas commencé : on part de 0-0 et 0 carton rouge
    if (alerts.kickoff && state === 'pre' && !s.k && start - now <= 20 * 60e3 && start - now > -5 * 60e3) {
      s.k = 1; push(`⏰ Coup d'envoi à ${hm(e.date)} · ${lgName}`, `${ico} ${name(h)} - ${name(a)}`, () => { delete s.k; });
    }
    // le multiplex ne couvre que les matchs de son groupe : les autres matchs de mes clubs gardent leur alerte « BUT ! »
    const inMx = mx.enabled && mx.leagues.includes(label) && Object.keys(st).some(k => k.startsWith(`mx:${label}:`) && (st[k].ids || []).includes(String(e.id)) && now - Number(k.split(':')[2]) < 3.5 * 3600e3 && now >= Number(k.split(':')[2]) - 5 * 60e3);
    if (alerts.score && kind === 'foot' && state === 'in' && !inMx) {
      const sc = `${h.score ?? 0}-${a.score ?? 0}`, old = s.sc, o = parseSc(old), cur = parseSc(sc);
      if (old === undefined) {
        // le robot découvre un match déjà commencé (réveil tardif, mémoire vidée) : il donne le score au lieu de le taire
        if (cur && cur[0] + cur[1] > 0) push(`📊 Score actuel · ${lgName}`, `${score}${clk}`, () => { delete s.sc; });
      } else if (o && cur && old !== sc) {
        for (const c of scoreChanges(e, h, a, o, cur)) {
          if (c.type === 'void') push(`❌ But annulé · ${lgName}`, `${score}${clk}`, () => { s.sc = old; });
          else push(`⚽ But ${frDe(name(c.t))} · ${lgName}`, `${score}${c.g ? '\n' + goalLine(c.g) : clk}`, () => { s.sc = old; });
        }
      }
      s.sc = sc;
    }
    if (kind === 'foot' && state === 'in') {
      // cartons rouges : un message par nouveau carton (3 au plus d'un coup)
      if (alerts.redCard) {
        const reds = detailsOf(e).filter(x => x.redCard && !x.scoringPlay && !x.shootout);
        if (s.rc === undefined) s.rc = reds.length;                       // première vue en cours de match : on ne rejoue pas l'historique
        else if (reds.length > s.rc) {
          const before = s.rc; s.rc = reds.length;
          reds.slice(before, before + 3).forEach(x => {
            const tm = [h, a].find(t => String(t.team.id) === String(x.team?.id));
            push(`🟥 Carton rouge · ${lgName}`, `${score}\n🟥 ${who(x) || 'Joueur'}${tm ? ` (${name(tm)})` : ''} ${x.clock?.displayValue || ''}`.trim(), () => { s.rc = before; });
          });
        }
      }
      // noms de statut ESPN : le nom exact des prolongations / tirs au but est à confirmer sur un vrai match
      if (alerts.halfTime && /HALFTIME/.test(sn) && !s.ht) { s.ht = 1; push(`⏸ Mi-temps · ${lgName}`, score, () => { delete s.ht; }); }
      if (alerts.extraTime && /EXTRA/.test(sn) && !s.et) { s.et = 1; push(`⏱ Prolongations · ${lgName}`, score, () => { delete s.et; }); }
      if (alerts.extraTime && /SHOOTOUT/.test(sn) && !s.so) { s.so = 1; push(`🥅 Tirs au but · ${lgName}`, score, () => { delete s.so; }); }
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
          const { e, h, a, p, cur } = ch, nm = tname, sc = `${nm(h)} ${cur[0]} - ${cur[1]} ${nm(a)}`, clk = e.status?.displayClock ? ` (${e.status.displayClock})` : '';
          for (const c of scoreChanges(e, h, a, p, cur)) {
            // score qui baisse = but annulé (avant, il était annoncé comme un but de l'équipe adverse)
            if (c.type === 'void') { push(`❌ But annulé (${label})`, `${sc}${clk}`, () => { prev[e.id] = p; }); continue; }
            const scorer = c.t;
            let rk = '';
            if (base && base.length) { const before = project(base, [e], { [e.id]: p }), after = project(base, [e]), id = String(scorer.team.id);
              const o = n => n === 1 ? '1er' : n + 'e';
              if (before[id] && after[id]) rk = before[id].nr !== after[id].nr ? ` · ${nm(scorer)} ${after[id].nr < before[id].nr ? 'passe' : 'tombe'} ${o(before[id].nr)} → ${o(after[id].nr)}` : ` · ${nm(scorer)} ${o(after[id].nr)}`; }
            push(`🚨 But à ${nm(scorer)} (${label})`, `${sc}${c.g ? '\n' + goalLine(c.g) : clk}${rk}`, () => { prev[e.id] = p; });
          }
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


/* ------------------------------------------------------------------ */
/* Tennis : matchs du jour + cotes (page publique de Tennis Explorer)  */
/* Seuls les tournois du circuit (ATP / WTA, 250 et plus) sont gardés.  */
/* Si Tennis Explorer change sa page, c'est cette partie qu'on ajuste.  */
/* ------------------------------------------------------------------ */
const TE = 'https://www.tennisexplorer.com';
const txt = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const parisYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });   // AAAA-MM-JJ

// Liste « Main tournaments » (colonne de droite) : sert de liste blanche (exclut Challengers, ITF, UTR…)
function tournoisPrincipaux(html) {
  const a = html.search(/Main tournaments/i), b = html.search(/Lower level tournaments/i);
  if (a < 0 || b < 0 || b <= a) return null;
  const set = new Set();
  html.slice(a, b).replace(/<a [^>]*>([\s\S]*?)<\/a>/gi, (_m, t) => { const n = norm(txt(t)).replace(/\s+(wta|atp)$/, ''); if (n) set.add(n); return ''; });
  return set.size ? set : null;
}
function estPrincipal(nom, href, liste) {
  const n = norm(nom);
  if (/challenger|futures|\bitf\b|utr|\b125\b|exhibition|exhibit|qualif|\bqual\b|\(q\)/.test(n) || /qualif/i.test(href || '')) return false;   // pas de petits tournois ni de qualifications
  if (liste) return [...liste].some(x => n === x || n.startsWith(x + ' ') || x.startsWith(n + ' '));
  return !/challenger|futures|itf|utr/i.test(href || '');          // secours si la liste n'a pas été trouvée
}
// Vainqueur d'après les sets gagnés [sets joueur 1, sets joueur 2] : seulement si net (victoire en 2 sets ou plus)
// Abandon / forfait (ex. 1-0) : on ne devine pas, le vainqueur reste à saisir à la main.
function vainqueur(s) {
  if (!Array.isArray(s) || s.length < 2) return null;
  const a = s[0], b = s[1];
  if (a === b || Math.max(a, b) < 2 || Math.max(a, b) > 3 || Math.min(a, b) > 2) return null;   // 3 sets gagnants au maximum : au-delà, la lecture est douteuse
  return a > b ? 1 : 2;
}
function lireTE(html, ymdStr, tour) {
  const [Y, M, D] = ymdStr.split('-'), cible = `${D}.${M}.${Y}`;
  const liste = tournoisPrincipaux(html);
  const pad = x => String(x).padStart(2, '0');
  const dateDe = t => { const m = String(t).match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/); return m ? `${pad(m[1])}.${pad(m[2])}.${m[3]}` : null; };
  const tabDate = dateDe((html.match(/class="tab">\s*([\d.\s]{8,14})</i) || [])[1]);          // date de l'onglet (« 31. 10. 2026 »)
  const sansDates = !tabDate && !/\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/.test(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ''));
  const out = [];
  let date = tabDate, tournoi = null, tHref = '', cur = null, principal = false, basVu = false;
  const vus = new Set();
  const jourPasse = ymdStr < parisYmd();
  const fin = () => { if (cur && cur.p.length >= 2 && tournoi && principal && (sansDates || date === cible || date === null)) out.push({ tour, tournoi, heure: cur.h, id: cur.id || null, j1: cur.p[0], j2: cur.p[1], c1: cur.o[0] ?? null, c2: cur.o[1] ?? null, w: vainqueur(cur.s) }); cur = null; };
  // Sur la page du jour, Tennis Explorer empile plusieurs jours (hier, aujourd'hui) : chaque jour a son propre onglet de date
  // placé AVANT son tableau, en dehors des lignes <tr>. On suit donc ces onglets au fil de la page.
  const onglets = [...html.matchAll(/class="tab">\s*([\d.\s]{8,14})</gi)].map(m => ({ i: m.index, d: dateDe(m[1]) })).filter(o => o.d);
  let oi = 0;
  for (const rm of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const r = rm[0];
    while (oi < onglets.length && onglets[oi].i < rm.index) {
      if (onglets[oi].d !== date) { fin(); date = onglets[oi].d; basVu = false; vus.clear(); tournoi = null; principal = false; }
      oi++;
    }
    const t = txt(r);
    const joueurs = [...r.matchAll(/<a [^>]*href="[^"]*\/player\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => txt(m[1])).filter(Boolean);
    const duel = r.match(/<a [^>]*href="[^"]*\/match-detail\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const heure = (r.match(/(?:class="[^"]*\btime\b[^"]*"[^>]*>|>)\s*(\d{1,2}:\d{2})\s*</i) || [])[1];
    if (!joueurs.length && !duel) {                         // ligne de titre : date ou tournoi
      fin();
      const dm = dateDe(t);
      if (dm && t.replace(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/, '').replace(/[^\p{L}\d]/gu, '').length < 12) { date = dm; basVu = false; vus.clear(); continue; }   // nouveau jour : on repart de zéro
      const lk = r.match(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      if (lk && txt(lk[2]) && /^<tr[^>]*class="[^"]*\bhead\b/i.test(r) && !/<th[\s>]/i.test(r)) {   // seuls les vrais titres (class="head"), pas la liste des tournois de la semaine
        tHref = lk[1]; tournoi = txt(lk[2]);
        // Tennis Explorer range les qualifications sous un titre qui porte le même nom que le tournoi (« Paris »), APRÈS les petits tournois.
        // Règle : un titre n'est « principal » que s'il est autorisé, jamais vu plus haut, et placé avant tout petit tournoi.
        const cle = tHref || tournoi;
        // « avant tout petit tournoi » : vrai seulement sur les pages de résultats (jours passés), triées par niveau.
        // Sur la page du jour et des jours à venir, Tennis Explorer trie par heure : on ne s'y fie pas.
        principal = estPrincipal(tournoi, tHref, liste) && !vus.has(cle) && !(jourPasse && basVu);
        if (!estPrincipal(tournoi, tHref, liste)) basVu = true;
        vus.add(cle);
      }
      continue;
    }
    if (heure) { fin(); cur = { h: heure, p: [], o: [], s: [] }; }
    else if (!cur) cur = { h: '', p: [], o: [], s: [] };
    { const di = (r.match(/\/match-detail\/\?id=(\d+)/i) || [])[1]; if (di && !cur.id) cur.id = di; }
    const propre = x => String(x || '').replace(/\b(info|h2h|live)\b/gi, ' ').replace(/\s*\(\d+\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    let noms = joueurs.map(propre).filter(Boolean);
    if (noms.length < 2 && duel) { const d = txt(duel[1]); if (/\s-\s/.test(d)) noms = d.split(/\s+-\s+/).map(propre).filter(Boolean); }
    if (noms.length < 2) {                                   // nom en simple texte (sans lien) dans la case « t-name »
      for (const m of r.matchAll(/<td[^>]*class="[^"]*\bt-name\b[^"]*"[^>]*>([\s\S]*?)<\/td>/gi)) {
        const c = propre(txt(m[1]).replace(/^\d{1,2}:\d{2}\s*/, ''));
        const parts = /\s-\s/.test(c) ? c.split(/\s+-\s+/).map(propre) : [c];
        for (const x of parts) if (x && !noms.includes(x)) noms.push(x);
      }
    }
    for (const n of noms) if (cur.p.length < 2 && n && !cur.p.includes(n)) cur.p.push(n);
    const cotes = [...r.matchAll(/<td[^>]*class="[^"]*\bcourse[^"]*"[^>]*>([\s\S]*?)<\/td>/gi)].map(m => parseFloat(txt(m[1]))).filter(x => x > 1 && x < 200);
    for (const c of cotes) if (cur.o.length < 2) cur.o.push(c);
    // score en sets : une case « result » par joueur (2 lignes), ou « 2 - 0 » dans une seule case
    for (const m of r.matchAll(/<td[^>]*class="[^"]*\bresult\b[^"]*"[^>]*>([\s\S]*?)<\/td>/gi)) {
      const v = txt(m[1]), two = v.match(/^(\d)\s*[-:]\s*(\d)$/);
      if (two) cur.s.push(+two[1], +two[2]); else if (/^\d$/.test(v)) cur.s.push(+v);
    }
  }
  fin();
  return out;
}
// Lecture d'une page Tennis Explorer, avec une 2e tentative si le site répond 429/5xx ou une page de blocage.
const CIRCUITS_TENNIS = [['ATP', 'atp-single']];
async function pageTE(page, type, Y, M, D, heads) {
  let dernier = { status: 0, html: '' };
  for (let essai = 0; essai < 2; essai++) {
    try {
      const res = await fetch(`${TE}/${page}/?type=${type}&year=${Y}&month=${M}&day=${D}`, { headers: heads });
      const html = res.ok ? await res.text() : '';
      dernier = { status: res.status, html };
      const blocage = res.ok && (html.length < 400 || /just a moment|captcha|access denied|cf-chl|attention required/i.test(html.slice(0, 6000)));
      if (res.ok && !blocage) return dernier;
      if (blocage) dernier = { status: 'bloqué', html: '' };
      if (res.status !== 429 && res.status < 500 && !blocage) return dernier;   // 403/404 : inutile de réessayer
    } catch (e) { dernier = { status: 'réseau', html: '' }; }
    await new Promise(r => setTimeout(r, 400));
  }
  return dernier;
}

async function tennisDuJour(dateParam, debug, env) {
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(dateParam || '') ? dateParam : parisYmd();
  const [Y, M, D] = jour.split('-');
  const cache = caches.default, ck = new Request(`https://statify.cache/tennis-v3/${jour}`);
  if (!debug) { const hit = await cache.match(ck); if (hit) return await hit.json(); }
  const kv = env && env.STATE, kvKey = `tennis:dernier:${jour}`;
  const heads = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'accept-language': 'en' };
  let matchs = [], brut = {}, erreurs = [], pages = [];
  // Tennis Explorer a 3 pages selon le jour : « matches » = aujourd'hui, « results » = jours passés, « next » = jours à venir.
  // Si la page principale ne donne rien, on essaie l'autre page possible avant de conclure.
  const aujd = parisYmd();
  const essais = jour === aujd ? ['matches', 'next'] : jour < aujd ? ['results'] : ['next'];
  // Circuits suivis : ATP seulement (le WTA est volontairement ignoré). Pour le réactiver : ajouter ['WTA', 'wta-single'].
  for (const [tour, type] of CIRCUITS_TENNIS) {
    let lus = [], htmlDiag = '', dernierStatut = '';
    for (const page of essais) {
      const { status, html } = await pageTE(page, type, Y, M, D, heads);
      pages.push(`${tour} ${page} → ${status}${html ? ' (' + html.length + ' o)' : ''}`);
      if (!html) { dernierStatut = String(status); continue; }
      const l = lireTE(html, jour, tour);
      if (!htmlDiag || l.length) htmlDiag = html;
      if (l.length) { lus = l; break; }
    }
    if (!lus.length && dernierStatut) erreurs.push(`${tour} : Tennis Explorer a répondu ${dernierStatut}`);
    if (debug) {
      const html = htmlDiag, i = html.search(/\/player\//i), k = html.search(/Main tournaments/i);
      brut[tour] = {
        taille: html.length, lignes: (html.match(/<tr/gi) || []).length, liensJoueur: (html.match(/\/player\//gi) || []).length, liensMatch: (html.match(/\/match-detail\//gi) || []).length,
        dates: [...new Set(html.match(/\b\d{2}\.\d{2}\.\d{4}\b/g) || [])].slice(0, 6), mainTournaments: k >= 0, coursesCells: (html.match(/class="[^"]*course/gi) || []).length,
        extraitMatchs: i >= 0 ? html.slice(Math.max(0, i - 1500), i + 1500) : html.slice(0, 1500),
        extraitMain: k >= 0 ? html.slice(k, k + 600) : null, lus: lireTE(html, jour, tour).length,
        titresTournois: (html.match(/<tr[^>]*class="[^"]*head[^"]*"[\s\S]*?<\/tr>/gi) || []).slice(0, 14).map(r => txt(r).slice(0, 80) + ' | ' + ((r.match(/href="([^"]*)"/i) || [])[1] || '')),
        extraitQualif: (() => { const q = html.search(/qualif/i); return q >= 0 ? html.slice(Math.max(0, q - 700), q + 700) : 'aucun mot « qualif » dans la page'; })(),
        matchsLus: lireTE(html, jour, tour).slice(0, 6).map(m => m.tournoi + ' | ' + m.heure + ' | ' + m.j1 + ' - ' + m.j2)
      };
    }
    matchs = matchs.concat(lus);
  }
  // doublons éventuels (la même page servie pour les deux circuits)
  const vu = new Set();
  matchs = matchs.filter(m => { const k = [m.tournoi, m.heure, m.j1, m.j2].join('|'); if (vu.has(k)) return false; vu.add(k); return true; });
  if (debug) return { ok: true, v: 5, debug: brut, pages, matchs };
  matchs.sort((a, b) => a.heure.localeCompare(b.heure) || a.tournoi.localeCompare(b.tournoi));
  const rep = { ok: true, v: 5, jour, maj: Date.now(), matchs, avertissements: erreurs, pages };
  if (matchs.length) {
    await cache.put(ck, new Response(JSON.stringify(rep), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=300' } }));
    if (kv) { try { await kv.put(kvKey, JSON.stringify(rep), { expirationTtl: 14 * 86400 }); } catch (e) {} }
    return rep;
  }
  // Rien de lisible : on ressort le dernier bon calendrier connu pour ce jour, en le signalant.
  if (kv) {
    try {
      const vieux = JSON.parse((await kv.get(kvKey)) || 'null');
      if (vieux && Array.isArray(vieux.matchs) && vieux.matchs.length) return Object.assign(vieux, { v: 5, perime: true, avertissements: erreurs.length ? erreurs : ['Tennis Explorer n\'a rien renvoyé de lisible : dernier calendrier connu.'], pages });
    } catch (e) {}
  }
  if (erreurs.length) throw new Error(erreurs.join(' · '));
  rep.raison = 'page lue mais aucun match de tournoi du circuit trouvé (' + pages.join(' ; ') + ')';
  return rep;
}

// ── Détail d'un match (page « match-detail » de Tennis Explorer) : classement, face-à-face, bilan de la saison.
// Lecture tolérante par le texte de la page ; si un champ n'est pas trouvé il reste null (l'appli s'en passe).
function lireDetailTE(html) {
  const T = txt(String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' '));
  const n = x => { const v = parseInt(x, 10); return Number.isFinite(v) ? v : null; };
  const out = { r1: null, r2: null, h1: null, h2: null, w1: null, l1: null, w2: null, l2: null, surface: null };
  const rk = [...T.matchAll(/ranking\s*:?\s*(\d{1,4})\b/gi)].map(m => n(m[1]));
  if (rk.length >= 2) { out.r1 = rk[0]; out.r2 = rk[1]; }
  const h = T.match(/head[\s-]*to[\s-]*head[^0-9]{0,60}(\d{1,3})\s*-\s*(\d{1,3})/i);
  if (h) { out.h1 = n(h[1]); out.h2 = n(h[2]); }
  const wl = T.match(/W\s*\/\s*L\s*-\s*\d{4}[^0-9]{0,60}(\d{1,3})\s*\/\s*(\d{1,3})[^0-9]{0,80}(\d{1,3})\s*\/\s*(\d{1,3})/i);
  if (wl) { out.w1 = n(wl[1]); out.l1 = n(wl[2]); out.w2 = n(wl[3]); out.l2 = n(wl[4]); }
  const su = T.match(/\b(clay|hard|grass|indoors?)\b/i); if (su) out.surface = su[1].toLowerCase();
  return out;
}
async function tennisDetail(id, debug) {
  if (!/^\d{3,10}$/.test(id || '')) throw new Error('identifiant de match invalide');
  const cache = caches.default, ck = new Request(`https://statify.cache/tennis-detail-v1/${id}`);
  if (!debug) { const hit = await cache.match(ck); if (hit) return await hit.json(); }
  const res = await fetch(`${TE}/match-detail/?id=${id}`, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'accept-language': 'en' } });
  if (!res.ok) throw new Error(`Tennis Explorer a répondu ${res.status}`);
  const html = await res.text(), d = lireDetailTE(html);
  if (debug) {
    const T = txt(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')), ctx = re => { const i = T.search(re); return i >= 0 ? T.slice(Math.max(0, i - 80), i + 260) : null; };
    return { ok: true, v: 5, id, lu: d, taille: html.length, extraits: { ranking: ctx(/ranking/i), h2h: ctx(/head[\s-]*to[\s-]*head/i), saison: ctx(/W\s*\/\s*L\s*-/i) } };
  }
  const rep = { ok: true, v: 5, id, ...d };
  if (d.r1 != null || d.h1 != null || d.w1 != null) await cache.put(ck, new Response(JSON.stringify(rep), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=21600' } }));
  return rep;
}

/* ------------------------------------------------------------------ */
/* RueDesJoueurs : pronostic d'expert d'un match de tennis             */
/* On ne garde que : qui l'expert voit gagnant, les cotes, le lien.     */
/* Aucun texte d'analyse n'est copié.                                   */
/* ------------------------------------------------------------------ */
const RDJ = 'https://www.ruedesjoueurs.com';
const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ocirc: 'ô', ccedil: 'ç', icirc: 'î', iuml: 'ï', ugrave: 'ù', ucirc: 'û', euro: '€', rsaquo: '›', rArr: '⇒' };
const rdjTexte = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&([a-z]+);/gi, (_, n) => ENT[n] != null ? ENT[n] : ' ').replace(/\s+/g, ' ');
const rdjNom = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
const rdjA = (txt, nom) => (' ' + rdjNom(txt) + ' ').includes(' ' + nom + ' ');
// Lit le texte d'une page de match : { c1, c2 (dans l'ordre a, b), pick (1 = a, 2 = b, 0 = inconnu), heure }
function rdjLire(html, a, b) {
  const i = html.indexOf('Meilleure cote');
  if (i < 0) return { ok: false, raison: 'pas de cotes sur la page' };
  const txt = rdjTexte(html);
  const m = txt.match(/Meilleure cote\s*:\s*([\d.,]+)\s*vs\s*(.{0,90}?)\s*à\s*(\d{1,2})[:h](\d{2})\s*(?:favori\s*)?(.{0,70}?)\s*Meilleure cote\s*:\s*([\d.,]+)/i);
  if (!m) return { ok: false, raison: 'cotes illisibles' };
  const s1 = txt.slice(Math.max(0, m.index - 70), m.index), s2 = m[5];
  const cA = parseFloat(m[1].replace(',', '.')), cB = parseFloat(m[6].replace(',', '.'));
  let ordre;                                               // 1 : joueur de gauche = a ; 2 : inversé
  if (rdjA(s1, a) && rdjA(s2, b)) ordre = 1; else if (rdjA(s1, b) && rdjA(s2, a)) ordre = 2; else return { ok: false, raison: 'joueurs non reconnus' };
  const [c1, c2] = ordre === 1 ? [cA, cB] : [cB, cA];
  let nomPick = '';
  const h = txt.search(/Pronostics 1-2 du match/i);
  if (h >= 0) { const v = txt.slice(h, h + 1800).match(/Victoire\s+(?:de\s+)?(.{1,40})/i); if (v) nomPick = v[1]; }
  if (!nomPick) { const v = txt.match(/Pronostic de nos experts\s+(.{1,40}?)\s+\d\s*-\s*\d/i); if (v) nomPick = v[1]; }
  const np = ' ' + rdjNom(nomPick);
  let pick = 0;
  if (np.trim()) { const pa = np.startsWith(' ' + a + ' ') || np === ' ' + a, pb = np.startsWith(' ' + b + ' ') || np === ' ' + b; pick = pa && !pb ? 1 : pb && !pa ? 2 : 0; }
  return { ok: true, c1, c2, pick, heure: `${m[3].padStart(2, '0')}:${m[4]}` };
}
async function rdjMatch(a0, b0, debug) {
  const a = rdjNom(a0), b = rdjNom(b0);
  if (!a || !b) return { ok: false, error: 'noms manquants' };
  const cache = caches.default, ck = new Request('https://statify.cache/rdj-v1/' + encodeURIComponent(a + '|' + b));
  if (!debug) { const hit = await cache.match(ck); if (hit) return await hit.json(); }
  const H = { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Statify)', 'accept-language': 'fr-FR,fr;q=0.9' } };
  const ckL = new Request('https://statify.cache/rdj-liste-v1');
  let liens; const hl = await cache.match(ckL);
  if (hl) liens = await hl.json(); else {
    const r = await fetch(RDJ + '/pronostics/tennis.html', H);
    if (!r.ok) return { ok: false, error: 'RueDesJoueurs ' + r.status };
    const h = await r.text();
    liens = [...new Set([...h.matchAll(/\/pronostic\/([a-z0-9-]+-\d+)\.html/g)].map(x => x[1]))];
    await cache.put(ckL, new Response(JSON.stringify(liens), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=600' } }));
  }
  const slug = liens.find(l => { const t = ' ' + l.replace(/-\d+$/, '').replace(/-/g, ' ') + ' '; return t.includes(' ' + a + ' ') && t.includes(' ' + b + ' '); });
  let out;
  if (!slug) out = { ok: true, trouve: false };
  else {
    const url = `${RDJ}/pronostic/${slug}.html`, r = await fetch(url, H);
    if (!r.ok) out = { ok: false, error: 'page match ' + r.status };
    else { const x = rdjLire(await r.text(), a, b); out = x.ok ? { ok: true, trouve: true, url, c1: x.c1, c2: x.c2, pick: x.pick, heure: x.heure } : { ok: true, trouve: false, raison: x.raison, url }; }
  }
  if (!debug && out.ok) await cache.put(ck, new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + (out.trouve ? 1800 : 600) } }));
  return out;
}
