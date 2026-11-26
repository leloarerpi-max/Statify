/* Statify : « Mes paris ».
   Tes paris et combinés foot vivent directement dans Statify Foot :
   - une ligne sous chaque match où tu as un pari, avec son état calculé d'après le score en direct ;
   - un bloc « Mes paris » dans la colonne de droite de l'Accueil ;
   - l'onglet « Pronos » devient « Mes paris » et s'ouvre ici, sans changer de page ;
   - la fiche d'un match montre tes paris et permet d'en ajouter ;
   - ajouter / modifier / supprimer un pari, régler Gagné / Perdu, créer / défaire / supprimer un combiné ;
   - règlement automatique d'après les scores finaux (case à cocher, comme dans PronoTracker).
   Les données restent dans le même stockage que PronoTracker (prono_tracker_multisport_data) : prono.html les lit toujours.
   Chaque modification est annulable (bouton « Annuler » en bas). Pour le retirer, enlève la ligne <script src="mes-paris.js"> de index.html. */
(function () {
  'use strict';
  const KEY = 'prono_tracker_multisport_data';
  const lire = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eur = v => (v > 0.004 ? '+' : v < -0.004 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ',') + ' €';
  const cote = v => (+v || 0).toFixed(2).replace('.', ',');
  const jour = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---------- Correspondance pari ↔ match Statify ---------- */
  const STOP = new Set(['fc', 'sv', 'ac', 'as', 'cf', 'sc', 'afc', 'ssc', 'us', 'estac', 'fsv', 'vfb', 'vfl', 'tsg', 'rc', 'og', 'ca', 'cd', 'ud', 'sd', 'de', 'la', 'le', 'club', 'city']);
  // équivalences de noms (reprises de PronoTracker) : « Man Utd » = « Manchester United », « PSG » = « Paris Saint-Germain »…
  const ALIAS = { psg: ['paris', 'saint', 'germain'], om: ['marseille'], ol: ['lyon'], utd: ['united'], man: ['manchester'], spurs: ['tottenham'], barca: ['barcelona'], atleti: ['atletico'], atm: ['atletico'], praha: ['prague'], prag: ['prague'], hambourg: ['hamburg'], hamburger: ['hamburg'], valence: ['valencia'], olympiakos: ['olympiacos'], bruges: ['brugge'], kiev: ['kyiv'], wien: ['vienna'], koln: ['cologne'], kln: ['cologne'], koeln: ['cologne'], dynamo: ['dinamo'], lisboa: ['lisbon'], gladbach: ['monchengladbach'], mnchen: ['munich'], munchen: ['munich'], muenchen: ['munich'], bayern: ['bayern', 'munich'], bodoglimt: ['bodo', 'glimt'], bvb: ['dortmund'], juve: ['juventus'], wolves: ['wolverhampton'], nottm: ['nottingham'], forest: ['nottingham'], sheff: ['sheffield'], qpr: ['queens', 'park', 'rangers'], 'w': [] };
  // perf : les mêmes noms d'équipes reviennent des milliers de fois → on garde le résultat en mémoire
  const _motsC = new Map();
  const mots = s => { const k = String(s || ''); let r = _motsC.get(k); if (r) return r; if (_motsC.size > 20000) _motsC.clear(); r = _mots(k); _motsC.set(k, r); return r; };
  const _mots = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).flatMap(w => ALIAS[w] || [w]).filter(w => w.length >= 3 && !STOP.has(w));
  // quel côté désigne le pronostic : compte les mots en commun (utile pour « Man Utd » / « Man City »)
  const proche = (x, y) => { const a = mots(x), b = mots(y); return a.filter(u => b.some(v => u === v || (u.length >= 4 && v.length >= 4 && (u.startsWith(v) || v.startsWith(u))))).length; };
  const brut = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).flatMap(w => ALIAS[w] || [w]).filter(w => w.length >= 3);
  const proche2 = (x, y) => { const a = brut(x), b = brut(y); return a.filter(u => b.includes(u)).length; };
  const cote2 = (p, hn, an) => { let h = proche(p, hn), a = proche(p, an); if (h === a && h > 0) { h = proche2(p, hn); a = proche2(p, an); } return [h > 0 && h > a, a > 0 && a > h]; };
  const pareil = (x, y) => { const a = mots(x), b = mots(y); return a.some(u => b.some(v => u === v || (u.length >= 4 && v.length >= 4 && (u.startsWith(v) || v.startsWith(u))))); };
  const cotes = m => String(m || '').split(/\s+(?:vs\.?|v)\s+|\s+[-–—]\s+/i);
  function matchs() {
    try { const ex = {}; extListe().forEach(m => { ex[m.id.slice(1)] = m; }); const ids = new Set(); const base = Object.entries(foot.leagues || {}).flatMap(([lg, L]) => Object.values(L.matches || {}).map(m => { const c = Object.assign({ lg }, m), e = ex[String(m.id)]; ids.add(String(m.id)); if (e) { if (!c.ht) c.ht = e.ht; if (!(c.x && c.x.ev && c.x.ev.length)) c.x = e.x; } return c; })); return base.concat(extListe().filter(m => !ids.has(m.id.slice(1)))); } catch (e) { return []; }
  }
  let cache = null, cacheT = 0;
  // perf : résultat de la recherche gardé par pari tant que la liste des matchs n'a pas été rechargée
  // (on garde l'id du match trouvé ; on renvoie toujours l'objet à jour, donc les scores en direct restent frais)
  let _tmNoms = { gen: null, liste: [] }, _tmC = new Map(), _tmGen = null, _tmSig = '', _tmId = new Map();
  function trouverM(b) {
    if (!cache || Date.now() - cacheT > 3000) { cache = matchs(); cacheT = Date.now(); }
    if (_tmGen !== cache) {
      _tmGen = cache; _tmId = new Map(); cache.forEach(m => { const k = String(m.id); if (!_tmId.has(k)) _tmId.set(k, m); });
      const sig = cache.length + ':' + cache.map(m => m.id + '/' + m.d).join(',');
      if (sig !== _tmSig) { _tmSig = sig; _tmC = new Map(); }   // nouveaux matchs chargés : on recherche à nouveau
    }
    const ck = String(b.match) + '|' + (b.date || '') + '|' + (b.status || '');
    if (_tmC.has(ck)) { const id = _tmC.get(ck); return id == null ? null : (_tmId.get(id) || null); }
    const r = _trouverM(b); _tmC.set(ck, r ? String(r.id) : null); return r;
  }
  function _trouverM(b) {
    const [h, a] = cotes(b.match); if (!h || !a) return null;
    const j = b.date ? Date.parse(b.date) : 0;
    // perf : on compare d'abord aux noms d'équipes distincts (quelques centaines) plutôt qu'à chaque match (plusieurs milliers)
    if (_tmNoms.gen !== cache) { const n = new Set(); cache.forEach(m => { n.add(m.hn); n.add(m.an); }); _tmNoms = { gen: cache, liste: [...n] }; }
    const okH = new Set(_tmNoms.liste.filter(n => pareil(h, n))), okA = new Set(_tmNoms.liste.filter(n => pareil(a, n)));
    const ok = cache.filter(m => (okH.has(m.hn) && okA.has(m.an)) || (okH.has(m.an) && okA.has(m.hn)));   // domicile/extérieur parfois inversés à la saisie
    if (!ok.length) { if (b.status !== 'Won' && b.status !== 'Lost') manque(b); return null; }
    let m = ok[0], best = Math.abs(Date.parse(m.d) - j);   // le plus proche de la date du pari (sans trier toute la liste)
    for (let i = 1; i < ok.length; i++) { const e = Math.abs(Date.parse(ok[i].d) - j); if (e < best) { best = e; m = ok[i]; } }
    return (!j || best < 2.5 * 864e5) ? m : null;
  }

  /* ---------- Score à la mi-temps (d'après les buts datés de Statify) ---------- */
  const estMT = b => /mi-temps|1[eè]re mt|\bmt\b|half/i.test(String(b.prono || '')) || /^mi-temps$/i.test(String(b.market || ''));
  const _dl = new Set();
  function scoreMT(m) {
    if (!m || m.st === 'pre' || reporte(m)) return null;
    const per = +m.per || 0, fini = m.done || m.st === 'post', hs = +m.hs || 0, as = +m.as || 0;
    if (m.st === 'in' && per <= 1) return { h: hs, a: as, final: /^ht$|half|mi-temps/i.test(String(m.det || '').trim()) };
    if (!hs && !as) return { h: 0, a: 0, final: true };
    if (m.ht) return { h: m.ht.h, a: m.ht.a, final: true };
    const g = ((m.x && m.x.ev) || []).filter(e => e.t === 'g' || e.t === 'pg' || e.t === 'og');
    if (g.length !== hs + as || g.some(e => e.s !== 'h' && e.s !== 'a')) {
      demandeExt(m);   // score par période pas encore connu : on lit le tableau ESPN du jour (une requête par championnat et par jour)
      return null;
    }
    const p1 = g.filter(e => (+e.m || 0) <= 45);
    return { h: p1.filter(e => e.s === 'h').length, a: p1.filter(e => e.s === 'a').length, final: true };
  }

  /* ---------- Matchs que Statify ne suit pas : lus directement chez ESPN (comme PronoTracker) ---------- */
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/', _ext = {}, _extT = {}, _tm = {};
  function slugEspn(comp) {
    const c = String(comp || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!c || /\bq\b|qualif/.test(c)) return null;
    if (/champions|^ldc$|^c1$/.test(c) && !/fem|women|afc|caf|concacaf/.test(c)) return 'uefa.champions';
    if (/conference|conf\.? league|^c4$/.test(c)) return 'uefa.europa.conf';
    if (/europa|^c3$/.test(c)) return 'uefa.europa';
    if (/^ligue 1\b/.test(c)) return 'fra.1';
    if (/^ligue 2\b/.test(c)) return 'fra.2';
    if (/^premier league\b/.test(c) && !/ecosse|scot|russ|ukrain|egypt|kazakh|maroc|ghana|nigeria|singap|armen|malt|bosn|hongr|hungar|irland|ireland/.test(c)) return 'eng.1';
    if (/^(la ?liga|liga espagnole|liga espagne|primera division)\b/.test(c) || c === 'liga' || c === 'espagne') return 'esp.1';
    if (/^serie a\b/.test(c) && !/bresil|brazil|equateur/.test(c)) return 'ita.1';
    if (/^bundesliga\b/.test(c) && !/2|autrich|austria/.test(c)) return 'ger.1';
    return null;
  }
  function extMatch(e, lg) {
    const c = e && e.competitions && e.competitions[0]; if (!c) return null;
    const h = (c.competitors || []).find(x => x.homeAway === 'home'), a = (c.competitors || []).find(x => x.homeAway === 'away'); if (!h || !a || !h.team || !a.team) return null;
    const stt = e.status || {}, t = stt.type || {}, n = x => { const v = parseInt(x.score, 10); return Number.isFinite(v) ? v : 0; };
    const hs = n(h), as = n(a), per = +stt.period || 0, ls = x => (x.linescores || []).map(l => Number(l.value)).filter(Number.isFinite), lh = ls(h), la = ls(a), sum = q => q.reduce((u, v) => u + v, 0);
    const ex = /AET|PEN|EXTRA|SHOOT/i.test(String(t.name || '')) || lh.length > 2 || la.length > 2 || per >= 3;
    let ht = null; if (!ex && lh.length >= 2 && la.length >= 2 && sum(lh.slice(0, 2)) === hs && sum(la.slice(0, 2)) === as) ht = { h: lh[0], a: la[0] };
    const ev = (c.details || []).filter(x => x.scoringPlay && !x.shootout).map(x => ({ t: x.ownGoal ? 'og' : x.penaltyKick ? 'pg' : 'g', m: parseInt(String((x.clock && x.clock.displayValue) || '')) || 0, s: String(x.team && x.team.id) === String(h.team.id) ? 'h' : String(x.team && x.team.id) === String(a.team.id) ? 'a' : '' }));
    return { id: 'x' + e.id, ext: true, lg, d: e.date, st: t.state || 'pre', done: !!t.completed, sn: t.name || '', det: t.shortDetail || '', clk: stt.displayClock || '', per, hn: h.team.displayName || h.team.shortDisplayName, an: a.team.displayName || a.team.shortDisplayName, hs, as, ht, x: { ev } };
  }
  function demandeExt(m) {
    if (!m || m.ext || !m.lg || !m.d) return;
    const j = new Date(m.d).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }), k = m.lg + '|' + j;
    if (_extT[k] != null) return; _extT[k] = 0; clearTimeout(_tm.x); _tm.x = setTimeout(chargerExt, 400);
  }
  const extListe = () => Object.values(_ext).flat();
  function manque(b) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return;
    const sl = slugEspn(b.comp), lgs = sl ? [sl] : Object.keys(FLGN);
    lgs.forEach(lg => { const k = lg + '|' + b.date; if (_extT[k] != null) return; _extT[k] = 0; clearTimeout(_tm.x); _tm.x = setTimeout(chargerExt, 400); });
    if (lgs.every(lg => _extT[lg + '|' + b.date] > 0)) fdCharger(b.date);   // ESPN déjà interrogé sans succès : secours football-data
  }
  async function chargerExt() {
    const todo = Object.keys(_extT).filter(k => _extT[k] === 0); if (!todo.length) return; let n = 0;
    for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(async k => {
      _extT[k] = Date.now(); const [lg, j] = k.split('|');
      try { const r = await fetch(ESPN + lg + '/scoreboard?dates=' + j.replace(/-/g, ''), { cache: 'no-store' }); if (!r.ok) return; const d = await r.json(); _ext[k] = (d.events || []).map(e => extMatch(e, lg)).filter(Boolean); n++; } catch (e) {}
    }));
    if (n) { cache = null; rafraichir(); }
  }
  // rafraîchit chaque minute les jours dont des matchs ne sont pas terminés
  setInterval(() => { try { const ks = Object.keys(_ext).filter(k => _ext[k].some(m => m.st !== 'post') && Date.now() - _extT[k] > 55000 && Math.abs(Date.parse(k.split('|')[1] + 'T12:00:00') - Date.now()) < 2 * 864e5); ks.forEach(k => { _extT[k] = 0; }); if (ks.length) chargerExt(); } catch (e) {} }, 30000);

  /* ---------- État d'un pari d'après le score ---------- */
  // won = gagné (ou déjà acquis), ok = en passe, live = en cours, pre = à venir, lost = perdu, end = à régler, nf = pas suivi par Statify
  // double chance : « Arsenal ou nul », « nul ou Lens », « Arsenal ou Lens », ou 1X / X2 / 12
  function dcSet(p, market, m) {
    const mk = /double/i.test(market || '');
    if (mk || /^\s*(1x|x2|12)\s*$/.test(p)) { const t = p.replace(/\s/g, ''); if (/^(1x|x1|1n)$/.test(t)) return ['H', 'D']; if (/^(x2|2x|n2)$/.test(t)) return ['D', 'A']; if (/^12$/.test(t)) return ['H', 'A']; }
    if (!/\sou\s/.test(p)) return null;
    const k = p.replace(/\(.*?\)/g, '').split(/\s+ou\s+/).map(x => x.trim()).map(x => /^(match )?nul$|^draw$|^x$/.test(x) ? 'D' : (() => { const [d, e] = cote2(x, m.hn, m.an); return d ? 'H' : e ? 'A' : null; })()).filter(Boolean);
    return k.length === 2 && k[0] !== k[1] ? k : null;
  }
  function etatM(b, m) {
    if (b.status === 'Won') return 'won';
    if (b.status === 'Lost') return 'lost';
    if (!m) return 'nf';
    if (reporte(m)) return 'rep';
    if (m.st === 'pre') return 'pre';
    const h = +m.hs || 0, a = +m.as || 0, t = h + a, fini = m.done || m.st === 'post';
    const p = String(b.prono || '').toLowerCase();
    if (estMT(b)) {
      const ht = scoreMT(m); if (!ht) return fini ? 'end' : 'live';
      const hh = ht.h, aa = ht.a, tt = hh + aa; let bon = null, acq = false, y;
      if (/deux|btts|both/.test(p)) { bon = hh > 0 && aa > 0; acq = bon; }
      else if ((y = p.match(/(?:plus de|over|\+)\s*(\d+(?:[.,]\d+)?)/))) { bon = tt > parseFloat(y[1].replace(',', '.')); acq = bon; }
      else if ((y = p.match(/(?:moins de|under)\s*(\d+(?:[.,]\d+)?)/))) bon = tt < parseFloat(y[1].replace(',', '.'));
      else { const [dom, ext] = cote2(p, m.hn, m.an); if (/nul|draw/.test(p) && !dom && !ext) bon = hh === aa; else if (dom) bon = hh > aa; else if (ext) bon = aa > hh; }
      if (bon === null) return fini ? 'end' : 'live';
      if (ht.final) return bon ? 'won' : 'lost';
      return acq ? 'won' : bon ? 'ok' : 'live';
    }
    let bon = null, acquis = false;
    let x;
    const dc = dcSet(p, b.market, m);
    if (dc) { const o = h > a ? 'H' : h < a ? 'A' : 'D'; bon = dc.includes(o); }
    else if (/ne marque pas|pas de but/.test(p) && /btts|marque/.test(p + ' ' + String(b.market || '').toLowerCase())) { bon = !(h > 0 && a > 0); }
    else if (/deux|btts|both/.test(p)) { bon = h > 0 && a > 0; acquis = bon; }
    else if ((x = p.match(/(?:plus de|over|\+)\s*(\d+(?:[.,]\d+)?)/))) { const n = parseFloat(x[1].replace(',', '.')); bon = t > n; acquis = bon; }
    else if ((x = p.match(/(?:moins de|under)\s*(\d+(?:[.,]\d+)?)/))) { const n = parseFloat(x[1].replace(',', '.')); bon = t < n; }
    else if (/victoire|gagne|vainqueur|win/.test(p) || /1n2/i.test(b.market || '')) {
      const [dom, ext] = cote2(p, m.hn, m.an);
      if (/nul|draw|\bn\b/.test(p) && !dom && !ext) bon = h === a; else if (dom) bon = h > a; else if (ext) bon = a > h;
    }
    if (bon === null) return fini ? 'end' : 'live';
    if (fini) return bon ? 'won' : 'lost';
    return acquis ? 'won' : bon ? 'ok' : 'live';
  }
  // match reporté / annulé / suspendu (statut ESPN)
  const reporte = m => !!m && /POSTPON|CANCEL|ABANDON|SUSPEND|DELAY/i.test(String(m.sn || '') + ' ' + String(m.det || '')) && !(m.done && !/POSTPON|CANCEL/i.test(String(m.sn || '')));
  const libRep = m => /CANCEL/i.test(m.sn || '') ? 'annulé' : /ABANDON/i.test(m.sn || '') ? 'arrêté' : /SUSPEND/i.test(m.sn || '') ? 'suspendu' : /DELAY/i.test(m.sn || '') ? 'retardé' : 'reporté';
  const LIB = { rep: 'reporté', won: 'gagné', ok: 'en passe', live: 'en cours', pre: 'à venir', lost: 'perdu', end: 'à régler', nf: 'pas suivi par Statify' };
  const libEtat = (e, m) => e === 'rep' ? (m ? libRep(m) : 'reporté') : e === 'won' && m && !(m.done || m.st === 'post') ? 'déjà passé' : LIB[e];

  /* ---------- Données ---------- */
  // pour l'onglet Multiplex de Statify : les paris en cours sur un match (id ESPN) et leur état
  let _pzM = { t: 0, d: null };
  window.pzParisMatch = id => {
    try {
      if (!_pzM.d || Date.now() - _pzM.t > 3000) { _pzM = { t: Date.now(), d: donnees() }; }
      return (_pzM.d.parMatch.get(String(id)) || []).map(({ l, combo }) => ({ id: l.b.id, prono: l.b.prono || '', odds: +l.b.odds || null, stake: +l.b.stake || 0, e: l.e, combo: !!combo, need: besoin(l.b, l.m) }));
    } catch (e) { return []; }
  };
  function donnees(sport) {
    sport = sport || 'football';
    const TN = sport === 'tennis', trouver = b => TN ? null : trouverM(b), etat = (b, m) => TN ? (b.status === 'Won' ? 'won' : b.status === 'Lost' ? 'lost' : 'pre') : etatM(b, m);
    const S = lire(), bets = S[sport] || [], combos = ((S.combos || {})[sport]) || [];
    const parId = new Map(bets.map(b => [String(b.id), b]));
    const C = combos.map(c => {
      const legs = (c.legIds || []).map(id => parId.get(String(id))).filter(Boolean).map(b => { const m = trouver(b); return { b, m, e: etat(b, m) }; });
      const odds = legs.reduce((p, l) => p * (+l.b.odds || 1), 1), stake = +c.stake || 1;
      const perdu = legs.some(l => l.e === 'lost'), gagne = legs.length && legs.every(l => l.e === 'won' && (l.b.status === 'Won' || (l.m && (l.m.done || l.m.st === 'post'))));
      const regle = legs.length && legs.every(l => l.b.status === 'Won' || l.b.status === 'Lost');
      const jours = legs.map(l => l.b.date).filter(Boolean).sort();
      return { c, legs, odds, stake, perdu, gagne, regle, jour: jours[jours.length - 1] || '' };
    }).filter(x => x.legs.length);
    const solos = bets.filter(b => !b.comboId).map(b => { const m = trouver(b); return { b, m, e: etat(b, m) }; });
    const refus = refusSet(), vu = new Set(), aRegler = [];
    const pousse = (b, m, e) => { const id = String(b.id); if (vu.has(id)) return; vu.add(id); if ((b.status === 'Pending' || !b.status) && (e === 'won' || e === 'lost') && m && (m.done || m.st === 'post') && !refus.has(id)) aRegler.push({ id: b.id, res: e === 'won' ? 'Won' : 'Lost' }); };
    C.forEach(x => x.legs.forEach(l => pousse(l.b, l.m, l.e))); solos.forEach(s => pousse(s.b, s.m, s.e));
    const netC = C.filter(x => x.regle).reduce((s, x) => s + (x.legs.every(l => l.b.status === 'Won') ? x.stake * (x.odds - 1) : -x.stake), 0);
    const miseC = C.filter(x => x.regle).reduce((s, x) => s + x.stake, 0);
    const netS = solos.filter(s => s.b.status === 'Won' || s.b.status === 'Lost').reduce((s, x) => s + (x.b.status === 'Won' ? (+x.b.stake || 0) * ((+x.b.odds || 1) - 1) : -(+x.b.stake || 0)), 0);
    const ouvertsC = C.filter(x => !x.regle), ouvertsS = solos.filter(s => s.b.status === 'Pending' || !s.b.status);
    const auj = jour();
    const ajd = ouvertsC.filter(x => x.legs.some(l => l.b.date === auj));
    const siTout = ajd.reduce((s, x) => s + x.stake * (x.odds - 1), 0) + ouvertsS.filter(s => s.b.date === auj).reduce((s, x) => s + (+x.b.stake || 0) * ((+x.b.odds || 1) - 1), 0);
    const parMatch = new Map();
    const pose = (id, item) => { if (!parMatch.has(id)) parMatch.set(id, []); parMatch.get(id).push(item); };
    C.forEach(x => x.legs.forEach(l => { if (l.m && !x.regle) pose(String(l.m.id), { l, combo: x }); }));
    ouvertsS.forEach(s => { if (s.m) pose(String(s.m.id), { l: s, combo: null }); });
    return { S, C, solos, netC, miseC, netS, ouvertsC, ouvertsS, ajd, siTout, parMatch, aRegler, nbAttente: ouvertsC.length + ouvertsS.length };
  }

  /* ---------- Morceaux d'interface (classes de Statify) ---------- */
  const pastille = (e, m) => `<span class="pz-st pz-${e}">${esc(libEtat(e, m))}</span>`;
  const scoreDe = m => !m ? '' : reporte(m) ? '⏸ ' + libRep(m).replace(/^./, c => c.toUpperCase()) : m.st === 'pre' ? new Date(m.d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : `${m.hs}-${m.as}${m.st === 'in' ? ' · ' + esc(m.clk || m.det || '') : ''}`;
  function etatCombo(x) {
    if (x.perdu) return ['lost', 'perdu'];
    if (x.regle || x.gagne) return ['won', 'gagné'];
    const rp = x.legs.filter(l => l.e === 'rep').length; if (rp) return ['rep', rp + ' match reporté'];
    const ok = x.legs.filter(l => l.e === 'won').length;
    if (x.legs.every(l => l.e === 'pre' || l.e === 'nf')) return ['pre', 'à venir'];
    return ['live', ok + '/' + x.legs.length + ' passé' + (ok > 1 ? 's' : '')];
  }
  function ligneMatch(items) {
    return items.map(({ l, combo }) => `<div class="pz-line"><span class="pz-ic">🎯</span><b>${esc(l.b.prono)} · ${cote(l.b.odds)}</b>${pastille(l.e, l.m)}${combo ? `<span class="pz-cb">Combiné ${cote(combo.odds)}</span>` : '<span class="pz-cb pz-solo">Solo</span>'}</div>`).join('');
  }
  // Explique pourquoi un pari n'est pas relié à un match de Statify
  function diagNF(b) {
    const [h, a] = cotes(b.match); if (!h || !a) return 'Nom du match illisible : écris « Équipe A vs Équipe B ».';
    if (!cache || Date.now() - cacheT > 3000) { cache = matchs(); cacheT = Date.now(); }
    const jj = d => { const t = new Date(d); return isNaN(t) ? '?' : t.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' }); };
    const c = k => cache.filter(m => pareil(k, m.hn) || pareil(k, m.an)).sort((x, y) => Date.parse(x.d) - Date.parse(y.d));
    const ch = c(h), ca = c(a), fmt = L => L.slice(0, 3).map(m => m.hn + ' – ' + m.an + ' (' + jj(m.d) + ')').join(' ; ');
    let t = 'Pari daté du ' + (b.date ? stFdf(b.date) : 'jour inconnu') + '. ';
    if (!ch.length && !ca.length) t += 'Statify n\'a aucun match de ' + h + ' ni de ' + a + ' dans ses données (championnat non suivi, ou match hors période' + (Object.keys(_extT).some(k => k.endsWith('|' + b.date) && _extT[k]) ? ' : ESPN a déjà été interrogé pour ce jour' : '') + ').';
    else t += 'Matchs connus : ' + (fmt(ch.length ? ch : ca)) + '. Aucun ne correspond à cette date ou à cette affiche (match peut-être reporté à une autre date : corrige la date du pari).';
    return t;
  }

  // éléments repliés (menus ⋯, explications ⓘ, blocs) : gardés ouverts entre deux rafraîchissements
  const OUV = new Set();
  const ouvert = k => OUV.has(k);
  function jambe(l, edit) {
    const ic = { won: '✅', lost: '❌', ok: '🟢', live: '🔴', pre: '⏳', end: '❔', nf: '➖', rep: '⏸️' }[l.e];
    const id = esc(l.b.id), W = l.b.status === 'Won', P = l.b.status === 'Lost', nf = l.e === 'nf' && !W && !P;
    // juste deux pastilles Gagné / Perdu ; toucher le pronostic ouvre la fiche du pari (modifier, supprimer)
    const act = edit ? `<span class="pz-act pz-gp"><button class="sec pz-pill${W ? ' pz-onw' : ''}" data-pz="won" data-id="${id}" title="Marquer gagné">✓ Gagné</button><button class="sec pz-pill${P ? ' pz-onl' : ''}" data-pz="lost" data-id="${id}" title="Marquer perdu">✗ Perdu</button></span>` : '';
    const info = nf ? ` <span class="pz-i" role="button" tabindex="0" data-pz="menu" data-k="d${id}" title="Pourquoi ce pari n'est pas suivi ?">ⓘ</span>` : '';
    const prono = edit ? `<span class="pz-pr" role="button" tabindex="0" data-pz="edit" data-id="${id}" title="Modifier ou supprimer ce pari">${esc(l.b.prono)} · ${cote(l.b.odds)}</span>` : `${esc(l.b.prono)} · ${cote(l.b.odds)}`;
    return `<div class="pz-leg"><span>${ic}</span><div class="pz-lt"><b ${l.m && !l.m.ext ? `class="link" data-act="fmatch" data-id="${esc(l.m.id)}"` : ''}>${esc(l.b.match.replace(/\s+vs\s+/i, ' – '))}</b><small class="mut">${prono}${info}</small>${nf && ouvert('d' + l.b.id) ? `<small class="mut pz-diag">${esc(diagNF(l.b))}</small>` : ''}${(() => { const n = besoin(l.b, l.m); return n ? `<small class="pz-need">⏱ ${esc(n)}</small>` : ''; })()}${act}</div><b class="pz-sc">${scoreJambe(l)}</b></div>`;
  }
  function scoreJambe(l) {
    if (!l.m || l.m.st === 'pre') return scoreDe(l.m);
    const mt = estMT(l.b), ht = scoreMT(l.m);
    if (!ht || (!ht.final && !mt)) return scoreDe(l.m);   // comme PronoTracker : mi-temps affichée dès la 2e période (ou en direct pour un pari mi-temps)
    return `${scoreDe(l.m)}<small class="mut" style="display:block;font-weight:600;font-size:11px">MT ${ht.h}-${ht.a}${ht.final ? '' : ' ·'}</small>`;
  }
  function carteCombo(x, edit) {
    const [e, t] = etatCombo(x), cid = esc(x.c.id), menu = ouvert('c' + x.c.id);
    const pied = edit && menu ? `<div class="pz-cf"><button class="sec pz-ib" data-pz="mcombo" data-id="${cid}">✎ Mise</button><button class="sec pz-ib" data-pz="dcombo" data-id="${cid}" title="Les paris redeviennent des simples">Défaire</button><button class="sec pz-ib pz-danger" data-pz="xcombo" data-id="${cid}">🗑 Supprimer</button></div>` : '';
    return `<div class="pz-combo"><div class="pz-ch"><b>Combiné · ${cote(x.odds)}</b><span class="pz-st pz-${e}">${esc(t)}</span>${edit ? `<span class="pz-i pz-cdots" role="button" tabindex="0" data-pz="menu" data-k="c${cid}" title="Mise, défaire, supprimer">${menu ? '✕' : '⋯'}</span>` : ''}</div><small class="mut">Mise ${stF2(x.stake)} € · gain possible ${stF2(x.stake * x.odds)} €</small>${x.legs.map(l => jambe(l, edit)).join('')}${pied}</div>`;
  }
  function bilan(D, grand) {
    if (!grand) return `<div class="pz-bil"><div class="pz-k pz-main"><span>Combinés · bilan</span><b class="${D.netC < 0 ? 'pz-neg' : 'pz-pos'}">${eur(D.netC)}</b><small class="mut">ROI ${D.miseC ? (100 * D.netC / D.miseC).toFixed(1).replace('.', ',') : '0,0'} %</small></div>
      <div class="pz-k"><span>Solo</span><b class="${D.netS < 0 ? 'pz-neg' : 'pz-pos'}">${eur(D.netS)}</b></div>
      <div class="pz-k"><span>En attente</span><b>${D.nbAttente}</b></div>
      <div class="pz-k pz-sit"><span>Aujourd'hui si tout passe</span><b class="pz-pos">${eur(D.siTout)}</b></div></div>`;
    // une seule bande de chiffres en haut de Mes paris
    const auj = jour(); let pj = 0;
    D.C.forEach(x => { if (x.regle && x.jour === auj) pj += x.legs.every(l => l.b.status === 'Won') ? x.stake * (x.odds - 1) : -x.stake; });
    D.solos.forEach(s => { if (s.b.date === auj && stReg(s.b)) pj += stGain(s.b); });
    const live = D.C.reduce((n, x) => n + x.legs.filter(l => l.m && l.m.st === 'in' && l.b.status === 'Pending').length, 0) + D.ouvertsS.filter(s => s.m && s.m.st === 'in').length;
    const k = (t, v, c, x) => `<div class="pz-kc${x ? ' ' + x : ''}"><span>${t}</span><b class="${c || ''}">${v}</b></div>`;
    return `<div class="pz-band">${k('Combinés · bilan', eur(D.netC), D.netC < 0 ? 'pz-neg' : 'pz-pos', 'pz-kmain')}${k('ROI', (D.miseC ? (100 * D.netC / D.miseC).toFixed(1).replace('.', ',') : '0,0') + ' %', D.netC < 0 ? 'pz-neg' : 'pz-pos')}${k('Solo', eur(D.netS), D.netS < 0 ? 'pz-neg' : 'pz-pos')}${k('Aujourd\'hui', eur(pj), stCls(pj))}${k('Si tout passe', eur(D.siTout), 'pz-pos')}${k('En attente', D.nbAttente)}${live ? k('En direct', '🔴 ' + live) : ''}</div>`;
  }
  /* ---------- Décoration des écrans de Statify ---------- */
  function lateral(D) {
    // menu latéral (tous les sports) : tous les onglets visibles, logo, « Mes paris » + « Analyseur »
    const tabs = document.getElementById('tabs'), grand = window.innerWidth >= 1100;
    if (tabs && grand) {
      if (typeof ui !== 'undefined' && !ui.tabMore && !window.__pzMore) { window.__pzMore = 1; ui.tabMore = true; setTimeout(() => { try { render(); } catch (e) {} window.__pzMore = 0; }, 0); }
      const br = document.querySelector('header .brand');
      if (br && !tabs.querySelector('.pz-brand')) { const c = br.cloneNode(true); c.classList.add('pz-brand'); c.removeAttribute('id'); tabs.prepend(c); }
    }
    const t = document.querySelector('#tabs [data-act=pronos]');
    if (t && grand && !tabs.querySelector('[data-act=pzanalyse]')) { const a = t.cloneNode(false); a.setAttribute('data-act', 'pzanalyse'); a.removeAttribute('id'); a.innerHTML = '<i>🔍</i><span>Analyseur</span>'; t.insertAdjacentElement('afterend', a); }
    const ta = document.querySelector('#tabs [data-act=pzanalyse]'); if (ta) ta.classList.toggle('on', !!window.__pzVue && filtre === 'analyse');
    if (t) { const s = t.querySelector('span'); if (s && s.textContent !== 'Mes paris') s.textContent = 'Mes paris'; t.classList.toggle('on', !!window.__pzVue && !(grand && filtre === 'analyse')); { const nl = D ? D.C.filter(x => !x.regle && !x.perdu && x.legs.some(l => l.m && l.m.st === 'in' && l.b.status === 'Pending')).length : 0, bd = t.querySelector('.pz-badge');   // pastille = nombre de combinés avec un match en direct
      if (!nl) { if (bd) bd.remove(); } else if (!bd) t.insertAdjacentHTML('beforeend', `<em class="pz-badge" title="Combinés avec un match en direct">${nl}</em>`); else if (bd.textContent !== String(nl)) bd.textContent = nl; } }
  }
  // Mes paris vit dans le Foot : depuis la NBA ou l'Euroligue, on bascule d'abord sur le Foot
  function allerFoot() { if (typeof ui !== 'undefined' && ui.sport !== 'foot' && typeof setSport === 'function') { setSport('foot'); try { render(); } catch (e) {} } }
  // scores en direct (encadré du haut) : seulement sur l'Accueil et dans Mes paris (sauf l'Analyseur)
  function majLive() {
    const tab = ui.sport === 'foot' ? ui.ftab : ui.tab, voir = window.__pzVue ? filtre !== 'analyse' : tab === 'home';
    const v = voir ? 'on' : 'off'; if (document.body.dataset.pzlive !== v) document.body.dataset.pzlive = v;
    const pt = window.__pzVue ? 'paris:' + filtre : ui.sport + ':' + tab; if (document.body.dataset.pztab !== pt) document.body.dataset.pztab = pt;
  }
  function decorer() {
    if (typeof ui === 'undefined') return;
    try { majLive(); } catch (e) {}
    if (ui.sport !== 'foot') { try { lateral(ui.sport === 'tennis' ? null : donnees()); } catch (e) {} if (ui.sport === 'tennis') tennisParis(); return; }
    const D = donnees();
    lateral(D);
    try { surveiller(D); } catch (e) {}
    // Accueil : « À ne pas manquer » rangé dans le bloc « Ce soir » (un seul bloc)
    try { const ts = document.querySelector('#view [data-fb=tonight] .card'), bg = document.querySelector('#view [data-fb=big]'); if (ts && bg && !ts.querySelector('.pz-big2')) { const rows = [...bg.querySelectorAll('.alert')]; if (rows.length) { ts.insertAdjacentHTML('beforeend', '<h3 class="pz-h3 pz-big2">🔥 À ne pas manquer · 8 prochains jours</h3>'); rows.forEach(r => ts.appendChild(r)); bg.style.display = 'none'; } } } catch (e) {}
    // 1) lignes sous les matchs (Accueil : .mxc, Matchs : .gt-tile)
    document.querySelectorAll('#view .mxc[data-id], #view .gt-tile[data-id]').forEach(el => {
      if (el.querySelector('.pz-line')) return;
      const it = D.parMatch.get(String(el.dataset.id));
      if (it) { el.insertAdjacentHTML('beforeend', ligneMatch(it)); el.classList.add('pz-has'); }
    });
    // 2) bloc « Mes paris » en haut de la colonne de droite de l'Accueil
    const petit = window.innerWidth < 1000;
    const zr = document.querySelector(petit ? '#view [data-zone=C]' : '#view [data-zone=R]');
    if (zr && !document.querySelector('#view [data-fb=paris]')) {
      // bloc compact : une ligne de chiffres + les combinés du jour (en direct d'abord), une ligne chacun
      const live = x => x.legs.some(l => l.m && l.m.st === 'in'), L = (D.ajd.length ? D.ajd : D.ouvertsC).slice().sort((a, b) => live(b) - live(a) || msCombo(a) - msCombo(b)).slice(0, petit ? 3 : 5);
      const avant = petit && zr.querySelector('[data-fb=multi]'), nl = D.ouvertsC.filter(live).length;
      const ligneC = x => { const [e, t] = etatCombo(x); return `<div class="pz-rr" data-pz="open"><div class="pz-rrh"><b>Combiné · ${cote(x.odds)}</b><span class="pz-st pz-${e}">${esc(t)}</span></div><small class="mut">${x.legs.map(l => `${{ won: '✅', lost: '❌', ok: '🟢', live: '🔴', pre: '⏳', end: '❔', nf: '➖', rep: '⏸️' }[l.e]} ${esc(l.b.match.replace(/\s+vs\s+/i, ' – '))}${l.m && l.m.st !== 'pre' && !reporte(l.m) ? ' <b>' + l.m.hs + '-' + l.m.as + '</b>' : ''}${besoin(l.b, l.m) ? ' <i>(' + esc(besoin(l.b, l.m)) + ')</i>' : ''}`).join(' · ')}</small></div>`; };
      (avant || zr).insertAdjacentHTML(avant ? 'beforebegin' : 'afterbegin', `<div class="fb" data-fb="paris"><div class="card rail pz-rail"><h2>🎯 Mes paris <span class="link pz-add" data-pz="new">＋ Pari</span><span class="link pz-all" data-pz="open">Tout voir</span></h2>
        <div class="pz-rl"><span>Combinés <b class="${D.netC < 0 ? 'pz-neg' : 'pz-pos'}">${eur(D.netC)}</b></span><span>Si tout passe <b class="pz-pos">${eur(D.siTout)}</b></span>${nl ? `<span>En direct <b>🔴 ${nl}</b></span>` : `<span>En attente <b>${D.nbAttente}</b></span>`}</div>
        ${L.map(ligneC).join('') || '<p class="mut" style="margin:6px 0 0">Aucun combiné en cours.</p>'}</div></div>`);
    }
    if (lsGet(AUTO) === '1' && D.aRegler.length && !window.__pzAuto && !window.__pzFrame) { window.__pzAuto = 1; try { appliquer(D.aRegler, true); } finally { setTimeout(() => { window.__pzAuto = 0; }, 1500); } return; }
    if (window.__pzVue) vueParis(D);
  }

  /* ---------- Écriture dans le stockage de PronoTracker (annulable) ---------- */
  const AUTO = 'pronotracker_autoRegler', REFUS = 'pronotracker_auto_refus', MARCHES = 'pronotracker_customMarkets';
  const FLGN = { 'fra.1': 'Ligue 1', 'eng.1': 'Premier League', 'esp.1': 'Liga', 'ita.1': 'Serie A', 'ger.1': 'Bundesliga', 'uefa.champions': 'Ligue des champions', 'uefa.europa': 'Europa League', 'uefa.europa.conf': 'Conférence League' };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const refusSet = () => { try { return new Set(JSON.parse(lsGet(REFUS) || '[]').map(String)); } catch (e) { return new Set(); } };
  const SP = () => (typeof ui !== 'undefined' && ui.sport === 'tennis') ? 'tennis' : 'football';
  const TENNIS_M = ['Vainqueur du match', 'Vainqueur du 1er set', 'Handicap jeux', 'Total jeux', 'Nombre de sets', 'Autre'];
  const marches = () => { if (SP() === 'tennis') return TENNIS_M.slice(); try { const s = JSON.parse(lsGet(MARCHES)); if (Array.isArray(s) && s.length) return s; } catch (e) {} return ['1N2', 'BTTS', 'Over/Under', 'Buteur', 'Mi-Temps', 'Autre']; };
  const jourDe = iso => { const d = new Date(iso); return isNaN(d) ? jour() : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const norm = s => mots(s).join(' ');
  let sel = new Set(), miseCombo = null, toastT = null;

  function lireN() { const S = lire(); ['football', 'tennis'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; }); if (!S.combos) S.combos = {}; ['football', 'tennis'].forEach(k => { if (!Array.isArray(S.combos[k])) S.combos[k] = []; }); return S; }
  function sauver(S) {
    ['football', 'tennis'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
    if (!S.combos) S.combos = {}; ['football', 'tennis'].forEach(k => { if (!Array.isArray(S.combos[k])) S.combos[k] = []; });
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    cache = null; if (window.syncSchedule) { try { window.syncSchedule(); } catch (e) {} }
  }
  function toast(msg, snap, refus) {
    let o = document.getElementById('pzToast'); if (!o) { o = document.createElement('div'); o.id = 'pzToast'; document.body.appendChild(o); }
    o._snap = snap; o._refus = refus || [];
    o.innerHTML = `<span>${esc(msg)}</span>${snap != null ? '<button class="sec" data-pz="undo">Annuler</button>' : ''}`;
    clearTimeout(toastT); toastT = setTimeout(() => { const t = document.getElementById('pzToast'); if (t) t.remove(); }, 9000);
  }
  function rafraichir() {
    document.querySelectorAll('#view .pz-line').forEach(e => e.remove());
    document.querySelectorAll('#view .pz-has').forEach(e => e.classList.remove('pz-has'));
    const r = document.querySelector('#view [data-fb=paris]'); if (r) r.remove();
    const v = document.getElementById('view'); if (v && !window.__pzFrame) v.__pzH = null;
    const ht = document.getElementById('pzTennis'); if (ht) ht.__pzH = null;
    decorer();
  }
  // Applique une modification, garde une copie pour « Annuler »
  function muter(fn, msg, refus) {
    dernierMut = Date.now();
    const snap = lsGet(KEY) || '{}', S = lireN(); fn(S); sauver(S);
    toast(msg, snap, refus); rafraichir();
  }
  function annuler() {
    const o = document.getElementById('pzToast'); if (!o || o._snap == null) return;
    try { localStorage.setItem(KEY, o._snap); } catch (e) {}
    if (o._refus && o._refus.length) { const s = refusSet(); o._refus.forEach(i => s.add(String(i))); try { localStorage.setItem(REFUS, JSON.stringify([...s].slice(-400))); } catch (e) {} }
    o.remove(); cache = null; rafraichir();
  }
  function appliquer(liste, auto) {
    if (!liste.length) return;
    const ids = liste.map(x => x.id);
    muter(S => liste.forEach(x => { const b = (S[SP()] || []).find(y => String(y.id) === String(x.id)); if (b && (b.status === 'Pending' || !b.status)) b.status = x.res; }),
      liste.length + ' pari' + (liste.length > 1 ? 's' : '') + ' réglé' + (liste.length > 1 ? 's' : '') + (auto ? ' automatiquement d\'après les scores' : ''), ids);
  }
  function retirerDuCombine(S, bet) {
    if (!bet.comboId) return;
    const cs = S.combos[SP()], c = cs.find(x => String(x.id) === String(bet.comboId));
    if (c) {
      c.legIds = c.legIds.filter(i => String(i) !== String(bet.id));
      if (c.legIds.length < 2) { S.combos[SP()] = cs.filter(x => x !== c); S[SP()].forEach(b => { if (String(b.comboId) === String(c.id)) delete b.comboId; }); }
    }
    delete bet.comboId;
  }

  /* ---------- Fenêtre : ajouter / modifier un pari ---------- */
  function ov(html) {
    fermer(); const o = document.createElement('div'); o.id = 'pzOv'; o.innerHTML = html; document.body.appendChild(o);
    const f = o.querySelector('input:not([type=date])'); if (f) setTimeout(() => f.focus(), 30);
  }
  function fermer() { const o = document.getElementById('pzOv'); if (o) o.remove(); }
  /* --- Saisie rapide : coller plusieurs paris d'un coup (même analyse que PronoTracker), avec aperçu modifiable --- */
  let COL = null;   // lignes analysées en attente de validation
  function marcheTexte(t, fb) { const P = [[/BTTS|(les\s+)?(deux|2)\s+équipes?\s+marquent/i, 'BTTS'], [/Over\/?Under/i, 'Over/Under'], [/Buteur/i, 'Buteur'], [/Mi[\s-]?Temps/i, 'Mi-Temps'], [/1N2|Résultat|Vainqueur/i, '1N2']]; if (!t) return fb; for (const [p, l] of P) if (p.test(t)) return l; return fb; }
  const recoller = s => s.replace(/(\.)([A-ZÀ-Ö])/g, '$1 $2').replace(/([a-zà-öø-ÿ])([A-ZÀ-Ö])/g, '$1 $2').replace(/([A-Za-zÀ-ÖØ-öø-ÿ])(\d)/g, '$1 $2').replace(/(\d-\d)(\d)/g, '$1 $2').replace(/\s{2,}/g, ' ').trim();
  const RED_COLLE = 4.88;   // même réduction que les cotes de l'Analyseur (cote réellement obtenue)
  function analyserCollage(raw, mise, existants) {
    const nm = s => String(s || '').toLowerCase().replace(/vs|-|_/g, ' ').replace(/\s+/g, ' ').trim();
    const dbl = b => existants.some(x => x.date === b.date && nm(x.match) === nm(b.match) && x.market === b.market && String(x.prono || '').toLowerCase().trim() === String(b.prono || '').toLowerCase().trim());
    const i0 = raw.search(/\d{2}[\/.-]\d{2}[\/.-]\d{4}/), r1 = i0 > 0 ? raw.slice(i0) : raw;
    const lignes = r1.replace(/(?<![\n|])(?=\d{2}[\/.-]\d{2}[\/.-]\d{4})/g, '\n').split('\n').filter(l => l.trim());
    const out = []; let dup = 0;
    lignes.forEach((line, i) => {
      let s = line.trim().replace(/^\|+\s*/, '').replace(/\s*\|+$/, '').replace(/(\d-\d)(\d)/g, '$1 $2'); if (!s) return;
      let date = jour(); const dm = s.match(/^(\d{2}[\/.-]\d{2}[\/.-]\d{4})/); if (dm) { const p = dm[1].split(/[\/.-]/); date = p[2] + '-' + p[1] + '-' + p[0]; s = s.replace(dm[0], '').trim(); }
      // cote : réduite de 4,88 % comme dans l'Analyseur ; « net » à la fin = cote déjà réduite (lignes copiées depuis l'Analyseur)
      let odds = 1.5, odds0 = null; const om = s.match(/(\d+[.,]\d{1,2})\s*(net)?\s*$/i); if (om) { const v = parseFloat(om[1].replace(',', '.')); if (om[2]) odds = v; else { odds0 = v; odds = Math.round(v * (1 - RED_COLLE / 100) * 100) / 100; } s = s.substring(0, s.lastIndexOf(om[0])).trim(); }
      let b = null;
      if (s.includes('|')) {
        const p = s.split('|').map(x => x.trim()).filter(Boolean);
        if (p.length >= 3) {
          let market = '1N2', unres = false; if (p.length >= 4) { const r = marcheTexte(p[2], null); if (r) market = r; else { market = 'Autre'; unres = true; } }
          let prono = p[p.length - 1], st = mise; if (p.length >= 5) { prono = p[p.length - 2]; const l = p[p.length - 1].trim(), n = parseFloat(l.replace(',', '.').replace('€', '')); if (!isNaN(n) && /^[\d.,]+\s*€?$/.test(l)) st = n; }
          b = { date, match: p[0].replace(/\s+-\s+/g, ' vs ').replace(/\s+/g, ' ').trim(), comp: p[1], market, prono, odds, stake: st, unres };
        }
      }
      if (!b) {
        const rx = x => { let t = x, market = '1N2', ok = false; for (const [pt, l] of [[/BTTS|(les\s+)?(deux|2)\s+équipes?\s+marquent/i, 'BTTS'], [/Over\/?Under/i, 'Over/Under'], [/Buteur/i, 'Buteur'], [/Mi[\s-]?Temps/i, 'Mi-Temps'], [/1N2|Résultat|Vainqueur/i, '1N2']]) if (pt.test(t)) { market = l; ok = true; t = t.replace(pt, ' |MARKET| '); break; }
          let comp = 'Autre'; const cm = t.match(/(Ligue\s+Europa\s+Conf[ée]rence|Europa\s+Conf[ée]rence\s+League|Conf[ée]rence\s+League|Ligue\s+Conf[ée]rence|Ligue\s+Europa|Europa\s+League|Ligue\s+des\s+Champions|Champions\s+League|Ligue\s+1|Premier\s+League|La\s+Liga|Serie\s+A|Bundesliga)/i);
          if (cm) { comp = cm[0].trim(); t = t.replace(cm[0], ' |COMP| '); }
          let match = 'Affiche inconnue', prono = t;
          if (t.includes('|COMP|')) { const q = t.split('|COMP|'); match = q[0].replace(/\s+vs\s+/i, ' vs ').replace(/\s+-\s+/g, ' vs ').replace(/\s+/g, ' ').trim(); prono = q[1].replace('|MARKET|', '').trim(); }
          else if (t.includes('|MARKET|')) { const q = t.split('|MARKET|'); match = q[0].replace(/\s+-\s+/g, ' vs ').replace(/\s+/g, ' ').trim(); prono = q[1].trim(); }
          prono = prono.replace(/^Victoire de\s+/i, 'Vainqueur ').replace(/^\||\|$/g, '').trim();
          return { market, ok, comp, match, prono }; };
        let r = rx(s); if (!r.ok) { const r2 = rx(recoller(s)); if (r2.ok) r = r2; }
        b = { date, match: r.match, comp: r.comp, market: r.market, prono: r.prono, odds, stake: mise, unres: !r.ok };
      }
      b.id = Date.now() + i; b.type = 'Single'; b.status = 'Pending'; if (odds0) b.odds0 = odds0;
      if (dbl(b)) { dup++; return; }
      out.push(b);
    });
    return { out, dup };
  }
  function vueColler(texte, msg) {
    ov(`<div class="pz-fm pz-col"><h3>📋 Coller plusieurs paris</h3><p class="mut" style="margin:0 0 6px">Une ligne par pari. Format : <b>Date | Match | Compétition | Marché | Pronostic | [Mise] | Cote</b>. La cote collée est réduite de 4,88 % (cote réellement obtenue). Exemple : <i>06/08/2026 | Lens - Lyon | Ligue 1 | 1N2 | Lens | 1.67</i></p>
      <textarea id="pz-col-t" rows="7" placeholder="06/08/2026 | Équipe A - Équipe B | Compétition | Marché | Pronostic | 1.67">${esc(texte || '')}</textarea><p class="pz-err">${esc(msg || '')}</p>
      <div class="pz-fa"><span style="flex:1"></span><button class="sec" data-pz="cancel">Annuler</button><button data-pz="colan">Analyser</button></div></div>`);
  }
  function vueApercu(dup) {
    const mk = marches();
    ov(`<div class="pz-fm pz-col"><h3>📋 Vérifie avant d'ajouter</h3><p class="mut" style="margin:0">${COL.length} pari(s) analysé(s). Corrige si besoin, décoche ceux à ignorer.${dup ? ` <b>${dup} doublon(s) déjà présent(s) ont été ignorés.</b>` : ''}</p>
      <div class="pz-tbw"><table class="pz-tb pz-colt"><thead><tr><th></th><th class="l">Date</th><th class="l">Match</th><th class="l">Compétition</th><th class="l">Marché</th><th class="l">Pronostic</th><th>Cote</th><th>Mise</th></tr></thead><tbody>
      ${COL.map((b, i) => `<tr class="${b.unres ? 'pz-warn' : ''}"><td><input type="checkbox" data-pz="colinc" data-i="${i}"${b.on !== false ? ' checked' : ''}></td><td><input data-col="${i}" data-f="date" type="date" value="${esc(b.date)}"></td><td><input data-col="${i}" data-f="match" value="${esc(b.match)}"></td><td><input data-col="${i}" data-f="comp" value="${esc(b.comp)}"></td><td><select data-col="${i}" data-f="market">${(mk.includes(b.market) ? mk : mk.concat(b.market)).map(m => `<option${m === b.market ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></td><td><input data-col="${i}" data-f="prono" value="${esc(b.prono)}"></td><td><input data-col="${i}" data-f="odds" type="number" step="0.01" value="${esc(b.odds)}" style="width:70px">${b.odds0 ? `<div class="mut" style="font-size:11px;white-space:nowrap">${String(b.odds0.toFixed(2)).replace('.', ',')} − 4,88 %</div>` : ''}</td><td><input data-col="${i}" data-f="stake" type="number" step="0.5" value="${esc(b.stake)}" style="width:60px"></td></tr>`).join('')}
      </tbody></table></div><p class="mut pz-hint">Les lignes en orange : marché non reconnu, à vérifier.</p>
      <div class="pz-fa"><button class="sec" data-pz="colback">← Modifier le texte</button><span style="flex:1"></span><button class="sec" data-pz="cancel">Annuler</button><button data-pz="colok">Valider et ajouter (<span id="pz-col-n">${COL.filter(b => b.on !== false).length}</span>)</button></div></div>`);
  }
  function collerAnalyser() {
    const raw = ((document.getElementById('pz-col-t') || {}).value || '').trim(); if (!raw) return;
    const L = lireN()[SP()], mise = (L[0] && +L[0].stake) || 1, r = analyserCollage(raw, mise, L);
    COL = r.out; COL.texte = raw;
    if (!COL.length) return vueColler(raw, r.dup ? `Tous les paris analysés (${r.dup}) étaient déjà présents.` : 'Aucun pari n\'a pu être extrait du texte.');
    vueApercu(r.dup);
  }
  function collerValider() {
    const add = COL.filter(b => b.on !== false).map(b => { const x = Object.assign({}, b); delete x.on; delete x.unres; delete x.odds0; x.odds = parseFloat(String(x.odds).replace(',', '.')) || 1; x.stake = parseFloat(String(x.stake).replace(',', '.')) || 1; return x; });
    if (!add.length) return;
    fermer(); COL = null;
    muter(S => { add.slice().reverse().forEach(b => S[SP()].unshift(b)); }, add.length + ' pari(s) ajouté(s)');
  }
  // suggestions de pronostic sous le champ, d'après le match et le marché (comme PronoTracker)
  function suggestions(match, market) {
    const p = String(match || '').split(/\s+vs\.?\s+|\s+-\s+/i).map(x => x.trim()).filter(Boolean), t = p.length === 2 ? p : null, m = String(market || '').toLowerCase();
    if (/1n2|résultat|vainqueur/.test(m)) return t ? [t[0], 'Match nul', t[1]] : [];
    if (/btts|deux\s+équipes?\s+marquent/.test(m)) return ['Les deux équipes marquent', 'Une équipe ne marque pas'];
    if (/over\/?under/.test(m)) return ['Plus de 1.5 buts', 'Plus de 2.5 buts', 'Moins de 2.5 buts', 'Plus de 3.5 buts'];
    if (/mi[\s-]?temps/.test(m)) return t ? [`Victoire ${t[0]} (MT)`, 'Nul (MT)', `Victoire ${t[1]} (MT)`] : ['Nul à la Mi-Temps'];
    return [];
  }
  function majSugg() { const box = document.getElementById('pz-sugg'); if (!box) return; const L = suggestions((document.getElementById('pz-m') || {}).value, (document.getElementById('pz-k') || {}).value); box.innerHTML = L.map(x => `<button class="sec pz-ib" data-pz="sugg" data-v="${esc(x)}">${esc(x)}</button>`).join(''); }

  function formulaire(opt) {
    opt = opt || {};
    const S = lire(), L = S[SP()] || [];
    const b = opt.id != null ? L.find(x => String(x.id) === String(opt.id)) : null;
    const mk = marches(); if (b && b.market && !mk.includes(b.market)) mk.push(b.market);
    const v = b || { date: opt.date || jour(), match: opt.match || '', comp: opt.comp || '', market: opt.market && mk.includes(opt.market) ? opt.market : (opt.market ? (mk.push(opt.market), opt.market) : mk[0]), prono: '', odds: '', stake: opt.stake != null ? +opt.stake : ((L[0] && +L[0].stake) || 1) };
    const noms = [...new Set(matchs().map(m => m.hn + ' vs ' + m.an))];
    const comps = [...new Set(L.map(x => (x.comp || '').trim()).filter(Boolean).concat(Object.values(FLGN)))];
    const pronos = [...new Set(L.map(x => x.prono).filter(Boolean))].slice(0, 80);
    const dl = (id, a) => `<datalist id="${id}">${a.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
    ov(`<div class="pz-fm" data-new="${b ? 0 : 1}"><h3>${b ? 'Modifier le pari' : '🎯 Nouveau pari'}</h3>
      <div class="pz-fg">
        <label class="pz-f"><span>Date</span><input id="pz-d" type="date" value="${esc(v.date)}"></label>
        <label class="pz-f"><span>Championnat</span><input id="pz-c" list="pz-lc" value="${esc(v.comp)}" autocomplete="off"></label>
        <label class="pz-f w"><span>Match</span><input id="pz-m" list="pz-lm" placeholder="Équipe A vs Équipe B" value="${esc(v.match)}" autocomplete="off"></label>
        <label class="pz-f"><span>Marché</span><select id="pz-k">${mk.map(x => `<option${x === v.market ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label class="pz-f"><span>Pronostic</span><input id="pz-p" list="pz-lp" placeholder="Ex. Plus de 2.5 buts" value="${esc(v.prono)}" autocomplete="off"></label>
        <div class="pz-f w pz-sugg" id="pz-sugg">${suggestions(v.match, v.market).map(x => `<button class="sec pz-ib" data-pz="sugg" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        <label class="pz-f"><span>Cote</span><input id="pz-o" type="number" step="0.01" min="1.01" inputmode="decimal" value="${esc(v.odds)}"></label>
        <label class="pz-f"><span>Mise (€)</span><input id="pz-s" type="number" step="0.5" min="0.1" inputmode="decimal" value="${esc(v.stake)}"></label>
      </div>${dl('pz-lm', noms)}${dl('pz-lc', comps)}${dl('pz-lp', pronos)}
      <p class="pz-err" id="pz-err"></p>
      <div class="pz-fa">${b ? `<button class="sec pz-danger" data-pz="del" data-id="${esc(b.id)}">🗑 Supprimer</button><button class="sec" data-pz="dup" data-id="${esc(b.id)}" title="Nouveau pari avec le même championnat, marché et mise">⧉ Dupliquer</button>` : `<button class="sec" data-pz="newmatch" title="Vide le match et le pronostic, garde le reste">↺ Nouveau match</button><button class="sec" data-pz="paste" title="Coller plusieurs paris d'un coup">📋 Coller plusieurs paris</button>`}<span style="flex:1"></span><button class="sec" data-pz="cancel">Annuler</button><button data-pz="save" data-id="${b ? esc(b.id) : ''}">Enregistrer</button></div></div>`);
  }
  function enregistrer(id) {
    const g = k => (document.getElementById(k) || {}).value || '';
    const f = { date: g('pz-d'), match: g('pz-m').trim(), comp: g('pz-c').trim(), market: g('pz-k'), prono: g('pz-p').trim(), odds: parseFloat(g('pz-o')), stake: parseFloat(g('pz-s')) };
    const err = t => { const e = document.getElementById('pz-err'); if (e) e.textContent = t; };
    if (!f.match || !cotes(f.match)[1]) return err('Indique le match sous la forme « Équipe A vs Équipe B ».');
    if (!f.prono) return err('Indique le pronostic.');
    if (!(f.odds > 1)) return err('La cote doit être supérieure à 1.');
    if (!(f.stake > 0)) return err('La mise doit être supérieure à 0.');
    const S = lire(), L = S[SP()] || [], cle = x => norm(x.match) + '|' + norm(x.prono) + '|' + norm(x.market);
    const dup = L.find(x => String(x.id) !== String(id) && x.date === f.date && cle(x) === cle(f));
    if (dup && !confirm('⚠️ Ce pari existe déjà :\n' + dup.match + ' · ' + dup.prono + ' · cote ' + dup.odds + '\n\nL\'ajouter quand même ?')) return;
    fermer();
    if (id) muter(S2 => { const b = S2[SP()].find(x => String(x.id) === String(id)); if (b) Object.assign(b, f); }, 'Pari modifié');
    else muter(S2 => { S2[SP()] = S2[SP()] || []; S2[SP()].unshift(Object.assign({ id: Date.now(), type: 'Single', status: 'Pending' }, f)); }, 'Pari ajouté');
  }
  function supprimerPari(id) {
    fermer();
    muter(S => {
      const i = S[SP()].findIndex(x => String(x.id) === String(id)); if (i < 0) return;
      const b = S[SP()][i]; retirerDuCombine(S, b); S[SP()].splice(i, 1);
    }, 'Pari supprimé');
  }
  function regler(id, res) {
    muter(S => { const b = S[SP()].find(x => String(x.id) === String(id)); if (b) b.status = b.status === res ? 'Pending' : res; }, res === 'Won' ? 'Marqué gagné' : 'Marqué perdu');
  }

  /* ---------- Combinés : créer / modifier la mise / défaire / supprimer ---------- */
  function creerCombine() {
    const D = donnees(SP()), legs = [...sel].map(i => D.ouvertsS.find(s => String(s.b.id) === i)).filter(Boolean);
    if (legs.length < sel.size) { toast((sel.size - legs.length) + ' pari(s) coché(s) ne sont plus en cours (déjà réglés ou déjà dans un combiné).'); }
    const why = pourquoiPasManuel(legs); if (why) { toast(why); return; }
    const stake = parseFloat((document.getElementById('pz-ms') || {}).value || miseCombo);
    if (!(stake > 0)) { toast('Indique une mise valide pour le combiné.'); return; }
    const ids = legs.map(l => l.b.id), cid = Date.now();
    muter(S => { S.combos[SP()].push({ id: cid, stake, legIds: ids, createdAt: new Date().toISOString() }); S[SP()].forEach(b => { if (ids.some(i => String(i) === String(b.id))) b.comboId = cid; }); },
      'Combiné créé · cote ' + cote(legs.reduce((p, l) => p * (+l.b.odds || 1), 1)));
    sel = new Set(); miseCombo = stake;
  }
  function miseDuCombine(cid) {
    const S = lireN(), c = S.combos[SP()].find(x => String(x.id) === String(cid)); if (!c) return;
    ov(`<div class="pz-fm"><h3>Mise du combiné</h3><div class="pz-fg"><label class="pz-f w"><span>Mise (€)</span><input id="pz-s" type="number" step="0.5" min="0.1" inputmode="decimal" value="${esc(c.stake)}"></label></div>
      <p class="pz-err" id="pz-err"></p><div class="pz-fa"><span style="flex:1"></span><button class="sec" data-pz="cancel">Annuler</button><button data-pz="msave" data-id="${esc(cid)}">Enregistrer</button></div></div>`);
  }
  function enregistrerMise(cid) {
    const m = parseFloat((document.getElementById('pz-s') || {}).value); if (!(m > 0)) { const e = document.getElementById('pz-err'); if (e) e.textContent = 'La mise doit être supérieure à 0.'; return; }
    fermer(); muter(S => { const c = S.combos[SP()].find(x => String(x.id) === String(cid)); if (c) c.stake = m; }, 'Mise modifiée');
  }
  function defaire(cid) {
    muter(S => { const c = S.combos[SP()].find(x => String(x.id) === String(cid)); if (!c) return; S[SP()].forEach(b => { if (String(b.comboId) === String(cid)) delete b.comboId; }); S.combos[SP()] = S.combos[SP()].filter(x => x !== c); }, 'Combiné défait : les paris redeviennent des simples');
  }
  function supprimerCombine(cid) {
    muter(S => { const c = S.combos[SP()].find(x => String(x.id) === String(cid)); if (!c) return; const ids = c.legIds.map(String); S[SP()] = S[SP()].filter(b => !ids.includes(String(b.id))); S.combos[SP()] = S.combos[SP()].filter(x => x !== c); }, 'Combiné et ses paris supprimés');
  }

  /* ---------- Moteur de l'Analyseur (repris tel quel de PronoTracker) ---------- */
    function echapper(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function fmt(v) { return (v === null || v === undefined) ? '—' : v + '%'; }
    // Réduction appliquée aux cotes du tableau des paris (4,88 %), pour retrouver la cote réellement
    // obtenue. La cote ajustée est arrondie à 2 décimales : ce qui est affiché est ce qui est enregistré.
    const REDUCTION_COTE_PCT = 4.88;
    function coteAjustee(v) {
        if (v === null || v === undefined || isNaN(v)) return v;
        return Math.round(v * (1 - REDUCTION_COTE_PCT / 100) * 100) / 100;
    }
    function fmtCote(v) { return (v === null || v === undefined) ? '—' : v.toFixed(2).replace('.', ','); }

    function directionLabel(cle) {
        const m = cle.match(/^(over|under)([\d.]+)$/);
        if (!m) return cle;
        const dir = m[1] === 'over' ? 'Plus de' : 'Moins de';
        const val = m[2].replace('.', ',');
        return `${dir} ${val} but(s)`;
    }

    // Compétitions connues (les coupes européennes d'abord, car un texte sur un match de C1
    // peut aussi citer la Ligue 1 pour la forme domestique d'une équipe).
    const LIGUES_CONNUES = [
        [/ligue\s+des\s+champions|champions\s+league/i, 'Ligue des Champions'],
        [/europa\s+conf[ée]rence\s+league|conf[ée]rence\s+league|ligue\s+conf[ée]rence|ligue\s+europa\s+conf[ée]rence/i, 'Ligue Conférence'],
        [/europa\s+league|ligue\s+europa/i, 'Europa League'],
        [/premier\s+league/i, 'Premier League'],
        [/la\s?liga|primera\s+divisi[oó]n/i, 'La Liga'],
        [/serie\s+a\b/i, 'Serie A'],
        [/bundesliga/i, 'Bundesliga'],
        [/ligue\s+1\b/i, 'Ligue 1'],
        [/ligue\s+2\b/i, 'Ligue 2'],
        [/eredivisie/i, 'Eredivisie'],
        [/primeira\s+liga|liga\s+portugal/i, 'Primeira Liga'],
        [/jupiler\s+pro\s+league/i, 'Jupiler Pro League'],
        [/s[üu]per\s+lig/i, 'Süper Lig'],
    ];

    // Si la compétition existe déjà dans le tracker (à la casse près), on reprend EXACTEMENT
    // l'orthographe déjà utilisée, pour ne pas créer de doublons dans les stats par championnat.
    function alignerSurCompetitionExistante(nom) {
        if (!nom) return nom;
        const existantes = Array.from(new Set((lire().football || []).map(b => (b.comp || '').trim()).filter(Boolean)));
        const trouvee = existantes.find(c => c.toLowerCase() === nom.toLowerCase());
        return trouvee || nom;
    }

    function normaliserCompetition(brut) {
        for (const [re, nom] of LIGUES_CONNUES) {
            if (re.test(brut)) return alignerSurCompetitionExistante(nom);
        }
        return alignerSurCompetitionExistante(brut.trim());
    }

    // Devine la compétition d'après l'historique : cherche les paris déjà enregistrés où
    // apparaissent ces équipes. Priorité à une compétition commune aux deux équipes.
    function devinerCompetitionParEquipes(home, away) {
        if (!home || !away) return null;
        const cH = {}, cA = {};
        (lire().football || []).forEach(b => {
            const comp = (b.comp || '').trim();
            if (!comp || !b.match) return;
            const parts = String(b.match).split(/\s+(?:vs\.?|v|-|–|—)\s+/i);
            parts.forEach(nom => {
                if (pareil(nom, home)) cH[comp] = (cH[comp] || 0) + 1;
                if (pareil(nom, away)) cA[comp] = (cA[comp] || 0) + 1;
            });
        });
        const communes = Object.keys(cH).filter(c => cA[c]);
        if (communes.length) {
            communes.sort((a, b) => Math.min(cH[b], cA[b]) - Math.min(cH[a], cA[a]) || (cH[b] + cA[b]) - (cH[a] + cA[a]));
            return communes[0];
        }
        const tous = Object.assign({}, cH);
        Object.keys(cA).forEach(c => { tous[c] = (tous[c] || 0) + cA[c]; });
        const cles = Object.keys(tous).sort((a, b) => tous[b] - tous[a]);
        return cles.length ? cles[0] : null;
    }

    function extraireCompetition(texte, home, away) {
        // 1) Compétition explicitement étiquetée ("Compétition : ...", "League: ...", "Championnat : ...")
        let m = texte.match(/(?:Comp[ée]tition|Championnat|League|Tournament|Tournoi)\s*:\s*([^.\n|]+)/i);
        if (m && m[1].trim()) return normaliserCompetition(m[1].trim());

        // 2) Compétition connue citée dans le texte
        for (const [re, nom] of LIGUES_CONNUES) {
            if (re.test(texte)) return alignerSurCompetitionExistante(nom);
        }

        // 3) Compétition déjà utilisée dans le tracker (ex: une compétition personnalisée)
        const existantes = Array.from(new Set((lire().football || []).map(b => (b.comp || '').trim()).filter(c => c.length >= 4)));
        existantes.sort((a, b) => b.length - a.length);
        const low = texte.toLowerCase();
        const trouvee = existantes.find(c => low.includes(c.toLowerCase()));
        if (trouvee) return trouvee;

        // 4) Déduction par les équipes, d'après les paris déjà enregistrés
        return devinerCompetitionParEquipes(home, away);
    }

    // Renvoie le nom du marché tel qu'il existe dans la liste déroulante du tracker
    // (marches() : 1N2, BTTS, Over/Under, Buteur, Mi-Temps, Double Chance, + types ajoutés).
    function marcheDisponible(nom) {
        const trouve = marches().find(x => x.toLowerCase() === nom.toLowerCase());
        if (trouve) return trouve;
        const autre = marches().find(x => x.toLowerCase() === 'autre');
        return autre || nom;
    }

    // Traduit un candidat de l'Analyseur en (marché du tracker, pronostic au format du tracker).
    // Les pronostics reprennent les mêmes libellés que les suggestions du formulaire d'ajout :
    //   1N2        -> "Équipe A" / "Match nul" / "Équipe B"
    //   Mi-Temps   -> "Victoire Équipe A (MT)" / "Nul (MT)" / "Victoire Équipe B (MT)"
    //   Over/Under -> "Plus de 2.5 buts" / "Moins de 2.5 buts"
    //   BTTS       -> "Les deux équipes marquent" / "Une équipe ne marque pas"
    function separerMarchePronostic(label, home, away) {
        if (label === 'Match nul à la mi-temps') return { marche: marcheDisponible('Mi-Temps'), pronostic: 'Nul (MT)' };
        if (label === 'Match nul au score final') return { marche: marcheDisponible('1N2'), pronostic: 'Match nul' };
        if (label === `${home} gagne la 1ère mi-temps`) return { marche: marcheDisponible('Mi-Temps'), pronostic: `Victoire ${home} (MT)` };
        if (label === `${away} gagne la 1ère mi-temps`) return { marche: marcheDisponible('Mi-Temps'), pronostic: `Victoire ${away} (MT)` };
        if (label === `${home} gagne le match`) return { marche: marcheDisponible('1N2'), pronostic: home };
        if (label === `${away} gagne le match`) return { marche: marcheDisponible('1N2'), pronostic: away };
        let m = label.match(/^(Plus de|Moins de) ([\d,]+) but\(s\) en 1ère mi-temps$/);
        if (m) return { marche: marcheDisponible('Mi-Temps'), pronostic: `${m[1]} ${m[2].replace(',', '.')} buts en 1ère MT` };
        m = label.match(/^(Plus de|Moins de) ([\d,]+) but\(s\) sur le match complet$/);
        if (m) return { marche: marcheDisponible('Over/Under'), pronostic: `${m[1]} ${m[2].replace(',', '.')} buts` };
        if (label.includes('BTTS oui')) return { marche: marcheDisponible('BTTS'), pronostic: 'Les deux équipes marquent' };
        if (label.includes('BTTS non')) return { marche: marcheDisponible('BTTS'), pronostic: 'Une équipe ne marque pas' };
        return { marche: marcheDisponible('Autre'), pronostic: label };
    }

    // Règle : dès que le pronostic contient "MT" (mi-temps), le marché est forcément Mi-Temps.
    function marcheSelonPronostic(marche, pronostic) {
        return /\bMT\b/i.test(pronostic || '') ? marcheDisponible('Mi-Temps') : marche;
    }

    function extraireEquipes(texte) {
        let home = null, away = null;

        let m = texte.match(/The home team is ([^.]+)\./i);
        if (m) home = m[1].trim();
        m = texte.match(/The away team is ([^.]+)\./i);
        if (m) away = m[1].trim();

        if (!home) {
            m = texte.match(/L['’]équipe (?:à domicile|recevante|hôte) est ([^.]+)\./i);
            if (m) home = m[1].trim();
        }
        if (!away) {
            m = texte.match(/L['’]équipe (?:à l['’]extérieur|visiteuse) est ([^.]+)\./i);
            if (m) away = m[1].trim();
        }

        if (!home || !away) {
            m = texte.match(/Match\s*:\s*([^.]+?)\s+(?:vs\.?|contre)\s+([^.]+)\./i) ||
                texte.match(/([A-ZÀ-Ý][\wà-ÿ'\- ]+?)\s+(?:vs\.?|contre)\s+([A-ZÀ-Ý][\wà-ÿ'\- ]+)/);
            if (m) { home = home || m[1].trim(); away = away || m[2].trim(); }
        }
        return { home, away };
    }

    function parseResultatsEquipe(texte, team) {
        const t = echapper(team);
        const verbMapEN = { won: 'win', drew: 'draw', lost: 'loss' };
        const res = {
            home: { win: null, draw: null, loss: null },
            away: { win: null, draw: null, loss: null },
            homeFT: { win: null, draw: null, loss: null },
            awayFT: { win: null, draw: null, loss: null },
        };

        function collectEN(regexStr, obj) {
            const re = new RegExp(regexStr, 'gi');
            let m;
            while ((m = re.exec(texte))) obj[verbMapEN[m[1].toLowerCase()]] = parseInt(m[2], 10);
        }
        collectEN(`In ${t}'s home matches this season, ${t} (won|drew|lost) the first half in (\\d+)% of matches`, res.home);
        collectEN(`In ${t}'s away matches this season, ${t} (won|drew|lost) the first half in (\\d+)% of matches`, res.away);
        collectEN(`In ${t}'s home matches this season, ${t} (won|drew|lost) at full time in (\\d+)% of matches`, res.homeFT);
        collectEN(`In ${t}'s away matches this season, ${t} (won|drew|lost) at full time in (\\d+)% of matches`, res.awayFT);

        const verbeFR = '(a gagné|remporte|a remporté|gagne|a fait match nul|fait match nul|a été tenu en échec|a perdu|perd)';
        function verbeVersCleFR(v) {
            v = v.toLowerCase();
            if (v.includes('nul') || v.includes('tenu en échec')) return 'draw';
            if (v.includes('perd')) return 'loss';
            return 'win';
        }
        function collectFR(scopeStr, periodeStr, obj) {
            const re = new RegExp(`${scopeStr},\\s*${t} ${verbeFR} ${periodeStr} dans (\\d+)\\s?% des (?:matchs|cas)`, 'gi');
            let m;
            while ((m = re.exec(texte))) obj[verbeVersCleFR(m[1])] = parseInt(m[2], 10);
        }
        const scopeDomicileFR = `Dans les matchs (?:à domicile|domicile) de ${t}(?: cette saison)?`;
        const scopeExterieurFR = `Dans les matchs (?:à l['’]extérieur|extérieur) de ${t}(?: cette saison)?`;
        collectFR(scopeDomicileFR, 'la première mi-temps', res.home);
        collectFR(scopeExterieurFR, 'la première mi-temps', res.away);
        collectFR(scopeDomicileFR, '(?:le match|à la fin du match)', res.homeFT);
        collectFR(scopeExterieurFR, '(?:le match|à la fin du match)', res.awayFT);

        return res;
    }

    function parseButsEquipe(texte, team) {
        const t = echapper(team);
        const data = { home1H: {}, away1H: {}, homeFT: {}, awayFT: {} };

        function collectEN(regexStr, obj) {
            const re = new RegExp(regexStr, 'gi');
            let m;
            while ((m = re.exec(texte))) obj[`${m[1].toLowerCase()}${m[2]}`] = parseInt(m[3], 10);
        }
        collectEN(`In ${t}'s home matches this season, total first-half goals were (over|under) ([\\d.]+) in (\\d+)% of matches`, data.home1H);
        collectEN(`In ${t}'s away matches this season, total first-half goals were (over|under) ([\\d.]+) in (\\d+)% of matches`, data.away1H);
        collectEN(`In ${t}'s home matches this season, total match goals at full time were (over|under) ([\\d.]+) in (\\d+)% of matches`, data.homeFT);
        collectEN(`In ${t}'s away matches this season, total match goals at full time were (over|under) ([\\d.]+) in (\\d+)% of matches`, data.awayFT);

        function collectFR(scopeStr, sujetStr, obj) {
            const re = new RegExp(`${scopeStr},\\s*${sujetStr} était (supérieur|inférieur) à ([\\d.,]+) dans (\\d+)\\s?% des (?:matchs|cas)`, 'gi');
            let m;
            while ((m = re.exec(texte))) {
                const dir = m[1].toLowerCase() === 'supérieur' ? 'over' : 'under';
                const seuil = m[2].replace(',', '.');
                obj[`${dir}${seuil}`] = parseInt(m[3], 10);
            }
        }
        const scopeDomicileFR = `Dans les matchs (?:à domicile|domicile) de ${t}(?: cette saison)?`;
        const scopeExterieurFR = `Dans les matchs (?:à l['’]extérieur|extérieur) de ${t}(?: cette saison)?`;
        collectFR(scopeDomicileFR, 'le total de buts en première mi-temps', data.home1H);
        collectFR(scopeExterieurFR, 'le total de buts en première mi-temps', data.away1H);
        collectFR(scopeDomicileFR, 'le total de buts du match', data.homeFT);
        collectFR(scopeExterieurFR, 'le total de buts du match', data.awayFT);

        return data;
    }

    function parseBTTSEquipe(texte, team) {
        const t = echapper(team);
        const data = { home: {}, away: {} };

        function collectScopeEN(scope, obj) {
            let m = texte.match(new RegExp(`${scope}, both teams scored at full time in (\\d+)% of matches`, 'i'));
            if (m) obj.both = parseInt(m[1], 10);
            m = texte.match(new RegExp(`${scope}, at least one team failed to score at full time in (\\d+)% of matches`, 'i'));
            if (m) obj.fail = parseInt(m[1], 10);
        }
        collectScopeEN(`In ${t}'s home matches this season`, data.home);
        collectScopeEN(`In ${t}'s away matches this season`, data.away);

        function collectScopeFR(scope, obj) {
            let m = texte.match(new RegExp(`${scope},\\s*les deux équipes ont marqué dans (\\d+)\\s?% des (?:matchs|cas)`, 'i'));
            if (m) obj.both = parseInt(m[1], 10);
            m = texte.match(new RegExp(`${scope},\\s*au moins une équipe n['’]a pas marqué dans (\\d+)\\s?% des (?:matchs|cas)`, 'i'));
            if (m) obj.fail = parseInt(m[1], 10);
        }
        collectScopeFR(`Dans les matchs (?:à domicile|domicile) de ${t}(?: cette saison)?`, data.home);
        collectScopeFR(`Dans les matchs (?:à l['’]extérieur|extérieur) de ${t}(?: cette saison)?`, data.away);

        return data;
    }

    function parseCotes(texte, home, away) {
        const cotes = {};
        const th = echapper(home || '§§§');
        const ta = echapper(away || '§§§');
        let m;

        m = texte.match(new RegExp(`The odds for ${th} to win the first half are ([\\d.]+)`, 'i'));
        if (m) cotes.home_win_1H = parseFloat(m[1]);
        m = texte.match(new RegExp(`The odds for ${ta} to win the first half are ([\\d.]+)`, 'i'));
        if (m) cotes.away_win_1H = parseFloat(m[1]);
        m = texte.match(/The odds for a draw in the first half are ([\d.]+)/i);
        if (m) cotes.draw_1H = parseFloat(m[1]);
        m = texte.match(new RegExp(`The odds for ${th} to win at full time are ([\\d.]+)`, 'i'));
        if (m) cotes.home_win_FT = parseFloat(m[1]);
        m = texte.match(new RegExp(`The odds for ${ta} to win at full time are ([\\d.]+)`, 'i'));
        if (m) cotes.away_win_FT = parseFloat(m[1]);
        m = texte.match(/The odds for a draw at full time are ([\d.]+)/i);
        if (m) cotes.draw_FT = parseFloat(m[1]);
        let re = /The odds for the total first-half goals to be (over|under) ([\d.]+) are ([\d.]+)/gi;
        while ((m = re.exec(texte))) cotes[`${m[1].toLowerCase()}${m[2]}_1H`] = parseFloat(m[3]);
        re = /The odds for the total match goals at full time to be (over|under) ([\d.]+) are ([\d.]+)/gi;
        while ((m = re.exec(texte))) cotes[`${m[1].toLowerCase()}${m[2]}_FT`] = parseFloat(m[3]);
        m = texte.match(/The odds for both teams to score at full time are ([\d.]+)/i);
        if (m) cotes.btts_yes = parseFloat(m[1]);
        m = texte.match(/The odds for at least one team to fail to score at full time are ([\d.]+)/i);
        if (m) cotes.btts_no = parseFloat(m[1]);

        function siVide(cle, val) { if (cotes[cle] === undefined) cotes[cle] = val; }

        m = texte.match(new RegExp(`(?:La |Les )?cotes? pour que ${th} gagne la première mi-temps (?:est|sont) de ([\\d.,]+)`, 'i'));
        if (m) siVide('home_win_1H', parseFloat(m[1].replace(',', '.')));
        m = texte.match(new RegExp(`(?:La |Les )?cotes? pour que ${ta} gagne la première mi-temps (?:est|sont) de ([\\d.,]+)`, 'i'));
        if (m) siVide('away_win_1H', parseFloat(m[1].replace(',', '.')));
        m = texte.match(/(?:La |Les )?cotes? pour un match nul en première mi-temps (?:est|sont) de ([\d.,]+)/i);
        if (m) siVide('draw_1H', parseFloat(m[1].replace(',', '.')));
        m = texte.match(new RegExp(`(?:La |Les )?cotes? pour que ${th} gagne le match (?:est|sont) de ([\\d.,]+)`, 'i'));
        if (m) siVide('home_win_FT', parseFloat(m[1].replace(',', '.')));
        m = texte.match(new RegExp(`(?:La |Les )?cotes? pour que ${ta} gagne le match (?:est|sont) de ([\\d.,]+)`, 'i'));
        if (m) siVide('away_win_FT', parseFloat(m[1].replace(',', '.')));
        m = texte.match(/(?:La |Les )?cotes? pour un match nul au score final (?:est|sont) de ([\d.,]+)/i);
        if (m) siVide('draw_FT', parseFloat(m[1].replace(',', '.')));

        re = /cotes? pour que le total de buts en première mi-temps soit (supérieur|inférieur) à ([\d.,]+) (?:est|sont) de ([\d.,]+)/gi;
        while ((m = re.exec(texte))) {
            const dir = m[1].toLowerCase() === 'supérieur' ? 'over' : 'under';
            siVide(`${dir}${m[2].replace(',', '.')}_1H`, parseFloat(m[3].replace(',', '.')));
        }
        re = /cotes? pour que le total de buts du match soit (supérieur|inférieur) à ([\d.,]+) (?:est|sont) de ([\d.,]+)/gi;
        while ((m = re.exec(texte))) {
            const dir = m[1].toLowerCase() === 'supérieur' ? 'over' : 'under';
            siVide(`${dir}${m[2].replace(',', '.')}_FT`, parseFloat(m[3].replace(',', '.')));
        }
        m = texte.match(/cotes? pour que les deux équipes marquent (?:est|sont) de ([\d.,]+)/i);
        if (m) siVide('btts_yes', parseFloat(m[1].replace(',', '.')));
        m = texte.match(/cotes? pour qu['’]au moins une équipe ne marque pas (?:est|sont) de ([\d.,]+)/i);
        if (m) siVide('btts_no', parseFloat(m[1].replace(',', '.')));

        return cotes;
    }

    const MARQUEURS_INSTRUCTION = [
        'act as a', 'analyze this football match', 'be practical', 'focus on value',
        'never overstate', 'first, search the web', 'you must actively search',
        'for fresh external factors, focus only', 'do not infer', 'do not use rankings',
        'do not invent context', 'if an important external factor', 'mention the source type',
        'separate clearly', 'when a super stat is mentioned', 'then combine those fresh',
        'explain the strongest combined', 'clearly separate', 'the final answer must be written',
        'keep the analysis detailed', 'if recent external factors and datafoot',
        'do not use rankings, historical averages',
        'agis comme un', 'analyse ce match de football', 'sois pratique', 'concentre-toi sur la valeur',
        'ne surestime jamais', 'cherche d\u2019abord sur le web', 'tu dois activement rechercher',
        'mentionne le type de source', 's\u00e9pare clairement', 'la r\u00e9ponse finale doit \u00eatre r\u00e9dig\u00e9e',
    ];

    function estUneInstruction(phrase) {
        const p = phrase.toLowerCase();
        return MARQUEURS_INSTRUCTION.some(marqueur => p.includes(marqueur));
    }

    function extraireFacteursExternes(texte) {
        const mots = [
            'forfait', 'blessure', 'blessé', 'incertain', 'entraîneur', 'entraineur',
            'conférence', 'absent', 'suspendu', 'suspension', 'infirmerie',
            'injury', 'injured', 'doubtful', 'uncertain', 'unavailable', 'sidelined',
            'suspended', 'suspension', 'coach', 'press conference', 'absent', 'ruled out',
        ];
        const sentences = texte.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
        return sentences.filter(s => !estUneInstruction(s) && mots.some(mot => s.toLowerCase().includes(mot)));
    }

    function genererCandidats(home, away, resHome, resAway, butsHome, butsAway, bttsHome, bttsAway, cotes) {
        const candidats = [];

        function ajouter(label, pctA, pctB, cote, detail) {
            if (pctA == null && pctB == null) return;
            if (cote == null) return;
            let score, spread, nbSources;
            if (pctA != null && pctB != null) {
                score = (pctA + pctB) / 2;
                spread = Math.abs(pctA - pctB);
                nbSources = 2;
            } else {
                score = pctA != null ? pctA : pctB;
                spread = null;
                nbSources = 1;
            }
            const finalScore = nbSources === 2 ? (score - spread * 0.5) : (score - 15);
            candidats.push({ label, score, spread, nbSources, cote, detail, finalScore, conflit: nbSources === 2 && spread >= 60 });
        }

        ajouter(`${home} gagne la 1ère mi-temps`, resHome.home.win, resAway.away.loss, cotes.home_win_1H,
            `${home} (domicile) gagne sa 1ère MT ${fmt(resHome.home.win)} du temps · ${away} (extérieur) perd sa 1ère MT ${fmt(resAway.away.loss)} du temps`);
        ajouter(`Match nul à la mi-temps`, resHome.home.draw, resAway.away.draw, cotes.draw_1H,
            `${home} (domicile) nul en 1ère MT ${fmt(resHome.home.draw)} du temps · ${away} (extérieur) nul en 1ère MT ${fmt(resAway.away.draw)} du temps`);
        ajouter(`${away} gagne la 1ère mi-temps`, resHome.home.loss, resAway.away.win, cotes.away_win_1H,
            `${home} (domicile) perd sa 1ère MT ${fmt(resHome.home.loss)} du temps · ${away} (extérieur) gagne sa 1ère MT ${fmt(resAway.away.win)} du temps`);

        ajouter(`${home} gagne le match`, resHome.homeFT.win, resAway.awayFT.loss, cotes.home_win_FT,
            `${home} (domicile) gagne ${fmt(resHome.homeFT.win)} du temps · ${away} (extérieur) perd ${fmt(resAway.awayFT.loss)} du temps`);
        ajouter(`Match nul au score final`, resHome.homeFT.draw, resAway.awayFT.draw, cotes.draw_FT,
            `${home} (domicile) nul ${fmt(resHome.homeFT.draw)} du temps · ${away} (extérieur) nul ${fmt(resAway.awayFT.draw)} du temps`);
        ajouter(`${away} gagne le match`, resHome.homeFT.loss, resAway.awayFT.win, cotes.away_win_FT,
            `${home} (domicile) perd ${fmt(resHome.homeFT.loss)} du temps · ${away} (extérieur) gagne ${fmt(resAway.awayFT.win)} du temps`);

        const seuils1H = new Set([...Object.keys(butsHome.home1H), ...Object.keys(butsAway.away1H)]);
        seuils1H.forEach(cle => {
            ajouter(`${directionLabel(cle)} en 1ère mi-temps`, butsHome.home1H[cle], butsAway.away1H[cle], cotes[`${cle}_1H`],
                `${home} (domicile) ${fmt(butsHome.home1H[cle])} · ${away} (extérieur) ${fmt(butsAway.away1H[cle])}`);
        });

        const seuilsFT = new Set([...Object.keys(butsHome.homeFT), ...Object.keys(butsAway.awayFT)]);
        seuilsFT.forEach(cle => {
            ajouter(`${directionLabel(cle)} sur le match complet`, butsHome.homeFT[cle], butsAway.awayFT[cle], cotes[`${cle}_FT`],
                `${home} (domicile) ${fmt(butsHome.homeFT[cle])} · ${away} (extérieur) ${fmt(butsAway.awayFT[cle])}`);
        });

        ajouter(`Les deux équipes marquent (BTTS oui)`, bttsHome.home.both, bttsAway.away.both, cotes.btts_yes,
            `${home} (domicile) BTTS ${fmt(bttsHome.home.both)} · ${away} (extérieur) BTTS ${fmt(bttsAway.away.both)}`);
        ajouter(`Au moins une équipe ne marque pas (BTTS non)`, bttsHome.home.fail, bttsAway.away.fail, cotes.btts_no,
            `${home} (domicile) ${fmt(bttsHome.home.fail)} · ${away} (extérieur) ${fmt(bttsAway.away.fail)}`);

        return candidats;
    }

    // Repli quand le texte ne contient QUE des cotes (aucun % par équipe) : on classe les options
    // d'après la probabilité implicite des cotes, marge du bookmaker retirée. Aucune "valeur"
    // n'est calculée (pas de statistiques) : c'est seulement un classement du plus probable
    // selon le marché, en ignorant les cotes trop basses pour être intéressantes (< 1,40).
    function genererCandidatsCotesSeules(home, away, cotes) {
        const defs = [];
        const add = (label, cle, groupe) => { if (cotes[cle] != null) defs.push({ label, cle, groupe }); };
        add(`${home} gagne la 1ère mi-temps`, 'home_win_1H', '1H');
        add('Match nul à la mi-temps', 'draw_1H', '1H');
        add(`${away} gagne la 1ère mi-temps`, 'away_win_1H', '1H');
        add(`${home} gagne le match`, 'home_win_FT', 'FT');
        add('Match nul au score final', 'draw_FT', 'FT');
        add(`${away} gagne le match`, 'away_win_FT', 'FT');
        Object.keys(cotes).forEach(cle => {
            const m = cle.match(/^(over|under)([\d.]+)_(1H|FT)$/);
            if (!m) return;
            const lib = directionLabel(m[1] + m[2]) + (m[3] === '1H' ? ' en 1ère mi-temps' : ' sur le match complet');
            add(lib, cle, 'OU_' + m[3] + '_' + m[2]);
        });
        add('Les deux équipes marquent (BTTS oui)', 'btts_yes', 'BTTS');
        add('Au moins une équipe ne marque pas (BTTS non)', 'btts_no', 'BTTS');

        const somme = {}, nb = {};
        defs.forEach(d => { somme[d.groupe] = (somme[d.groupe] || 0) + 1 / cotes[d.cle]; nb[d.groupe] = (nb[d.groupe] || 0) + 1; });
        const res = [];
        defs.forEach(d => {
            const cote = cotes[d.cle];
            // Groupe complet (1N2 : 3 issues, O/U et BTTS : 2 issues) -> marge retirée ; sinon cote brute.
            const complet = (d.groupe === '1H' || d.groupe === 'FT') ? nb[d.groupe] === 3 : nb[d.groupe] === 2;
            const proba = (complet ? (1 / cote) / somme[d.groupe] : 1 / cote) * 100;
            if (cote < 1.40) return;
            res.push({ label: d.label, score: proba, spread: null, nbSources: 1, cote, cotesSeules: true,
                finalScore: proba - 15, conflit: false,
                detail: `Probabilité implicite des cotes ≈ ${Math.round(proba)} % (marge du bookmaker retirée${complet ? '' : ' impossible : marché incomplet'}). Aucune statistique en % fournie dans le texte.` });
        });
        return res;
    }

    // Convertit une date extraite du texte (formats variés) vers le format YYYY-MM-DD attendu
    // par le tracker. Repli sur la date du jour si le format n'est pas reconnu.
    function normalizeDateAnalyseur(str) {
        if (!str) return jour();
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
        const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) {
            const [, d, mo, y] = m;
            return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return jour();
    }

    function genererRapportTexte(matchName, matchDate, facteursExternes, candidats, home, away, nomMatch, nomCompetition) {
        let lignes = [];
        lignes.push("=".repeat(60));
        lignes.push(`FICHE DE MATCH : ${matchName} (${matchDate})`);
        lignes.push("=".repeat(60));
        lignes.push("");
        lignes.push("1. FACTEURS EXTERNES & INFIRMERIE");
        lignes.push("-".repeat(40));
        if (facteursExternes.length) {
            facteursExternes.forEach(p => lignes.push(`  - ${p}`));
        } else {
            lignes.push("  Aucun facteur externe critique isolé.");
        }
        lignes.push("");
        lignes.push("2. PARIS CALCULÉS");
        lignes.push("-".repeat(40));
        if (!home || !away) {
            lignes.push("  Équipes non détectées (format non reconnu).");
        } else if (!candidats.length) {
            lignes.push("  Aucune donnée chiffrée exploitable.");
        } else {
            candidats.slice(0, 3).forEach((c, i) => {
                lignes.push(`  Option ${i + 1} : ${c.label} (cote ${fmtCote(c.cote)}) — fiabilité ${Math.round(c.finalScore)}/100`);
                lignes.push(`    ${c.detail}`);
            });
            lignes.push("");
            lignes.push("3. TABLEAU DES PARIS");
            lignes.push("-".repeat(40));
            lignes.push("Date | Match | Compétition | Marché | Pronostic | [Mise] | Cote");
            candidats.slice(0, 3).forEach(c => {
                const { marche, pronostic } = separerMarchePronostic(c.label, home, away);
                lignes.push(`${matchDate} | ${nomMatch} | ${nomCompetition} | ${marche} | ${pronostic} | 1 | ${fmtCote(coteAjustee(c.cote))} net`);
            });
        }
        lignes.push("");
        lignes.push("Calcul par règles mathématiques, pas une garantie de résultat. Paris = risque financier.");
        lignes.push(`Généré le ${new Date().toLocaleString('fr-FR')}`);
        return lignes.join("\n");
    }

  /* ---------- Analyseur : colle le texte d'analyse, enregistre les paris calculés ---------- */
  let anTexte = '', AN = null;
  /* --- Analyseur : types de pari exclus (mémorisés) + cases à cocher --- */
  const AN_EXK = 'pz_an_exclus', AN_TYPES = [['1N2', 'Résultat (1N2)'], ['Over/Under', 'Over/Under'], ['BTTS', 'BTTS'], ['MT-buts', 'Buts 1re MT'], ['MT-res', 'Résultat 1re MT'], ['P25', 'Plus de 2.5 buts']];
  let anEx; try { anEx = new Set(JSON.parse(lsGet(AN_EXK) || '[]')); } catch (e) { anEx = new Set(); }
  function anType(c, home, away) {
    const { marche, pronostic } = separerMarchePronostic(c.label, home, away), t = [];
    if (/^mi-temps$/i.test(marche)) t.push(/buts en 1ère MT/.test(pronostic) ? 'MT-buts' : 'MT-res');
    else if (/btts/i.test(marche)) t.push('BTTS'); else if (/over/i.test(marche)) t.push('Over/Under'); else if (/1n2/i.test(marche)) t.push('1N2');
    if (/^Plus de 2\.5 buts$/.test(pronostic)) t.push('P25');
    return { marche, pronostic, t };
  }
  function anLignes(candidats, home, away, comp) {
    return candidats.map(c => Object.assign({ c }, anType(c, home, away))).filter(x => !x.t.some(t => anEx.has(t))).slice(0, 3)
      .map(x => ({ c: x.c, marche: x.marche, prono: x.pronostic, comp, mise: '1', odds: coteAjustee(x.c.cote), saved: false, on: true }));
  }
  /* --- Suivi des propositions de l'Analyseur : celle choisie et les autres (sans mise, hors bilan) --- */
  const AN_SUIVI = 'pz_an_suivi';
  const suiviLire = () => { try { const v = JSON.parse(lsGet(AN_SUIVI) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const suiviEcrire = L => { try { localStorage.setItem(AN_SUIVI, JSON.stringify(L.slice(-600))); } catch (e) {} };
  // mémorise l'analyse au moment où tu choisis (ou mets à jour si tu en choisis un autre ensuite)
  function suiviNoter(choisis) {
    if (!AN || !AN.rows.length) return;
    const L = suiviLire(); let rec = AN.suiviId && L.find(x => x.id === AN.suiviId);
    if (!rec) { rec = { id: AN.suiviId = Date.now(), date: AN.date, match: AN.nomMatch, comp: AN.competition || '', options: AN.rows.map((r, i) => ({ rang: i + 1, market: r.marche, prono: r.prono, odds: +r.odds || 1, fiab: Math.round(r.c.finalScore || 0), choisi: false, betId: null, status: 'Pending' })) }; L.push(rec); }
    choisis.forEach(({ i, id }) => { const o = rec.options[i]; if (o) { o.choisi = true; o.betId = id; o.prono = AN.rows[i].prono; o.market = AN.rows[i].marche; o.odds = +AN.rows[i].odds || o.odds; } });
    suiviEcrire(L);
  }
  // règle les propositions : celle jouée suit ton pari, les autres d'après le score final
  function suiviMaj() {
    const L = suiviLire(); if (!L.length) return L;
    const S = lireN(), parId = new Map((S.football || []).map(b => [String(b.id), b])); let chg = false;
    L.forEach(rec => rec.options.forEach(o => {
      if (o.choisi && o.betId != null) { const b = parId.get(String(o.betId)); if (b && (b.status === 'Won' || b.status === 'Lost')) { if (b.status !== o.status) { o.status = b.status; chg = true; } return; } }   // ton pari réglé fait foi ; sinon on lit le score comme pour les autres
      if (o.status !== 'Pending' || o.manuel) return;
      const b = { match: rec.match, date: rec.date, prono: o.prono, market: o.market, status: 'Pending' }, m = trouverM(b); if (!m) return;
      const e = etatM(b, m), fini = m.done || m.st === 'post';
      if ((e === 'won' && (fini || estMT(b))) || (e === 'lost' && fini)) { o.status = e === 'won' ? 'Won' : 'Lost'; chg = true; }
    }));
    if (chg) suiviEcrire(L);
    return L;
  }
  function vueSuiviAnalyseur() {
    const L = suiviMaj().slice().reverse();
    if (!L.length) return '<div class="card"><h2>🔍 Mes choix dans l\'Analyseur</h2><p class="mut">Rien encore : à chaque « Choisir ce pari », Statify garde aussi les autres propositions pour comparer. Les statistiques apparaîtront ici dès les premiers matchs terminés.</p></div>';
    const agr = arr => { const r = arr.filter(o => o.status === 'Won' || o.status === 'Lost'), w = r.filter(o => o.status === 'Won').length, p = r.reduce((s, o) => s + (o.status === 'Won' ? o.odds - 1 : -1), 0); return { n: arr.length, r: r.length, w, p, att: arr.length - r.length }; };
    const ligne = (nom, a) => `<tr><td class="l"><b>${nom}</b></td><td>${a.r}${a.att ? ` <small class="mut">(+${a.att} en attente)</small>` : ''}</td><td>${a.r ? Math.round(100 * a.w / a.r) + ' %' : '–'}</td><td class="${stCls(a.p)}">${a.r ? eur(a.p) : '–'}</td><td class="${stCls(a.p)}">${a.r ? (a.p >= 0 ? '+' : '−') + Math.abs(100 * a.p / a.r).toFixed(1).replace('.', ',') + ' %' : '–'}</td></tr>`;
    const tout = L.flatMap(r => r.options), ch = tout.filter(o => o.choisi), nc = tout.filter(o => !o.choisi);
    const H = ['', 'Réglés', 'Réussite', 'Bilan à 1 €', 'ROI'];
    // tes choix face aux autres options d'une même analyse
    let bien = 0, mal = 0, egal = 0;
    L.forEach(rec => { const c = rec.options.filter(o => o.choisi && (o.status === 'Won' || o.status === 'Lost')), a = rec.options.filter(o => !o.choisi && (o.status === 'Won' || o.status === 'Lost')); if (!c.length || !a.length) return; const cw = c.some(o => o.status === 'Won'), aw = a.some(o => o.status === 'Won'); if (cw && !a.every(o => o.status === 'Won')) bien++; else if (!cw && aw) mal++; else egal++; });
    const mks = {}; tout.forEach(o => { (mks[o.market || 'Autre'] ||= { c: [], n: [] })[o.choisi ? 'c' : 'n'].push(o); });
    const ic = o => o.status === 'Won' ? '✅' : o.status === 'Lost' ? '❌' : '⏳';
    const recents = L.slice(0, 20).map(rec => `<tr><td class="l"><b>${esc(String(rec.match).replace(/\s+vs\s+/i, ' – '))}</b><small class="mut" style="display:block">${stFdf(rec.date)}</small></td>${rec.options.map(o => `<td class="l${o.choisi ? ' pz-chx' : ''}">${ic(o)} ${o.choisi ? '<b>' : ''}${esc(o.prono)}${o.choisi ? '</b>' : ''} <small class="mut">${cote(o.odds)}</small>${!o.choisi && o.status === 'Pending' && rec.date < jour() ? ` <span class="pz-i" role="button" data-pz="suivw" data-k="${rec.id}|${o.rang}" title="Marquer gagné">✓</span><span class="pz-i" role="button" data-pz="suivl" data-k="${rec.id}|${o.rang}" title="Marquer perdu">✗</span>` : ''}</td>`).join('')}</tr>`).join('');
    return `<div class="card"><h2>🔍 Mes choix dans l'Analyseur</h2><p class="mut pz-hint">Les propositions que tu n'as pas jouées sont suivies sans mise : elles ne comptent pas dans ton bilan.</p>
      <div class="pz-bil pz-big pz-six">${tuile('Analyses suivies', L.length)}${tuile('Bien choisi', bien, 'pz-pos')}${tuile('Mal choisi', mal, mal ? 'pz-neg' : '')}${tuile('Sans différence', egal)}</div>
      <p class="mut pz-hint" style="margin-top:6px">« Mal choisi » : ton pari a perdu alors qu'une autre proposition a gagné. « Bien choisi » : le tien a gagné et au moins une autre a perdu.</p>
      <div class="pz-grid pz-2"><div><h3 class="pz-h3">Joués ou pas</h3>${stTab(H, [ligne('Mes choix', agr(ch)), ligne('Les autres propositions', agr(nc))])}</div>
      <div><h3 class="pz-h3">Selon le rang proposé</h3>${stTab(H, [1, 2, 3].map(k => ligne('Option ' + k, agr(tout.filter(o => o.rang === k)))))}</div></div>
      <h3 class="pz-h3">Par type de pari</h3>${stTab(['Type', 'Mes choix · réussite', 'Mes choix · ROI', 'Les autres · réussite', 'Les autres · ROI'], Object.keys(mks).sort().map(k => { const a = agr(mks[k].c), b = agr(mks[k].n), pc = x => x.r ? Math.round(100 * x.w / x.r) + ' % (' + x.r + ')' : '–', roi = x => x.r ? `<span class="${stCls(x.p)}">${(x.p >= 0 ? '+' : '−') + Math.abs(100 * x.p / x.r).toFixed(1).replace('.', ',')} %</span>` : '–'; return `<tr><td class="l"><b>${esc(k)}</b></td><td>${pc(a)}</td><td>${roi(a)}</td><td>${pc(b)}</td><td>${roi(b)}</td></tr>`; }))}
      <h3 class="pz-h3">Dernières analyses <span class="mut pz-hint">· en gras ton choix</span></h3>${stTab(['Match', 'Option 1', 'Option 2', 'Option 3'], [recents])}</div>`;
  }

  function anSaveCoches(seul) {
    if (!AN) return false; const L = (lire().football || []), cle = x => norm(x.match) + '|' + norm(x.prono) + '|' + norm(x.market);
    const pris = AN.rows.map((r, i) => ({ r, i })).filter(o => seul != null ? o.i === seul : (o.r.on && !o.r.saved)); if (!pris.length) { toast('Coche au moins un pari.'); return false; }
    let dbl = 0; const bets = [];
    pris.forEach(({ r, i }) => { const mise = parseFloat(String(r.mise).replace(',', '.')), b = { id: Date.now() + i, date: AN.date, type: 'Single', match: AN.nomMatch, comp: (r.comp || '').trim(), market: r.marche, prono: r.prono, odds: isNaN(r.odds) ? 1 : r.odds, stake: mise > 0 ? mise : 1, status: 'Pending' };
      if (L.some(x => x.date === b.date && cle(x) === cle(b))) { dbl++; return; } b._i = i; bets.push(b); r.saved = true; });
    if (!bets.length) { toast(seul != null ? 'Ce pari existe déjà dans Mes paris.' : 'Ces paris existent déjà dans Mes paris.'); return false; }
    anTexte = '';
    try { suiviNoter(bets.map(b => ({ i: b._i, id: b.id }))); } catch (e) {}
    bets.forEach(b => delete b._i);
    muter(S => { bets.slice().reverse().forEach(b => S.football.unshift(b)); }, (seul != null ? 'Pari enregistré : ' + bets[0].prono + ' · ' + cote(bets[0].odds) : bets.length + ' pari(s) enregistré(s)') + (dbl ? ' · ' + dbl + ' doublon(s) ignoré(s)' : ''));
    return true;
  }
  function analyser(raw) {
    let matchName = 'Match de Football'; const mm = raw.match(/Match\s*:\s*([^.]+)\./i); if (mm) matchName = mm[1].trim();
    let matchDate = ''; const md = raw.match(/Date\s*:\s*([0-9\-\/]+)/i); if (md) matchDate = md[1].trim();
    const { home, away } = extraireEquipes(raw), facteurs = extraireFacteursExternes(raw), competition = extraireCompetition(raw, home, away);
    let candidats = [];
    if (home && away) {
      const rH = parseResultatsEquipe(raw, home), rA = parseResultatsEquipe(raw, away), bH = parseButsEquipe(raw, home), bA = parseButsEquipe(raw, away), tH = parseBTTSEquipe(raw, home), tA = parseBTTSEquipe(raw, away), co = parseCotes(raw, home, away);
      candidats = genererCandidats(home, away, rH, rA, bH, bA, tH, tA, co);
      if (!candidats.length) candidats = genererCandidatsCotesSeules(home, away, co);
      candidats.sort((a, b) => (b.finalScore - a.finalScore) || (b.cote - a.cote));
    }
    const nomMatch = (home && away) ? `${home} vs ${away}` : matchName;
    const sm = (home && away) ? matchs().filter(m => pareil(home, m.hn) && pareil(away, m.an)).sort((x, y) => Math.abs(Date.parse(x.d) - Date.now()) - Math.abs(Date.parse(y.d) - Date.now()))[0] : null;
    const date = matchDate ? normalizeDateAnalyseur(matchDate) : (sm ? jourDe(sm.d) : jour());
    const comp = competition || (sm ? FLGN[sm.lg] || '' : '');
    const rows = anLignes(candidats, home, away, comp);
    return { matchName, matchDate: matchDate || date, date, nomMatch, home, away, facteurs, competition: comp, candidats, rows, sm, rapport: genererRapportTexte(matchName, matchDate || date, facteurs, candidats, home, away, nomMatch, comp) };
  }
  function vueAnalyse() {
    const L = (lire().football || []), comps = [...new Set(L.map(x => (x.comp || '').trim()).filter(Boolean).concat(Object.values(FLGN)))];
    let res = '';
    if (AN) {
      const r = AN;
      const fx = r.facteurs.length ? `<ul class="pz-ul">${r.facteurs.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p class="mut">Aucun facteur externe critique isolé dans le texte fourni.</p>';
      let corps = '';
      if (!r.home || !r.away) corps = '<p class="mut">Impossible de calculer des paris : je n\'ai pas trouvé les noms des deux équipes (« The home team is… » / « L\'équipe à domicile est… »). Ce moteur fonctionne avec des textes structurés type Datafoot (cotes + statistiques en %), en français ou en anglais.</p>';
      else if (!r.candidats.length) corps = `<p class="mut">Aucune cote ou statistique chiffrée exploitable trouvée pour ${esc(r.home)} / ${esc(r.away)}.</p>`;
      else {
        const filt = r.candidats.filter(c => !anType(c, r.home, r.away).t.some(t => anEx.has(t))), opts = filt.slice(0, 3).map((c, i) => `<div class="pz-combo${c.conflit ? ' pz-conf' : ''}"><div class="pz-ch"><b>Option ${i + 1} · ${esc(c.label)}</b><span class="pz-st pz-live">cote ${fmtCote(c.cote)}</span></div><small class="mut">Fiabilité calculée : ${Math.round(c.finalScore)}/100${c.cotesSeules ? ' · d\'après les cotes seules, à confirmer' : c.nbSources === 1 ? ' · une seule source de données, à confirmer' : ''}${c.conflit ? ' · ⚠️ signaux domicile/extérieur contradictoires' : ''}</small><p class="pz-det">${esc(c.detail)}</p></div>`).join('');
        const mk = marches();
        const rows = r.rows.map((x, i) => { const lm = mk.includes(x.marche) ? mk : [...mk, x.marche]; return `<div class="pz-combo pz-anr${x.on ? '' : ' pz-off'}"><label class="pz-ck pz-anck"><input type="checkbox" data-pz="anon" data-i="${i}"${x.on ? ' checked' : ''}${x.saved ? ' disabled' : ''}><b>${esc(x.prono)}</b><span class="mut">· ${fmtCote(x.odds)}</span></label><div class="pz-fg">
          <label class="pz-f"><span>Championnat</span><input id="pz-an-c-${i}" list="pz-an-lc" value="${esc(x.comp)}" autocomplete="off"></label>
          <label class="pz-f"><span>Marché</span><select id="pz-an-k-${i}">${lm.map(m => `<option${m === x.marche ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
          <label class="pz-f w"><span>Pronostic</span><input id="pz-an-p-${i}" value="${esc(x.prono)}" autocomplete="off"></label>
          <label class="pz-f"><span>Mise (€)</span><input id="pz-an-s-${i}" inputmode="decimal" value="${esc(x.mise)}"></label>
          <div class="pz-f"><span>Cote <small class="mut" style="text-transform:none;letter-spacing:0">(${fmtCote(x.c.cote)} − ${String(REDUCTION_COTE_PCT).replace('.', ',')} %)</small></span><b class="pz-cote">${fmtCote(x.odds)}</b></div></div>
          <div class="pz-fa">${x.saved ? '<span class="pz-st pz-won">✓ Enregistré dans Mes paris</span>' : `<button class="pz-take" data-pz="antake" data-i="${i}">✓ Choisir ce pari</button>`}</div></div>`; }).join('');
        const filtres = `<div class="row pz-chips pz-anfx"><span class="mut">Ne pas proposer :</span>${AN_TYPES.map(([k, l]) => `<button class="${anEx.has(k) ? 'pz-exon' : 'sec'} pz-ib" data-pz="anex" data-k="${k}">${anEx.has(k) ? '🚫 ' : ''}${l}</button>`).join('')}</div>`;
        corps = `<h3 class="pz-h3">Paris calculés à partir des cotes et statistiques</h3>${filtres}${opts ? `<div class="pz-grid">${opts}</div>` : '<p class="mut">Aucun pari proposé avec ces filtres : retire une exclusion.</p>'}
          ${rows ? `<h3 class="pz-h3">Enregistrer dans Mes paris · ${esc(r.nomMatch)} · ${esc(r.date)} <span class="mut pz-hint">· coche ceux à garder</span></h3><div class="pz-grid">${rows}</div>` : ''}<datalist id="pz-an-lc">${comps.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          <div class="pz-fa"><button class="sec" data-pz="ancopy">Copier les lignes</button><button class="sec" data-pz="anexport">Exporter en .txt</button><span style="flex:1"></span><button data-pz="ansavesel"${r.rows.some(x => x.on && !x.saved) ? '' : ' disabled'}>💾 Enregistrer les paris cochés (${r.rows.filter(x => x.on && !x.saved).length})</button></div>`;
      }
      res = `<div class="card pz-anres"><h2>Fiche de match : ${esc(r.matchName)} <span class="pz-st pz-pre">${esc(r.matchDate)}</span>${r.sm ? '<span class="pz-st pz-won">suivi par Statify</span>' : ''}</h2>
        <h3 class="pz-h3">Facteurs externes &amp; infirmerie</h3>${fx}${corps}
        <p class="mut pz-avert">Suggestions calculées par des règles mathématiques simples (moyenne et cohérence des % domicile/extérieur des deux équipes, croisés avec les cotes fournies) : ce n'est pas de l'intelligence artificielle. Les pourcentages reposent souvent sur très peu de matchs : un 100 % peut venir d'un seul match. Les paris comportent un risque financier.</p></div>`;
    }
    return `<div class="card pz-an"><h2>🔍 Analyseur de paris</h2><p class="mut" style="margin:0 0 8px">Colle le texte d'analyse (français ou anglais, avec cotes et % par équipe). Le moteur en tire 3 paris que tu enregistres en un clic.</p>
      <textarea id="pz-an-t" placeholder="Colle ton texte d'analyse complet ici…">${esc(anTexte)}</textarea>
      <div class="pz-fa"><button data-pz="anrun">Analyser et calculer les paris</button>${AN ? '<button class="sec" data-pz="anclear">Effacer</button>' : ''}</div></div>${res}`;
  }
  function anSave(i) {
    const r = AN && AN.rows[i]; if (!r) return;
    const mise = parseFloat(String(r.mise).replace(',', '.')), L = (lire().football || []), cle = x => norm(x.match) + '|' + norm(x.prono) + '|' + norm(x.market);
    const bet = { id: Date.now() + i, date: AN.date, type: 'Single', match: AN.nomMatch, comp: (r.comp || '').trim(), market: r.marche, prono: r.prono, odds: isNaN(r.odds) ? 1 : r.odds, stake: mise > 0 ? mise : 1, status: 'Pending' };
    const dup = L.find(x => x.date === bet.date && cle(x) === cle(bet));
    if (dup && !confirm('⚠️ Ce pari existe déjà :\n' + dup.match + ' · ' + dup.prono + ' · cote ' + dup.odds + '\n\nL\'ajouter quand même ?')) return;
    r.saved = true; anTexte = '';
    muter(S => { S.football.unshift(bet); }, 'Pari enregistré : ' + bet.prono + ' · ' + cote(bet.odds));
  }
  function anCopier() {
    if (!AN || !AN.rows.length) return;
    const t = ['Date | Match | Compétition | Marché | Pronostic | Mise | Cote'].concat(AN.rows.map(x => [AN.date, AN.nomMatch, x.comp, x.marche, x.prono, x.mise, fmtCote(x.odds)].join(' | '))).join('\n');
    const ok = () => toast('Lignes copiées dans le presse-papiers');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok).catch(() => toast('Copie impossible : sélectionne le texte à la main.')); else toast('Copie impossible sur ce navigateur.');
  }
  function anExport() {
    if (!AN) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([AN.rapport], { type: 'text/plain;charset=utf-8' })); a.download = 'rapport_match.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- Vue « Mes paris » (à la place de PronoTracker) ---------- */
  let filtre = 'cours';
  // Pages de l'ancien PronoTracker encore accessibles (matchs ATP / cotes, ancienne synchro)
  const FRAMES = { atp: ['🎾 ATP & cotes', 'prono.html?embed=1&sport=tennis'], sync: ['☁️ Synchro PronoTracker', 'prono.html?embed=1&page=reglages'] };
  const TABS = [['cours', 'En cours'], ['hist', 'Historique'], ['analyse', '🔍 Analyseur'], ['combos', '🔀 Combinés'], ['stats', '📊 Stats'], ['reglages', '⚙️ Réglages']];
  const ongletsHtml = D => { const act = filtre === 'atp' ? 'tennis' : filtre === 'sync' ? 'reglages' : filtre; return TABS.filter(([k]) => !(k === 'analyse' && window.innerWidth >= 1100)).map(([k, l]) => `<button class="${act === k ? '' : 'sec'}" data-pz="f" data-k="${k}">${l}${k === 'cours' && D ? ' · ' + D.nbAttente : ''}</button>`).join(''); };
  // raison pour laquelle les paris cochés ne peuvent pas faire un combiné ('' si c'est possible)
  function pourquoiPasManuel(legs) {
    if (legs.length < 2) return 'Coche au moins 2 paris simples pour faire un combiné.';
    const ks = legs.map(l => norm(l.b.match)); const i = ks.findIndex((k, n) => k && ks.indexOf(k) !== n);
    if (i >= 0) return 'Deux sélections portent sur le même match (' + legs[i].b.match + ') : décoche-en une.';
    return '';
  }
  function barreCombine(D) {
    sel = new Set([...sel].filter(i => D.ouvertsS.some(s => String(s.b.id) === i)));
    if (!sel.size) return '';
    const legs = [...sel].map(i => D.ouvertsS.find(s => String(s.b.id) === i)), odds = legs.reduce((p, l) => p * (+l.b.odds || 1), 1);
    if (miseCombo == null) { const dern = ((D.S.combos || {})[SP()] || []).slice(-1)[0]; miseCombo = dern ? +dern.stake : 1; }
    return `<div class="pz-bar"><b>${legs.length} sélection${legs.length > 1 ? 's' : ''} · cote ${cote(odds)}</b><label>Mise <input id="pz-ms" type="number" step="0.5" min="0.1" inputmode="decimal" value="${esc(miseCombo)}"> €</label><span class="mut" id="pz-gain" data-odds="${odds}">gain possible ${eur(miseCombo * odds).replace('+', '')}</span>${pourquoiPasManuel(legs) ? `<span class="pz-why">⚠️ ${esc(pourquoiPasManuel(legs))}</span>` : ''}<span style="flex:1"></span><button class="sec" data-pz="selclear">Vider</button><button data-pz="mkcombo">Créer le combiné</button></div>`;
  }
  function carteSolo(s) {
    const pend = s.b.status === 'Pending' || !s.b.status;
    return `<div class="pz-combo pz-scard"><div class="pz-ch">${pend ? `<label class="pz-ck" title="Cocher pour faire un combiné"><input type="checkbox" data-pz="sel" data-id="${esc(s.b.id)}"${sel.has(String(s.b.id)) ? ' checked' : ''}><b>Solo · ${cote(s.b.odds)}</b></label>` : `<b>Solo · ${cote(s.b.odds)}</b>`}<small class="mut">mise ${stF2(+s.b.stake || 0)} €</small>${s.e !== 'nf' ? pastille(s.e, s.m) : ''}<span class="pz-i pz-del" role="button" tabindex="0" data-pz="del" data-id="${esc(s.b.id)}" title="Supprimer ce pari">🗑</span></div>${jambe(s, true)}</div>`;
  }

  const JOURF = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  const cleJour = ms => new Date(ms).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  function libJour(ms) {
    const k = cleJour(ms), a = cleJour(Date.now()), dem = cleJour(Date.now() + 864e5), hier = cleJour(Date.now() - 864e5);
    const t = JOURF.format(ms), T = t.charAt(0).toUpperCase() + t.slice(1);
    return k === a ? "Aujourd'hui · " + T : k === dem ? 'Demain · ' + T : k === hier ? 'Hier · ' + T : T;
  }
  const msLeg = l => { const t = Date.parse(l.m ? l.m.d : ''); return t || Date.parse((l.b.date || '') + 'T12:00:00') || 0; };
  const msCombo = x => Math.min(...x.legs.map(msLeg).filter(Boolean).concat([Infinity]));
  const msSolo = s => msLeg(s);
  // regroupe par jour de match (ordre croissant, ou décroissant pour l'historique)
  function parJour(arr, ms, rend, desc) {
    const L = arr.map(x => ({ x, t: ms(x) })).sort((a, b) => desc ? b.t - a.t : a.t - b.t);
    return `<div class="pz-grid pz-days">${L.map(o => { const j = isFinite(o.t) && o.t ? libJour(o.t) : 'Date inconnue', tm = isFinite(o.t) && o.t ? new Date(o.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : ''; return rend(o.x).replace('<div class="pz-ch">', `<div class="pz-dtag">${esc(j.replace(/^(Aujourd'hui|Demain|Hier) · .*/, '$1'))}${tm && tm !== '12:00' ? ' · ' + tm : ''}</div><div class="pz-ch">`); }).join('')}</div>`;
  }


  function corpsCours(D) {
    const auj = jour(), vieuxC = x => x.legs.every(l => (l.b.date || '') < auj), vieuxS = x => (x.b.date || '') < auj;
    const oldC = D.ouvertsC.filter(vieuxC), oldS = D.ouvertsS.filter(vieuxS), nOld = oldC.length + oldS.length;
    const enCours = D.ouvertsC.filter(x => !vieuxC(x)), live = enCours.filter(x => x.legs.some(l => l.m && l.m.st === 'in')), avenir = enCours.filter(x => !live.includes(x)), solos = D.ouvertsS.filter(x => !vieuxS(x));
    const grille = (arr, fn) => `<div class="pz-grid">${arr.map(fn).join('')}</div>`;
    const vieux = nOld ? `<button class="pz-fold" data-pz="menu" data-k="old"><span>⏰ Matchs passés à régler · ${nOld}</span><span>${ouvert('old') ? '▴ Masquer' : '▾ Afficher'}</span></button>${ouvert('old') ? (oldC.length ? parJour(oldC, msCombo, x => carteCombo(x, true), true) : '') + (oldS.length ? parJour(oldS, msSolo, carteSolo, true) : '') : ''}` : '';
    const direct = live.length ? `<h3 class="pz-h3 pz-sec">🔴 En direct</h3>${grille(live.slice().sort((a, b) => msCombo(a) - msCombo(b)), x => carteCombo(x, true))}` : '';
    const venir = avenir.length ? `<h3 class="pz-h3 pz-sec">⏳ Combinés à venir</h3>${parJour(avenir, msCombo, x => carteCombo(x, true), false)}` : '';
    const simp = solos.length ? `<h3 class="pz-h3 pz-sec">📌 Paris simples <span class="mut pz-hint">· coche-en plusieurs pour faire un combiné</span></h3>${parJour(solos, msSolo, carteSolo, false)}` : '';
    return (vieux + direct + venir + simp) || '<p class="mut">Aucun pari en cours. Ajoute-en un avec « ＋ Nouveau pari ».</p>';
  }

  /* --- Historique complet (comme PronoTracker) : recherche, filtres, tri, numéros, dupliquer, charger plus --- */
  const H = { q: '', st: 'ALL', ty: 'ALL', per: 'ALL', from: '', to: '', comp: 'ALL', f: 'date', dir: 'desc', n: 25 };
  const H_TRIS = [['date', 'Date'], ['num', 'N°'], ['match', 'Match'], ['prono', 'Pronostic'], ['odds', 'Cote'], ['stake', 'Mise'], ['status', 'Statut']];
  function numeros(L) { const m = {}; let k = 1; [...L].reverse().forEach(b => { if (b.status === 'Won' || b.status === 'Lost') m[b.id] = k++; }); return m; }
  function histoFiltre(L, nums, sans) {
    const q = H.q.toLowerCase().trim(), qn = /^#?\d+$/.test(q) ? parseInt(q.replace('#', ''), 10) : null;
    const auj = jour(), dm = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(), mois = auj.slice(0, 7);
    return L.filter(b => {
      if (q && (qn != null ? nums[b.id] !== qn : !((b.match || '').toLowerCase().includes(q) || (b.prono || '').toLowerCase().includes(q) || (b.comp || '').toLowerCase().includes(q)))) return false;
      if (sans !== 'st') { if (H.st === 'Pending' && b.status !== 'Pending') return false; if (H.st === 'Settled' && b.status === 'Pending') return false; if (H.st === 'Won' && b.status !== 'Won') return false; if (H.st === 'Lost' && b.status !== 'Lost') return false; }
      if (sans !== 'ty') { if (H.ty === 'SOLO' && b.comboId) return false; if (H.ty === 'COMBO' && !b.comboId) return false; }
      const d = b.date || '';
      if (H.per === 'TODAY' && d !== auj) return false; if (H.per === 'TOMORROW' && d !== dm) return false; if (H.per === 'THIS_MONTH' && !d.startsWith(mois)) return false;
      if (H.per === 'THIS_WEEK' && Math.ceil(Math.abs(Date.now() - new Date(d)) / 864e5) > 7) return false;
      if (H.per === 'CUSTOM' && ((H.from && d < H.from) || (H.to && d > H.to))) return false;
      if (H.comp !== 'ALL' && (b.comp || '').trim() !== H.comp) return false;
      return true;
    });
  }
  function corpsHist(D) {
    const L = (D.S[SP()] || []).slice(), nums = numeros(L), info = new Map();
    D.solos.forEach(s => info.set(String(s.b.id), s)); D.C.forEach(x => x.legs.forEach(l => info.set(String(l.b.id), l)));
    const base = histoFiltre(L, nums, 'st'), bt = histoFiltre(L, nums, 'ty');
    const cS = { ALL: base.length, Pending: base.filter(b => b.status === 'Pending').length, Settled: base.filter(b => b.status !== 'Pending').length, Won: base.filter(b => b.status === 'Won').length, Lost: base.filter(b => b.status === 'Lost').length };
    const cT = { ALL: bt.length, SOLO: bt.filter(b => !b.comboId).length, COMBO: bt.filter(b => b.comboId).length };
    let F = histoFiltre(L, nums);
    const sg = H.dir === 'asc' ? 1 : -1, nm = s => String(s || '').toLowerCase().replace(/vs|-|_/g, ' ').replace(/\s+/g, ' ').trim();
    F.sort((a, b) => {
      if (H.f === 'date') { const x = (a.date || '').localeCompare(b.date || ''); return x ? sg * x : nm(a.match).localeCompare(nm(b.match)); }
      if (H.f === 'num') { const x = nums[a.id], y = nums[b.id]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return sg * (x - y); }
      if (H.f === 'odds' || H.f === 'stake') return sg * ((+a[H.f] || 0) - (+b[H.f] || 0));
      if (H.f === 'status') return sg * String(a.status).localeCompare(String(b.status));
      return sg * nm(a[H.f]).localeCompare(nm(b[H.f]));
    });
    const tot = F.length; F = F.slice(0, H.n);
    const comps = [...new Set(L.map(b => (b.comp || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const chip = (cur, k, l, n, act) => `<button class="${cur === k ? '' : 'sec'} pz-ib" data-pz="${act}" data-k="${k}">${l} <span class="pz-cnt">${n}</span></button>`;
    const nf = (H.q ? 1 : 0) + (H.st !== 'ALL') + (H.ty !== 'ALL') + (H.per !== 'ALL') + (H.comp !== 'ALL');
    const barre = `<div class="card pz-hbar"><div class="row pz-chips">${chip(H.st, 'ALL', 'Tous', cS.ALL, 'hst')}${chip(H.st, 'Pending', 'En cours', cS.Pending, 'hst')}${chip(H.st, 'Settled', 'Terminés', cS.Settled, 'hst')}${chip(H.st, 'Won', '✓ Gagnés', cS.Won, 'hst')}${chip(H.st, 'Lost', '✗ Perdus', cS.Lost, 'hst')}<span class="pz-sepv"></span>${chip(H.ty, 'ALL', 'Tous', cT.ALL, 'hty')}${chip(H.ty, 'SOLO', 'Solo', cT.SOLO, 'hty')}${chip(H.ty, 'COMBO', 'Combinés', cT.COMBO, 'hty')}</div>
      <div class="pz-fa pz-hf"><input id="pz-hq" class="pz-search" type="search" placeholder="Rechercher un match, un pronostic, un championnat ou #12…" value="${esc(H.q)}" autocomplete="off"><button class="sec pz-ib pz-hftog" data-pz="menu" data-k="hf">Filtres${((H.per !== 'ALL') + (H.comp !== 'ALL') + (H.f !== 'date' || H.dir !== 'desc')) ? ' · ' + ((H.per !== 'ALL') + (H.comp !== 'ALL') + (H.f !== 'date' || H.dir !== 'desc')) : ''} ${ouvert('hf') ? '▴' : '▾'}</button><div class="pz-hfx${ouvert('hf') ? ' open' : ''}">
      <select id="pz-hper" class="pz-sel">${[['ALL', 'Toutes les dates'], ['TODAY', 'Aujourd\'hui'], ['TOMORROW', 'Demain'], ['THIS_WEEK', 'Cette semaine'], ['THIS_MONTH', 'Ce mois-ci'], ['CUSTOM', 'Plage personnalisée…']].map(([k, l]) => `<option value="${k}"${H.per === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      ${H.per === 'CUSTOM' ? `<input id="pz-hfrom" class="pz-sel" type="date" value="${esc(H.from)}"><input id="pz-hto" class="pz-sel" type="date" value="${esc(H.to)}">` : ''}
      <select id="pz-hcomp" class="pz-sel"><option value="ALL">Tous les championnats</option>${comps.map(c => `<option${H.comp === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="pz-hsort" class="pz-sel" title="Trier par">${H_TRIS.map(([k, l]) => `<option value="${k}"${H.f === k ? ' selected' : ''}>Tri : ${l}</option>`).join('')}</select><button class="sec pz-ib" data-pz="hdir" title="Inverser l'ordre">${H.dir === 'asc' ? '↑ Croissant' : '↓ Décroissant'}</button></div>${nf ? '<button class="sec pz-ib pz-hreset" data-pz="hreset">✕ Effacer</button>' : ''}</div></div>`;
    const ligne = b => {
      const l = info.get(String(b.id)) || { b, m: null, e: b.status === 'Won' ? 'won' : b.status === 'Lost' ? 'lost' : 'nf' }, id = esc(b.id), W = b.status === 'Won', P = b.status === 'Lost', n = nums[b.id];
      return `<div class="pz-hr${W ? ' pz-hw' : P ? ' pz-hl' : ''}"><span class="pz-num">${n ? '#' + n : '–'}</span><div class="pz-hm"><div><b ${l.m && !l.m.ext ? `class="link" data-act="fmatch" data-id="${esc(l.m.id)}"` : ''}>${esc(String(b.match || '').replace(/\s+vs\s+/i, ' – '))}</b>${b.comboId ? ' <span class="pz-cb">Combiné</span>' : ''}</div><small class="mut">${esc(stFdf(b.date))}${b.comp ? ' · ' + esc(b.comp) : ''} · ${esc(b.market || '')}</small><div class="pz-hp pz-pr" role="button" tabindex="0" data-pz="edit" data-id="${id}" title="Modifier, dupliquer ou supprimer"><b>${esc(b.prono || '')}</b> <span class="mut">· cote</span> <b>${cote(+b.odds || 1)}</b> <span class="mut">· mise</span> <b>${stF2(b.stake)} €</b>${W || P ? ` <span class="${W ? 'pz-pos' : 'pz-neg'}"><b>${eur(stGain(b))}</b></span>` : ''}</div></div>
        <div class="pz-hs">${l.e !== 'nf' ? pastille(l.e, l.m) : ''}<b class="pz-sc">${l.m ? scoreJambe(l) : ''}</b></div>
        <div class="pz-act pz-gp"><button class="sec pz-pill${W ? ' pz-onw' : ''}" data-pz="won" data-id="${id}">✓ Gagné</button><button class="sec pz-pill${P ? ' pz-onl' : ''}" data-pz="lost" data-id="${id}">✗ Perdu</button><span class="pz-i pz-del" role="button" tabindex="0" data-pz="del" data-id="${id}" title="Supprimer ce pari">🗑</span></div></div>`;
    };
    const liste = F.length ? `<div class="card pz-hlist">${F.map(ligne).join('')}${tot > F.length ? `<div class="pz-fa" style="justify-content:center"><button class="sec" data-pz="hmore">Charger plus (${tot - F.length} restant${tot - F.length > 1 ? 's' : ''})</button></div>` : ''}</div>` : '<p class="mut">Aucun pari dans cette vue.</p>';
    return `${barre}<p class="mut pz-hint" style="margin:4px 2px">${tot} pari${tot > 1 ? 's' : ''}${nf ? ' correspondant aux filtres' : ''} · le n° (#) suit l'ordre des paris réglés, comme dans PronoTracker</p>${liste}`;
  }
  function poser(v, html, force) {
    const foc = document.activeElement;
    if (!force && foc && v.contains(foc) && /^(INPUT|TEXTAREA)$/.test(foc.tagName) && foc.type !== 'checkbox') return;   // ne pas casser la saisie en cours
    if (v.__pzH !== html || !v.querySelector('.pz-view')) { v.innerHTML = html; v.__pzH = html; }
  }
  function vueParis(D) {
    const v = document.getElementById('view'); if (!v) return;
    { const an = filtre === 'analyse' && window.innerWidth >= 1100; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', an ? b.dataset.act === 'pzanalyse' : b.dataset.act === 'pronos')); }
    ['railL', 'railR'].forEach(id => { const r = document.getElementById(id); if (r) r.innerHTML = ''; });
    if (FRAMES[filtre]) {
      window.__pzFrame = true;
      const retour = filtre === 'atp' ? ['tennis', '← Retour à mes paris tennis'] : ['reglages', '← Retour aux réglages'];
      const h = `<div class="pz-view"><div class="row pz-tabs">${ongletsHtml(null)}</div><div class="row pz-tabs"><button class="sec pz-ib" data-pz="f" data-k="${retour[0]}">${retour[1]}</button></div><iframe class="pz-if" src="${FRAMES[filtre][1]}" title="${esc(FRAMES[filtre][0])}"></iframe></div>`;
      if (v.__pzH !== h || !v.querySelector('.pz-view')) { v.innerHTML = h; v.__pzH = h; }
      return;
    }
    window.__pzFrame = false;
    const auto = lsGet(AUTO) === '1', T = filtre === 'tennis' ? donnees('tennis') : D;
    const ban = (filtre === 'cours' || filtre === 'hist') && D.aRegler.length && !auto ? `<div class="pz-ban"><span>✅ ${D.aRegler.length} pari${D.aRegler.length > 1 ? 's' : ''} peu${D.aRegler.length > 1 ? 'vent' : 't'} être réglé${D.aRegler.length > 1 ? 's' : ''} d'après les scores finaux.</span><button data-pz="regleall">Tout régler</button></div>` : '';
    const tf = ['cours', 'hist', 'combos', 'stats'].includes(filtre) ? tennisDansFoot() : { n: 0 };
    const mx = tf.mixtes ? tf.mixtes + ' combiné' + (tf.mixtes > 1 ? 's' : '') + ' mêlant foot et tennis ' + (tf.mixtes > 1 ? 'restent' : 'reste') + ' à vérifier à la main (défais-' + (tf.mixtes > 1 ? 'les' : 'le') + ' puis range chaque pari dans son sport).' : '';
    const ban2 = (tf.n || tf.mixtes) ? `<div class="pz-ban"><span>🎾 ${tf.n ? tf.n + ' pari' + (tf.n > 1 ? 's' : '') + ' de tennis ' + (tf.n > 1 ? 'sont rangés' : 'est rangé') + ' dans le foot. ' : ''}${mx}</span>${tf.n ? '<button data-pz="totennis">Déplacer vers Tennis</button>' : ''}</div>` : '';
    const barre = filtre === 'cours' ? barreCombine(D) : '';
    const ligne = `<div class="row pz-tabs pz-tabrow">${ongletsHtml(D)}${filtre === 'cours' || filtre === 'hist' ? `<button class="sec pz-ib" data-pz="paste" title="Coller plusieurs paris d'un coup">📋 Coller</button><button class="pz-new" data-pz="new" title="Ajouter un pari"><span>＋</span> Nouveau pari</button>` : ''}</div>`;
    let haut = '', corps = '';
    if (filtre === 'cours') { haut = bilan(D, true); corps = impactEtResume(D) + (autoInfo && SP() === 'football' ? `<div class="pz-ban" id="pz-autoinfo"><span>${esc(autoInfo)}</span>${autoInfo.startsWith('⏳') ? '<button data-pz="autonow">Combiner maintenant</button>' : ''}</div>` : '') + corpsCours(D); }
    else if (filtre === 'hist') { haut = bilan(D, true); corps = corpsHist(D); }
    else if (filtre === 'tennis') { haut = bilan(T, true); corps = vueTennisPage(T); }
    else if (filtre === 'analyse') corps = vueAnalyse();
    else if (filtre === 'combos') corps = vueCombinesPage(D);
    else if (filtre === 'stats') corps = vueStatsPage();
    else corps = vueReglagesPage();
    const html = `<div class="pz-view">${haut}${ligne}${ban}${ban2}${corps}${barre}${barre ? '<div class="pz-sp"></div>' : ''}</div>`;
    poser(v, html, window.__pzForce);
  }

  /* ---------- Pages natives : Combinés, Stats, Tennis, Réglages ---------- */
  const TENNIS_MARCHES = ['Vainqueur du match', 'Vainqueur du 1er set', 'Handicap jeux', 'Total jeux', 'Nombre de sets', 'Autre'];
  let cbF = 'tous', cbQ = '', cbN = 15, stSport = 'football', stPer = 0;

  // Éléments réglés (combinés + paris simples), du plus ancien au plus récent
  function elements(D) {
    const out = [];
    D.C.filter(x => x.regle).forEach(x => { const won = x.legs.every(l => l.b.status === 'Won'); out.push({ t: 'C', date: x.jour || '', id: +x.c.id || 0, stake: x.stake, odds: x.odds, won, profit: won ? x.stake * (x.odds - 1) : -x.stake, legs: x.legs.map(l => l.b) }); });
    D.solos.filter(s => s.b.status === 'Won' || s.b.status === 'Lost').forEach(s => { const won = s.b.status === 'Won', st = +s.b.stake || 0, od = +s.b.odds || 1; out.push({ t: 'S', date: s.b.date || '', id: +s.b.id || 0, stake: st, odds: od, won, profit: won ? st * (od - 1) : -st, legs: [s.b] }); });
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
  }
  function calcStats(items, per) {
    const lim = per ? new Date(Date.now() - per * 864e5).toISOString().slice(0, 10) : '';
    const L = items.filter(i => !lim || i.date >= lim), n = L.length, g = L.filter(i => i.won).length;
    const profit = L.reduce((s, i) => s + i.profit, 0), mise = L.reduce((s, i) => s + i.stake, 0);
    const jours = {}; L.forEach(i => { jours[i.date] = (jours[i.date] || 0) + i.profit; });
    const dk = Object.keys(jours).sort();
    let cum = 0; const courbe = L.map(i => (cum += i.profit));
    let mw = 0, ml = 0, cw = 0, cl = 0; L.forEach(i => { if (i.won) { cw++; cl = 0; } else { cl++; cw = 0; } mw = Math.max(mw, cw); ml = Math.max(ml, cl); });
    const best = dk.reduce((b, d) => (b == null || jours[d] > jours[b] ? d : b), null), worst = dk.reduce((b, d) => (b == null || jours[d] < jours[b] ? d : b), null);
    return { L, n, g, profit, mise, roi: mise ? 100 * profit / mise : 0, coteMoy: n ? L.reduce((s, i) => s + i.odds, 0) / n : 0, jours, dk, jp: dk.filter(d => jours[d] > 0).length, courbe, mw, ml, best, worst };
  }
  const joliJour = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); } catch (e) { return d; } };
  const tuile = (t, v, cls) => `<div class="pz-k"><span>${t}</span><b class="${cls || ''}">${v}</b></div>`;
  function svgCourbe(v) {
    if (v.length < 2) return '<p class="mut">Pas assez de données pour tracer la courbe.</p>';
    const mn = Math.min(0, ...v), mx = Math.max(0, ...v), rg = (mx - mn) || 1, X = i => i * 600 / (v.length - 1), Y = y => 196 - (y - mn) / rg * 192;
    return `<div class="pz-chart"><span class="pz-yl pz-yt">${eur(mx)}</span><span class="pz-yl pz-yb">${eur(mn)}</span><svg viewBox="0 0 600 200" preserveAspectRatio="none"><line x1="0" x2="600" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><polyline fill="none" stroke="#7c3aed" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" points="${v.map((y, i) => X(i).toFixed(1) + ',' + Y(y).toFixed(1)).join(' ')}"/></svg></div>`;
  }
  function svgBarres(S) {
    const d = S.dk.slice(-31); if (!d.length) return '<p class="mut">Aucun jour réglé.</p>';
    const vals = d.map(k => S.jours[k]), mn = Math.min(0, ...vals), mx = Math.max(0, ...vals), rg = (mx - mn) || 1, Y = y => 196 - (y - mn) / rg * 192, w = 600 / d.length;
    return `<div class="pz-chart"><span class="pz-yl pz-yt">${eur(mx)}</span><span class="pz-yl pz-yb">${eur(mn)}</span><svg viewBox="0 0 600 200" preserveAspectRatio="none"><line x1="0" x2="600" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>${d.map((k, i) => { const y0 = Y(0), y1 = Y(vals[i]); return `<rect x="${(i * w + w * .15).toFixed(1)}" width="${(w * .7).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" height="${Math.max(1.5, Math.abs(y1 - y0)).toFixed(1)}" rx="2" fill="${vals[i] >= 0 ? 'var(--ok)' : 'var(--bad)'}"/>`; }).join('')}</svg></div><div class="pz-xl"><span>${joliJour(d[0])}</span><span>${joliJour(d[d.length - 1])}</span></div>`;
  }
  const puces = (cur, arr, key) => `<div class="row pz-chips">${arr.map(([k, l]) => `<button class="${cur === k ? '' : 'sec'} pz-ib" data-pz="${key}" data-k="${k}">${l}</button>`).join('')}</div>`;

  /* --- Combinés --- */
  function vueCombinesPage(D) {
    const S = calcStats(elements(D).filter(i => i.t === 'C'), 0);
    let L = D.C.slice().sort((a, b) => (b.jour > a.jour ? 1 : b.jour < a.jour ? -1 : (+b.c.id || 0) - (+a.c.id || 0)));
    const stt = x => x.perdu ? 'perdu' : (x.regle || x.gagne) ? 'gagne' : 'cours';
    const cnt = { tous: L.length, cours: L.filter(x => stt(x) === 'cours').length, gagne: L.filter(x => stt(x) === 'gagne').length, perdu: L.filter(x => stt(x) === 'perdu').length };
    if (cbF !== 'tous') L = L.filter(x => stt(x) === cbF);
    const q = norm(cbQ); if (q) L = L.filter(x => x.legs.some(l => norm(l.b.match + ' ' + l.b.prono + ' ' + l.b.comp).includes(q)));
    const tot = L.length; L = L.slice(0, cbN);
    return `<div class="card"><h2>🔀 Stats des combinés</h2><div class="pz-bil pz-big pz-six">${tuile('Réglés', S.n)}${tuile('Gagnés', `${S.g} (${S.n ? Math.round(100 * S.g / S.n) : 0} %)`)}${tuile('Profit', eur(S.profit), S.profit < 0 ? 'pz-neg' : 'pz-pos')}${tuile('ROI', (S.roi >= 0 ? '+' : '−') + Math.abs(S.roi).toFixed(1).replace('.', ',') + ' %', S.roi < 0 ? 'pz-neg' : 'pz-pos')}${tuile('Cote moy.', cote(S.coteMoy))}${tuile('Jours +', `${S.jp}/${S.dk.length}`)}</div></div>
      <div class="row pz-tabs">${puces(cbF, [['tous', 'Tous · ' + cnt.tous], ['cours', 'En cours · ' + cnt.cours], ['gagne', 'Gagnés · ' + cnt.gagne], ['perdu', 'Perdus · ' + cnt.perdu]], 'cbf')}<input id="pz-cq" class="pz-search" placeholder="Rechercher un match, une équipe, un pronostic…" value="${esc(cbQ)}"><button class="sec pz-ib" data-pz="autocombo" title="Associe tes paris simples à venir par deux, pour une cote totale d'environ 2,00–2,40">✨ Combiner automatiquement</button></div>
      ${L.length ? `<div class="pz-grid">${L.map(x => carteCombo(x, true)).join('')}</div>` : '<p class="mut">Aucun combiné pour ce filtre.</p>'}
      ${tot > cbN ? `<div class="pz-fa" style="justify-content:center"><button class="sec" data-pz="cbmore">Voir plus (${tot - cbN})</button></div>` : ''}`;
  }

  /* --- Stats --- */
  /* --- Stats : reprise complète de PronoTracker (combinés, solo, championnats, marchés, cotes, équipes, jours) --- */
  let stOng = 'resume', stComp = new Set(), stMode = 'include', stMk = null, stCo = null, stOpen = {}, stJ = new Set(), stDcPer = 0, stSans = false;
  try { stComp = new Set(JSON.parse(lsGet('pronotracker_compFilters') || '[]')); stMode = lsGet('pronotracker_compFilterMode') === 'exclude' ? 'exclude' : 'include'; } catch (e) {}
  const stSave = () => { try { localStorage.setItem('pronotracker_compFilters', JSON.stringify([...stComp])); localStorage.setItem('pronotracker_compFilterMode', stMode); } catch (e) {} };
  const ST_CATS = ['Top 5 Européen', 'Coupes Européennes', 'L2 / National', 'Autres / Non classés'], ST_COUL = { 'Top 5 Européen': '#2563eb', 'Coupes Européennes': '#d97706', 'L2 / National': '#059669', 'Autres / Non classés': '#64748b' };
  function stCat(c) {
    const t = String(c || '').trim(); if (!t) return null;
    if (/champions\s*league|ligue\s+des\s+champions|europa\s+league|ligue\s+europa|conf[ée]rence\s+league|ligue\s+conf[ée]rence/i.test(t)) return 'Coupes Européennes';
    if (/premier\s+league|la\s*liga|primera\s*divisi[oó]n|\bliga\b(?!\s*(portugal|mx|argentina|femenina))|serie\s+a|bundesliga|ligue\s+1\b/i.test(t)) return 'Top 5 Européen';
    if (/ligue\s+2\b|national\b/i.test(t)) return 'L2 / National';
    return null;
  }
  const ST_TR = ['1.00 – 1.49', '1.50 – 1.99', '2.00 et +'], stBr = o => o < 1.5 ? ST_TR[0] : o < 2 ? ST_TR[1] : ST_TR[2];
  const stGain = b => b.status === 'Won' ? ((+b.odds || 1) - 1) * (+b.stake || 0) : b.status === 'Lost' ? -(+b.stake || 0) : 0;
  const stReg = b => b.status === 'Won' || b.status === 'Lost';
  const stCls = v => v > 0.004 ? 'pz-pos' : v < -0.004 ? 'pz-neg' : '';
  const stF2 = n => (Number(n) || 0).toFixed(2).replace('.', ','), stPc = (n, d) => d ? (n / d * 100).toFixed(1).replace('.', ',') : '0,0';
  const stFd = d => { const p = String(d || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : d; };
  const stFdf = d => String(d || '').split('-').reverse().join('/');
  function stAgg(list) { const o = { n: 0, w: 0, mise: 0, profit: 0, cotes: 0 }; list.forEach(b => { if (!stReg(b)) return; o.n++; o.mise += +b.stake || 0; o.cotes += +b.odds || 1; o.profit += stGain(b); if (b.status === 'Won') o.w++; }); return o; }
  function stTab(head, rows, empty) {
    if (!rows.length) return `<p class="mut">${empty || 'Aucune donnée.'}</p>`;
    return `<div class="pz-tbw"><table class="pz-tb"><thead><tr>${head.map((h, i) => `<th${i ? '' : ' class="l"'}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  const stLigne = (nom, o, extra) => `<tr${extra || ''}><td class="l"><b>${nom}</b></td><td>${o.n}</td><td>${stPc(o.w, o.n)} %</td><td class="${stCls(o.profit)}">${eur(o.profit)}</td><td class="${stCls(o.profit)}">${o.mise ? (o.profit >= 0 ? '+' : '−') + stPc(Math.abs(o.profit), o.mise) + ' %' : '–'}</td></tr>`;
  function stTabMap(map, ordre, clic, actif) {
    const keys = (ordre ? ordre.filter(k => map[k]) : Object.keys(map)).sort((a, b) => ordre ? 0 : map[b].n - map[a].n);
    return stTab(['Type', 'Joués', 'Réussite', 'Profit net', 'ROI'], keys.map(k => stLigne(esc(k) + (actif === k ? ' <span class="pz-pt">●</span>' : ''), map[k], clic ? ` class="pz-clk${actif === k ? ' pz-on' : ''}" data-pz="${clic}" data-k="${esc(k)}"` : '')));
  }
  const stGrp = (list, fn) => { const m = {}; list.forEach(b => { if (!stReg(b)) return; const k = fn(b); const o = m[k] || (m[k] = { n: 0, w: 0, mise: 0, profit: 0 }); o.n++; o.mise += +b.stake || 0; o.profit += stGain(b); if (b.status === 'Won') o.w++; }); return m; };
  function stGenExclus() { try { const p = JSON.parse(lsGet('pronotracker_gen_pref') || 'null'); if (p && Array.isArray(p.exclus)) return new Set(p.exclus); } catch (e) {} return new Set(['Ligue 2', 'Ligue Europa', 'Ligue Conférence', 'Ligue Europa Q', 'Ligue Conférence Q']); }

  function vueStatsPage() {
    const sp = stSport === 'tennis' ? 'tennis' : 'football', S = lireN(), tous = S[sp] || [], foot = sp === 'football';
    const lim = stPer ? new Date(Date.now() - stPer * 864e5).toISOString().slice(0, 10) : '';
    const perOk = b => !lim || (b.date || '') >= lim;
    const compOk = b => { if (!stComp.size) return true; const k = (b.comp || 'Non spécifié').trim(); return stMode === 'exclude' ? !stComp.has(k) : stComp.has(k); };
    const base = tous.filter(b => perOk(b) && compOk(b));                                   // alimente le Bilan, la courbe et les jours
    const kpi = base.filter(b => (!stMk || (b.market || 'Autre') === stMk) && (!stCo || stBr(+b.odds || 1) === stCo));
    const sw = puces(stSport, [['football', '⚽ Foot'], ['tennis', '🎾 Tennis']], 'stsp') + puces(stPer, [[0, 'Tout'], [7, '7 jours'], [30, '30 jours']], 'stper');

    // combinés du sport (indépendants des filtres du Bilan, comme dans PronoTracker)
    const combos = ((S.combos || {})[sp] || []).map(c => {
      const legs = (c.legIds || []).map(i => tous.find(b => String(b.id) === String(i))).filter(Boolean);
      const status = legs.some(l => l.status === 'Lost') ? 'Lost' : (legs.length && legs.every(l => l.status === 'Won')) ? 'Won' : 'Pending';
      const odds = legs.reduce((p, l) => p * (+l.odds || 1), 1), stake = +c.stake || 0;
      return { c, legs, status, odds, stake, profit: status === 'Won' ? stake * (odds - 1) : status === 'Lost' ? -stake : 0, date: legs.reduce((m, l) => (l.date && l.date > m ? l.date : m), '') };
    }).filter(r => r.legs.length && r.date);

    // ---- Bandeau de filtres actifs ----
    const nf = (stComp.size ? 1 : 0) + (stMk ? 1 : 0) + (stCo ? 1 : 0);
    const ban = nf ? `<div class="pz-ban"><span>🔎 Bilan calculé sur la sélection filtrée : ${[stComp.size ? (stMode === 'exclude' ? stComp.size + ' championnat(s) exclu(s)' : stComp.size + ' championnat(s) inclus') : '', stMk ? 'marché « ' + esc(stMk) + ' »' : '', stCo ? 'cote ' + esc(stCo) : ''].filter(Boolean).join(' · ')}</span><button data-pz="streset">Réinitialiser les filtres</button></div>` : '';

    // ---- Cartes KPI globales ----
    const a = stAgg(kpi), cr = combos.filter(r => r.status !== 'Pending' && perOk({ date: r.date })), cp = cr.reduce((s, r) => s + r.profit, 0), cm = cr.reduce((s, r) => s + r.stake, 0);
    const roiS = a.mise ? 100 * a.profit / a.mise : 0, roiC = cm ? 100 * cp / cm : 0;
    const kpis = `<div class="pz-bil pz-big pz-six">${tuile('Cote / mise moy.', a.n ? stF2(a.cotes / a.n) + ' @ ' + (a.mise / a.n).toFixed(1).replace('.', ',') + ' €' : '–')}${tuile('Bilan net solo', eur(a.profit), stCls(a.profit))}${tuile('ROI solo', (roiS >= 0 ? '+' : '−') + Math.abs(roiS).toFixed(1).replace('.', ',') + ' %', stCls(a.profit))}${tuile('Bilan net combiné', eur(cp), stCls(cp))}${tuile('ROI combiné', (roiC >= 0 ? '+' : '−') + Math.abs(roiC).toFixed(1).replace('.', ',') + ' %', stCls(cp))}${tuile('Paris réglés', a.n)}</div>`;

    // ---- Stats combinés ----
    const exc = stGenExclus(), lc = stDcPer ? new Date(Date.now() - stDcPer * 864e5).toISOString().slice(0, 10) : '';
    let rows = combos.filter(r => (!lc || r.date >= lc) && (!stSans || !r.legs.some(l => exc.has((l.comp || '').trim()))));
    const reg = rows.filter(r => r.status !== 'Pending').sort((x, y) => x.date.localeCompare(y.date) || (+x.c.id || 0) - (+y.c.id || 0)), N = reg.length, W = reg.filter(r => r.status === 'Won').length;
    const jmap = {}; rows.forEach(r => { const j = jmap[r.date] || (jmap[r.date] = { date: r.date, n: 0, w: 0, l: 0, p: 0, profit: 0, cotes: [], items: [] }); j.n++; j.items.push(r); if (r.status === 'Won') j.w++; else if (r.status === 'Lost') j.l++; else j.p++; if (r.status !== 'Pending') { j.profit += r.profit; j.cotes.push(r.odds); } });
    const jours = Object.values(jmap).sort((x, y) => x.date.localeCompare(y.date)), jReg = jours.filter(j => j.w + j.l > 0);
    const dcMise = reg.reduce((s, r) => s + r.stake, 0), dcProf = reg.reduce((s, r) => s + r.profit, 0), dcCote = N ? reg.reduce((s, r) => s + r.odds, 0) / N : 0;
    const bestJ = jReg.slice().sort((x, y) => y.profit - x.profit)[0], worstJ = jReg.slice().sort((x, y) => x.profit - y.profit)[0];
    let ser = 0, mp = 0, mg = 0, sg = 0; reg.forEach(r => { if (r.status === 'Lost') { ser++; sg = 0; mp = Math.max(mp, ser); } else { sg++; ser = 0; mg = Math.max(mg, sg); } });
    const parNb = {}; reg.forEach(r => { const o = parNb[r.legs.length] || (parNb[r.legs.length] = { n: 0, w: 0, mise: 0, profit: 0 }); o.n++; if (r.status === 'Won') o.w++; o.mise += r.stake; o.profit += r.profit; });
    const TR = [['Moins de 2,50', 0, 2.5], ['2,50 – 3,49', 2.5, 3.5], ['3,50 – 4,99', 3.5, 5], ['5,00 et +', 5, 1e9]];
    const trRows = TR.map(([nom, lo, hi]) => { const rs = reg.filter(r => r.odds >= lo && r.odds < hi); if (!rs.length) return ''; return stLigne(nom, { n: rs.length, w: rs.filter(r => r.status === 'Won').length, mise: rs.reduce((s, r) => s + r.stake, 0), profit: rs.reduce((s, r) => s + r.profit, 0) }); }).filter(Boolean);
    const perdus = reg.filter(r => r.status === 'Lost'), parPerte = {};
    perdus.forEach(r => { const n = r.legs.length, k = r.legs.filter(l => l.status === 'Lost').length, o = parPerte[k + '/' + n] || (parPerte[k + '/' + n] = { k, n, nb: 0, g: 0, att: 0 }); o.nb++; const au = r.legs.filter(l => l.status !== 'Lost'); if (au.length) { if (au.every(l => l.status === 'Won')) o.g++; else o.att++; } });
    const defs = N ? `<div class="pz-dfs"><div class="pz-ch"><b>Défaites</b><span class="pz-st pz-lost">${perdus.length} sur ${N} · ${stPc(perdus.length, N)} %</span></div>${Object.values(parPerte).sort((x, y) => (x.n - y.n) || (y.k - x.k)).map(o => { const pc = Math.round(100 * o.nb / N); return `<div class="pz-dl"><div class="pz-ch"><span>${o.k === o.n ? `Les ${o.n} pronos perdus` : `${o.k} prono${o.k > 1 ? 's' : ''} perdu${o.k > 1 ? 's' : ''} sur ${o.n}`}</span><span><b class="pz-neg">${o.nb}</b> combiné${o.nb > 1 ? 's' : ''} · <b class="pz-neg">${pc} %</b></span></div><div class="pz-pb"><i style="width:${pc}%"></i></div>${o.k < o.n && (o.g || o.att) ? `<small class="mut">${[o.g ? 'l\'autre gagné : ' + o.g : '', o.att ? 'autre pas encore joué : ' + o.att : ''].filter(Boolean).join(' · ')}</small>` : ''}</div>`; }).join('') || '<p class="mut">Aucun combiné perdu sur cette période.</p>'}<small class="mut">Un combiné est perdu dès qu'un prono est perdu, même si l'autre n'est pas encore joué.</small></div>` : '';
    let cum = 0; const courbeC = reg.map(r => (cum += r.profit));
    const jj = {}; jReg.forEach(j => { jj[j.date] = j.profit; });
    const lignesJ = jours.slice().reverse().map(j => {
      const rg = j.w + j.l, ouv = stJ.has(j.date);
      const det = ouv ? j.items.map(r => `<div class="pz-jd"><b class="${r.status === 'Won' ? 'pz-pos' : r.status === 'Lost' ? 'pz-neg' : ''}">${r.status === 'Won' ? 'Gagné' : r.status === 'Lost' ? 'Perdu' : 'En cours'}</b> · cote ${stF2(r.odds)} · mise ${stF2(r.stake)} € · <b class="${stCls(r.profit)}">${eur(r.profit)}</b>${r.legs.map(l => `<div class="mut">${l.status === 'Won' ? '✅' : l.status === 'Lost' ? '❌' : '⏳'} ${esc(l.match || '')} — ${esc(l.prono || '')} <span>(${stF2(l.odds)})</span></div>`).join('')}</div>`).join('') : '';
      return `<div class="pz-jr" data-pz="stjour" data-k="${esc(j.date)}"><span><b>${stFd(j.date)}</b></span><span>${j.n}</span><span><b class="pz-pos">${j.w}</b>/<b class="pz-neg">${j.l}</b>${j.p ? '/<b>' + j.p + '</b>' : ''}</span><span>${rg ? Math.round(100 * j.w / rg) + ' %' : '–'}</span><span>${j.cotes.length ? stF2(j.cotes.reduce((x, y) => x + y, 0) / j.cotes.length) : '–'}</span><span class="${stCls(j.profit)}"><b>${rg ? eur(j.profit) : '–'}</b></span></div>${det}`;
    }).join('');
    const tailles = Object.keys(parNb).sort((x, y) => x - y).map(k => stLigne(k + ' matchs', parNb[k]));
    const comboCard = `<div class="card"><h2>📊 Stats des combinés</h2><div class="row pz-chips">${puces(stDcPer, [[0, 'Tout'], [7, '7 jours'], [30, '30 jours']], 'stdc')}<button class="${stSans ? '' : 'sec'} pz-ib" data-pz="stsans">${stSans ? '✓ ' : ''}Sans championnats exclus</button></div>
      ${N ? `<div class="pz-bil pz-big pz-six">${tuile('Réglés', N)}${tuile('Gagnés', W + ' (' + Math.round(100 * W / N) + ' %)')}${tuile('Profit', eur(dcProf), stCls(dcProf))}${tuile('ROI', dcMise ? (dcProf >= 0 ? '+' : '−') + stPc(Math.abs(dcProf), dcMise) + ' %' : '–', stCls(dcProf))}${tuile('Cote moy.', stF2(dcCote))}${tuile('Jours +', jReg.filter(j => j.profit > 0).length + '/' + jReg.length)}</div>${defs}
      <div class="pz-grid pz-2"><div><h3 class="pz-h3">Évolution du bankroll (combiné après combiné)</h3>${svgCourbe(courbeC)}</div><div><h3 class="pz-h3">Bilan par jour</h3>${svgBarres({ dk: jReg.map(j => j.date), jours: jj })}</div></div>
      <div class="pz-bil pz-big"><div class="pz-k pz-okbg"><span>Meilleur jour</span><b>${bestJ ? stFd(bestJ.date) + ' · ' + eur(bestJ.profit) : '–'}</b></div><div class="pz-k pz-kobg"><span>Pire jour</span><b>${worstJ ? stFd(worstJ.date) + ' · ' + eur(worstJ.profit) : '–'}</b></div><div class="pz-k"><span>Plus longue série gagnante</span><b>${mg} combiné(s)</b></div><div class="pz-k"><span>Plus longue série perdante</span><b>${mp} combiné(s)</b></div></div>
      <div class="pz-grid pz-2"><div><h3 class="pz-h3">Par nombre de matchs</h3>${stTab(['Taille', 'Nb', 'Réussite', 'Profit', 'ROI'], tailles)}</div><div><h3 class="pz-h3">Par tranche de cote</h3>${stTab(['Tranche', 'Joués', 'Réussite', 'Profit', 'ROI'], trRows)}</div></div>` : '<p class="mut">Aucun combiné réglé sur cette période.</p>'}
      <h3 class="pz-h3">Jour par jour <span class="mut pz-hint">· touche un jour pour voir ses combinés</span></h3>
      <div class="pz-jh"><span>Jour</span><span>Combinés</span><span>G/P</span><span>Réussite</span><span>Cote moy.</span><span>Profit</span></div>${lignesJ || '<p class="mut">Rien à afficher.</p>'}</div>`;

    // ---- Stats solo ----
    let cs = 0; const ord = base.filter(stReg).slice().sort((x, y) => (x.date || '').localeCompare(y.date || '') || (+x.id || 0) - (+y.id || 0));
    const courbeS = ord.map(b => (cs += stGain(b)));
    const dm = {}; base.forEach(b => { if (!b.date) return; const d = dm[b.date] || (dm[b.date] = { n: 0, w: 0, l: 0, mise: 0, profit: 0 }); if (stReg(b)) { d.n++; d.mise += +b.stake || 0; d.profit += stGain(b); if (b.status === 'Won') d.w++; else d.l++; } });
    const dLignes = Object.keys(dm).sort().reverse().map(d => { const o = dm[d]; return `<tr><td class="l"><b>${stFdf(d)}</b></td><td>${o.n} (${o.w}G/${o.l}P)</td><td class="${stCls(o.profit)}">${eur(o.profit)}</td><td class="${stCls(o.profit)}">${o.mise ? (o.profit >= 0 ? '+' : '−') + stPc(Math.abs(o.profit), o.mise) + ' %' : '–'}</td></tr>`; });
    const src = base;  // marché / cote : mêmes filtres mais sans se filtrer eux-mêmes
    const mkMap = stGrp(src, b => b.market || 'Autre'), coMap = stGrp(src, b => stBr(+b.odds || 1));
    const eq = {}; src.forEach(b => { if (!stReg(b)) return; const p = String(b.match || '').split(/\s+(?:vs\.?|contre|-|–)\s+/i).map(x => x.trim()).filter(Boolean); if (p.length !== 2) return; const g = stGain(b); p.forEach(nom => { const k = mots(nom).join(' ') || nom.toLowerCase(), e = eq[k] || (eq[k] = { noms: {}, n: 0, w: 0, profit: 0 }); e.noms[nom] = (e.noms[nom] || 0) + 1; e.n++; if (b.status === 'Won') e.w++; e.profit += g; }); });
    const eqL = Object.values(eq).filter(e => e.n >= 3).map(e => (e.nom = Object.keys(e.noms).sort((x, y) => e.noms[y] - e.noms[x])[0], e));
    const eqLigne = e => `<tr><td class="l"><b>${esc(e.nom)}</b></td><td>${e.n}</td><td>${Math.round(100 * e.w / e.n)} %</td><td class="${stCls(e.profit)}">${eur(e.profit)}</td></tr>`;
    const eqT = arr => stTab(['Équipe', 'Paris', 'Réussite', 'Profit'], arr.map(eqLigne), 'Pas encore assez de paris (3 minimum par équipe).');
    // catégories de championnat (foot)
    let cats = '';
    if (foot) {
      const modeBtns = `<div class="row pz-chips"><span class="mut">Cases à cocher :</span><button class="${stMode === 'include' ? '' : 'sec'} pz-ib" data-pz="stmode" data-k="include" title="Cocher un championnat = ne garder que celui-ci dans le Bilan">✅ Inclure</button><button class="${stMode === 'exclude' ? '' : 'sec'} pz-ib" data-pz="stmode" data-k="exclude" title="Cocher un championnat = le retirer du Bilan">🚫 Exclure</button></div>`;
      cats = `<div class="card"><h2>🏆 Stats par catégorie de championnat</h2>${modeBtns}${ST_CATS.map(cat => {
        const bets = tous.filter(b => stReg(b) && ((stCat(b.comp) || 'Autres / Non classés') === cat)), o = stAgg(bets), ouv = !!stOpen[cat], col = ST_COUL[cat];
        const cmap = {}; bets.forEach(b => { const k = (b.comp || 'Non spécifié').trim(); const t = cmap[k] || (cmap[k] = { n: 0, w: 0, mise: 0, profit: 0 }); t.n++; t.mise += +b.stake || 0; t.profit += stGain(b); if (b.status === 'Won') t.w++; });
        const cks = Object.keys(cmap).sort((x, y) => x.localeCompare(y, 'fr', { sensitivity: 'base' })), nbCk = cks.filter(k => stComp.has(k)).length;
        let cc = 0; const cb = bets.slice().sort((x, y) => (x.date || '').localeCompare(y.date || '') || (+x.id || 0) - (+y.id || 0)).map(b => (cc += stGain(b)));
        const compT = stTab(['<input type="checkbox" data-pz="stcompall" data-k="' + esc(cat) + '"' + (cks.length && nbCk === cks.length ? ' checked' : '') + ' title="Tout cocher / décocher">', 'Championnat', 'Joués', 'Réussite', 'Profit', 'ROI'], cks.map(k => { const t = cmap[k], on = stComp.has(k); return `<tr class="${on ? (stMode === 'exclude' ? 'pz-exc' : 'pz-on') : ''}"><td><input type="checkbox" data-pz="stcomp" data-k="${esc(k)}"${on ? ' checked' : ''}></td><td class="l" data-pz="stcomp" data-k="${esc(k)}"><b>${esc(k)}</b>${on && stMode === 'exclude' ? ' <span class="pz-neg">(exclu)</span>' : ''}</td><td>${t.n}</td><td>${stPc(t.w, t.n)} %</td><td class="${stCls(t.profit)}">${eur(t.profit)}</td><td class="${stCls(t.profit)}">${t.mise ? (t.profit >= 0 ? '+' : '−') + stPc(Math.abs(t.profit), t.mise) + ' %' : '–'}</td></tr>`; }), 'Aucune donnée.');
        return `<div class="pz-cat" style="border-left:4px solid ${col}"><div class="pz-cath" data-pz="stopen" data-k="${esc(cat)}"><b>${esc(cat)}</b><span class="mut">${o.n} pari(s)</span><span class="${stCls(o.profit)}"><b>${eur(o.profit)}</b></span><span class="${stCls(o.profit)}">ROI ${o.mise ? (o.profit >= 0 ? '+' : '−') + stPc(Math.abs(o.profit), o.mise) : '0,0'} %</span><span>${ouv ? '▴' : '▾'}</span></div>
          ${ouv ? `<div class="pz-catb"><div class="pz-bil pz-big pz-six">${tuile('Joués', o.n)}${tuile('Réussite', stPc(o.w, o.n) + ' %')}${tuile('Cote moy.', o.n ? stF2(o.cotes / o.n) : '1,00')}${tuile('Profit net', eur(o.profit), stCls(o.profit))}${tuile('ROI', o.mise ? (o.profit >= 0 ? '+' : '−') + stPc(Math.abs(o.profit), o.mise) + ' %' : '0,0 %', stCls(o.profit))}</div><h3 class="pz-h3">Évolution cumulée</h3>${svgCourbe(cb)}<h3 class="pz-h3">Par championnat <span class="mut pz-hint">· ${stMode === 'exclude' ? 'coche pour exclure du Bilan' : 'coche pour n\'inclure que ceux cochés dans le Bilan'}</span></h3>${compT}<div class="pz-grid pz-2"><div><h3 class="pz-h3">Par type de prono</h3>${stTabMap(stGrp(bets, b => b.market || 'Autre'))}</div><div><h3 class="pz-h3">Par tranche de cote</h3>${stTabMap(stGrp(bets, b => stBr(+b.odds || 1)), ST_TR)}</div></div></div>` : ''}</div>`;
      }).join('')}</div>`;
    }
    const bk = `<div class="card"><h2>📈 Évolution du bankroll <span class="mut pz-hint">· chaque pari compté seul, sur la sélection filtrée</span></h2>${svgCourbe(courbeS)}</div>`;
    const quot = `<div class="card"><h2>📅 Bilan quotidien · jour par jour</h2>${stTab(['JJ/MM/AAAA', 'Joués (G/P)', 'Gain net', 'ROI'], dLignes, 'Aucun résultat quotidien enregistré.')}</div>`;
    const mkco = `<div class="pz-grid pz-2"><div class="card"><h2>🎯 Par type de prono (marché)</h2><p class="mut pz-hint">Touche une ligne pour filtrer le bilan.</p>${stTabMap(mkMap, null, 'stmk', stMk)}</div><div class="card"><h2>💶 Par tranche de cote</h2><p class="mut pz-hint">Touche une ligne pour filtrer le bilan.</p>${stTabMap(coMap, ST_TR, 'stco', stCo)}</div></div>`;
    const equipes = `<div class="card"><h2>👥 Par équipe : où tu gagnes, où tu perds</h2><p class="mut pz-hint">Tous tes paris terminés sur les matchs de l'équipe, quel que soit le marché (3 paris minimum).</p><div class="pz-grid pz-2"><div><h3 class="pz-h3">✅ Les plus rentables</h3>${eqT(eqL.filter(e => e.profit > 0).sort((x, y) => y.profit - x.profit).slice(0, 5))}</div><div><h3 class="pz-h3">⚠️ Les pièges (les plus coûteuses)</h3>${eqT(eqL.filter(e => e.profit < 0).sort((x, y) => x.profit - y.profit).slice(0, 5))}</div></div></div>`;
    const ONG = [['resume', 'Résumé'], ['combos', 'Combinés'], ['champ', 'Championnats'], ['details', 'Détails'], ['an', 'Analyseur']].filter(([k]) => (k !== 'champ' && k !== 'an') || foot);
    if (!ONG.some(([k]) => k === stOng)) stOng = 'resume';
    const sous = `<div class="row pz-chips pz-sous">${ONG.map(([k, l]) => `<button class="${stOng === k ? '' : 'sec'} pz-ib" data-pz="stong" data-k="${k}">${l}</button>`).join('')}</div>`;
    let corps;
    if (stOng === 'combos') corps = comboCard;
    else if (stOng === 'champ') corps = cats;
    else if (stOng === 'details') corps = quot + mkco + equipes;
    else if (stOng === 'an') corps = vueSuiviAnalyseur();
    else corps = bk + mkco;
    return `<div class="pz-stats"><div class="row pz-tabs">${sw}</div>${ban}${kpis}${sous}${corps}</div>`;
  }

  /* --- Tennis : matchs du jour et cotes lus par le robot (Tennis Explorer), comme dans PronoTracker --- */
  const TN_ROBOT = 'prono-tennis-robot', TN_SEUIL = 'prono-cotes-seuil', TN_MISE = 'prono-cotes-mise', TN_AUTO = 'prono-cotes-auto';
  const TN = { off: 0, days: {}, busy: false, err: '', reg: false, lastReg: 0, edit: false };
  const tnRobot = () => { try { return Object.assign({ url: '', key: '' }, JSON.parse(lsGet(TN_ROBOT) || '{}')); } catch (e) { return { url: '', key: '' }; } };
  const tnNum = (k, d) => { const v = parseFloat(lsGet(k)); return v > 0 ? v : d; };
  const tnIso = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const tnN = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const tnKey = (d, m) => d + '|' + tnN(m.j1) + '|' + tnN(m.j2);
  const tnAutoOn = () => lsGet(TN_AUTO) !== '0';
  const tnMaj = () => { const h = document.getElementById('pzTennis'); if (h) { h.__pzH = null; tennisParis(); } };
  async function tnLire(iso) {
    const R = tnRobot(), r = await fetch(R.url.replace(/\/+$/, '') + '/tennis?date=' + iso, { headers: { 'x-key': R.key }, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Clé refusée : vérifie la SYNC_KEY.');
    if (!r.ok || !j.ok) throw new Error(j.error || ('Le robot a répondu ' + r.status));
    j._t = Date.now(); return j;
  }
  async function tnCharger(force) {
    const R = tnRobot(); if (!R.url || !R.key || TN.busy) return;
    const iso = tnIso(TN.off), d = TN.days[iso];
    if (!force && d && Date.now() - d._t < 5 * 60e3) return;
    TN.busy = true; TN.err = ''; tnMaj();
    try { TN.days[iso] = await tnLire(iso); if (tnAutoOn()) tnCombos(iso, false); }
    catch (e) { TN.err = e.message === 'Failed to fetch' ? 'Robot injoignable : vérifie l\'adresse et ta connexion.' : e.message; }
    TN.busy = false; tnMaj();
  }
  function tnPari(iso, m, n, mise) {
    const k = tnKey(iso, m), c = n === 1 ? +m.c1 : +m.c2, who = n === 1 ? m.j1 : m.j2;
    return { id: Date.now() + Math.floor(Math.random() * 1000), date: iso, type: 'Single', match: m.j1 + ' vs ' + m.j2, comp: m.tournoi || 'Tennis', market: 'Vainqueur du match', prono: 'Victoire ' + who, odds: c, stake: mise, status: 'Pending', tn: { k, j1: m.j1, j2: m.j2, p: n, h: m.heure || '' } };
  }
  function tnAjouter(iso, i, n) {
    const m = ((TN.days[iso] || {}).matchs || [])[i]; if (!m) return;
    const ex = (lireN().tennis || []).find(b => b.tn && b.tn.k === tnKey(iso, m));
    if (ex && ex.tn.p === n) { toast('Déjà parié : ' + ex.prono); return; }
    const b = tnPari(iso, m, n, tnNum(TN_MISE, 1));
    muter(S => { S.tennis.unshift(b); }, 'Pari ajouté : ' + b.prono + ' · ' + cote(b.odds));
  }
  // favoris à cote basse (≤ seuil) associés deux par deux, meilleures cotes ensemble ; un joueur ne sert qu'une fois
  function tnCombos(iso, manuel) {
    const D = TN.days[iso]; if (!D || iso < tnIso(0)) return 0;
    const seuil = tnNum(TN_SEUIL, 1.5), mise = tnNum(TN_MISE, 1), flag = 'prono-cotes-auto-' + iso;
    if (!manuel && lsGet(flag)) return 0;
    const S0 = lireN(), dejaC = new Set(), dejaP = new Set(), legIds = new Set();
    S0.combos.tennis.forEach(c => (c.legIds || []).forEach(id => legIds.add(String(id))));
    S0.tennis.forEach(b => { if (b.date !== iso || !b.tn) return; dejaP.add(tnN(b.tn.j1) + '|' + tnN(b.tn.j2)); if (b.comboId || legIds.has(String(b.id))) { dejaC.add(tnN(b.tn.j1)); dejaC.add(tnN(b.tn.j2)); } });
    const cand = (D.matchs || []).filter(m => m.w !== 1 && m.w !== 2 && +m.c1 > 1 && +m.c2 > 1)
      .map(m => { const n = +m.c1 <= +m.c2 ? 1 : 2; return { m, n, c: n === 1 ? +m.c1 : +m.c2 }; })
      .filter(x => x.c <= seuil && !dejaP.has(tnN(x.m.j1) + '|' + tnN(x.m.j2)) && !dejaC.has(tnN(x.m.j1)) && !dejaC.has(tnN(x.m.j2)))
      .sort((a, b) => b.c - a.c);
    const paires = []; for (let i = 0; i + 1 < cand.length; i += 2) paires.push([cand[i], cand[i + 1]]);
    if (cand.length >= 2) { try { localStorage.setItem(flag, '1'); } catch (e) {} }
    if (!paires.length) { if (manuel) toast('Aucun combiné possible : il faut au moins 2 matchs avec un favori ≤ ' + cote(seuil) + ' pas encore utilisés.'); return 0; }
    muter(S => paires.forEach(pr => {
      const ids = pr.map(x => { const b = tnPari(iso, x.m, x.n, mise); S.tennis.unshift(b); return b.id; });
      const cid = Date.now() + Math.floor(Math.random() * 100000);
      ids.forEach(id => { const b = S.tennis.find(x => x.id === id); if (b) b.comboId = cid; });
      S.combos.tennis.push({ id: cid, stake: mise, legIds: ids, createdAt: new Date().toISOString(), auto: true });
    }), paires.length + ' combiné(s) tennis créé(s)');
    return paires.length;
  }
  // règle les paris tennis en cours d'après les résultats lus par le robot
  async function tnRegler(manuel) {
    const R = tnRobot(); if (TN.reg || !R.url || !R.key) return 0;
    const att = lireN().tennis.filter(b => b.status === 'Pending' && b.tn && b.date <= tnIso(0));
    if (!att.length) { if (manuel) toast('Aucun pari tennis en cours à régler.'); return 0; }
    TN.reg = true; TN.lastReg = Date.now(); const res = {};
    try {
      for (const d of [...new Set(att.map(b => b.date))]) {
        let J; try { J = await tnLire(d); } catch (e) { continue; }
        att.filter(b => b.date === d).forEach(b => {
          const m = (J.matchs || []).find(x => tnKey(d, x) === b.tn.k) || (J.matchs || []).find(x => tnN(x.j1) === tnN(b.tn.j1) && tnN(x.j2) === tnN(b.tn.j2));
          if (m && (m.w === 1 || m.w === 2)) res[b.id] = m.w === b.tn.p ? 'Won' : 'Lost';
        });
      }
    } finally { TN.reg = false; }
    const n = Object.keys(res).length;
    if (n) muter(S => S.tennis.forEach(b => { if (res[b.id] && b.status === 'Pending') b.status = res[b.id]; }), n + ' pari(s) tennis réglé(s) d\'après les résultats');
    else if (manuel) toast('Aucun nouveau résultat lisible (abandon, match pas fini ou score non lu : règle-le à la main).');
    return n;
  }
  setInterval(() => { try { if (typeof ui !== 'undefined' && ui.sport === 'tennis' && document.getElementById('pzTennis') && !document.hidden) tnRegler(false); } catch (e) {} }, 5 * 60e3);
  function vueRobot() {
    const R = tnRobot();
    if (!R.url || !R.key || TN.edit) return `<div class="card"><h2>🎾 Matchs du jour &amp; cotes</h2><p class="mut" style="margin:0 0 8px">Renseigne ton robot Cloudflare pour lire les matchs et les cotes (Tennis Explorer). C'est le même que dans PronoTracker.</p>
      <div class="pz-fa" style="margin:0"><input id="pz-tn-url" class="pz-search" placeholder="https://statify-robot.xxx.workers.dev" value="${esc(R.url)}"><input id="pz-tn-key" class="pz-search" style="max-width:200px" type="password" placeholder="SYNC_KEY" value="${esc(R.key)}"><button data-pz="tnrobot">Enregistrer</button>${R.url ? '<button class="sec" data-pz="tnedit">Annuler</button>' : ''}</div></div>`;
    const seuil = tnNum(TN_SEUIL, 1.5), mise = tnNum(TN_MISE, 1), iso = tnIso(TN.off), D = TN.days[iso];
    if (!D && !TN.busy && !TN.err) setTimeout(() => tnCharger(false), 0);
    const ctl = `<div class="row pz-chips" style="align-items:center">${puces(TN.off, [[0, 'Aujourd\'hui'], [1, 'Demain']], 'tnjour')}<label class="pz-auto" title="Chaque jour, forme tout seul des combinés de 2 matchs avec les favoris à cote basse"><input type="checkbox" data-pz="tnauto"${tnAutoOn() ? ' checked' : ''}> Combinés auto</label>
      <label class="pz-auto">Favori ≤ <input id="pz-tn-seuil" class="pz-mini" type="number" step="0.05" min="1" value="${seuil}"></label><label class="pz-auto">Mise <input id="pz-tn-mise" class="pz-mini" type="number" step="0.5" min="0.5" value="${mise}"> €</label>
      <button class="sec pz-ib" data-pz="tngen">⚡ Générer</button><button class="sec pz-ib" data-pz="tncotes">↻ Cotes</button><button class="sec pz-ib" data-pz="tnregler" title="Lit les résultats et règle tes paris en cours">✓ Régler d'après les résultats</button><button class="sec pz-ib" data-pz="tnedit" title="Changer l'adresse du robot">⚙️</button></div>`;
    let corps;
    if (TN.busy && !D) corps = '<p class="mut">Chargement des matchs…</p>';
    else if (TN.err && !D) corps = `<p class="pz-neg">⚠️ ${esc(TN.err)}</p>`;
    else if (!D) corps = '<p class="mut">Touche « ↻ Cotes » pour lire les matchs.</p>';
    else {
      const ms = (D.matchs || []).map((m, i) => ({ m, i })).filter(x => x.m.w !== 1 && x.m.w !== 2), parT = {};
      ms.forEach(x => { (parT[x.m.tournoi || 'Tennis'] ||= []).push(x); });
      const paris = lireN().tennis;
      const btn = (x, n) => { const m = x.m, c = n === 1 ? m.c1 : m.c2, who = n === 1 ? m.j1 : m.j2, ex = paris.find(b => b.tn && b.tn.k === tnKey(iso, m)), pris = ex && ex.tn.p === n; return `<button class="${pris ? '' : 'sec'} pz-ib pz-tnj" data-pz="tnpari" data-d="${iso}" data-i="${x.i}" data-n="${n}"${c > 1 ? '' : ' disabled'} title="Ajouter « Victoire ${esc(who)} »"><b>${esc(who)}</b> ${c > 1 ? cote(+c) : '–'}${pris ? ' ✓' : ''}</button>`; };
      corps = ms.length ? Object.keys(parT).map(t => `<h3 class="pz-h3">${esc(t)}</h3>` + parT[t].map(x => `<div class="pz-tnl"><span class="mut">${esc(x.m.heure || '')}</span>${btn(x, 1)}<span class="mut">vs</span>${btn(x, 2)}</div>`).join('')).join('') : '<p class="mut">Aucun match à venir pour ce jour (ou tous sont terminés).</p>';
      corps += `<p class="mut pz-hint" style="margin-top:10px">Combinés auto : les favoris à cote basse sont associés deux par deux (les meilleures cotes ensemble), un joueur n'est jamais dans deux combinés. Matchs et cotes : Tennis Explorer (ATP / WTA, sans qualifications) via ton robot${D.perime ? ' · ⚠️ données mémorisées' : ''}.</p>`;
    }
    return `<div class="card"><h2>🎾 Matchs du jour &amp; cotes <span class="mut pz-hint">· un clic sur un joueur ajoute le pari</span></h2>${ctl}${corps}</div>`;
  }
  document.addEventListener('change', e => {
    const id = e.target.id, v = e.target.value;
    if (id === 'pz-k') majSugg();
    if (id === 'pz-eh-du') { EH.du = v; vueExport(); } else if (id === 'pz-eh-au') { EH.au = v; vueExport(); }
    if (id === 'pz-delai') { try { localStorage.setItem(RG_DELAI, v); localStorage.removeItem(RG_SIG); } catch (x) {} autoCombos(false); decorer(); }
    if (e.target.dataset && e.target.dataset.col != null && COL && COL[+e.target.dataset.col]) COL[+e.target.dataset.col][e.target.dataset.f] = v;
    if (id === 'pz-hper') { H.per = v; H.n = 25; decorer(); } else if (id === 'pz-hcomp') { H.comp = v; H.n = 25; decorer(); } else if (id === 'pz-hsort') { H.f = v; H.dir = v === 'date' || v === 'num' ? 'desc' : 'asc'; decorer(); }
    else if (id === 'pz-hfrom') { H.from = v; decorer(); } else if (id === 'pz-hto') { H.to = v; decorer(); }
    if (id === 'pz-tn-seuil' || id === 'pz-tn-mise') { const x = parseFloat(e.target.value); if (x > 0) { try { localStorage.setItem(id === 'pz-tn-seuil' ? TN_SEUIL : TN_MISE, String(x)); } catch (er) {} } }
  });

  /* --- Tennis (paris saisis à la main : pas de score en direct) --- */
  function vueTennisPage(D) {
    const cours = corpsCours(D), hist = corpsHist(D);
    const R = tnRobot();
    if (R.url && R.key && Date.now() - TN.lastReg > 5 * 60e3) setTimeout(() => tnRegler(false), 0);
    return `${vueRobot()}<div class="row pz-tabs"><button class="pz-new" data-pz="new">＋ Nouveau pari tennis</button></div>
      <p class="mut" style="margin:0">${R.url && R.key ? 'Les paris pris depuis les cotes se règlent tout seuls d\'après les résultats du robot (toutes les 5 minutes). Les autres se règlent à la main (✓ Gagné / ✗ Perdu).' : 'Sans robot, les paris tennis se règlent à la main (✓ Gagné / ✗ Perdu).'}</p>${cours}${hist}${barreCombine(D)}${sel.size ? '<div class="pz-sp"></div>' : ''}`;
  }

  /* --- Mes paris dans le sport Tennis (onglet de tennis.js) --- */
  function tennisParis() {
    const h = document.getElementById('pzTennis'); if (!h) return;
    const foc = document.activeElement;
    if (!window.__pzForce && foc && h.contains(foc) && /^(INPUT|TEXTAREA)$/.test(foc.tagName) && foc.type !== 'checkbox') return;
    const D = donnees('tennis'), html = `<div class="pz-view">${bilan(D, true)}${vueTennisPage(D)}</div>`;
    if (h.__pzH !== html) { h.innerHTML = html; h.__pzH = html; }
  }
  window.pzTennis = tennisParis;

  /* ======================= OUTILS repris de PronoTracker ======================= */

  /* --- Paires de combinés (mêmes règles que PronoTracker : championnats exclus et refus respectés) --- */
  const RG_AUTO_CMB = 'pronotracker_autoCombos', RG_DELAI = 'pronotracker_auto_delai', RG_SIG = 'pronotracker_auto_sig';
  const delaiMin = () => { const s = lsGet(RG_DELAI); if (s === null) return 5; const v = parseInt(s, 10); return v >= 0 ? v : 5; };
  const autoCmbOn = () => lsGet(RG_AUTO_CMB) === '1';
  function pairesDuJour(sp, j) {
    const exc = stGenExclus(), refus = refusSet(), S = lireN(), dans = new Set();
    (S.combos[sp] || []).forEach(c => (c.legIds || []).forEach(id => dans.add(String(id))));
    const el = (S[sp] || []).filter(b => b.date === j && b.status === 'Pending' && !b.comboId && !dans.has(String(b.id)) && !exc.has((b.comp || '').trim()) && !refus.has(String(b.id))).map(b => Object.assign({}, b, { odds: +b.odds || 1 }));
    const pr = paires(el), pris = new Set(pr.flat().map(b => String(b.id)));
    return { paires: pr, restes: el.filter(b => !pris.has(String(b.id))), exclus: (S[sp] || []).filter(b => b.date === j && b.status === 'Pending' && !b.comboId && exc.has((b.comp || '').trim())) };
  }
  function pairesAVenir(sp) { const auj = jour(), S = lireN(); const js = [...new Set((S[sp] || []).filter(b => b.status === 'Pending' && b.date >= auj && !b.comboId).map(b => b.date))].sort(); return js.flatMap(j => pairesDuJour(sp, j).paires); }
  function creerPaires(sp, pr, msg) {
    if (!pr.length) return;
    muter(S => { const base = Date.now(); pr.forEach(([x, y], k) => { const bx = S[sp].find(b => String(b.id) === String(x.id)), by = S[sp].find(b => String(b.id) === String(y.id)); if (!bx || !by || bx.comboId || by.comboId) return; const c = { id: base + k, stake: +bx.stake > 0 ? +bx.stake : 1, legIds: [bx.id, by.id], createdAt: new Date().toISOString() }; bx.comboId = c.id; by.comboId = c.id; S.combos[sp].push(c); }); }, msg);
  }
  // combinés automatiques avec délai : on attend la fin de ta saisie (le délai repart à zéro dès que la liste change)
  let autoInfo = '';
  // pourquoi rien ne se combine : désactivé, ou aucune paire entre 2,00 et 3,00 (on donne la meilleure trouvée)
  function autoPourquoi() {
    const auj = jour(), S = lireN(), dans = new Set(), refus = refusSet(); (S.combos.football || []).forEach(c => (c.legIds || []).forEach(id => dans.add(String(id))));
    const T = (S.football || []).filter(b => b.date === auj && b.status === 'Pending' && !b.comboId && !dans.has(String(b.id)) && !refus.has(String(b.id)) && +b.odds > 1);
    if (T.length < 2) return '';
    if (!autoCmbOn()) return `ℹ️ ${T.length} paris simples aujourd'hui : coche « Créer les combinés tout seuls » (Réglages) pour qu'ils se combinent automatiquement.`;
    const exc = stGenExclus(), X = T.filter(b => exc.has((b.comp || '').trim())), L = T.filter(b => !exc.has((b.comp || '').trim()));
    const cl = [...new Set(X.map(b => (b.comp || '').trim()))], comps = cl.length > 1 ? cl.slice(0, -1).join(', ') + ' et ' + cl[cl.length - 1] : (cl[0] || '');
    const txtX = X.length ? `${X.length} pari${X.length > 1 ? 's' : ''} en ${comps} : pas de combiné automatique pour ${cl.length > 1 ? 'ces compétitions' : 'cette compétition'}` : '';
    if (L.length < 2) return `ℹ️ Aucun combiné automatique : ${txtX}${L.length === 1 ? ` (il ne reste qu'un pari ailleurs : « ${L[0].match} »)` : ''}.`;
    let best = 0; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (norm(L[i].match) !== norm(L[j].match)) { const c = L[i].odds * L[j].odds; if (c <= 3 && c > best) best = c; }
    return `ℹ️ Aucun combiné automatique possible : il faut deux paris dont la cote ensemble fait entre 2,00 et 3,00${best ? ` (meilleure paire aujourd'hui : ${cote(Math.round(best * 100) / 100)})` : ''}${txtX ? ` · ${txtX}` : ''}.`;
  }
  function autoExclusTxt() { try { const auj = jour(), exc = stGenExclus(), n = (lireN().football || []).filter(b => b.date === auj && b.status === 'Pending' && !b.comboId && exc.has((b.comp || '').trim())).length; return n ? ` · ${n} pari${n > 1 ? 's' : ''} en Ligue 2 / Europa / Conférence laissé${n > 1 ? 's' : ''} de côté` : ''; } catch (e) { return ''; } }
  function autoCombos(force) {
    autoInfo = '';
    if (!autoCmbOn()) { autoInfo = autoPourquoi(); return; }
    const pr = pairesAVenir('football');
    if (!pr.length) { try { localStorage.removeItem(RG_SIG); } catch (e) {} autoInfo = autoPourquoi(); return; }
    const sig = pr.flat().map(b => b.id).join(',');
    let st = null; try { st = JSON.parse(lsGet(RG_SIG) || 'null'); } catch (e) {}
    if (!st || st.sig !== sig) { st = { sig, t: Date.now() }; try { localStorage.setItem(RG_SIG, JSON.stringify(st)); } catch (e) {} }
    const reste = delaiMin() * 60000 - (Date.now() - st.t);
    if (!force && reste > 0) { const mm = Math.floor(reste / 60000), ss = String(Math.floor(reste / 1000) % 60).padStart(2, '0'); autoInfo = `⏳ ${pr.length} combiné${pr.length > 1 ? 's' : ''} automatique${pr.length > 1 ? 's' : ''} dans ${mm}:${ss} (le temps que tu finisses de saisir)${autoExclusTxt()}`; return; }
    try { localStorage.removeItem(RG_SIG); } catch (e) {}
    creerPaires('football', pr, pr.length + ' combiné(s) créé(s) automatiquement');
  }
  setInterval(() => { try { if (typeof ui !== 'undefined' && ui.sport === 'foot' && !document.getElementById('pzOv') && !document.hidden) { const avant = autoInfo; autoCombos(false); const el = document.getElementById('pz-autoinfo'); if (el && autoInfo) el.firstChild.textContent = autoInfo; else if (window.__pzVue && filtre === 'cours' && !!autoInfo !== !!el) decorer(); } } catch (e) {} }, 1000);

  /* --- Générateur de combinés (choix du jour et des paires) --- */
  let GEN = null;
  function vueGenerateur(j) {
    const sp = SP(), S = lireN(), auj = jour();
    const jours = [...new Set((S[sp] || []).filter(b => b.status === 'Pending' && b.date >= auj && !b.comboId).map(b => b.date))].sort();
    j = j || (GEN && GEN.j) || jours[0] || auj;
    const P = pairesDuJour(sp, j); GEN = { j, sp, paires: P.paires, on: P.paires.map(() => true) };
    const ligne = (x, y, i) => `<label class="pz-gen"><input type="checkbox" data-pz="genon" data-i="${i}" checked><span><b>${esc(x.match)}</b> · ${esc(x.prono)} (${cote(x.odds)})<br><b>${esc(y.match)}</b> · ${esc(y.prono)} (${cote(y.odds)})</span><b class="pz-cote">${cote(x.odds * y.odds)}</b></label>`;
    ov(`<div class="pz-fm"><h3>✨ Générer les combinés</h3><p class="mut" style="margin:0 0 8px">Les paris simples du jour sont associés par 2 pour que la cote du combiné tombe autour de 2,00 à 2,40 (jamais sous 2,00, jamais deux fois le même match). Les championnats exclus ne sont pas utilisés.</p>
      <div class="row pz-chips">${jours.length ? jours.map(d => `<button class="${d === j ? '' : 'sec'} pz-ib" data-pz="genjour" data-k="${d}">${esc(libJour(Date.parse(d + 'T12:00:00')))}</button>`).join('') : '<span class="mut">Aucun pari simple en attente.</span>'}</div>
      ${P.paires.length ? P.paires.map(([x, y], i) => ligne(x, y, i)).join('') : '<p class="mut">Aucune paire possible ce jour-là.</p>'}
      ${P.restes.length ? `<p class="mut pz-hint">Restent seuls : ${P.restes.map(b => esc(b.match) + ' (' + cote(b.odds) + ')').join(' · ')}</p>` : ''}${P.exclus.length ? `<p class="mut pz-hint">Championnats exclus : ${P.exclus.length} pari(s) non utilisé(s).</p>` : ''}
      <div class="pz-fa"><span style="flex:1"></span><button class="sec" data-pz="cancel">Fermer</button>${P.paires.length ? '<button data-pz="genok">Créer les combinés cochés</button>' : ''}</div></div>`);
  }

  /* --- Vérifier mes résultats : cohérence + comparaison aux scores finaux ESPN --- */
  const VR_IGN = 'pronotracker_verif_ignores';
  let VR = { per: 'tout', res: null, msg: '' };
  const vrN = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const vrEq = m => { const p = String(m || '').split(/\s+(?:vs\.?|contre|-|–)\s+/i); return p.length >= 2 ? [p[0].trim(), p[1].trim()] : null; };
  const vrLib = s => (s === 'Won' ? 'Gagné' : s === 'Lost' ? 'Perdu' : s === 'Pending' ? 'En cours' : 'Annulé');
  function vrBornes() {
    const t = new Date(); t.setHours(12, 0, 0, 0); const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (VR.per === '7' || VR.per === '30') { const d = new Date(t); d.setDate(d.getDate() - +VR.per + 1); return [iso(d), '']; }
    if (VR.per === 'mois') return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
    if (VR.per === 'mois-1') return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))];
    return ['', ''];
  }
  function vrPick(txt, home, away) { const [h, a] = cote2(txt, home, away); return h ? 'H' : a ? 'A' : null; }
  function vrParse(b) {
    const eq = vrEq(b.match); if (!eq) return { kind: 'x', why: 'nom du match illisible (« Équipe A - Équipe B » attendu)' };
    const [home, away] = eq, marche = vrN(b.market), prono = vrN(b.prono), txt = marche + ' | ' + prono, mt = /\bmt\b|mi.?temps|1ere mi|1re mi|premiere mi/.test(txt);
    if (/buteur|scorer|premier but|joueur/.test(marche)) return { kind: 'x', why: 'marché « Buteur » (les buteurs ne sont pas disponibles)' };
    if (/corner|carton|jaune|rouge|tirs?\b|faute|passe|possession|hors.?jeu|penalt/.test(txt)) return { kind: 'x', why: 'marché non lié au score (corners, cartons, tirs…)' };
    let m = /(plus d[e']\s*|over\s*)(\d+(?:[.,]\d+)?)/.exec(prono) || /(\+)\s*(\d+(?:[.,]\d+)?)\s*buts?/.exec(prono), dir = m ? 'plus' : null;
    if (!m) { m = /(moins d[e']\s*|under\s*)(\d+(?:[.,]\d+)?)/.exec(prono) || /(-)\s*(\d+(?:[.,]\d+)?)\s*buts?/.exec(prono); dir = m ? 'moins' : null; }
    if (m) { if (vrPick(prono.slice(0, m.index).replace(/\(.*?\)/g, ''), home, away)) return { kind: 'x', why: 'total de buts d\'une seule équipe' }; const line = parseFloat(m[2].replace(',', '.')); if (!Number.isFinite(line) || Math.round(line * 2) !== line * 2) return { kind: 'x', why: 'ligne en quart de but (non gérée)' }; return { kind: 'ou', dir, line, mt }; }
    if (/btts|deux equipes|both teams/.test(txt)) return { kind: 'btts', yes: !/ne marque pas|ne marquent pas|\bnon\b|\bno\b|pas de but/.test(prono), mt };
    const dcM = /double chance/.test(marche); let set = null;
    if (/(^|[^a-z0-9])(1x|x1|1n|n1)([^a-z0-9]|$)/.test(prono)) set = ['H', 'D']; else if (/(^|[^a-z0-9])(x2|2x|n2|2n)([^a-z0-9]|$)/.test(prono)) set = ['D', 'A']; else if (/(^|[^a-z0-9])(12|1-2)([^a-z0-9]|$)/.test(prono) && dcM) set = ['H', 'A'];
    else if (/\sou\s/.test(prono)) { const pk = prono.replace(/\(.*?\)/g, '').split(/\s+ou\s+/).map(p => p.replace(/\b(victoire|gagne|double chance)\b/g, '').trim()).map(p => (/^(match )?nul$|^draw$|^x$/.test(p) ? 'D' : vrPick(p, home, away))).filter(Boolean); if (pk.length === 2 && pk[0] !== pk[1]) set = pk; }
    if (set) return { kind: 'dc', set, mt };
    if (dcM) return { kind: 'x', why: 'double chance non reconnue' };
    const clean = prono.replace(/\(.*?\)/g, '').replace(/\b(victoire|gagne|gagnant|vainqueur|win|de|du|des|la|le)\b/g, ' ').replace(/\s+/g, ' ').trim(), est = /1n2|resultat|vainqueur|1x2|mi.?temps/.test(marche) || /^(match )?nul$/.test(clean) || mt;
    if (/^(match )?nul$|^draw$|^x$/.test(clean)) return { kind: '1n2', pick: 'D', mt };
    const pk = vrPick(clean, home, away); if (pk && (est || /victoire|gagne|vainqueur/.test(prono))) return { kind: '1n2', pick: pk, mt };
    if (est) return { kind: 'x', why: 'équipe du pronostic non reconnue' };
    return { kind: 'x', why: 'marché non géré (« ' + (b.market || 'Autre') + ' »)' };
  }
  function vrVerdict(sel, sc) {
    if (sel.mt && !sc.mt) return { res: null, why: 'score à la mi-temps indisponible' };
    if (!sel.mt && sc.extra) return { res: null, why: 'prolongations / tirs au but : le résultat à 90 minutes n\'est pas disponible' };
    const hh = sel.mt ? sc.mt.h : sc.h, aa = sel.mt ? sc.mt.a : sc.a, T = hh + aa, sco = `Score ${sel.mt ? 'à la mi-temps' : 'final'} ${hh}-${aa}`, out = hh > aa ? 'H' : hh < aa ? 'A' : 'D';
    if (sel.kind === '1n2') return { res: out === sel.pick ? 'Won' : 'Lost', why: sco };
    if (sel.kind === 'dc') return { res: sel.set.includes(out) ? 'Won' : 'Lost', why: sco };
    if (sel.kind === 'btts') { const both = hh > 0 && aa > 0; return { res: both === sel.yes ? 'Won' : 'Lost', why: sco + (both ? ' (les deux équipes ont marqué)' : ' (une équipe n\'a pas marqué)') }; }
    if (sel.kind === 'ou') { if (T === sel.line) return { res: null, why: sco + ' : ligne atteinte pile (pari remboursé)' }; const plus = T > sel.line; return { res: (sel.dir === 'plus') === plus ? 'Won' : 'Lost', why: sco + ' : ' + T + ' but(s)' }; }
    return { res: null, why: 'pari non vérifiable' };
  }
  function vrCoherence(bets, combos) {
    const out = [], today = jour(), lim = new Date(); lim.setDate(lim.getDate() - 3); const vieux = lim.toISOString().slice(0, 10), seen = {};
    const add = (niv, b, titre, det) => out.push({ niv, b: b || null, titre, det: det || '' });
    bets.forEach(b => {
      const d = String(b.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) add('erreur', b, 'Date manquante ou invalide');
      if (!(+b.stake > 0)) add('erreur', b, 'Mise manquante ou à 0');
      if (!(+b.odds >= 1.01)) add('erreur', b, 'Cote invalide', 'Cote : ' + (b.odds == null || b.odds === '' ? 'vide' : b.odds)); else if (+b.odds > 50) add('doute', b, 'Cote très élevée', 'Cote : ' + b.odds + ' (faute de frappe possible ?)');
      if (!['Won', 'Lost', 'Pending', 'ABORTED'].includes(b.status)) add('erreur', b, 'Statut inconnu', 'Statut : ' + b.status);
      if ((b.status === 'Won' || b.status === 'Lost') && d > today) add('erreur', b, 'Marqué ' + vrLib(b.status) + ' alors que le match n\'a pas encore eu lieu', 'Date du match : ' + stFdf(d));
      if (b.status === 'Pending' && d && d < vieux) add('info', b, 'Toujours « En cours » plus de 3 jours après le match', 'À régler : ' + stFdf(d));
      if (!vrEq(b.match)) add('doute', b, 'Nom du match sans « Équipe A - Équipe B »');
      if (!(b.comp || '').trim()) add('doute', b, 'Championnat vide');
      const k = [d, vrN(b.match), vrN(b.market), vrN(b.prono)].join('|'); (seen[k] ||= []).push(b);
    });
    Object.values(seen).filter(l => l.length > 1).forEach(l => l.slice(1).forEach(b => add('doute', b, 'Doublon possible', 'Même match, même pronostic qu\'un autre pari')));
    const pm = {}; bets.filter(b => b.status === 'Won').forEach(b => { (pm[String(b.date).slice(0, 10) + '|' + vrN(b.match)] ||= []).push(b); });
    Object.values(pm).forEach(l => { if (l.length < 2) return; const s = l.map(b => ({ b, s: vrParse(b) })); for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) { const x = s[i].s, y = s[j].s; let bad = false; if (x.kind === y.kind && !x.mt === !y.mt) { if (x.kind === '1n2' && x.pick !== y.pick) bad = true; if (x.kind === 'btts' && x.yes !== y.yes) bad = true; if (x.kind === 'ou' && x.dir !== y.dir) { const p = x.dir === 'plus' ? x : y, m = x.dir === 'plus' ? y : x; if (m.line <= p.line) bad = true; } if (x.kind === 'dc' && !x.set.some(v => y.set.includes(v))) bad = true; } if (bad) add('erreur', s[j].b, 'Deux pronostics contradictoires marqués « Gagné » sur le même match', (s[i].b.prono || '?') + ' / ' + (s[j].b.prono || '?')); } });
    const parId = new Map(bets.map(b => [String(b.id), b])), dc = {};
    (combos || []).forEach(c => { const ids = c.legIds || [], legs = ids.map(i => parId.get(String(i))).filter(Boolean);
      if (legs.length < ids.length) add('erreur', null, 'Combiné : sélection introuvable', (ids.length - legs.length) + ' sélection(s) ne correspondent plus à un pari existant');
      if (!(+c.stake > 0)) add('erreur', null, 'Combiné : mise manquante ou à 0');
      const ms = legs.map(l => String(l.date).slice(0, 10) + '|' + vrN(l.match)); if (new Set(ms).size < ms.length) add('doute', null, 'Combiné : deux sélections sur le même match', legs.map(l => l.match).join(' + '));
      ids.forEach(id => { (dc[String(id)] ||= []).push(c.id); }); });
    Object.keys(dc).filter(k => dc[k].length > 1).forEach(k => { const b = parId.get(k); if (b) add('doute', b, 'Sélection utilisée dans plusieurs combinés'); });
    bets.filter(b => b.comboId && !(combos || []).some(c => String(c.id) === String(b.comboId))).forEach(b => add('erreur', b, 'Rattaché à un combiné qui n\'existe plus'));
    return out;
  }
  async function vrLancer() {
    VR.msg = 'Contrôle de cohérence…'; VR.res = null; vueVerif();
    const [mn, mx] = vrBornes(), dans = b => { const d = String(b.date || '').slice(0, 10); return !!d && (!mn || d >= mn) && (!mx || d <= mx); };
    const S = lireN(), tous = S.football.filter(dans), combos = S.combos.football.filter(c => (c.legIds || []).some(id => { const b = S.football.find(x => String(x.id) === String(id)); return !b || dans(b); }));
    const res = { total: tous.length, coh: vrCoherence(tous, combos), ok: [], ko: [], nv: [] };
    const regles = tous.filter(b => b.status === 'Won' || b.status === 'Lost').map(b => ({ b, sel: vrParse(b), slug: slugEspn(b.comp) }));
    const aV = regles.filter(p => p.sel.kind !== 'x' && p.slug);
    // scores : un tableau ESPN par championnat et par jour (J-1, J, J+1, puis J-3…J+5 pour un match décalé)
    const charger = async cles => { const todo = [...cles].filter(k => _extT[k] == null || (_extT[k] === 0)); todo.forEach(k => { _extT[k] = 0; }); let f = 0; for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(async k => { _extT[k] = Date.now(); const [lg, j] = k.split('|'); try { const r = await fetch(ESPN + lg + '/scoreboard?dates=' + j.replace(/-/g, ''), { cache: 'no-store' }); if (r.ok) { const d = await r.json(); _ext[k] = (d.events || []).map(e => extMatch(e, lg)).filter(Boolean); } } catch (e) {} f++; VR.msg = 'Récupération des scores : ' + f + '/' + todo.length; vueVerif(true); })); };
    const decal = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('fr-CA'); };
    const trouver = (b, ec) => { const [h, a] = cotes(b.match), L = []; ec.forEach(n => (_ext[b.slug + '|' + decal(b.date, n)] || []).forEach(m => L.push(m))); return L.find(m => pareil(h, m.hn) && pareil(a, m.an)) || (L.find(m => pareil(h, m.an) && pareil(a, m.hn)) ? Object.assign({ sw: 1 }, L.find(m => pareil(h, m.an) && pareil(a, m.hn))) : null); };
    const cles = new Set(); aV.forEach(p => { p.b.slug = p.slug; [-1, 0, 1].forEach(n => cles.add(p.slug + '|' + decal(p.b.date, n))); });
    await charger(cles);
    const rates = aV.filter(p => !trouver(p.b, [0, -1, 1])), c2 = new Set(); rates.forEach(p => [-3, -2, 2, 3, 4, 5].forEach(n => c2.add(p.slug + '|' + decal(p.b.date, n))));
    if (c2.size) await charger(c2);
    const ign = (() => { try { return JSON.parse(lsGet(VR_IGN) || '{}'); } catch (e) { return {}; } })();
    regles.forEach(({ b, sel, slug }) => {
      if (sel.kind === 'x') return res.nv.push({ b, why: sel.why });
      if (!slug) return res.nv.push({ b, why: 'championnat non couvert par ESPN (« ' + (b.comp || 'vide') + ' »)' });
      const m = trouver(b, [0, -1, 1, -3, -2, 2, 3, 4, 5]); if (!m) return res.nv.push({ b, why: 'match introuvable chez ESPN (noms d\'équipes ou date ?)' });
      if (!(m.done || m.st === 'post')) return res.nv.push({ b, why: 'match pas encore terminé selon ESPN' });
      const sw = x => x && { h: x.a, a: x.h }, sc = m.sw ? { h: m.as, a: m.hs, mt: sw(m.ht), extra: false } : { h: m.hs, a: m.as, mt: m.ht, extra: false };
      if (/AET|PEN|SHOOT|EXTRA/i.test(m.det || '')) sc.extra = true;
      const v = vrVerdict(sel, sc);
      if (v.res == null) return res.nv.push({ b, why: v.why });
      if (v.res === b.status) return res.ok.push({ b, why: v.why });
      const sig = b.status + '|' + sc.h + '-' + sc.a; if (ign[b.id] === sig) return;
      res.ko.push({ b, att: v.res, why: v.why, sig });
    });
    VR.res = res; VR.msg = ''; vueVerif(true);
  }
  function vueVerif(maj) {
    if (maj && !document.querySelector('#pzOv .pz-vr')) return;   // fenêtre fermée pendant la recherche : on ne la rouvre pas
    const r = VR.res, per = [['tout', 'Tout'], ['7', '7 jours'], ['30', '30 jours'], ['mois', 'Ce mois-ci'], ['mois-1', 'Mois dernier']];
    const L = b => `${esc(b.match || '?')} · ${esc(b.market || '')}${b.prono ? ' : ' + esc(b.prono) : ''} · cote ${cote(b.odds)} · ${stFdf(b.date)}`;
    let corps = '';
    if (VR.msg) corps = `<p class="mut">⏳ ${esc(VR.msg)}</p>`;
    else if (!r) corps = `<p class="mut" style="margin:0">Contrôle d'abord la <b>cohérence</b> de tes paris (mises, cotes, dates, doublons, combinés…), puis compare tes paris <b>déjà réglés</b> aux <b>scores finaux</b> (ESPN). Rien n'est modifié sans ton accord.</p>`;
    else {
      const coh = r.coh, er = coh.filter(x => x.niv === 'erreur'), dt = coh.filter(x => x.niv === 'doute'), inf = coh.filter(x => x.niv === 'info');
      const bloc = (t, a, cls) => a.length ? `<h3 class="pz-h3 ${cls || ''}">${t} (${a.length})</h3>${a.map(x => `<div class="pz-vrl"><b>${esc(x.titre)}</b>${x.det ? ` <span class="mut">· ${esc(x.det)}</span>` : ''}${x.b ? `<small class="mut">${L(x.b)}</small>` : ''}${x.b ? `<button class="sec pz-ib" data-pz="edit" data-id="${esc(x.b.id)}">✎ Modifier</button>` : ''}</div>`).join('')}` : '';
      corps = `<div class="pz-bil pz-big pz-six">${tuile('Paris contrôlés', r.total)}${tuile('Scores confirmés', r.ok.length, 'pz-pos')}${tuile('À corriger', r.ko.length, r.ko.length ? 'pz-neg' : '')}${tuile('Non vérifiables', r.nv.length)}${tuile('Erreurs', er.length, er.length ? 'pz-neg' : '')}${tuile('Doutes', dt.length)}</div>
        ${r.ko.length ? `<h3 class="pz-h3 pz-neg">Résultat différent du score (${r.ko.length})</h3>${r.ko.map(x => `<div class="pz-vrl"><b>Noté ${vrLib(x.b.status)} · devrait être ${vrLib(x.att)}</b> <span class="mut">· ${esc(x.why)}</span><small class="mut">${L(x.b)}</small><span><button class="pz-ib" data-pz="vrfix" data-id="${esc(x.b.id)}">Corriger</button> <button class="sec pz-ib" data-pz="vrign" data-id="${esc(x.b.id)}">Ignorer</button></span></div>`).join('')}<div class="pz-fa"><button data-pz="vrall">Tout corriger (${r.ko.length})</button></div>` : '<p class="pz-pos"><b>✅ Aucun pari réglé ne contredit les scores.</b></p>'}
        ${bloc('Erreurs', er, 'pz-neg')}${bloc('Doutes', dt)}${bloc('À régler', inf)}
        ${r.nv.length ? `<details class="pz-det2"><summary>Non vérifiables (${r.nv.length})</summary>${r.nv.map(x => `<div class="pz-vrl"><small class="mut">${L(x.b)} — ${esc(x.why)}</small></div>`).join('')}</details>` : ''}`;
    }
    ov(`<div class="pz-fm pz-vr"><h3>🔎 Vérifier mes résultats (foot)</h3><div class="row pz-chips">${per.map(([k, l]) => `<button class="${VR.per === k ? '' : 'sec'} pz-ib" data-pz="vrper" data-k="${k}">${l}</button>`).join('')}</div>${corps}
      <div class="pz-fa"><span style="flex:1"></span><button class="sec" data-pz="cancel">Fermer</button>${VR.msg ? '' : `<button data-pz="vrgo">${r ? 'Relancer' : 'Lancer la vérification'}</button>`}</div></div>`);
  }

  /* --- Vérifier les championnats : un pari mal classé par rapport aux autres paris des mêmes équipes --- */
  const VC_IGN = 'pronotracker_comp_ignores';
  const vcEurope = c => /champions|europa|conf[ée]rence|coupe|cup|supercoupe/i.test(c || '');
  function vcAnalyser() {
    const S = lireN(), bets = S.football.filter(b => b.match), info = bets.map(b => ({ b, comp: (b.comp || '').trim(), eq: cotes(b.match).slice(0, 2) }));
    let ig; try { ig = new Set(JSON.parse(lsGet(VC_IGN) || '[]').map(String)); } catch (e) { ig = new Set(); }
    const top = (nom, sauf) => { const c = {}; info.forEach(o => { if (o.b === sauf || !o.comp || vcEurope(o.comp)) return; if (o.eq.some(t => proche(t, nom) && proche(nom, t))) c[o.comp] = (c[o.comp] || 0) + 1; }); const k = Object.keys(c).sort((x, y) => c[y] - c[x]); return k.length && c[k[0]] >= 2 ? { comp: k[0], n: c[k[0]], tout: c } : null; };
    const deviner = (h, a) => { const m = matchs().find(x => pareil(h, x.hn) && pareil(a, x.an)) || matchs().find(x => pareil(h, x.hn) || pareil(h, x.an)); return m ? (FLGN[m.lg] || '') : ''; };
    const grp = {}; info.forEach(o => { (grp[o.b.date + '|' + vrN(o.b.match)] ||= new Set()).add(o.comp); });
    const out = [];
    info.forEach(o => {
      if (ig.has(String(o.b.id))) return;
      const [h, a] = o.eq; let sugg = null, why = '';
      if (!o.comp) { sugg = h && a ? deviner(h, a) : ''; why = 'Championnat vide'; }
      else if (h && a) {
        const th = top(h, o.b), ta = top(a, o.b);
        if (th && ta && th.comp === ta.comp && th.comp !== o.comp) { sugg = th.comp; why = `Les deux équipes jouent ailleurs en ${th.comp} (${th.n} et ${ta.n} paris)`; }
        else if (!vcEurope(o.comp)) { const un = th && !ta ? th : ta && !th ? ta : null; if (un && un.n >= 3 && !un.tout[o.comp] && un.comp !== o.comp) { sugg = un.comp; why = `Une des équipes est toujours notée ${un.comp} (${un.n} paris)`; } }
      }
      const g = grp[o.b.date + '|' + vrN(o.b.match)]; if (!why && g && g.size > 1) { sugg = o.comp; why = 'Ce même match existe avec deux championnats différents'; }
      if (why) out.push({ b: o.b, sugg: sugg || '', why });
    });
    return out.sort((x, y) => (y.b.date || '').localeCompare(x.b.date || ''));
  }
  function vueVerifComp() {
    const L = vcAnalyser();
    ov(`<div class="pz-fm pz-vr"><h3>🏷️ Vérifier les championnats</h3><p class="mut" style="margin:0 0 8px">Compare le championnat de chaque pari avec celui des autres paris des mêmes équipes. Les matchs de coupe d'Europe entre équipes de pays différents sont considérés normaux.</p>
      ${L.length ? `<p><b>${L.length} pari(s) à vérifier</b></p>` + L.map(x => `<div class="pz-vrl"><b>${esc(x.b.match)}</b> <span class="mut">· ${stFdf(x.b.date)} · noté « ${esc(x.b.comp || 'vide')} »</span><small class="mut">${esc(x.why)}</small><span class="pz-fa" style="margin:0"><input class="pz-sel" id="pz-vc-${esc(x.b.id)}" value="${esc(x.sugg)}" placeholder="Championnat"><button class="pz-ib" data-pz="vcfix" data-id="${esc(x.b.id)}">Appliquer</button><button class="sec pz-ib" data-pz="vcign" data-id="${esc(x.b.id)}">Ignorer</button></span></div>`).join('') : '<p class="pz-pos"><b>✅ Aucune incohérence trouvée.</b></p>'}
      <div class="pz-fa"><span style="flex:1"></span><button class="sec" data-pz="cancel">Fermer</button></div></div>`);
  }

  /* --- Exporter l'historique (Excel .xlsx ou CSV), avec période et statuts --- */
  const EH = { per: 'tout', du: '', au: '', fmt: 'xlsx', combos: true, st: { Won: true, Lost: true, Pending: true, Autre: true } };
  function ehDonnees() {
    const t = new Date(), iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let mn = '', mx = '';
    if (EH.per === '7' || EH.per === '30') { const d = new Date(t); d.setDate(d.getDate() - +EH.per + 1); mn = iso(d); }
    else if (EH.per === 'mois') { mn = iso(new Date(t.getFullYear(), t.getMonth(), 1)); mx = iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)); }
    else if (EH.per === 'mois-1') { mn = iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)); mx = iso(new Date(t.getFullYear(), t.getMonth(), 0)); }
    else if (EH.per === 'perso') { mn = EH.du; mx = EH.au; }
    const okD = d => !!d && (!mn || d >= mn) && (!mx || d <= mx), okS = s => !!EH.st[(s === 'Won' || s === 'Lost' || s === 'Pending') ? s : 'Autre'];
    const S = lireN(), sp = SP(), bets = S[sp].filter(b => okD(String(b.date || '').slice(0, 10)) && okS(b.status)).sort((a, b) => String(a.date).localeCompare(String(b.date)) || (+a.id || 0) - (+b.id || 0));
    const parId = new Map(S[sp].map(b => [String(b.id), b]));
    const combos = EH.combos ? S.combos[sp].map(c => { const legs = (c.legIds || []).map(i => parId.get(String(i))).filter(Boolean), status = legs.some(l => l.status === 'Lost') ? 'Lost' : legs.length && legs.every(l => l.status === 'Won') ? 'Won' : 'Pending', odds = legs.reduce((p, l) => p * (+l.odds || 1), 1), stake = +c.stake || 0; return { c, legs, date: legs.reduce((m, l) => (l.date && l.date > m ? String(l.date).slice(0, 10) : m), ''), status, odds, stake, profit: status === 'Won' ? stake * (odds - 1) : status === 'Lost' ? -stake : 0 }; }).filter(r => r.legs.length && okD(r.date) && okS(r.status)).sort((a, b) => a.date.localeCompare(b.date)) : [];
    return { bets, combos, sp };
  }
  const ehLib = s => (s === 'Won' ? 'Gagné' : s === 'Lost' ? 'Perdu' : s === 'Pending' ? 'En cours' : 'Annulé'), r2 = v => Math.round(v * 100) / 100;
  function ehStats(items) { const reg = items.filter(i => i.status === 'Won' || i.status === 'Lost'), w = reg.filter(i => i.status === 'Won').length, mise = reg.reduce((s, i) => s + i.stake, 0), profit = reg.reduce((s, i) => s + i.profit, 0); return { n: items.length, w, l: reg.length - w, p: items.filter(i => i.status === 'Pending').length, taux: reg.length ? w / reg.length : null, mise: r2(mise), profit: r2(profit), roi: mise ? profit / mise : null, cote: items.length ? r2(items.reduce((s, i) => s + i.odds, 0) / items.length) : null }; }
  function ehLignes(d) {
    const P = d.bets.map(b => [String(b.date || '').slice(0, 10), b.match || '', b.comp || '', b.market || '', b.prono || '', +b.odds || 0, +b.stake || 0, ehLib(b.status), (b.status === 'Won' || b.status === 'Lost') ? r2(stGain(b)) : '', b.comboId ? 'Combiné #' + b.comboId : 'Simple', b.id]);
    const C = d.combos.map(r => [r.date, r.legs.length, r.legs.map(l => (l.match || '?') + ' — ' + (l.prono || '?') + ' @' + (+l.odds || 0).toFixed(2)).join(' | '), r2(r.odds), r.stake, ehLib(r.status), (r.status === 'Won' || r.status === 'Lost') ? r2(r.profit) : '', r.c.id]);
    return { P, C };
  }
  function chargerXlsx() { return new Promise((ok, ko) => { if (window.XlsxLite) return ok(); const s = document.createElement('script'); s.src = 'xlsx.js'; s.onload = () => ok(); s.onerror = () => ko(new Error('xlsx.js introuvable')); document.head.appendChild(s); }); }
  async function ehTelecharger() {
    const d = ehDonnees(); if (!d.bets.length && !d.combos.length) return;
    const { P, C } = ehLignes(d), jourF = jour(), nom = `pronos-historique_${EH.per}_${jourF}.${EH.fmt}`;
    let blob;
    if (EH.fmt === 'xlsx') {
      try { await chargerXlsx(); } catch (e) { toast('Export Excel indisponible (fichier xlsx.js manquant). Choisis CSV.'); return; }
      const simples = d.bets.map(b => ({ status: b.status, odds: +b.odds || 0, stake: +b.stake || 0, profit: stGain(b), comp: (b.comp || '').trim() || 'Sans championnat' })), sS = ehStats(simples), sC = ehStats(d.combos);
      const kv = (l, a, b, f) => [{ v: l, b: true }, { v: a, f }, { v: b, f }], pc = {}; simples.forEach(s => (pc[s.comp] ||= []).push(s));
      const sheets = [{ name: 'Paris', header: ['Date', 'Match', 'Compétition', 'Marché', 'Pronostic', 'Cote', 'Mise (€)', 'Statut', 'Profit (€)', 'Compte dans', 'ID'], widths: [12, 34, 22, 18, 26, 8, 10, 11, 11, 16, 15], fmts: ['date', 'text', 'text', 'text', 'text', 'num', 'money', 'text', 'money', 'text', 'int'], rows: P }];
      if (EH.combos) sheets.push({ name: 'Combinés', header: ['Date', 'Nb sélections', 'Sélections', 'Cote totale', 'Mise (€)', 'Statut', 'Profit (€)', 'ID'], widths: [12, 14, 70, 12, 10, 11, 11, 15], fmts: ['date', 'int', 'text', 'num', 'money', 'text', 'money', 'int'], rows: C });
      sheets.push({ name: 'Résumé', header: ['', 'Paris (Bilan Solo)', 'Combinés (Bilan Combiné)'], widths: [26, 22, 26], plain: true, rows: [kv('Nombre de paris', sS.n, sC.n, 'int'), kv('Gagnés', sS.w, sC.w, 'int'), kv('Perdus', sS.l, sC.l, 'int'), kv('En cours', sS.p, sC.p, 'int'), kv('Taux de réussite', sS.taux, sC.taux, 'pct'), kv('Mise (paris réglés)', sS.mise, sC.mise, 'money'), kv('Profit', sS.profit, sC.profit, 'money'), kv('ROI', sS.roi, sC.roi, 'pct'), kv('Cote moyenne', sS.cote, sC.cote, 'num'), ['', '', ''], [{ v: 'Exporté le', b: true }, new Date().toLocaleString('fr-FR'), '']] });
      sheets.push({ name: 'Par championnat', header: ['Championnat', 'Paris', 'Gagnés', 'Perdus', 'En cours', 'Réussite', 'Mise (€)', 'Profit (€)', 'ROI'], widths: [28, 8, 9, 9, 10, 10, 11, 11, 9], fmts: ['text', 'int', 'int', 'int', 'int', 'pct', 'money', 'money', 'pct'], rows: Object.keys(pc).map(k => ({ k, s: ehStats(pc[k]) })).sort((a, b) => b.s.n - a.s.n).map(({ k, s }) => [k, s.n, s.w, s.l, s.p, s.taux, s.mise, s.profit, s.roi]) });
      blob = new Blob([XlsxLite.build(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } else {
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"', n = v => (v === '' || v == null ? '' : String(r2(+v)).replace('.', ','));
      let out = ['Date', 'Match', 'Compétition', 'Marché', 'Pronostic', 'Cote', 'Mise (€)', 'Statut', 'Profit (€)', 'Compte dans', 'ID'].map(q).join(';') + '\n';
      P.forEach(r => { out += [stFdf(r[0]), r[1], r[2], r[3], r[4]].map(q).join(';') + ';' + n(r[5]) + ';' + n(r[6]) + ';' + q(r[7]) + ';' + n(r[8]) + ';' + q(r[9]) + ';' + q(r[10]) + '\n'; });
      if (EH.combos && C.length) { out += '\n' + ['Date', 'Nb sélections', 'Sélections', 'Cote totale', 'Mise (€)', 'Statut', 'Profit (€)', 'ID'].map(q).join(';') + '\n'; C.forEach(r => { out += [q(stFdf(r[0])), r[1], q(r[2]), n(r[3]), n(r[4]), q(r[5]), n(r[6]), q(r[7])].join(';') + '\n'; }); }
      blob = new Blob(['﻿' + out], { type: 'text/csv;charset=utf-8' });
    }
    let file = null; try { file = new File([blob], nom, { type: blob.type }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Historique des paris' }).catch(er => { if (er && er.name !== 'AbortError') ancre(blob, nom); }); } else ancre(blob, nom);
  }
  function ancre(blob, nom) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1500); }
  function vueExport() {
    const d = ehDonnees(), vide = !d.bets.length && !d.combos.length, ch = (on, l, k, v) => `<button class="${on ? '' : 'sec'} pz-ib" data-pz="eh" data-k="${k}" data-v="${v || ''}">${l}</button>`;
    ov(`<div class="pz-fm"><h3>📊 Exporter l'historique (${d.sp === 'tennis' ? 'tennis' : 'foot'})</h3>
      <h3 class="pz-h3">Période</h3><div class="row pz-chips">${[['tout', 'Tout'], ['7', '7 jours'], ['30', '30 jours'], ['mois', 'Ce mois-ci'], ['mois-1', 'Mois dernier'], ['perso', 'Dates…']].map(([k, l]) => ch(EH.per === k, l, 'per', k)).join('')}</div>
      ${EH.per === 'perso' ? `<div class="pz-fa" style="margin:6px 0 0"><span class="mut">Du</span><input id="pz-eh-du" class="pz-sel" type="date" value="${esc(EH.du)}"><span class="mut">au</span><input id="pz-eh-au" class="pz-sel" type="date" value="${esc(EH.au)}"></div>` : ''}
      <h3 class="pz-h3">Statuts</h3><div class="row pz-chips">${[['Won', 'Gagnés'], ['Lost', 'Perdus'], ['Pending', 'En cours'], ['Autre', 'Annulés']].map(([k, l]) => ch(EH.st[k], l, 'st', k)).join('')}</div>
      <h3 class="pz-h3">Contenu</h3><div class="row pz-chips">${ch(EH.combos, 'Inclure la feuille Combinés', 'combos')}</div>
      <h3 class="pz-h3">Format</h3><div class="row pz-chips">${ch(EH.fmt === 'xlsx', 'Excel / Google Sheets (.xlsx)', 'fmt', 'xlsx')}${ch(EH.fmt === 'csv', 'CSV', 'fmt', 'csv')}</div>
      <p class="mut">${d.bets.length} pari(s)${EH.combos ? ' · ' + d.combos.length + ' combiné(s)' : ''} dans cet export.</p>
      <div class="pz-fa"><span style="flex:1"></span><button class="sec" data-pz="cancel">Fermer</button><button data-pz="ehgo"${vide ? ' disabled' : ''}>⬇️ Télécharger</button></div></div>`);
  }

  /* --- Barre d'impact + résumé du jour (en haut de « En cours ») --- */
  function impactEtResume(D) {
    const sp = SP(), S = lireN(), L = S[sp] || [], auj = jour(), parId = new Map(L.map(b => [String(b.id), b]));
    const g = b => stGain(b), net = L.filter(stReg).reduce((s, b) => s + g(b), 0);
    let pj = 0; L.forEach(b => { if (b.date === auj && stReg(b)) pj += g(b); });
    let pc = 0, netC = 0; (S.combos[sp] || []).forEach(c => { const legs = (c.legIds || []).map(i => parId.get(String(i))).filter(Boolean); if (!legs.length) return; const st = legs.some(l => l.status === 'Lost') ? 'Lost' : legs.every(l => l.status === 'Won') ? 'Won' : 'P', od = legs.reduce((p, l) => p * (+l.odds || 1), 1), k = +c.stake || 0, v = st === 'Won' ? k * (od - 1) : st === 'Lost' ? -k : 0; netC += v; const d = legs.reduce((m, l) => (l.date > m ? l.date : m), ''); if (d === auj) pc += v; });
    const live = D.C.reduce((n, x) => n + x.legs.filter(l => l.m && l.m.st === 'in' && l.b.status === 'Pending').length, 0) + D.ouvertsS.filter(s => s.m && s.m.st === 'in').length;
    const barre = `<div class="pz-imp">${[['Bilan du jour · paris', pj], ['Bilan du jour · combinés', pc]].map(([l, v]) => `<div><span>${l}</span><b class="${stCls(v)}">${eur(v)}</b></div>`).join('')}${live ? `<div class="pz-livek"><span>En direct</span><b>🔴 ${live}</b></div>` : ''}</div>`;
    // projection : ce que rapportent les paris en attente s'ils passent, jour par jour
    const dans = new Set(); (S.combos[sp] || []).forEach(c => (c.legIds || []).forEach(id => dans.add(String(id))));
    const jr = {}, J = d => jr[d] ||= { ns: 0, ms: 0, gs: 0, nc: 0, mc: 0, gc: 0 };
    L.filter(b => b.status === 'Pending' && b.date >= auj && !dans.has(String(b.id)) && !b.comboId && (+b.stake || 0) > 0).forEach(b => { const j = J(b.date); j.ns++; j.ms += +b.stake; j.gs += ((+b.odds || 1) - 1) * b.stake; });
    (S.combos[sp] || []).forEach(c => { const legs = (c.legIds || []).map(i => parId.get(String(i))).filter(Boolean); if (!legs.length || legs.some(l => l.status === 'Lost') || legs.every(l => l.status === 'Won')) return; const d = legs.reduce((m, l) => (l.date > m ? l.date : m), ''); if (d < auj) return; const j = J(d), k = +c.stake || 0; j.nc++; j.mc += k; j.gc += k * (legs.reduce((p, l) => p * (+l.odds || 1), 1) - 1); });
    const nS = L.filter(b => b.date === auj && !dans.has(String(b.id)) && !b.comboId).length, nC = D.C.filter(x => x.jour === auj).length;
    const cel = (n, m, gg, mot) => n ? `<b class="pz-pos">${eur(gg)}</b><small class="mut">${n} ${mot}${n > 1 ? 's' : ''} · mise ${stF2(m)} €</small>` : '<span class="mut">—</span>';
    const jours = Object.keys(jr).sort(), lignes = (jr[auj] ? [auj] : []).concat(jours.filter(d => d > auj).slice(0, 4)).map(d => { const j = jr[d], m = j.ms + j.mc, gg = j.gs + j.gc; return `<tr><td class="l"><b>${d === auj ? '🎯 Aujourd\'hui' : esc(libJour(Date.parse(d + 'T12:00:00')))}</b></td><td>${cel(j.ns, j.ms, j.gs, 'simple')}</td><td>${cel(j.nc, j.mc, j.gc, 'combiné')}</td><td><b class="pz-pos">${eur(gg)}</b><small class="mut">mise ${stF2(m)} € → retour ${stF2(m + gg)} €</small></td></tr>`; });
    const resume = (nS || nC || lignes.length) ? `<div class="card pz-rj"><p style="margin:0 0 6px"><b>Aujourd'hui :</b> ${nS} pari${nS > 1 ? 's' : ''} simple${nS > 1 ? 's' : ''}, ${nC} combiné${nC > 1 ? 's' : ''} <span class="mut">(les paris d'un combiné ne sont comptés que dans leur combiné)</span></p>${lignes.length ? stTab(['', 'Paris simples', 'Combinés', 'Total si tout est bon'], lignes) : ''}</div>` : '';
    if (!resume) return '';
    return `<button class="pz-fold" data-pz="menu" data-k="proj"><span>📅 Gains possibles par jour</span><span>${ouvert('proj') ? '▴ Masquer' : '▾ Afficher'}</span></button>${ouvert('proj') ? resume : ''}`;
  }

  /* --- Secours football-data.org (clé facultative) pour les matchs qu'ESPN ne trouve pas --- */
  const FD_CFG = 'pronotracker_scores_cfg';
  const fdCfg = () => { try { return JSON.parse(lsGet(FD_CFG) || '{}') || {}; } catch (e) { return {}; } };
  function fdMatch(m) {
    const sc = m.score || {}, ft = sc.regularTime || sc.fullTime || {}, ht = sc.halfTime || {}, st = m.status || '';
    const etat = /IN_PLAY|PAUSED|LIVE/.test(st) ? 'in' : /FINISHED|AWARDED/.test(st) ? 'post' : 'pre';
    return { id: 'f' + m.id, ext: true, lg: 'fd', d: m.utcDate, st: etat, sn: /POSTPONED|CANCELLED|SUSPENDED/.test(st) ? st : '', done: etat === 'post', det: st === 'PAUSED' ? 'HT' : '', clk: m.minute ? m.minute + '\'' : '', per: st === 'PAUSED' ? 1 : etat === 'in' ? (m.minute > 45 ? 2 : 1) : 0, hn: (m.homeTeam || {}).name || (m.homeTeam || {}).shortName || '', an: (m.awayTeam || {}).name || (m.awayTeam || {}).shortName || '', hs: +ft.home || 0, as: +ft.away || 0, ht: (etat === 'post' || (etat === 'in' && m.minute > 45)) && ht.home != null ? { h: +ht.home, a: +ht.away } : null, x: { ev: [] } };
  }
  async function fdCharger(j) {
    const c = fdCfg(), key = (c.key || '').trim(); if (!key) return;
    const k = 'fd|' + j; if (_extT[k] != null) return; _extT[k] = Date.now();
    const dec = n => { const x = new Date(j + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('fr-CA'); };
    try { const r = await fetch((c.relay || 'https://api.football-data.org').replace(/\/+$/, '') + '/v4/matches?dateFrom=' + dec(-1) + '&dateTo=' + dec(1), { headers: { 'X-Auth-Token': key } }); if (!r.ok) return; const d = await r.json(); _ext[k] = (d.matches || []).map(fdMatch); cache = null; rafraichir(); } catch (e) {}
  }

  /* --- Ce qu'il manque pour gagner (match en cours) --- */
  function besoin(b, m) {
    if (!m || m.st !== 'in' || b.status !== 'Pending' || reporte(m)) return '';
    const mt = estMT(b); if (mt && ((+m.per || 0) > 1 || /^ht$|half|mi-temps/i.test(String(m.det || '').trim()))) return '';
    const p = String(b.prono || '').toLowerCase(), h = +m.hs || 0, a = +m.as || 0, t = h + a, fin = mt ? ' avant la pause' : '', s = n => n > 1 ? 's' : '';
    let x;
    if (/deux|btts|both/.test(p)) {
      if (/ne marque pas|pas de but|\bnon\b|\bno\b/.test(p)) { if (h && a) return ''; return !h && !a ? 'une des deux équipes doit rester à 0' + fin : (!h ? m.hn : m.an) + ' ne doit pas marquer' + fin; }
      if (h && a) return ''; return !h && !a ? 'il faut un but de chaque équipe' + fin : 'il manque un but de ' + (!h ? m.hn : m.an) + fin;
    }
    if ((x = p.match(/(?:plus de|over|\+)\s*(\d+(?:[.,]\d+)?)/))) { const need = Math.floor(parseFloat(x[1].replace(',', '.'))) + 1 - t; return need > 0 ? `il faut encore ${need} but${s(need)}${fin}` : ''; }
    if ((x = p.match(/(?:moins de|under)\s*(\d+(?:[.,]\d+)?)/))) { const mx = Math.ceil(parseFloat(x[1].replace(',', '.'))) - 1 - t; return mx < 0 ? '' : mx === 0 ? 'plus aucun but' + fin : `encore ${mx} but${s(mx)} au maximum${fin}`; }
    const [dom, ext] = cote2(p, m.hn, m.an);
    if (dom || ext) { const d = dom ? h - a : a - h, eq = dom ? m.hn : m.an; return d > 0 ? `${eq} doit tenir${fin}` : `il manque ${1 - d} but${s(1 - d)} à ${eq}${fin}`; }
    if (/nul|draw/.test(p)) { const d = h - a; return d === 0 ? 'doit rester à égalité' + fin : `il faut ${Math.abs(d)} but${s(Math.abs(d))} de ${d > 0 ? m.an : m.hn}${fin}`; }
    return '';
  }

  /* --- Alertes sur les matchs de mes paris : buts, pronostic acquis, combiné gagné / perdu --- */
  const PREV = { sc: new Map(), leg: new Map(), cmb: new Map(), init: false };
  let dernierMut = 0;
  function surveiller(D) {
    if (!D) return;
    const msgs = [], parMatch = new Map();
    D.C.forEach(x => x.legs.forEach(l => { if (l.m) { if (!parMatch.has(String(l.m.id))) parMatch.set(String(l.m.id), []); parMatch.get(String(l.m.id)).push(l); } }));
    D.solos.forEach(l => { if (l.m) { if (!parMatch.has(String(l.m.id))) parMatch.set(String(l.m.id), []); parMatch.get(String(l.m.id)).push(l); } });
    parMatch.forEach((legs, k) => {
      const m = legs[0].m, sc = (+m.hs || 0) + '-' + (+m.as || 0), p = PREV.sc.get(k);
      if (PREV.init && p != null && p !== sc && m.st === 'in' && legs.some(l => l.b.status === 'Pending')) {
        const [ph, pa] = p.split('-').map(Number), qui = (+m.hs || 0) > ph ? m.hn : (+m.as || 0) > pa ? m.an : '';
        const det = legs.filter(l => l.b.status === 'Pending').map(l => { const n = besoin(l.b, m); return `« ${l.b.prono} » : ${l.e === 'won' ? 'c\'est passé ✅' : l.e === 'lost' ? 'perdu ❌' : n || 'en cours'}`; }).join(' · ');
        msgs.push({ t: `⚽ But${qui ? ' de ' + qui : ''} ! ${m.hn} ${m.hs}-${m.as} ${m.an}`, d: det, k: 'goal' });
      }
      PREV.sc.set(k, sc);
    });
    // pronostic acquis en cours de match (ex. « plus de 1.5 buts » atteint)
    parMatch.forEach(legs => legs.forEach(l => { const k = String(l.b.id), p = PREV.leg.get(k); if (PREV.init && p && p !== l.e && l.e === 'won' && l.b.status === 'Pending' && l.m && l.m.st === 'in') msgs.push({ t: `🟢 C'est passé : « ${l.b.prono} »`, d: l.b.match.replace(/\s+vs\s+/i, ' – '), k: 'ok' }); PREV.leg.set(k, l.e); }));
    D.C.forEach(x => {
      const [e] = etatCombo(x), k = String(x.c.id), p = PREV.cmb.get(k);
      if (PREV.init && p && p !== e && Date.now() - dernierMut > 4000) {
        if (e === 'won') msgs.push({ t: `✅ Combiné gagné · ${cote(x.odds)}`, d: `+${stF2(x.stake * (x.odds - 1))} €`, k: 'win' });
        else if (e === 'lost') { const pl = x.legs.find(l => l.e === 'lost'); msgs.push({ t: `❌ Combiné perdu · ${cote(x.odds)}`, d: pl ? pl.b.match.replace(/\s+vs\s+/i, ' – ') + ' : « ' + pl.b.prono + ' »' : '', k: 'lose' }); }
        else if (e === 'rep') msgs.push({ t: '⏸️ Match reporté dans un combiné', d: x.legs.filter(l => l.e === 'rep').map(l => l.b.match).join(', '), k: 'rep' });
      }
      PREV.cmb.set(k, e);
    });
    PREV.init = true;
    msgs.slice(0, 4).forEach(alerte);
  }
  function alerte(a) {
    let box = document.getElementById('pzAlerts'); if (!box) { box = document.createElement('div'); box.id = 'pzAlerts'; document.body.appendChild(box); }
    const el = document.createElement('div'); el.className = 'pz-alert pz-al-' + a.k; el.setAttribute('data-pz', 'open');
    el.innerHTML = `<b>${esc(a.t)}</b>${a.d ? `<small>${esc(a.d)}</small>` : ''}`;
    box.appendChild(el); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 9000);
    try { if (navigator.vibrate) navigator.vibrate(a.k === 'goal' ? [120, 60, 120] : 200); } catch (e) {}
    try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(a.t, { body: a.d || '', icon: 'icon-192.png', tag: 'pz-' + a.k }); } catch (e) {}
  }
  setInterval(() => { try { if (typeof foot !== 'undefined') surveiller(donnees()); } catch (e) {} }, 15000);

  /* --- Réglages --- */
  function vueReglagesPage() {
    const auto = lsGet(AUTO) === '1', mk = marchesFoot();
    return `<div class="pz-grid pz-2">
      <div class="card"><h2>⚡ Règlement automatique</h2><label class="pz-auto" style="font-size:14px;color:var(--txt)"><input type="checkbox" data-pz="auto"${auto ? ' checked' : ''}> Régler Gagné / Perdu quand le match est terminé</label><p class="mut" style="margin:8px 0 0">D'après le score final de Statify. Sinon, une bannière te propose « Tout régler ». Chaque règlement reste annulable.</p></div>
      <div class="card"><h2>✨ Combinés automatiques</h2><p class="mut" style="margin:0 0 10px">Associe tes paris simples à venir par deux, pour une cote totale d'environ 2,00–2,40 (jamais sous 2,00, jamais deux fois le même match). Les championnats exclus ne sont pas utilisés. Tu peux annuler juste après.</p>
        <label class="pz-auto" style="font-size:14px;color:var(--txt)"><input type="checkbox" data-pz="autocmb"${autoCmbOn() ? ' checked' : ''}> Créer les combinés tout seuls</label>
        <label class="pz-auto" style="margin-top:8px">après <select id="pz-delai" class="pz-sel">${[[0, 'tout de suite'], [1, '1 min'], [2, '2 min'], [5, '5 min']].map(([v, l]) => `<option value="${v}"${delaiMin() === v ? ' selected' : ''}>${l}</option>`).join('')}</select> <span class="mut">(le temps que tu finisses de saisir)</span></label>
        <div class="pz-fa"><button class="sec" data-pz="ogen">✨ Générer et choisir les paires…</button><button data-pz="autocombo">Combiner maintenant</button></div></div>
      <div class="card"><h2>🛠️ Vérifications</h2><p class="mut" style="margin:0 0 10px">Rien n'est modifié sans ton accord.</p><div class="pz-fa" style="margin:0"><button class="sec" data-pz="overif">🔎 Vérifier mes résultats</button><button class="sec" data-pz="ovc">🏷️ Vérifier les championnats</button></div>
        <p class="mut" style="margin:12px 0 4px">Clé <b>football-data.org</b> (facultative) : sert de secours pour les matchs qu'ESPN ne trouve pas. Elle reste sur cet appareil.</p><div class="pz-fa" style="margin:0"><input id="pz-fd-key" class="pz-search" type="password" placeholder="Clé API football-data.org" value="${esc(fdCfg().key || '')}"><button class="sec" data-pz="fdsave">Enregistrer</button></div></div>
      <div class="card"><h2>🎯 Types de marché (foot)</h2><div class="pz-mks">${mk.map((m, i) => `<span class="pz-mk">${esc(m)}<button class="sec" data-pz="mkdel" data-i="${i}" title="Retirer">✕</button></span>`).join('')}</div><div class="pz-fa"><input id="pz-mkn" class="pz-search" placeholder="Nouveau marché (ex. Double Chance)"><button data-pz="mkadd">Ajouter</button></div></div>
      <div class="card"><h2>💾 Données &amp; synchronisation</h2><div class="pz-fa" style="margin:0"><button class="sec" data-pz="oexp">📊 Exporter l'historique (Excel / CSV)</button><button class="sec" data-pz="ext" data-b="btnExport">⬇️ Sauvegarde complète</button><button class="sec" data-pz="ext" data-b="btnImport">⬆️ Importer</button><button class="sec" data-pz="ext" data-b="btnCloud">☁️ Cloud</button></div><p class="mut" style="margin:10px 0 0">Le Cloud de Statify synchronise maintenant aussi tes paris entre appareils (dernier envoi gagnant : envoie depuis l'appareil à jour, puis récupère sur l'autre).</p><button class="sec pz-ib" data-pz="f" data-k="sync" style="margin-top:8px">☁️ Ancienne synchro PronoTracker (Supabase / Firebase)</button></div></div>`;
  }
  const marchesFoot = () => { try { const s = JSON.parse(lsGet(MARCHES)); if (Array.isArray(s) && s.length) return s; } catch (e) {} return ['1N2', 'BTTS', 'Over/Under', 'Buteur', 'Mi-Temps', 'Autre']; };
  function majMarches(fn) { const m = marchesFoot().slice(); fn(m); try { localStorage.setItem(MARCHES, JSON.stringify(m)); } catch (e) {} const v = document.getElementById('view'); if (v) v.__pzH = null; decorer(); }

  /* --- Paris tennis rangés par erreur dans le foot --- */
  const RE_TENNIS = /\b(atp|wta|challenger|itf|roland[\s-]?garros|wimbledon|us open|australian open|open d'australie|davis cup|billie jean|tennis)\b/i;
  const estTennis = b => TENNIS_MARCHES.some(m => m !== 'Autre' && String(b.market || '').toLowerCase() === m.toLowerCase()) || RE_TENNIS.test(String(b.comp || ''));
  function tennisDansFoot() {
    const S = lireN(), L = S.football, cs = S.combos.football, ids = new Set(), combos = [];
    L.filter(b => !b.comboId && estTennis(b)).forEach(b => ids.add(String(b.id)));
    let mixtes = 0;
    cs.forEach(c => { const legs = (c.legIds || []).map(i => L.find(b => String(b.id) === String(i))).filter(Boolean), n = legs.filter(estTennis).length; if (!n) return; if (n === legs.length) { combos.push(c.id); legs.forEach(b => ids.add(String(b.id))); } else mixtes++; });
    return { ids, combos, mixtes, n: ids.size };
  }
  function deplacerTennis() {
    const t = tennisDansFoot(); if (!t.n) return;
    muter(S => {
      const cc = new Set(t.combos.map(String));
      S.tennis.unshift(...S.football.filter(b => t.ids.has(String(b.id))));
      S.football = S.football.filter(b => !t.ids.has(String(b.id)));
      S.combos.tennis.push(...S.combos.football.filter(c => cc.has(String(c.id))));
      S.combos.football = S.combos.football.filter(c => !cc.has(String(c.id)));
    }, t.n + ' pari' + (t.n > 1 ? 's' : '') + ' déplacé' + (t.n > 1 ? 's' : '') + ' vers Tennis');
  }
  /* --- Combinés automatiques (même calcul que PronoTracker) --- */
  function paires(bets) {
    const o = { min: 2.00, cible: 2.20, ideal: 2.40, max: 3.00 }, L = bets.filter(b => b && b.odds > 1), n = L.length;
    const cout = p => p <= o.ideal ? Math.abs(p - o.cible) : (o.ideal - o.cible) + (p - o.ideal) * 3;
    const ok = (i, j) => { const p = L[i].odds * L[j].odds; return p >= o.min - 1e-9 && p <= o.max + 1e-9 && norm(L[i].match) !== norm(L[j].match); };
    if (n < 2) return [];
    let best = null;
    if (n <= 14) {
      const used = new Array(n).fill(false), cur = [];
      (function dfs(i, c) {
        while (i < n && used[i]) i++;
        if (i >= n) { if (!best || cur.length > best.p.length || (cur.length === best.p.length && c < best.c - 1e-9)) best = { p: cur.slice(), c }; return; }
        used[i] = true;
        for (let j = i + 1; j < n; j++) if (!used[j] && ok(i, j)) { used[j] = true; cur.push([i, j]); dfs(i + 1, c + cout(L[i].odds * L[j].odds)); cur.pop(); used[j] = false; }
        dfs(i + 1, c); used[i] = false;
      })(0, 0);
    } else {
      const cand = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (ok(i, j)) cand.push([i, j, cout(L[i].odds * L[j].odds)]);
      cand.sort((a, b) => a[2] - b[2]); const u = new Set(), p = []; cand.forEach(([i, j]) => { if (!u.has(i) && !u.has(j)) { u.add(i); u.add(j); p.push([i, j]); } }); best = { p };
    }
    return (best ? best.p : []).map(([i, j]) => [L[i], L[j]]);
  }
  function combinerAuto() {
    const sp = SP(), D = donnees(sp), auj = jour(), parJour = {};
    const exc = stGenExclus(), refus = refusSet();
    D.ouvertsS.filter(s => s.b.date && s.b.date >= auj && !exc.has((s.b.comp || '').trim()) && !refus.has(String(s.b.id))).forEach(s => { (parJour[s.b.date] ||= []).push(s.b); });
    const pr = []; Object.keys(parJour).sort().forEach(j => paires(parJour[j]).forEach(p => pr.push(p)));
    if (!pr.length) { toast('Aucune paire possible (il faut deux paris simples à venir dont la cote totale fait entre 2,00 et 3,00).'); return; }
    muter(S => { const base = Date.now(); pr.forEach(([x, y], k) => { const bx = S[sp].find(b => String(b.id) === String(x.id)), by = S[sp].find(b => String(b.id) === String(y.id)); if (!bx || !by) return; const c = { id: base + k, stake: +bx.stake > 0 ? +bx.stake : 1, legIds: [bx.id, by.id], createdAt: new Date().toISOString() }; bx.comboId = c.id; by.comboId = c.id; S.combos[sp].push(c); }); },
      pr.length + ' combiné' + (pr.length > 1 ? 's' : '') + ' créé' + (pr.length > 1 ? 's' : '') + ' automatiquement');
  }
  function exporterCsv() {
    const S = lireN(), q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"', rows = [['Sport', 'Date', 'Match', 'Compétition', 'Marché', 'Pronostic', 'Cote', 'Mise', 'Statut', 'Type', 'Combiné']];
    ['football', 'tennis'].forEach(sp => (S[sp] || []).forEach(b => rows.push([sp, b.date, b.match, b.comp, b.market, b.prono, b.odds, b.stake, b.status, b.comboId ? 'Combiné' : 'Simple', b.comboId || ''])));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(q).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'mes-paris.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Le Cloud de Statify sauvegarde aussi les paris (même mécanisme que le reste)
  try { if (typeof CLOUD_KEYS !== 'undefined') [KEY, MARCHES, 'pz_an_suivi'].forEach(k => { if (!CLOUD_KEYS.includes(k)) CLOUD_KEYS.push(k); }); } catch (e) {}

  /* ---------- Fiche d'un match : « Mes paris sur ce match » + ajouter un pari ---------- */
  function fiche(id) {
    setTimeout(() => {
      const box = document.querySelector('#modal .mbox'); if (!box || box.querySelector('.pz-fiche')) return;
      const it = donnees().parMatch.get(String(id)) || [];
      const m = matchs().find(x => String(x.id) === String(id));
      const ajout = m ? `<button class="sec pz-ib" data-pz="new" data-m="${esc(m.hn + ' vs ' + m.an)}" data-c="${esc(FLGN[m.lg] || '')}" data-d="${esc(jourDe(m.d))}">＋ Parier sur ce match</button>` : '';
      // autres propositions de l'Analyseur pour ce match (suivies sans mise, comptées dans Stats › Analyseur)
      let autres = '';
      if (m) { try { const jm = jourDe(m.d), recs = suiviMaj().filter(r => { const [h, a] = cotes(r.match); return h && a && ((pareil(h, m.hn) && pareil(a, m.an)) || (pareil(h, m.an) && pareil(a, m.hn))) && Math.abs(Date.parse(r.date + 'T12:00:00') - Date.parse(jm + 'T12:00:00')) <= 1.5 * 864e5; });
        const L = recs.flatMap(r => r.options.filter(o => !o.choisi)); if (L.length) autres = `<div class="pz-autres"><small class="mut">🔍 Autres propositions de l'Analyseur · non jouées</small>${L.map(o => `<div class="pz-line pz-nj"><span>${o.status === 'Won' ? '✅' : o.status === 'Lost' ? '❌' : '⏳'}</span><span>${esc(o.prono)} · ${cote(o.odds)}</span><span class="pz-st pz-pre">option ${o.rang}</span><span class="pz-st ${o.status === 'Won' ? 'pz-won' : o.status === 'Lost' ? 'pz-lost' : 'pz-pre'}">${o.status === 'Won' ? 'aurait gagné' : o.status === 'Lost' ? 'aurait perdu' : 'non joué'}</span></div>`).join('')}</div>`; } catch (e) {} }
      const html = `<div class="pz-fiche"><b>🎯 Mes paris sur ce match</b>${it.length ? ligneMatch(it) : '<p class="mut" style="margin:6px 0 0">Aucun pari sur ce match.</p>'}${autres}${ajout}</div>`;
      const notes = [...box.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === 'Mes notes');
      if (notes) notes.insertAdjacentHTML('beforebegin', html); else (box.firstElementChild || box).insertAdjacentHTML('afterbegin', html);
    }, 350);
  }

  /* ---------- Branchements ---------- */
  const css = `
  .pz-line{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);font-size:12px;line-height:1.3}
  .pz-ic{font-size:13px}.pz-st{padding:2px 9px;border-radius:999px;font-weight:800;font-size:11.5px;white-space:nowrap}
  .pz-won,.pz-ok{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}.pz-lost{background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad)}
  .pz-live,.pz-end{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}.pz-pre,.pz-nf{background:var(--field);color:var(--mut)}
  .pz-cb{padding:2px 9px;border-radius:999px;font-weight:800;font-size:11.5px;background:color-mix(in srgb,#7c3aed 14%,transparent);color:#7c3aed}.pz-solo{background:var(--field);color:var(--mut)}
  .pz-has{box-shadow:inset 0 0 0 2px color-mix(in srgb,#7c3aed 35%,transparent)}
  .pz-rail h2{display:flex;align-items:center;gap:6px}.pz-all{margin-left:auto;font-size:12px}
  .pz-bil{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0 10px}.pz-sit{grid-column:1/-1;flex-direction:row!important;align-items:center;justify-content:space-between}.pz-k{background:var(--field);border-radius:14px;padding:9px 12px;display:flex;flex-direction:column}
  .pz-k span{font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}.pz-k b{font-size:15px;white-space:nowrap}.pz-k{padding:8px 9px}
  .pz-main{grid-column:1/-1;border:2px solid #7c3aed;background:var(--card)}.pz-main span{color:#7c3aed}.pz-main b{font-size:30px;line-height:1.15}
  .pz-big{grid-template-columns:2fr 1fr 1fr 1fr}.pz-big .pz-main,.pz-big .pz-sit{grid-column:auto}.pz-big .pz-sit{flex-direction:column!important;align-items:flex-start;justify-content:flex-start}.pz-big .pz-k b{font-size:24px}.pz-big .pz-k{padding:12px 14px}.pz-big .pz-k span{font-size:10.5px}.pz-big .pz-main b{font-size:38px}
  .pz-pos{color:var(--ok)}.pz-neg{color:var(--bad)}
  .pz-combo{border:1px solid var(--line);border-radius:16px;padding:10px 12px;margin-top:8px;background:var(--card)}
  .pz-ch{display:flex;align-items:center;justify-content:space-between;gap:8px}.pz-ch b{color:#7c3aed}
  .pz-leg{display:grid;grid-template-columns:20px 1fr auto;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--line);margin-top:6px;font-size:13px}
  .pz-lt{display:flex;flex-direction:column;min-width:0}.pz-lt small{font-size:11.5px}.pz-sc{white-space:nowrap;font-size:13px}
  .pz-view{display:flex;flex-direction:column;gap:12px}.pz-tabs{gap:8px;align-items:center}.pz-note{margin-left:auto;font-size:12px}
  .pz-h3{margin:8px 0 0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
  .pz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}.pz-grid .pz-combo{margin-top:0}
  .pz-fiche{margin:4px 0 14px;padding:12px 14px;border:2px solid #7c3aed;border-radius:16px;background:var(--card)}.pz-fiche .pz-line{font-size:13px}
  #tabs [data-act=pronos]{position:relative}.pz-badge{position:absolute;top:2px;right:14px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--bad);color:#fff;font-style:normal;font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center}
  .pz-brand{display:none}#pzTop{display:none}
  @media (min-width:1100px){
    body{padding-left:240px!important}
    header .brand:not(.pz-brand){display:none!important}
    main{padding-bottom:32px!important}
    body nav#tabs{position:fixed!important;left:0!important;right:auto!important;top:0!important;bottom:0!important;transform:none!important;width:240px!important;max-width:none!important;margin:0!important;
      display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:4px!important;padding:18px 14px!important;box-sizing:border-box;
      border-radius:0!important;background:var(--card)!important;border:0!important;border-right:1px solid var(--line)!important;box-shadow:none!important;overflow-y:auto!important;z-index:60!important}
    body nav#tabs .pz-brand{display:flex!important;margin:2px 8px 22px;font-size:19px}
    body nav#tabs button{flex-direction:row!important;justify-content:flex-start!important;align-items:center!important;gap:12px!important;width:100%;min-height:0!important;
      padding:11px 14px!important;border-radius:12px!important;font-size:15px!important;font-weight:700!important;color:var(--mut)!important;background:transparent!important}
    body nav#tabs button:hover{background:var(--field)!important;color:var(--txt)!important}
    body nav#tabs button i{font-style:normal;font-size:18px;width:24px;text-align:center}
    body nav#tabs button.on{background:color-mix(in srgb,var(--acc) 15%,transparent)!important;color:var(--txt)!important;font-weight:800!important}
    body nav#tabs [data-act=tabmore]{display:none!important}
    body nav#tabs .tabsheet{position:static!important;width:auto!important;display:flex!important;flex-direction:column;gap:4px;margin-top:10px;padding:12px 0 0!important;
      border:0!important;border-top:1px solid var(--line)!important;border-radius:0!important;box-shadow:none!important;background:none!important}
    body nav#tabs .tabsheet::before{content:"Plus";padding:0 14px 4px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
    body nav#tabs .pz-badge{position:static;margin-left:auto}
    body.pz-docked header{display:none!important}
    body.pz-docked nav#tabs{padding-bottom:var(--pzdock,240px)!important}
    #pzDock:empty{display:none}
    #pzDock{position:fixed;left:0;bottom:0;width:240px;box-sizing:border-box;z-index:61;display:flex;flex-direction:column;gap:10px;
      padding:12px 14px 16px;background:var(--card);border-right:1px solid var(--line);border-top:1px solid var(--line)}
    body.pz-docked nav#tabs{padding-top:var(--pztop,150px)!important}
    body.pz-docked nav#tabs .pz-brand{display:none!important}
    #pzTop{position:fixed;left:0;top:0;width:240px;box-sizing:border-box;z-index:61;display:flex;flex-direction:column;gap:14px;padding:18px 14px 10px;background:var(--card);border-right:1px solid var(--line)}
    #pzTop .pz-brand{display:flex!important;margin:2px 8px 0;font-size:19px}
    #pzTop .seg{display:grid!important;grid-template-columns:1fr 1fr;gap:4px;width:100%;margin:0;padding:4px;box-sizing:border-box;border-radius:14px;background:var(--field);box-shadow:none}
    #pzTop .seg button{width:100%;padding:8px 6px;font-size:13px;border-radius:10px;justify-content:center}
    #pzDock > .row{display:grid!important;grid-template-columns:1fr 1fr;gap:6px;margin:0;width:100%}
    #pzDock > .row > button,#pzDock > .row .hdrmore > button{width:100%;margin:0;padding:9px 8px;font-size:13px;justify-content:center;white-space:nowrap;box-shadow:none;border:1px solid var(--line)}
    #pzDock > .row .hdrmore{display:contents!important}
    #pzDock #btnMore,#pzDock #btnTv{display:none!important}#pzDock span.hide-m{display:inline!important}
  }
  @media (max-width:700px){.pz-big{grid-template-columns:1fr 1fr}.pz-big .pz-sit{grid-column:1/-1;flex-direction:row!important;align-items:center;justify-content:space-between}.pz-big .pz-k b{font-size:17px}.pz-big .pz-main b{font-size:32px}.pz-big .pz-k{padding:9px 10px}.pz-big .pz-k span{font-size:9.5px}.pz-big .pz-main{grid-column:1/-1}.pz-note{display:none}.pz-grid{grid-template-columns:1fr}}`;
  const st = document.createElement('style'); st.textContent = css + `
  .pz-add{margin-left:auto;font-size:12px}.pz-add+.pz-all{margin-left:10px}
  .pz-act{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.pz-ib{padding:3px 9px!important;font-size:12px!important;border-radius:10px!important;box-shadow:none!important}
  .pz-onw{background:color-mix(in srgb,var(--ok) 22%,transparent)!important;color:var(--ok)!important;border-color:var(--ok)!important}.pz-onl{background:color-mix(in srgb,var(--bad) 20%,transparent)!important;color:var(--bad)!important;border-color:var(--bad)!important}
  .pz-cf{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}
  .pz-ck{display:flex;align-items:center;gap:8px;cursor:pointer}.pz-ck input{width:18px;height:18px;accent-color:#7c3aed}.pz-hint{text-transform:none;letter-spacing:0;font-weight:600}
  .pz-new{margin-left:auto}.pz-auto{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--mut);cursor:pointer}.pz-auto input[type=checkbox]{width:16px;height:16px;accent-color:var(--acc)}
  .pz-ban{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between;padding:10px 14px;border-radius:14px;background:color-mix(in srgb,var(--ok) 14%,transparent);font-weight:700;font-size:13.5px}
  .pz-why{flex-basis:100%;order:9;color:#b97f00;font-size:12.5px;font-weight:600}
  .pz-bar{position:fixed;left:12px;right:12px;bottom:84px;z-index:40;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;border-radius:16px;background:var(--card);border:2px solid #7c3aed;box-shadow:0 8px 30px rgba(0,0,0,.25)}
  .pz-bar input{width:70px;font:inherit;font-weight:700;color:var(--txt);background:var(--field);border:1px solid var(--line);border-radius:10px;padding:5px 8px}.pz-bar label{display:flex;align-items:center;gap:6px;font-weight:700}
  #pzOv{position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;padding:5vh 12px;overflow:auto}
  .pz-fm{width:min(540px,100%);background:var(--card);color:var(--txt);border-radius:20px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.5)}.pz-fm h3{margin:0 0 12px;font-size:18px}
  .pz-fg{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pz-f{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);min-width:0}.pz-f.w{grid-column:1/-1}
  .pz-f input,.pz-f select{font:inherit;font-size:15px;text-transform:none;letter-spacing:0;font-weight:600;color:var(--txt);background:var(--field);border:1px solid var(--line);border-radius:12px;padding:10px 12px;width:100%;box-sizing:border-box;min-width:0}
  .pz-fa{display:flex;gap:8px;margin-top:14px;align-items:center;flex-wrap:wrap}.pz-err{color:var(--bad);font-weight:700;font-size:13px;margin:8px 0 0;min-height:0}
  #pzOv button,#pzToast button{font:inherit;font-weight:800;font-size:14px;cursor:pointer;padding:10px 16px;border-radius:12px;border:1px solid transparent;background:linear-gradient(135deg,#2fc15a,#1a9d55);color:#fff}
  #pzOv button.sec,#pzToast button.sec{background:var(--field);color:var(--txt);border-color:var(--line)}#pzOv button.pz-danger{color:var(--bad)}
  #pzToast{position:fixed;left:50%;transform:translateX(-50%);top:14px;z-index:9700;display:flex;align-items:center;gap:14px;max-width:calc(100vw - 24px);padding:10px 12px 10px 16px;border-radius:14px;background:#171a21;color:#fff;font-weight:700;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
  #pzToast button{padding:6px 12px;background:#2a2f3a;color:#fff}
  .pz-fiche .pz-ib{margin-top:10px}

  .pz-an textarea{width:100%;min-height:170px;box-sizing:border-box;font:inherit;font-size:14px;color:var(--txt);background:var(--field);border:1px solid var(--line);border-radius:14px;padding:12px;resize:vertical}
  .pz-anres{margin-top:12px}.pz-ul{margin:6px 0;padding-left:20px;font-size:13.5px}.pz-det{margin:6px 0 0;font-size:12.5px;color:var(--mut)}.pz-avert{font-size:12px;margin-top:14px}
  .pz-conf{border-color:var(--warn)}.pz-cote{font-size:18px;color:#7c3aed}.pz-anr .pz-fg{align-items:end}.pz-anr .pz-fa{margin-top:10px}
  .pz-an .pz-fa{margin-top:10px}.pz-anr input,.pz-anr select,.pz-an input{font:inherit}
  .pz-if{width:100%;height:calc(100vh - 110px);min-height:520px;border:0;border-radius:16px;background:var(--card);box-shadow:0 4px 18px rgba(0,0,0,.08)}

  .pz-six{grid-template-columns:repeat(6,1fr)!important}.pz-six .pz-k b{font-size:20px!important}.pz-2{grid-template-columns:repeat(auto-fill,minmax(420px,1fr))}
  .pz-chart{position:relative;padding-left:46px;margin-top:6px}.pz-chart svg{width:100%;height:190px;display:block;background:linear-gradient(var(--field),transparent);border-radius:10px}
  .pz-yl{position:absolute;left:0;font-size:10.5px;color:var(--mut);font-weight:700}.pz-yt{top:0}.pz-yb{bottom:0}.pz-xl{display:flex;justify-content:space-between;padding-left:46px;font-size:11px;color:var(--mut);margin-top:4px}
  .pz-chips{gap:6px;flex-wrap:wrap}.pz-search{flex:1;min-width:200px;font:inherit;color:var(--txt);background:var(--field);border:1px solid var(--line);border-radius:12px;padding:9px 12px}
  .pz-okbg{background:color-mix(in srgb,var(--ok) 13%,transparent)!important}.pz-kobg{background:color-mix(in srgb,var(--bad) 12%,transparent)!important}
  .pz-mks{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.pz-mk{display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 12px;border-radius:999px;background:var(--field);font-weight:700;font-size:13px}.pz-mk button{padding:1px 7px!important;border-radius:999px!important;font-size:11px!important;box-shadow:none!important}
  @media (max-width:900px){.pz-six{grid-template-columns:repeat(2,1fr)!important}.pz-2{grid-template-columns:1fr}.pz-search{min-width:100%}}
  @media (max-width:700px){.pz-if{height:calc(100dvh - 200px)}.pz-fg{grid-template-columns:1fr}.pz-bar{bottom:84px;gap:8px 10px;padding:10px 12px}.pz-bar>span[style]{display:none}.pz-bar button{flex:1;padding:9px 10px!important}.pz-bar>b{flex:1 0 100%}}
  @media (min-width:1100px){.pz-bar{left:252px;bottom:16px}}.pz-sp{height:150px}.pz-diag{font-size:10.5px;line-height:1.35}.pz-jour{font-size:12.5px;opacity:.85;margin-top:14px}  .pz-tbw{overflow-x:auto}.pz-tb{width:100%;border-collapse:collapse;font-size:12.5px}.pz-tb th{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);padding:6px 8px;text-align:center;border-bottom:1px solid var(--line);white-space:nowrap}.pz-tb td{padding:7px 8px;text-align:center;border-bottom:1px solid var(--line)}.pz-tb .l{text-align:left}.pz-clk{cursor:pointer}.pz-clk:hover,.pz-tb tr.pz-on{background:var(--field)}.pz-tb tr.pz-exc{background:rgba(220,60,60,.08)}.pz-pt{color:var(--acc)}  .pz-cat{border:1px solid var(--line);border-radius:14px;margin-top:10px;overflow:hidden}.pz-cath{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:12px 14px;cursor:pointer}.pz-cath b:first-child{flex:1;min-width:140px}.pz-catb{padding:4px 14px 14px;border-top:1px solid var(--line)}
  .pz-dfs{background:var(--field);border-radius:14px;padding:12px;margin:10px 0}.pz-dl{margin-top:8px}.pz-pb{height:6px;border-radius:6px;background:var(--line);overflow:hidden;margin-top:4px}.pz-pb i{display:block;height:100%;background:var(--bad)}
  .pz-jh,.pz-jr{display:grid;grid-template-columns:.8fr 1fr 1fr 1fr 1fr 1.2fr;gap:4px;font-size:12.5px;padding:8px 4px;text-align:center}.pz-jh{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)}.pz-jr{cursor:pointer;border-bottom:1px solid var(--line)}.pz-jr span:first-child{text-align:left}.pz-jr span:last-child{text-align:right}.pz-jh span:last-child{text-align:right}.pz-jh span:first-child{text-align:left}.pz-jd{padding:6px 10px;font-size:12px;border-bottom:1px solid var(--line);background:var(--field)}
  .pz-h2{font-size:16px;margin:18px 0 4px}.pz-anfx{margin:2px 0 10px;align-items:center}.pz-exon{background:color-mix(in srgb,var(--bad) 14%,transparent)!important;color:var(--bad)!important;border:1px solid var(--bad)!important;box-shadow:none!important}.pz-anck{display:flex;gap:8px;align-items:center;margin-bottom:8px;font-size:14px}.pz-anr.pz-off{opacity:.5}.pz-chx{background:color-mix(in srgb,var(--acc) 8%,transparent)}.pz-autres{margin-top:8px;padding-top:6px;border-top:1px dashed var(--line)}.pz-autres .pz-line{border-top:0;margin-top:4px;padding-top:0;opacity:.85}.pz-del{font-size:14px;margin-left:4px;opacity:.6}.pz-del:hover{opacity:1;background:color-mix(in srgb,var(--bad) 14%,transparent)}.pz-take{width:100%;justify-content:center;font-weight:800}#pzAlerts{position:fixed;top:calc(12px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:9700;display:flex;flex-direction:column;gap:8px;width:min(440px,calc(100vw - 24px));pointer-events:none}.pz-alert{pointer-events:auto;cursor:pointer;background:var(--card);color:var(--txt);border:1px solid var(--line);border-left:5px solid var(--acc);border-radius:14px;padding:10px 14px;box-shadow:0 10px 30px rgba(0,0,0,.22);display:flex;flex-direction:column;gap:2px;animation:pzIn .3s ease;transition:opacity .4s,transform .4s}.pz-alert small{color:var(--mut);font-size:12px}.pz-alert.out{opacity:0;transform:translateY(-8px)}.pz-al-goal{border-left-color:#f59e0b}.pz-al-ok,.pz-al-win{border-left-color:var(--ok)}.pz-al-lose{border-left-color:var(--bad)}.pz-al-rep{border-left-color:var(--warn)}@keyframes pzIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}.pz-need{display:block;font-size:11.5px;font-weight:700;color:var(--warn);margin-top:1px}.pz-rep{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}.liverow.lmatch .lm-rks{display:none!important}.pz-rl{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--mut);margin:2px 0 8px}.pz-rl b{color:var(--txt);margin-left:3px}.pz-rr{padding:8px 0;border-top:1px solid var(--line);cursor:pointer}.pz-rrh{display:flex;justify-content:space-between;align-items:center;gap:8px}.pz-rrh b{color:#7c3aed}.pz-rr small{display:block;margin-top:2px;line-height:1.45}.pz-hfx{display:contents}.pz-hftog{display:none}@media (max-width:700px){.pz-tabrow{margin:0!important;padding:2px 0!important}.pz-band{flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.pz-band::-webkit-scrollbar{display:none}.pz-band .pz-kc{flex:0 0 auto!important;min-width:96px}.pz-band .pz-kmain{flex:0 0 auto!important;min-width:140px}.pz-band .pz-kmain b{font-size:19px!important}.pz-view .pz-six{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;gap:6px}.pz-view .pz-six::-webkit-scrollbar{display:none}.pz-view .pz-six>.pz-k{flex:0 0 auto!important;min-width:112px}.pz-sous{display:flex!important;flex-wrap:nowrap;overflow-x:auto;max-width:100%;box-sizing:border-box}.pz-sous .pz-ib{flex:0 0 auto!important}.pz-hbar .pz-chips{flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none}.pz-hbar .pz-chips>*{flex:0 0 auto}.pz-hreset{flex:0 0 auto!important}.pz-hftog{display:inline-flex!important;flex:0 0 auto!important;align-items:center}.pz-hfx{display:none}.pz-hfx.open{display:flex;flex-wrap:wrap;gap:8px;width:100%}.pz-hf .pz-search{flex:1 1 60%!important;flex-basis:auto!important}.pz-hr{grid-template-columns:30px minmax(0,1fr) auto!important;padding:9px 0}.pz-hr .pz-act{grid-column:2/-1}.fbar>.mut,.fbar>span>.mut{display:none}body[data-pztab="foot:matches"] #view .card>.row:first-child{flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;gap:6px}body[data-pztab="foot:matches"] #view .card>.row:first-child>select{flex:0 0 auto;width:auto!important;font-size:13px;padding:7px 8px}body[data-pztab="foot:matches"] #view .card>.row:first-child+p.mut{display:none}}#pzDock:not(.open) > .row{display:none!important}#pzDockTog{width:100%;justify-content:space-between;display:flex;padding:9px 12px;font-size:13px;box-shadow:none;border:1px solid var(--line)}@media (min-width:1100px){.livegrid{grid-template-columns:repeat(auto-fill,minmax(310px,1fr))!important;gap:10px!important}.liverow.lmatch{padding:9px 12px!important}.lm-s{font-size:26px!important}.lm-lg{width:30px!important;height:30px!important}.lm-t{font-size:12.5px!important;gap:2px!important}.lm-last{margin-top:6px!important;padding:4px 8px!important;font-size:12px!important}.lm-rks{margin-top:6px!important}.lm-rks>*{font-size:11px!important}.gt-grid{grid-template-columns:repeat(auto-fill,minmax(250px,1fr))!important;gap:8px!important}.gt-tile{padding:8px 10px!important}}.pz-sous{margin:4px 0 12px;padding:4px;background:var(--field);border-radius:14px;display:inline-flex!important;gap:4px}.pz-sous .pz-ib{font-size:13px!important;padding:6px 14px!important}.pz-sous .pz-ib.sec{background:transparent!important;border-color:transparent!important}.pz-stats .pz-big .pz-k b{font-size:18px!important}.pz-stats .pz-big .pz-k{padding:9px 12px!important}.pz-band{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}.pz-kc{flex:1 1 100px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:8px 12px;display:flex;flex-direction:column;gap:1px;min-width:0}.pz-kc span{font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);white-space:nowrap}.pz-kc b{font-size:16px;white-space:nowrap}.pz-kmain{flex:1.6 1 150px;border-color:color-mix(in srgb,#7c3aed 45%,var(--line))}.pz-kmain b{font-size:22px}.pz-fold{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--card)!important;color:var(--txt)!important;border:1px dashed var(--line)!important;border-radius:14px!important;padding:9px 14px!important;font-weight:700;font-size:13px;box-shadow:none!important;margin:2px 0 10px;cursor:pointer}.pz-fold span:last-child{color:var(--mut);font-weight:600;font-size:12px}.pz-days{align-items:start}.pz-days>.pz-jour{grid-column:1/-1;margin:8px 0 -2px;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);font-weight:800}.pz-dots{min-width:30px}.pz-cdots{display:block;margin:8px 0 0 auto}.pz-i{display:inline-block;padding:0 3px;font-size:12px;cursor:pointer;color:var(--mut);border-radius:6px;user-select:none}.pz-i:hover{background:var(--field)}.pz-cdots{margin-left:6px;font-size:16px;line-height:1;font-weight:800}.pz-ch>.pz-st{margin-left:auto}.pz-dtag{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);margin-bottom:4px}.pz-fold span:first-child{text-align:left}.pz-scard .pz-ch small{margin-left:8px}.pz-danger{color:var(--bad)!important}.pz-leg .pz-act:empty{display:none}.pz-gp{gap:6px!important}.pz-pill{padding:2px 10px!important;font-size:11.5px!important;border-radius:999px!important;box-shadow:none!important;min-height:0!important;line-height:1.6}.pz-pr{cursor:pointer;border-bottom:1px dotted var(--mut)}.pz-pr:hover{color:var(--txt)}body:has(.pz-bar) .pz-tabrow .pz-new{display:none!important}@media (max-width:700px){.pz-tabrow{flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:2px 16px}.pz-tabrow::-webkit-scrollbar{display:none}.pz-tabrow>*{flex:0 0 auto}.pz-tabrow .pz-new{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:60;width:54px;height:54px;border-radius:50%!important;padding:0!important;font-size:0!important;box-shadow:0 8px 22px rgba(0,0,0,.25)!important;margin:0}.pz-tabrow .pz-new span{font-size:26px;line-height:1}.pz-kc{flex:1 1 30%}.pz-kmain{flex:1 1 100%}}body[data-pzlive=off] #liveBox{display:none!important}.pz-imp{display:flex;flex-wrap:wrap;gap:6px;margin:-2px 0 10px}.pz-imp>div{flex:1 1 110px;background:var(--field);border-radius:12px;padding:7px 10px;display:flex;flex-direction:column}.pz-imp span{font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}.pz-imp b{font-size:14px}.pz-rj small{display:block}.pz-gen{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}.pz-gen span{flex:1}.pz-vrl{display:flex;flex-direction:column;gap:3px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}.pz-vrl button{align-self:flex-start}.pz-det2 summary{cursor:pointer;font-weight:700;margin:10px 0}#pzOv .pz-vr{max-width:820px;width:calc(100vw - 32px)}.pz-sugg{display:flex;flex-wrap:wrap;gap:6px;margin-top:-4px}.pz-sugg:empty{display:none}.pz-col textarea{width:100%;box-sizing:border-box;font:inherit;font-size:13px;color:var(--txt);background:var(--field);border:1px solid var(--line);border-radius:12px;padding:10px}.pz-colt input,.pz-colt select{font:inherit;font-size:12.5px;color:var(--txt);background:var(--field);border:1px solid var(--line);border-radius:8px;padding:5px 6px;min-width:0;width:100%;box-sizing:border-box}.pz-colt td{padding:4px}.pz-colt input[type=checkbox]{width:16px}.pz-warn td{background:rgba(245,158,11,.12)}#pzOv .pz-col{max-width:1100px;width:calc(100vw - 32px)}.pz-hbar .pz-chips{margin-bottom:8px}.pz-cnt{opacity:.7;font-weight:600;margin-left:2px}.pz-sepv{width:1px;align-self:stretch;background:var(--line);margin:0 4px}.pz-hf{margin:0;flex-wrap:wrap;gap:8px}.pz-sel{font:inherit;font-size:13px;color:var(--txt);background:var(--field);border:1px solid var(--line);border-radius:12px;padding:8px 10px}.pz-hlist{padding:4px 14px}.pz-hr{display:grid;grid-template-columns:44px minmax(0,1fr) auto auto;gap:6px 12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.pz-hr:last-of-type{border-bottom:0}.pz-hw{box-shadow:inset 3px 0 0 var(--ok)}.pz-hl{box-shadow:inset 3px 0 0 var(--bad)}.pz-num{font-weight:800;font-size:12px;color:var(--mut);text-align:center}.pz-hm{min-width:0;display:flex;flex-direction:column;gap:2px}.pz-hp{font-size:13px}.pz-hs{display:flex;flex-direction:column;align-items:flex-end;gap:3px;text-align:right}@media (max-width:700px){.pz-hf .pz-sel,.pz-hf .pz-ib{flex:1 1 40%}.pz-hf .pz-search{flex-basis:100%;min-width:0}.pz-hr{grid-template-columns:34px minmax(0,1fr) auto}.pz-hr .pz-act{grid-column:2/-1}}.pz-mini{width:70px;font:inherit;color:var(--txt);background:var(--field);border:1px solid var(--line);border-radius:8px;padding:4px 6px}.pz-tnl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:3px 0}.pz-tnl>span:first-child{width:44px;font-size:11.5px}.pz-tnj{text-align:left}
.pz-sec{font-size:15px}`; document.head.appendChild(st);

  // L'onglet « Pronos » s'ouvre ici au lieu d'aller sur prono.html ; actions sur les paris
  document.addEventListener('click', e => {
    const z = e.target.closest('[data-pz]');
    if (z) {
      const k = z.dataset.pz, id = z.dataset.id;
      if (k === 'sel') { if (z.checked) sel.add(String(id)); else sel.delete(String(id)); decorer(); return; }
      if (k === 'anon') { if (AN && AN.rows[+z.dataset.i]) AN.rows[+z.dataset.i].on = z.checked; const v = document.getElementById('view'); if (v) v.__pzH = null; decorer(); return; }
      if (k === 'genon') { if (GEN) GEN.on[+z.dataset.i] = z.checked; return; }
      if (k === 'autocmb') { try { localStorage.setItem(RG_AUTO_CMB, z.checked ? '1' : '0'); localStorage.removeItem(RG_SIG); } catch (x) {} autoCombos(false); decorer(); if (z.checked) toast(autoInfo.startsWith('⏳') ? autoInfo.replace('⏳ ', '') : (autoPourquoi() || 'Combinés automatiques activés : ils se créeront dès que deux paris du jour iront ensemble.')); return; }
      if (k === 'colinc') { if (COL && COL[+z.dataset.i]) COL[+z.dataset.i].on = z.checked; const n = document.getElementById('pz-col-n'); if (n) n.textContent = COL.filter(b => b.on !== false).length; return; }
      if (k === 'tnauto') { try { localStorage.setItem(TN_AUTO, z.checked ? '1' : '0'); } catch (x) {} if (z.checked) tnCombos(tnIso(TN.off), false); tnMaj(); return; }
      if (k === 'auto') { try { localStorage.setItem(AUTO, z.checked ? '1' : '0'); } catch (x) {} const v = document.getElementById('view'); if (v) v.__pzH = null; decorer(); return; }
      e.preventDefault(); e.stopImmediatePropagation();
      if (k === 'open') { window.__pzVue = true; decorer(); window.scrollTo(0, 0); }
      else if (k === 'f') { filtre = z.dataset.k; decorer(); }
      else if (k === 'new') { if (z.dataset.m) { formulaire({ match: z.dataset.m, comp: z.dataset.c, date: z.dataset.d }); } else formulaire(); }
      else if (k === 'edit') formulaire({ id });
      else if (k === 'cancel') fermer();
      else if (k === 'save') enregistrer(z.dataset.id);
      else if (k === 'del') supprimerPari(id);
      else if (k === 'won') regler(id, 'Won');
      else if (k === 'lost') regler(id, 'Lost');
      else if (k === 'selclear') { sel = new Set(); decorer(); }
      else if (k === 'mkcombo') creerCombine();
      else if (k === 'mcombo') miseDuCombine(id);
      else if (k === 'msave') enregistrerMise(id);
      else if (k === 'dcombo') defaire(id);
      else if (k === 'xcombo') supprimerCombine(id);
      else if (k === 'regleall') appliquer(donnees().aRegler, false);
      else if (k === 'undo') annuler();
      else if (k === 'cbf') { cbF = z.dataset.k; cbN = 15; decorer(); }
      else if (k === 'cbmore') { cbN += 15; decorer(); }
      else if (k === 'stsp') { stSport = z.dataset.k; decorer(); }
      else if (k === 'stper') { stPer = +z.dataset.k; decorer(); }
      else if (k === 'tnjour') { TN.off = +z.dataset.k; tnCharger(false); tnMaj(); }
      else if (k === 'tnauto') { try { localStorage.setItem(TN_AUTO, z.checked ? '1' : '0'); } catch (x) {} if (z.checked) tnCombos(tnIso(TN.off), false); tnMaj(); }
      else if (k === 'tngen') tnCombos(tnIso(TN.off), true);
      else if (k === 'tncotes') tnCharger(true);
      else if (k === 'tnregler') tnRegler(true);
      else if (k === 'tnpari') tnAjouter(z.dataset.d, +z.dataset.i, +z.dataset.n);
      else if (k === 'tnedit') { TN.edit = !TN.edit; tnMaj(); }
      else if (k === 'tnrobot') { const u = (document.getElementById('pz-tn-url') || {}).value || '', kk = (document.getElementById('pz-tn-key') || {}).value || ''; try { localStorage.setItem(TN_ROBOT, JSON.stringify({ url: u.trim(), key: kk.trim() })); } catch (x) {} TN.edit = false; TN.days = {}; TN.err = ''; tnCharger(true); tnMaj(); }
      else if (k === 'hst') { H.st = z.dataset.k; H.n = 25; decorer(); }
      else if (k === 'hty') { H.ty = z.dataset.k; H.n = 25; decorer(); }
      else if (k === 'hdir') { H.dir = H.dir === 'asc' ? 'desc' : 'asc'; decorer(); }
      else if (k === 'hmore') { H.n += 25; decorer(); }
      else if (k === 'hreset') { Object.assign(H, { q: '', st: 'ALL', ty: 'ALL', per: 'ALL', from: '', to: '', comp: 'ALL', n: 25 }); decorer(); }
      else if (k === 'dup') { const b = (lire()[SP()] || []).find(x => String(x.id) === String(id)); if (b) formulaire({ comp: b.comp, market: b.market, stake: b.stake }); }
      else if (k === 'paste') vueColler(COL && COL.texte);
      else if (k === 'colan') collerAnalyser();
      else if (k === 'colback') vueColler(COL && COL.texte);
      else if (k === 'colok') collerValider();
      else if (k === 'sugg') { const p = document.getElementById('pz-p'); if (p) { p.value = z.dataset.v; p.focus(); } }
      else if (k === 'newmatch') { ['pz-m', 'pz-p', 'pz-o'].forEach(i => { const x = document.getElementById(i); if (x) x.value = ''; }); majSugg(); const m = document.getElementById('pz-m'); if (m) m.focus(); }
      else if (k === 'ogen') vueGenerateur();
      else if (k === 'genjour') vueGenerateur(z.dataset.k);
      else if (k === 'genok') { const pr = GEN.paires.filter((p, i) => GEN.on[i]); fermer(); creerPaires(GEN.sp, pr, pr.length + ' combiné(s) créé(s)'); }
      else if (k === 'autonow') { const n0 = (lireN().combos.football || []).length; autoCombos(true); if ((lireN().combos.football || []).length === n0) toast(autoPourquoi() || 'Aucun combiné automatique à créer pour l\'instant.'); }
      else if (k === 'overif') { VR.res = null; VR.msg = ''; vueVerif(); }
      else if (k === 'vrper') { VR.per = z.dataset.k; VR.res = null; vueVerif(); }
      else if (k === 'vrgo') vrLancer();
      else if (k === 'vrfix' || k === 'vrall') { const L = k === 'vrall' ? VR.res.ko.slice() : VR.res.ko.filter(x => String(x.b.id) === String(id)); const m = {}; L.forEach(x => { m[x.b.id] = x.att; }); VR.res.ko = VR.res.ko.filter(x => !(x.b.id in m)); L.forEach(x => VR.res.ok.push(x)); muter(S => S.football.forEach(b => { if (b.id in m) b.status = m[b.id]; }), L.length + ' pari(s) corrigé(s) d\'après les scores'); vueVerif(); }
      else if (k === 'vrign') { const x = VR.res.ko.find(y => String(y.b.id) === String(id)); if (x) { let ig = {}; try { ig = JSON.parse(lsGet(VR_IGN) || '{}'); } catch (er) {} ig[x.b.id] = x.sig; try { localStorage.setItem(VR_IGN, JSON.stringify(ig)); } catch (er) {} VR.res.ko = VR.res.ko.filter(y => y !== x); } vueVerif(); }
      else if (k === 'ovc') vueVerifComp();
      else if (k === 'vcfix') { const v = ((document.getElementById('pz-vc-' + id) || {}).value || '').trim(); if (v) { muter(S => { const b = S.football.find(x => String(x.id) === String(id)); if (b) b.comp = v; }, 'Championnat corrigé : ' + v); vueVerifComp(); } }
      else if (k === 'vcign') { let ig = []; try { ig = JSON.parse(lsGet(VC_IGN) || '[]'); } catch (er) {} ig.push(String(id)); try { localStorage.setItem(VC_IGN, JSON.stringify(ig)); } catch (er) {} vueVerifComp(); }
      else if (k === 'oexp') vueExport();
      else if (k === 'eh') { const kk = z.dataset.k, v = z.dataset.v; if (kk === 'per') EH.per = v; else if (kk === 'st') EH.st[v] = !EH.st[v]; else if (kk === 'combos') EH.combos = !EH.combos; else if (kk === 'fmt') EH.fmt = v; vueExport(); }
      else if (k === 'ehgo') ehTelecharger();
      else if (k === 'fdsave') { const key = ((document.getElementById('pz-fd-key') || {}).value || '').trim(); const c = fdCfg(); c.key = key; try { localStorage.setItem(FD_CFG, JSON.stringify(c)); } catch (er) {} Object.keys(_extT).filter(x => x.startsWith('fd|')).forEach(x => delete _extT[x]); toast(key ? 'Clé football-data enregistrée' : 'Clé football-data retirée'); rafraichir(); }
      else if (k === 'menu') { const kk = z.dataset.k; if (OUV.has(kk)) OUV.delete(kk); else OUV.add(kk); const v = document.getElementById('view'); if (v) v.__pzH = null; const ht = document.getElementById('pzTennis'); if (ht) ht.__pzH = null; decorer(); }
      else if (k === 'stong') { stOng = z.dataset.k; decorer(); }
      else if (k === 'stdc') { stDcPer = +z.dataset.k; decorer(); }
      else if (k === 'stsans') { stSans = !stSans; decorer(); }
      else if (k === 'stjour') { const d = z.dataset.k; if (stJ.has(d)) stJ.delete(d); else stJ.add(d); decorer(); }
      else if (k === 'stopen') { const c = z.dataset.k; stOpen[c] = !stOpen[c]; decorer(); }
      else if (k === 'stmode') { stMode = z.dataset.k; stSave(); decorer(); }
      else if (k === 'stcomp') { const c = z.dataset.k; if (stComp.has(c)) stComp.delete(c); else stComp.add(c); stSave(); decorer(); }
      else if (k === 'stcompall') { const cat = z.dataset.k, on = z.checked; const S0 = lireN(); S0.football.filter(b => stReg(b) && ((stCat(b.comp) || 'Autres / Non classés') === cat)).forEach(b => { const kk = (b.comp || 'Non spécifié').trim(); if (on) stComp.add(kk); else stComp.delete(kk); }); stSave(); decorer(); }
      else if (k === 'stmk') { const m = z.dataset.k; stMk = stMk === m ? null : m; decorer(); }
      else if (k === 'stco') { const m = z.dataset.k; stCo = stCo === m ? null : m; decorer(); }
      else if (k === 'streset') { stComp = new Set(); stMk = null; stCo = null; stSave(); decorer(); }
      else if (k === 'autocombo') combinerAuto();
      else if (k === 'totennis') deplacerTennis();
      else if (k === 'csv') exporterCsv();
      else if (k === 'ext') { const b = document.getElementById(z.dataset.b); if (b) b.click(); }
      else if (k === 'mkadd') { const i = document.getElementById('pz-mkn'), t = i && i.value.trim(); if (t) majMarches(m => { if (!m.some(x => x.toLowerCase() === t.toLowerCase())) m.push(t); }); }
      else if (k === 'mkdel') majMarches(m => { m.splice(+z.dataset.i, 1); });
      else if (k === 'anrun') { const t = document.getElementById('pz-an-t'); anTexte = t ? t.value : anTexte; if (!anTexte.trim()) toast('Colle d\'abord le texte à analyser.'); else { try { AN = analyser(anTexte); } catch (x) { AN = null; toast('Analyse impossible : ' + x.message); } const v = document.getElementById('view'); if (v) v.__pzH = null; decorer(); } }
      else if (k === 'anclear') { AN = null; anTexte = ''; const v = document.getElementById('view'); if (v) v.__pzH = null; decorer(); }
      else if (k === 'ansave') anSave(+z.dataset.i);
      else if (k === 'ansavesel') anSaveCoches();
      else if (k === 'suivw' || k === 'suivl') { const [rid, rg] = z.dataset.k.split('|'), L = suiviLire(), rec = L.find(x => String(x.id) === rid), o = rec && rec.options.find(x => String(x.rang) === rg); if (o) { o.status = k === 'suivw' ? 'Won' : 'Lost'; o.manuel = true; suiviEcrire(L); decorer(); } }
      else if (k === 'antake') { if (anSaveCoches(+z.dataset.i)) { AN = null; anTexte = ''; const v = document.getElementById('view'); if (v) v.__pzH = null; window.__pzForce = true; try { decorer(); } finally { window.__pzForce = false; } const t = document.getElementById('pz-an-t'); if (t) { t.value = ''; t.focus(); } window.scrollTo(0, 0); } }
      else if (k === 'anex') { const t = z.dataset.k; if (anEx.has(t)) anEx.delete(t); else anEx.add(t); try { localStorage.setItem(AN_EXK, JSON.stringify([...anEx])); } catch (x) {} if (AN) AN.rows = anLignes(AN.candidats, AN.home, AN.away, AN.competition); const v = document.getElementById('view'); if (v) v.__pzH = null; decorer(); }
      else if (k === 'ancopy') anCopier();
      else if (k === 'anexport') anExport();
      return;
    }
    const pa = e.target.closest('#tabs [data-act=pzanalyse]');
    if (pa) { e.preventDefault(); e.stopImmediatePropagation(); allerFoot(); window.__pzVue = true; filtre = 'analyse'; decorer(); window.scrollTo(0, 0); return; }
    const p = e.target.closest('#tabs [data-act=pronos]');
    if (p) { e.preventDefault(); e.stopImmediatePropagation(); allerFoot(); window.__pzVue = true; if (filtre === 'analyse' && window.innerWidth >= 1100) filtre = 'cours'; decorer(); window.scrollTo(0, 0); return; }
    if (e.target.closest('#pzOv') === null && document.getElementById('pzOv') && e.target.id === 'pzOv') { fermer(); return; }
    if (e.target.closest('#tabs button') || e.target.closest('[data-act=sport]')) { window.__pzVue = false; window.__pzFrame = false; }
    const m = e.target.closest('[data-act=fmatch]'); if (m) fiche(m.dataset.id);
  }, true);
  document.addEventListener('click', e => { if (e.target.id === 'pzOv') fermer(); });
  document.addEventListener('keydown', e => {
    if (!document.getElementById('pzOv')) return;
    if (e.key === 'Escape') fermer();
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { const ok = document.querySelector('#pzOv [data-pz=save],#pzOv [data-pz=msave]'); if (ok) ok.click(); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'pz-an-t') anTexte = t.value;
    if (t.dataset && t.dataset.col != null && COL && COL[+t.dataset.col]) COL[+t.dataset.col][t.dataset.f] = t.value;
    if (t.id === 'pz-m') majSugg();
    if (t.id === 'pz-hq') { H.q = t.value; H.n = 25; const pos = t.selectionStart; window.__pzForce = true; try { decorer(); } finally { window.__pzForce = false; } const n = document.getElementById('pz-hq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } }
    if (t.id === 'pz-cq') { cbQ = t.value; cbN = 15; const pos = t.selectionStart; window.__pzForce = true; try { decorer(); } finally { window.__pzForce = false; } const n = document.getElementById('pz-cq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } }
    const q = /^pz-an-([ckps])-(\d+)$/.exec(t.id || '');
    if (q && AN && AN.rows[+q[2]]) {
      const r = AN.rows[+q[2]]; r[{ c: 'comp', k: 'marche', p: 'prono', s: 'mise' }[q[1]]] = t.value;
      if (q[1] === 'p') { const c = marcheSelonPronostic(r.marche, r.prono), sel = document.getElementById('pz-an-k-' + q[2]); if (c !== r.marche && sel && [...sel.options].some(o => o.value === c)) { r.marche = c; sel.value = c; } }
    }
    if (t.id === 'pz-ms') { miseCombo = parseFloat(t.value) || 0; const g = document.getElementById('pz-gain'); if (g) g.textContent = 'gain possible ' + eur(miseCombo * parseFloat(g.dataset.odds)).replace('+', ''); }
    if (t.id === 'pz-m') {                                   // choisir un match de Statify préremplit le championnat et la date
      const x = String(t.value).toLowerCase(), m = matchs().find(q => (q.hn + ' vs ' + q.an).toLowerCase() === x);
      const box = t.closest('.pz-fm');
      if (m && box && box.dataset.new === '1') { const c = document.getElementById('pz-c'), d = document.getElementById('pz-d'); if (c && !c.value) c.value = FLGN[m.lg] || ''; if (d) d.value = jourDe(m.d); }
    }
  });
  document.addEventListener('change', e => { const q = /^pz-an-k-(\d+)$/.exec(e.target.id || ''); if (q && AN && AN.rows[+q[1]]) AN.rows[+q[1]].marche = e.target.value; });
  window.addEventListener('storage', e => { if (e.key === KEY && !window.__pzFrame) { cache = null; rafraichir(); } });

  // Sur ordinateur : choix du sport + boutons de l'en-tête rangés en bas de la colonne de gauche
  function dock() {
    const head = document.querySelector('header'), seg = document.getElementById('sportSeg'), row = head && head.querySelector(':scope > .row') || document.querySelector('#pzDock > .row');
    if (!seg || !row) return;
    let d = document.getElementById('pzDock');
    if (window.innerWidth >= 1100) {
      if (!d) { d = document.createElement('div'); d.id = 'pzDock'; document.body.appendChild(d); }
      let top = document.getElementById('pzTop');
      if (!top) {
        top = document.createElement('div'); top.id = 'pzTop';
        const br = head && head.querySelector('.brand');
        if (br) { const c = br.cloneNode(true); c.classList.add('pz-brand'); top.appendChild(c); }
        document.body.appendChild(top);
      }
      if (seg.parentElement !== top) top.appendChild(seg);
      if (row.parentElement !== d) d.appendChild(row);
      if (!document.getElementById('pzDockTog')) { const t = document.createElement('button'); t.id = 'pzDockTog'; t.type = 'button'; t.className = 'sec'; t.innerHTML = '⚙︎ Outils &amp; sauvegarde <span>▾</span>'; t.addEventListener('click', () => { d.classList.toggle('open'); t.querySelector('span').textContent = d.classList.contains('open') ? '▴' : '▾'; }); d.prepend(t); }
      document.body.classList.add('pz-docked');
      document.documentElement.style.setProperty('--pzdock', (d.offsetHeight + 12) + 'px');
      document.documentElement.style.setProperty('--pztop', (top.offsetHeight + 8) + 'px');
    } else if (d && head) {
      const lead = document.getElementById('leaders');
      head.insertBefore(seg, lead || head.children[1] || null); head.appendChild(row);
      document.body.classList.remove('pz-docked');
    }
  }
  window.addEventListener('resize', () => { try { dock(); } catch (e) {} });
  try { dock(); } catch (e) {}

  // Après chaque affichage de Statify, on ajoute les paris
  if (typeof render === 'function') {
    const avant = render;
    render = function () { if (window.__pzVue && window.__pzFrame && document.querySelector('#view iframe.pz-if')) return; const r = avant.apply(this, arguments); try { decorer(); } catch (e) {} return r; };
  }
  try { decorer(); } catch (e) {}
  setInterval(() => { if (document.hidden) return; try { decorer(); } catch (e) {} }, 5000);
})();
