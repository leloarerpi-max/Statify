// Test du robot Statify avec de faux JSON ESPN (KV, fetch, horloge simulés)
import worker from './worker.mjs';

let T = Date.now();
const T0 = T;
Date.now = () => T;
globalThis.setTimeout = (fn, ms) => { T += ms || 0; queueMicrotask(fn); return 0; };
console.log = () => {};                       // le robot est bavard ; on n'affiche que nos résultats
const out = (...a) => process.stdout.write(a.join(' ') + '\n');

let frame = { events: [] }, std = { children: [] }, sent = [], kvFail = false;
globalThis.fetch = async (url, opt) => {
  url = String(url);
  if (url.startsWith('https://ntfy.sh')) { const b = JSON.parse(opt.body); sent.push(b); return { ok: true, status: 200 }; }
  if (url.includes('/scoreboard')) return { ok: true, status: 200, json: async () => frame };
  if (url.includes('/standings')) return { ok: true, status: 200, json: async () => std };
  return { ok: false, status: 404 };
};
const newEnv = cfg => { const m = new Map([['cfg', JSON.stringify(cfg)]]); return { NTFY_TOPIC: 'topic-secret-123456', STATE: { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } } }; };
async function wake(env) { const ps = []; await worker.scheduled(null, env, { waitUntil: p => ps.push(p) }); await Promise.all(ps); T += 60e3; const r = sent.splice(0); return r; }

const mk = ({ id = '100', state = 'pre', name = 'STATUS_SCHEDULED', start, h = 0, a = 0, clock = '', details = [], hid = '1', aid = '2', hn = 'PSG', an = 'OM' }) => ({
  id, date: new Date(start).toISOString(), status: { type: { state, name, completed: state === 'post' }, displayClock: clock },
  competitions: [{ competitors: [
    { homeAway: 'home', score: String(h), team: { id: hid, displayName: hn + ' FC', shortDisplayName: hn } },
    { homeAway: 'away', score: String(a), team: { id: aid, displayName: an + ' FC', shortDisplayName: an } }], details }]
});
const goal = (team, p, m, x = {}) => ({ scoringPlay: true, team: { id: team }, athletesInvolved: [{ shortName: p }], clock: { displayValue: m }, ...x });
const red = (team, p, m) => ({ redCard: true, team: { id: team }, athletesInvolved: [{ shortName: p }], clock: { displayValue: m } });

let fails = 0;
function expect(label, msgs, wants, notWants = []) {
  const all = msgs.map(m => m.title + ' || ' + m.message).join('\n');
  const miss = wants.filter(w => !all.includes(w)), bad = notWants.filter(w => all.includes(w));
  const exact = msgs.length;
  const ok = !miss.length && !bad.length;
  if (!ok) fails++;
  out(ok ? '✅' : '❌', label, `(${exact} msg)`);
  if (!ok || process.env.V) for (const m of msgs) out('     →', m.title, '|', m.message.replace(/\n/g, ' ⏎ '));
  if (miss.length) out('     manque :', JSON.stringify(miss));
  if (bad.length) out('     en trop :', JSON.stringify(bad));
  return msgs.length;
}
const count = (label, msgs, n) => { if (msgs.length !== n) { fails++; out('❌', label, `attendu ${n} message(s), reçu ${msgs.length}`); for (const m of msgs) out('     →', m.title, '|', m.message); } };

/* ---------- Scénario A : un match de mon club (id 1), de bout en bout ---------- */
out('\n== A. Match de mon club ==');
{
  const env = newEnv({ nba: [], foot: { teams: [], ids: ['1'], leagues: ['fra.1'], matches: [] }, maj: 0 });
  const KO = T0 + 21 * 60e3;
  const F = o => { frame = { events: [mk({ start: KO, ...o })] }; };
  F({}); let r = [];
  for (let i = 0; i < 3; i++) r.push(...await wake(env));
  expect('coup d\'envoi', r, ['⏰ Coup d\'envoi', 'PSG - OM']);
  count('coup d\'envoi : un seul message', r, 1);

  T = KO + 60e3; F({ state: 'in', name: 'STATUS_FIRST_HALF', clock: "1'" });
  r = await wake(env); count('0-0 : rien', r, 0);

  F({ state: 'in', name: 'STATUS_FIRST_HALF', h: 1, clock: "23'", details: [goal('1', 'Mbappé', "23'")] });
  r = await wake(env);
  expect('but avec buteur', r, ['⚽ But de PSG', 'PSG 1 - 0 OM', 'Mbappé 23\''], ['BUT !']);
  count('but : un seul message malgré 3 relevés', r, 1);

  F({ state: 'in', name: 'STATUS_FIRST_HALF', h: 0, clock: "26'", details: [] });
  r = await wake(env);
  expect('but annulé (le score baisse)', r, ['❌ But annulé', 'PSG 0 - 0 OM'], ['⚽ But', 'BUT !']);

  F({ state: 'in', name: 'STATUS_FIRST_HALF', h: 1, clock: "31'", details: [goal('1', 'Dembélé', "31'")] });
  r = await wake(env);
  expect('nouveau but après annulation', r, ['⚽ But de PSG', 'Dembélé 31\'']);

  F({ state: 'in', name: 'STATUS_FIRST_HALF', h: 1, clock: "35'", details: [goal('1', 'Dembélé', "31'"), red('2', 'Rongier', "35'")] });
  r = await wake(env);
  expect('carton rouge', r, ['🟥 Carton rouge', 'Rongier (OM) 35\'']);
  count('rouge : un seul message', r, 1);

  F({ state: 'in', name: 'STATUS_HALFTIME', h: 1, clock: "45'", details: [goal('1', 'Dembélé', "31'"), red('2', 'Rongier', "35'")] });
  r = await wake(env);
  expect('mi-temps', r, ['⏸ Mi-temps', 'PSG 1 - 0 OM']);

  F({ state: 'in', name: 'STATUS_SECOND_HALF', h: 2, a: 1, clock: "60'", details: [goal('1', 'Dembélé', "31'"), red('2', 'Rongier', "35'"), goal('1', 'Barcola', "52'", { penaltyKick: true }), goal('2', 'Greenwood', "58'")] });
  r = await wake(env);
  expect('doublé : les deux buts sont annoncés', r, ['⚽ But de PSG', 'Barcola 52\' (pen.)', '⚽ But d\'OM', 'Greenwood 58\'']);
  count('doublé : deux messages', r, 2);

  F({ state: 'in', name: 'STATUS_SECOND_HALF', h: 2, a: 2, clock: "70'", details: [goal('1', 'Dembélé', "31'"), goal('1', 'Barcola', "52'"), goal('2', 'Greenwood', "58'"), goal('2', 'Harit', "70'", { ownGoal: true })] });
  r = await wake(env);
  expect('csc', r, ['⚽ But d\'OM', 'Harit 70\' (csc)']);

  F({ state: 'in', name: 'STATUS_SECOND_HALF', h: 2, a: 2, clock: "88'", details: [] });
  r = await wake(env); count('score inchangé : rien', r, 0);

  F({ state: 'post', name: 'STATUS_FULL_TIME', h: 2, a: 2, clock: "90'" });
  r = await wake(env);
  expect('score final', r, ['🏁 Terminé', 'PSG 2 - 2 OM']);
  r = await wake(env); count('final : pas de doublon', r, 0);
}

/* ---------- Scénario B : le robot arrive en cours de match ---------- */
out('\n== B. Robot qui arrive en cours de match ==');
{
  const env = newEnv({ nba: [], foot: { teams: [], ids: ['1'], leagues: ['fra.1'], matches: [] }, maj: 0 });
  frame = { events: [mk({ start: T - 40 * 60e3, state: 'in', name: 'STATUS_FIRST_HALF', h: 1, a: 0, clock: "40'", details: [goal('1', 'Mbappé', "12'"), red('2', 'Rongier', "30'")] })] };
  let r = [];
  for (let i = 0; i < 4; i++) r.push(...await wake(env));
  expect('score actuel', r, ['📊 Score actuel', 'PSG 1 - 0 OM'], ['🟥']);
  count('score actuel : une seule fois, pas de rouge rejoué', r, 1);
}

/* ---------- Scénario C : multiplex (3 matchs, aucun n'est le mien) ---------- */
out('\n== C. Multiplex ==');
{
  const env = newEnv({ nba: [], foot: { teams: [], ids: ['999'], leagues: [], matches: [] }, maj: 0 });
  const KO = T + 12 * 60e3;
  const teams = [['11', '12', 'LIL', 'LEN'], ['13', '14', 'NIC', 'LYO'], ['15', '16', 'REN', 'MON']];
  const ent = (id, n, pts, gd, rank) => ({ team: { id, displayName: n, shortDisplayName: n }, stats: [{ name: 'points', value: pts }, { name: 'pointDifferential', value: gd }, { name: 'pointsFor', value: 10 }, { name: 'rank', value: rank }] });
  std = { children: [{ standings: { entries: [ent('12', 'LEN', 10, 3, 1), ent('11', 'LIL', 9, 0, 2), ent('13', 'NIC', 5, 0, 3), ent('14', 'LYO', 4, 0, 4), ent('15', 'REN', 3, 0, 5), ent('16', 'MON', 2, 0, 6)] } }] };
  const F = (o, d1 = []) => { frame = { events: teams.map((t, i) => mk({ id: String(200 + i), start: KO, hid: t[0], aid: t[1], hn: t[2], an: t[3], ...o, ...(i === 0 ? { ...o.m0, details: d1 } : {}) })) }; };
  F({}); let r = [];
  for (let i = 0; i < 3; i++) r.push(...await wake(env));
  expect('annonce du multiplex', r, ['🔥 Multiplex Ligue 1', '3 matchs']);
  count('annonce : un seul message', r, 1);

  T = KO + 2 * 60e3; F({ state: 'in', name: 'STATUS_FIRST_HALF', clock: "1'" });
  r = await wake(env); count('multiplex 0-0 : rien', r, 0);

  F({ state: 'in', name: 'STATUS_FIRST_HALF', clock: "20'", m0: { h: 1 } }, [goal('11', 'Haraldsson', "20'")]);
  r = await wake(env);
  expect('but en multiplex avec buteur et classement', r, ['🚨 But à LIL (Ligue 1)', 'LIL 1 - 0 LEN', 'Haraldsson 20\'', 'LIL passe 2e → 1er']);
  count('multiplex but : un message', r, 1);

  F({ state: 'in', name: 'STATUS_FIRST_HALF', clock: "24'", m0: { h: 0 } }, []);
  r = await wake(env);
  expect('but annulé en multiplex (avant : annoncé comme un but adverse)', r, ['❌ But annulé (Ligue 1)', 'LIL 0 - 0 LEN'], ['🚨 But']);
}

out(fails ? `\n${fails} échec(s)` : '\nTout est vert ✅');
process.exit(fails ? 1 : 0);
