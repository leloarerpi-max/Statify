// Statify - notifications même appli fermée.
// Tourne sur GitHub Actions. Quand un match qui t'intéresse est en cours (ou va démarrer),
// le robot reste allumé et interroge ESPN toutes les ~15 s ; sinon il fait un seul passage et s'arrête.
// Envoie des alertes via ntfy.sh (appli gratuite sur téléphone).
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const STATE = 'state.json';

let st = {}; try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}

// Équipes étoilées dans Statify : le robot les lit dans le petit espace PUBLIC « Statify - alertes » du propriétaire du dépôt
// (lecture sans jeton : le jeton interne de GitHub Actions n'a pas le droit de lire les Gists).
// S'il n'existe pas encore, on garde config.json ; en cas d'erreur passagère, on garde la dernière liste connue.
async function loadStars() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER; if (!owner) return;
  const hdr = { Accept: 'application/vnd.github+json', 'User-Agent': 'statify-robot' };
  const keep = (s, why) => { cfg.nba = s.nba; cfg.foot = { ...(cfg.foot || {}), teams: s.foot.teams, leagues: s.foot.leagues?.length ? s.foot.leagues : (cfg.foot?.leagues || []) };
    console.log(`${why} : ${cfg.nba.length} NBA, ${cfg.foot.teams.length} foot`); };
  try {
    let id = st._cfg?.gist;
    if (!id) {
      const r = await fetch(`https://api.github.com/users/${owner}/gists?per_page=100`, { headers: hdr });
      if (!r.ok) throw new Error('liste ' + r.status);
      const g = (await r.json()).find(x => x.description === 'Statify - alertes' && x.files && x.files['statify-notif.json']);
      if (!g) { console.log("Pas encore d'espace « Statify - alertes » : config.json utilisé"); return; }
      id = g.id;
    }
    const full = await fetch(`https://api.github.com/gists/${id}`, { headers: hdr });
    if (full.status === 404) { delete st._cfg; throw new Error('espace introuvable'); }
    if (!full.ok) throw new Error('lecture ' + full.status);
    const j = JSON.parse((await full.json()).files['statify-notif.json'].content);
    const stars = { nba: Array.isArray(j.nba) ? j.nba : [], foot: { teams: j.foot?.teams || [], leagues: j.foot?.leagues || [] } };
    st._cfg = { gist: id, stars, t: Date.now() };
    keep(stars, 'Équipes lues depuis Statify');
  } catch (e) {
    if (st._cfg?.stars) { st._cfg.t = Date.now(); keep(st._cfg.stars, `Espace Statify illisible (${e.message}), dernière liste connue utilisée`); }
    else console.log(`Espace Statify illisible (${e.message}) : config.json utilisé`);
  }
}
await loadStars();
let now = Date.now(), msgs = [], days = [], blocked = false, act = new Map();
const day = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const setDays = () => { now = Date.now(); days = [day(new Date(now - 864e5)), day(new Date(now)), day(new Date(now + 864e5))]; };
const ESPN_TRI = { WSH: 'WAS', NO: 'NOP', UTAH: 'UTA', SA: 'SAS', NY: 'NYK', GS: 'GSW' };   // codes ESPN -> codes de l'appli
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const favF = (cfg.foot?.teams || []).map(norm);
const hm = iso => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

async function board(path, ds) {
  const out = [];
  for (const d of ds || days) {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${d}`);
      if (r.status === 429 || r.status === 403) blocked = true;
      else if (r.ok) out.push(...((await r.json()).events || []).map(e => { e._d = d; return e; }));
    } catch {}
  }
  return [...new Map(out.map(e => [e.id, e])).values()];
}
function isMine(e, kind) {
  const c = e.competitions?.[0]; if (!c) return false;
  const [h, a] = ['home', 'away'].map(s => c.competitors.find(x => x.homeAway === s)); if (!h || !a) return false;
  return kind === 'nba'
    ? [h, a].some(t => (cfg.nba || []).includes(ESPN_TRI[t.team.abbreviation] || t.team.abbreviation))
    : [h, a].some(t => favF.some(f => norm(t.team.displayName).includes(f) || norm(t.team.shortDisplayName).includes(f)));
}
// un match est « actif » s'il est en cours ou démarre dans moins de 30 min : le robot reste alors allumé
function mark(path, e) {
  const state = e.status?.type?.state, t = Date.parse(e.date);
  if ((state === 'in' && now - t < 5 * 3600e3) || (state === 'pre' && t - now <= 30 * 60e3 && t - now > -10 * 60e3)) {
    if (!act.has(path)) act.set(path, new Set()); act.get(path).add(e._d);
  }
}
function handle(e, kind, label) {
  const lgName = kind === 'nba' ? 'NBA' : (LGN[label] || label), ico = kind === 'nba' ? '🏀' : '⚽';
  const c = e.competitions?.[0]; if (!c) return;
  const [h, a] = ['home', 'away'].map(s => c.competitors.find(x => x.homeAway === s));
  if (!h || !a) return;
  if (!isMine(e, kind)) return;
  const name = t => t.team.shortDisplayName || t.team.displayName;
  const state = e.status?.type?.state, start = Date.parse(e.date);
  const score = `${name(h)} ${h.score ?? 0} - ${a.score ?? 0} ${name(a)}`;
  const s = (st[e.id] ||= {});
  if (cfg.alerts?.kickoff && state === 'pre' && !s.k && start - now <= 20 * 60e3 && start - now > -5 * 60e3) {
    s.k = 1; msgs.push([`⏰ Coup d'envoi à ${hm(e.date)} · ${lgName}`, `${ico} ${name(h)} - ${name(a)}`]);
  }
  const inMx = mx.enabled && (mx.leagues || cfg.foot?.leagues || []).includes(label) && Object.keys(st).some(k => k.startsWith(`mx:${label}:`) && now - Number(k.split(':')[2]) < 3.5 * 3600e3 && now >= Number(k.split(':')[2]) - 5 * 60e3);
  if (cfg.alerts?.score && kind === 'foot' && state === 'in' && !inMx) {
    const sc = `${h.score}-${a.score}`;
    if (s.sc !== undefined && s.sc !== sc) msgs.push([`⚽ BUT ! · ${lgName}`, `${score}${e.status?.displayClock ? ` (${e.status.displayClock})` : ''}`]);
    s.sc = sc;
  }
  if (cfg.alerts?.final && state === 'post' && !s.f && now - start < 8 * 3600e3) {
    s.f = 1; msgs.push([`🏁 Terminé · ${lgName}`, `${ico} ${score}`]);
  }
}
const LGN = { 'fra.1': 'Ligue 1', 'eng.1': 'Premier League', 'esp.1': 'Liga', 'ita.1': 'Serie A', 'ger.1': 'Bundesliga', 'uefa.champions': 'Ligue des champions', 'uefa.europa': 'Europa League', 'uefa.europa.conf': 'Conférence League' };
const mx = cfg.multiplex || {};
const sides = e => { const c = e.competitions?.[0]; return c && ['home', 'away'].map(s => c.competitors.find(x => x.homeAway === s)); };

// Multiplex : >= 3 matchs d'un même championnat qui démarrent à moins de 30 min d'écart
function clusters(evs) {
  const L = evs.map(e => ({ e, t: Date.parse(e.date) })).filter(x => x.t).sort((a, b) => a.t - b.t), out = [];
  for (let i = 0; i < L.length; i++) { const c = L.filter(x => x.t >= L[i].t && x.t <= L[i].t + 30 * 60e3); if (c.length >= 3) { out.push({ start: L[i].t, evs: c.map(x => x.e) }); i += c.length - 1; } }
  return out;
}
// Classement projeté avec les scores du moment (base = classement ESPN, matchs en cours ajoutés)
async function standings(lg) {
  try {
    const r = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${lg}/standings`); if (!r.ok) return null;
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
    if (!s.k && c.start - now <= 25 * 60e3 && c.start - now > -5 * 60e3) {
      s.k = 1; msgs.push([`🔥 Multiplex ${label} dans ${Math.max(0, Math.round((c.start - now) / 60e3))} min`, `${c.evs.length} matchs à ${hm(c.evs[0].date)} : ` + c.evs.map(e => { const [h, a] = sides(e) || []; return h && a ? `${h.team.shortDisplayName || h.team.displayName}-${a.team.shortDisplayName || a.team.displayName}` : ''; }).join(', ')]);
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
        msgs.push([`🚨 But à ${nm(scorer)} (${label})`, `${nm(h)} ${cur[0]} - ${cur[1]} ${nm(a)}${e.status?.displayClock ? ` (${e.status.displayClock})` : ''}${rk}`]);
      }
      for (const e of live) { const [h, a] = sides(e) || []; if (h && a) prev[e.id] = [+h.score || 0, +a.score || 0]; }
    }
  }
}

const mxLeagues = new Set(mx.enabled ? (mx.leagues || cfg.foot?.leagues || []) : []);
const footLg = cfg.foot?.leagues || [];
const PATHS = [];
if ((cfg.nba || []).length) PATHS.push({ path: 'basketball/nba', kind: 'nba', code: 'NBA', foot: true, mx: false });
for (const lg of new Set([...footLg, ...mxLeagues])) PATHS.push({ path: `soccer/${lg}`, kind: 'foot', code: lg, foot: footLg.includes(lg), mx: mxLeagues.has(lg) });

async function pass(prevAct) {
  setDays(); msgs = []; act = new Map();
  const plan = prevAct ? PATHS.filter(p => prevAct.has(p.path)).map(p => ({ ...p, ds: [...prevAct.get(p.path)] })) : PATHS;
  await Promise.all(plan.map(async p => {
    const ev = await board(p.path, p.ds);
    if (p.foot) ev.forEach(e => handle(e, p.kind, p.code));
    if (p.mx) await multiplexAlerts(p.code, ev);
    ev.forEach(e => { if ((p.foot && isMine(e, p.kind)) || p.mx) mark(p.path, e); });
  }));
}

const topic = process.env.NTFY_TOPIC || cfg.ntfyTopic;
async function flush() {
  for (const [title, body] of msgs) {
    await fetch('https://ntfy.sh/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, message: body })
    }).catch(() => {});
    console.log('envoyé :', title, '|', body);
  }
}
function save() {
  // on oublie les vieux matchs
  for (const k of Object.keys(st)) { if (!st[k].t) st[k].t = now; if (now - st[k].t > 3 * 864e5) delete st[k]; }
  fs.writeFileSync(STATE, JSON.stringify(st));
}

const EVERY = Math.max(5, +(cfg.live?.everySeconds ?? 15)) * 1000;       // pas de 15 s par défaut (minimum 5 s)
const BUDGET = Math.max(1, +(cfg.live?.runMinutes ?? 9)) * 60e3;          // durée max d'un passage en continu
const t0 = Date.now();
let prevAct = null, total = 0, again = false;
for (;;) {
  await pass(prevAct);
  await flush(); total += msgs.length; save();
  if (blocked) { console.log('ESPN limite les requêtes : on arrête ce tour, nouvel essai au prochain passage'); break; }
  prevAct = act;
  if (!prevAct.size) break;                                // plus rien d'actif : on s'arrête
  if (Date.now() - t0 + EVERY + 3000 > BUDGET) { again = true; break; }   // encore actif : on demandera un nouveau passage
  await sleep(EVERY);
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `again=${again}\n`);
console.log(total ? total + ' alerte(s)' : 'rien de neuf', again ? '· encore actif, relance' : '');
