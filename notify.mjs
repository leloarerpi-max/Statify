// Statify - notifications même appli fermée.
// Tourne sur GitHub Actions toutes les ~10 min. Envoie des alertes via ntfy.sh (appli gratuite sur téléphone).
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const STATE = 'state.json';
let st = {}; try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
const now = Date.now(), msgs = [];
const day = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const days = [day(new Date(now - 864e5)), day(new Date(now)), day(new Date(now + 864e5))];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const favF = (cfg.foot?.teams || []).map(norm);
const hm = iso => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

async function board(path) {
  const out = [];
  for (const d of days) {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${d}`);
      if (r.ok) out.push(...((await r.json()).events || []));
    } catch {}
  }
  return [...new Map(out.map(e => [e.id, e])).values()];
}
function handle(e, kind, label) {
  const c = e.competitions?.[0]; if (!c) return;
  const [h, a] = ['home', 'away'].map(s => c.competitors.find(x => x.homeAway === s));
  if (!h || !a) return;
  const mine = kind === 'nba'
    ? [h, a].some(t => (cfg.nba || []).includes(t.team.abbreviation))
    : [h, a].some(t => favF.some(f => norm(t.team.displayName).includes(f) || norm(t.team.shortDisplayName).includes(f)));
  if (!mine) return;
  const name = t => t.team.shortDisplayName || t.team.displayName;
  const state = e.status?.type?.state, start = Date.parse(e.date);
  const score = `${name(h)} ${h.score ?? 0} - ${a.score ?? 0} ${name(a)}`;
  const s = (st[e.id] ||= {});
  if (cfg.alerts?.kickoff && state === 'pre' && !s.k && start - now <= 20 * 60e3 && start - now > -5 * 60e3) {
    s.k = 1; msgs.push([`${label} · coup d'envoi ${hm(e.date)}`, `${name(h)} - ${name(a)}`]);
  }
  const inMx = mx.enabled && (mx.leagues || cfg.foot?.leagues || []).includes(label) && Object.keys(st).some(k => k.startsWith(`mx:${label}:`) && now - Number(k.split(':')[2]) < 3.5 * 3600e3 && now >= Number(k.split(':')[2]) - 5 * 60e3);
  if (cfg.alerts?.score && state === 'in' && !(kind === 'foot' && inMx)) {
    const sc = `${h.score}-${a.score}`;
    if (s.sc !== undefined && s.sc !== sc) msgs.push([`${kind === 'nba' ? '🏀' : '⚽'} ${label}${kind === 'nba' ? '' : ' · BUT'}`, `${score}${e.status?.displayClock ? ` (${e.status.displayClock})` : ''}`]);
    s.sc = sc;
  }
  if (cfg.alerts?.final && state === 'post' && !s.f && now - start < 8 * 3600e3) {
    s.f = 1; msgs.push([`${label} · terminé`, score]);
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
          if (before[id] && after[id]) rk = before[id].nr !== after[id].nr ? ` · ${nm(scorer)} ${after[id].nr < before[id].nr ? 'passe' : 'tombe'} ${before[id].nr}e → ${after[id].nr}e` : ` · ${nm(scorer)} ${after[id].nr}e`; }
        msgs.push([`🚨 But à ${nm(scorer)} (${label})`, `${nm(h)} ${cur[0]} - ${cur[1]} ${nm(a)}${e.status?.displayClock ? ` (${e.status.displayClock})` : ''}${rk}`]);
      }
      for (const e of live) { const [h, a] = sides(e) || []; if (h && a) prev[e.id] = [+h.score || 0, +a.score || 0]; }
    }
  }
}

const jobs = [];
if ((cfg.nba || []).length) jobs.push(board('basketball/nba').then(ev => ev.forEach(e => handle(e, 'nba', 'NBA'))));
const mxLeagues = new Set(mx.enabled ? (mx.leagues || cfg.foot?.leagues || []) : []);
for (const lg of new Set([...(cfg.foot?.leagues || []), ...mxLeagues])) jobs.push(board(`soccer/${lg}`).then(async ev => {
  if (!(cfg.foot?.leagues || []).includes(lg)) { /* ligue uniquement suivie pour les multiplex */ } else ev.forEach(e => handle(e, 'foot', lg));
  if (mxLeagues.has(lg)) await multiplexAlerts(lg, ev);
}));
await Promise.all(jobs);

const topic = process.env.NTFY_TOPIC || cfg.ntfyTopic;
for (const [title, body] of msgs) {
  await fetch('https://ntfy.sh/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, title, message: body })
  }).catch(() => {});
  console.log('envoyé :', title, '|', body);
}
// on oublie les vieux matchs
for (const k of Object.keys(st)) { if (!st[k].t) st[k].t = now; if (now - st[k].t > 3 * 864e5) delete st[k]; }
fs.writeFileSync(STATE, JSON.stringify(st));
console.log(msgs.length ? msgs.length + ' alerte(s)' : 'rien de neuf');
