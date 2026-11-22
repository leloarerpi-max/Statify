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
  const mots = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w));
  const pareil = (x, y) => { const a = mots(x), b = mots(y); return a.some(u => b.some(v => u === v || (u.length >= 4 && v.length >= 4 && (u.startsWith(v) || v.startsWith(u))))); };
  const cotes = m => String(m || '').split(/\s+(?:vs\.?|v)\s+|\s+[-–—]\s+/i);
  function matchs() {
    try { return Object.entries(foot.leagues || {}).flatMap(([lg, L]) => Object.values(L.matches || {}).map(m => Object.assign({ lg }, m))); } catch (e) { return []; }
  }
  let cache = null, cacheT = 0;
  function trouverM(b) {
    if (!cache || Date.now() - cacheT > 3000) { cache = matchs(); cacheT = Date.now(); }
    const [h, a] = cotes(b.match); if (!h || !a) return null;
    const j = b.date ? Date.parse(b.date) : 0;
    const ok = cache.filter(m => (pareil(h, m.hn) && pareil(a, m.an)) || (pareil(h, m.an) && pareil(a, m.hn)));   // domicile/extérieur parfois inversés à la saisie
    if (!ok.length) { manque(b); return null; }
    ok.sort((x, y) => Math.abs(Date.parse(x.d) - j) - Math.abs(Date.parse(y.d) - j));
    const m = ok[0];
    return (!j || Math.abs(Date.parse(m.d) - j) < 2.5 * 864e5) ? m : null;
  }

  /* ---------- Score à la mi-temps (d'après les buts datés de Statify) ---------- */
  const estMT = b => /mi-temps|1[eè]re mt|\bmt\b|half/i.test(String(b.prono || '')) || /^mi-temps$/i.test(String(b.market || ''));
  const _dl = new Set();
  function scoreMT(m) {
    if (!m || m.st === 'pre') return null;
    const per = +m.per || 0, fini = m.done || m.st === 'post', hs = +m.hs || 0, as = +m.as || 0;
    if (m.st === 'in' && per <= 1) return { h: hs, a: as, final: /^ht$|half|mi-temps/i.test(String(m.det || '').trim()) };
    if (!hs && !as) return { h: 0, a: 0, final: true };
    const g = ((m.x && m.x.ev) || []).filter(e => e.t === 'g' || e.t === 'pg' || e.t === 'og');
    if (g.length !== hs + as || g.some(e => e.s !== 'h' && e.s !== 'a')) {
      if (!m.x && !_dl.has(m.id) && typeof footGet === 'function' && typeof footIngest === 'function') {   // détail des buts pas encore chargé : on le demande une fois
        _dl.add(m.id);
        footGet('https://site.api.espn.com/apis/site/v2/sports/soccer/' + m.lg + '/summary?event=' + m.id).then(d => { footIngest({ __foot: 'summary', league: m.lg, id: m.id, data: d }); try { footSave(); } catch (e) {} rafraichir(); }).catch(() => {});
      }
      return null;
    }
    const p1 = g.filter(e => (+e.m || 0) <= 45);
    return { h: p1.filter(e => e.s === 'h').length, a: p1.filter(e => e.s === 'a').length, final: true };
  }

  /* ---------- Matchs hors de la période chargée par Statify : on les va chercher ---------- */
  const _jours = new Set(); let _tm = 0;
  function manque(b) {
    if (b.status === 'Won' || b.status === 'Lost' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || _jours.has(b.date)) return;
    const dt = Date.parse(b.date + 'T12:00:00'); if (!dt || Math.abs(dt - Date.now()) > 21 * 864e5) return;
    _jours.add(b.date); clearTimeout(_tm); _tm = setTimeout(chargerJours, 600);
  }
  async function chargerJours() {
    if (typeof footGet !== 'function' || typeof footIngest !== 'function' || typeof FLG === 'undefined') return;
    const jours = [..._jours].filter(j => !_faits.has(j)); let n = 0;
    for (const j of jours) { _faits.add(j); const d8 = j.replace(/-/g, '');
      await Promise.all(FLG.map(async ([lg]) => { try { n += footIngest({ __foot: 'scores', league: lg, data: await footGet('https://site.api.espn.com/apis/site/v2/sports/soccer/' + lg + '/scoreboard?dates=' + d8) }) || 0; } catch (e) {} })); }
    if (n) { try { footSave(); } catch (e) {} cache = null; rafraichir(); }
  }
  const _faits = new Set();

  /* ---------- État d'un pari d'après le score ---------- */
  // won = gagné (ou déjà acquis), ok = en passe, live = en cours, pre = à venir, lost = perdu, end = à régler, nf = pas suivi par Statify
  function etatM(b, m) {
    if (b.status === 'Won') return 'won';
    if (b.status === 'Lost') return 'lost';
    if (!m) return 'nf';
    if (m.st === 'pre') return 'pre';
    const h = +m.hs || 0, a = +m.as || 0, t = h + a, fini = m.done || m.st === 'post';
    const p = String(b.prono || '').toLowerCase();
    if (estMT(b)) {
      const ht = scoreMT(m); if (!ht) return fini ? 'end' : 'live';
      const hh = ht.h, aa = ht.a, tt = hh + aa; let bon = null, acq = false, y;
      if (/deux|btts|both/.test(p)) { bon = hh > 0 && aa > 0; acq = bon; }
      else if ((y = p.match(/(?:plus de|over|\+)\s*(\d+(?:[.,]\d+)?)/))) { bon = tt > parseFloat(y[1].replace(',', '.')); acq = bon; }
      else if ((y = p.match(/(?:moins de|under)\s*(\d+(?:[.,]\d+)?)/))) bon = tt < parseFloat(y[1].replace(',', '.'));
      else { const dom = pareil(p, m.hn), ext = pareil(p, m.an); if (/nul|draw/.test(p) && !dom && !ext) bon = hh === aa; else if (dom) bon = hh > aa; else if (ext) bon = aa > hh; }
      if (bon === null) return fini ? 'end' : 'live';
      if (ht.final) return bon ? 'won' : 'lost';
      return acq ? 'won' : bon ? 'ok' : 'live';
    }
    let bon = null, acquis = false;
    let x;
    if (/deux|btts|both/.test(p)) { bon = h > 0 && a > 0; acquis = bon; }
    else if ((x = p.match(/(?:plus de|over|\+)\s*(\d+(?:[.,]\d+)?)/))) { const n = parseFloat(x[1].replace(',', '.')); bon = t > n; acquis = bon; }
    else if ((x = p.match(/(?:moins de|under)\s*(\d+(?:[.,]\d+)?)/))) { const n = parseFloat(x[1].replace(',', '.')); bon = t < n; }
    else if (/victoire|gagne|vainqueur|win/.test(p) || /1n2/i.test(b.market || '')) {
      const dom = pareil(p, m.hn), ext = pareil(p, m.an);
      if (/nul|draw|\bn\b/.test(p) && !dom && !ext) bon = h === a; else if (dom) bon = h > a; else if (ext) bon = a > h;
    }
    if (bon === null) return fini ? 'end' : 'live';
    if (fini) return bon ? 'won' : 'lost';
    return acquis ? 'won' : bon ? 'ok' : 'live';
  }
  const LIB = { won: 'gagné', ok: 'en passe', live: 'en cours', pre: 'à venir', lost: 'perdu', end: 'à régler', nf: 'pas suivi par Statify' };
  const libEtat = (e, m) => e === 'won' && m && !(m.done || m.st === 'post') ? 'déjà passé' : LIB[e];

  /* ---------- Données ---------- */
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
  const scoreDe = m => !m ? '' : m.st === 'pre' ? new Date(m.d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : `${m.hs}-${m.as}${m.st === 'in' ? ' · ' + esc(m.clk || m.det || '') : ''}`;
  function etatCombo(x) {
    if (x.perdu) return ['lost', 'perdu'];
    if (x.regle || x.gagne) return ['won', 'gagné'];
    const ok = x.legs.filter(l => l.e === 'won').length;
    if (x.legs.every(l => l.e === 'pre' || l.e === 'nf')) return ['pre', 'à venir'];
    return ['live', ok + '/' + x.legs.length + ' passé' + (ok > 1 ? 's' : '')];
  }
  function ligneMatch(items) {
    return items.map(({ l, combo }) => `<div class="pz-line"><span class="pz-ic">🎯</span><b>${esc(l.b.prono)} · ${cote(l.b.odds)}</b>${pastille(l.e, l.m)}${combo ? `<span class="pz-cb">Combiné ${cote(combo.odds)}</span>` : '<span class="pz-cb pz-solo">Solo</span>'}</div>`).join('');
  }
  function jambe(l, edit) {
    const ic = { won: '✅', lost: '❌', ok: '🟢', live: '🔴', pre: '⏳', end: '❔', nf: '➖' }[l.e];
    const id = esc(l.b.id), W = l.b.status === 'Won', P = l.b.status === 'Lost';
    const act = edit ? `<span class="pz-act"><button class="sec pz-ib${W ? ' pz-onw' : ''}" data-pz="won" data-id="${id}" title="Marquer gagné">✓ Gagné</button><button class="sec pz-ib${P ? ' pz-onl' : ''}" data-pz="lost" data-id="${id}" title="Marquer perdu">✗ Perdu</button><button class="sec pz-ib" data-pz="edit" data-id="${id}" title="Modifier">✎</button><button class="sec pz-ib" data-pz="del" data-id="${id}" title="Supprimer">🗑</button></span>` : '';
    return `<div class="pz-leg"><span>${ic}</span><div class="pz-lt"><b ${l.m ? `class="link" data-act="fmatch" data-id="${esc(l.m.id)}"` : ''}>${esc(l.b.match.replace(/\s+vs\s+/i, ' – '))}</b><small class="mut">${esc(l.b.prono)} · ${cote(l.b.odds)}${l.e === 'nf' ? ' · pas suivi par Statify' : ''}</small>${act}</div><b class="pz-sc">${scoreJambe(l)}</b></div>`;
  }
  function scoreJambe(l) {
    if (!l.m || !estMT(l.b)) return scoreDe(l.m);
    const ht = scoreMT(l.m); if (!ht || l.m.st === 'pre') return scoreDe(l.m);
    return `${scoreDe(l.m)}<small class="mut" style="display:block;font-weight:600;font-size:11px">MT ${ht.h}-${ht.a}${ht.final ? '' : ' ·'}</small>`;
  }
  function carteCombo(x, edit) {
    const [e, t] = etatCombo(x), cid = esc(x.c.id);
    const pied = edit ? `<div class="pz-cf"><button class="sec pz-ib" data-pz="mcombo" data-id="${cid}">✎ Mise</button><button class="sec pz-ib" data-pz="dcombo" data-id="${cid}" title="Les paris redeviennent des simples">Défaire</button><button class="sec pz-ib" data-pz="xcombo" data-id="${cid}">🗑 Supprimer</button></div>` : '';
    return `<div class="pz-combo"><div class="pz-ch"><b>Combiné · ${cote(x.odds)}</b><span class="pz-st pz-${e}">${esc(t)}</span></div><small class="mut">Mise ${eur(x.stake).replace('+', '')} · gain possible ${eur(x.stake * x.odds).replace('+', '')}</small>${x.legs.map(l => jambe(l, edit)).join('')}${pied}</div>`;
  }
  function bilan(D, grand) {
    return `<div class="pz-bil${grand ? ' pz-big' : ''}"><div class="pz-k pz-main"><span>Combinés · bilan</span><b class="${D.netC < 0 ? 'pz-neg' : 'pz-pos'}">${eur(D.netC)}</b><small class="mut">ROI ${D.miseC ? (100 * D.netC / D.miseC).toFixed(1).replace('.', ',') : '0,0'} %</small></div>
      <div class="pz-k"><span>Solo</span><b class="${D.netS < 0 ? 'pz-neg' : 'pz-pos'}">${eur(D.netS)}</b></div>
      <div class="pz-k"><span>En attente</span><b>${D.nbAttente}</b></div>
      <div class="pz-k pz-sit"><span>Aujourd'hui si tout passe</span><b class="pz-pos">${eur(D.siTout)}</b></div></div>`;
  }

  /* ---------- Décoration des écrans de Statify ---------- */
  function decorer() {
    if (typeof ui !== 'undefined' && ui.sport === 'tennis') return tennisParis();
    if (typeof ui === 'undefined' || ui.sport !== 'foot') return;
    const D = donnees();
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
      const ajd = (D.ajd.length ? D.ajd : D.ouvertsC).slice(0, petit ? 2 : 4);
      const avant = petit && zr.querySelector('[data-fb=multi]');
      (avant || zr).insertAdjacentHTML(avant ? 'beforebegin' : 'afterbegin', `<div class="fb" data-fb="paris"><div class="card rail pz-rail"><h2>🎯 Mes paris <span class="link pz-add" data-pz="new">＋ Pari</span><span class="link pz-all" data-pz="open">Tout voir</span></h2>${bilan(D)}${ajd.map(x => carteCombo(x, true)).join('') || '<p class="mut">Aucun combiné en cours.</p>'}</div></div>`);
    }
    // 3) onglet « Pronos » → « Mes paris »
    const tabs = document.getElementById('tabs'), grand = window.innerWidth >= 1100;
    if (tabs && grand) {
      if (typeof ui !== 'undefined' && !ui.tabMore && !window.__pzMore) { window.__pzMore = 1; ui.tabMore = true; setTimeout(() => { try { render(); } catch (e) {} window.__pzMore = 0; }, 0); }
      const br = document.querySelector('header .brand');
      if (br && !tabs.querySelector('.pz-brand')) { const c = br.cloneNode(true); c.classList.add('pz-brand'); c.removeAttribute('id'); tabs.prepend(c); }
    }
    const t = document.querySelector('#tabs [data-act=pronos]');
    if (t && grand && !tabs.querySelector('[data-act=pzanalyse]')) { const a = t.cloneNode(false); a.setAttribute('data-act', 'pzanalyse'); a.removeAttribute('id'); a.innerHTML = '<i>🔍</i><span>Analyseur</span>'; t.insertAdjacentElement('afterend', a); }
    const ta = document.querySelector('#tabs [data-act=pzanalyse]'); if (ta) ta.classList.toggle('on', !!window.__pzVue && filtre === 'analyse');
    if (t) { const s = t.querySelector('span'); if (s && s.textContent !== 'Mes paris') s.textContent = 'Mes paris'; t.classList.toggle('on', !!window.__pzVue && !(grand && filtre === 'analyse')); if (D.nbAttente && !t.querySelector('.pz-badge')) t.insertAdjacentHTML('beforeend', `<em class="pz-badge">${D.nbAttente}</em>`); }
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
  function formulaire(opt) {
    opt = opt || {};
    const S = lire(), L = S[SP()] || [];
    const b = opt.id != null ? L.find(x => String(x.id) === String(opt.id)) : null;
    const mk = marches(); if (b && b.market && !mk.includes(b.market)) mk.push(b.market);
    const v = b || { date: opt.date || jour(), match: opt.match || '', comp: opt.comp || '', market: opt.market || mk[0], prono: '', odds: '', stake: (L[0] && +L[0].stake) || 1 };
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
        <label class="pz-f"><span>Cote</span><input id="pz-o" type="number" step="0.01" min="1.01" inputmode="decimal" value="${esc(v.odds)}"></label>
        <label class="pz-f"><span>Mise (€)</span><input id="pz-s" type="number" step="0.5" min="0.1" inputmode="decimal" value="${esc(v.stake)}"></label>
      </div>${dl('pz-lm', noms)}${dl('pz-lc', comps)}${dl('pz-lp', pronos)}
      <p class="pz-err" id="pz-err"></p>
      <div class="pz-fa">${b ? `<button class="sec pz-danger" data-pz="del" data-id="${esc(b.id)}">🗑 Supprimer</button>` : ''}<span style="flex:1"></span><button class="sec" data-pz="cancel">Annuler</button><button data-pz="save" data-id="${b ? esc(b.id) : ''}">Enregistrer</button></div></div>`);
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
    if (legs.length < 2) return;
    const ks = legs.map(l => norm(l.b.match));
    if (ks.some((k, i) => k && ks.indexOf(k) !== i)) { toast('Deux sélections portent sur le même match : retire-en une.'); return; }
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
                lignes.push(`${matchDate} | ${nomMatch} | ${nomCompetition} | ${marche} | ${pronostic} | 1 | ${fmtCote(coteAjustee(c.cote))}`);
            });
        }
        lignes.push("");
        lignes.push("Calcul par règles mathématiques, pas une garantie de résultat. Paris = risque financier.");
        lignes.push(`Généré le ${new Date().toLocaleString('fr-FR')}`);
        return lignes.join("\n");
    }

  /* ---------- Analyseur : colle le texte d'analyse, enregistre les paris calculés ---------- */
  let anTexte = '', AN = null;
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
    const rows = candidats.slice(0, 3).map(c => { const { marche, pronostic } = separerMarchePronostic(c.label, home, away); return { c, marche, prono: pronostic, comp, mise: '1', odds: coteAjustee(c.cote), saved: false }; });
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
        const opts = r.candidats.slice(0, 3).map((c, i) => `<div class="pz-combo${c.conflit ? ' pz-conf' : ''}"><div class="pz-ch"><b>Option ${i + 1} · ${esc(c.label)}</b><span class="pz-st pz-live">cote ${fmtCote(c.cote)}</span></div><small class="mut">Fiabilité calculée : ${Math.round(c.finalScore)}/100${c.cotesSeules ? ' · d\'après les cotes seules, à confirmer' : c.nbSources === 1 ? ' · une seule source de données, à confirmer' : ''}${c.conflit ? ' · ⚠️ signaux domicile/extérieur contradictoires' : ''}</small><p class="pz-det">${esc(c.detail)}</p></div>`).join('');
        const mk = marches();
        const rows = r.rows.map((x, i) => { const lm = mk.includes(x.marche) ? mk : [...mk, x.marche]; return `<div class="pz-combo pz-anr"><div class="pz-fg">
          <label class="pz-f"><span>Championnat</span><input id="pz-an-c-${i}" list="pz-an-lc" value="${esc(x.comp)}" autocomplete="off"></label>
          <label class="pz-f"><span>Marché</span><select id="pz-an-k-${i}">${lm.map(m => `<option${m === x.marche ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
          <label class="pz-f w"><span>Pronostic</span><input id="pz-an-p-${i}" value="${esc(x.prono)}" autocomplete="off"></label>
          <label class="pz-f"><span>Mise (€)</span><input id="pz-an-s-${i}" inputmode="decimal" value="${esc(x.mise)}"></label>
          <div class="pz-f"><span>Cote <small class="mut" style="text-transform:none;letter-spacing:0">(${fmtCote(x.c.cote)} − ${String(REDUCTION_COTE_PCT).replace('.', ',')} %)</small></span><b class="pz-cote">${fmtCote(x.odds)}</b></div></div>
          <div class="pz-fa">${x.saved ? '<span class="pz-st pz-won">✓ Enregistré dans Mes paris</span>' : ''}<span style="flex:1"></span><button data-pz="ansave" data-i="${i}"${x.saved ? ' class="sec"' : ''}>💾 ${x.saved ? 'Enregistrer à nouveau' : 'Enregistrer'}</button></div></div>`; }).join('');
        corps = `<h3 class="pz-h3">Paris calculés à partir des cotes et statistiques</h3><div class="pz-grid">${opts}</div>
          <h3 class="pz-h3">Enregistrer dans Mes paris · ${esc(r.nomMatch)} · ${esc(r.date)}</h3><div class="pz-grid">${rows}</div><datalist id="pz-an-lc">${comps.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          <div class="pz-fa"><button class="sec" data-pz="ancopy">Copier les lignes</button><button class="sec" data-pz="anexport">Exporter en .txt</button></div>`;
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
  function barreCombine(D) {
    sel = new Set([...sel].filter(i => D.ouvertsS.some(s => String(s.b.id) === i)));
    if (!sel.size) return '';
    const legs = [...sel].map(i => D.ouvertsS.find(s => String(s.b.id) === i)), odds = legs.reduce((p, l) => p * (+l.b.odds || 1), 1);
    if (miseCombo == null) { const dern = ((D.S.combos || {})[SP()] || []).slice(-1)[0]; miseCombo = dern ? +dern.stake : 1; }
    return `<div class="pz-bar"><b>${legs.length} sélection${legs.length > 1 ? 's' : ''} · cote ${cote(odds)}</b><label>Mise <input id="pz-ms" type="number" step="0.5" min="0.1" inputmode="decimal" value="${esc(miseCombo)}"> €</label><span class="mut" id="pz-gain" data-odds="${odds}">gain possible ${eur(miseCombo * odds).replace('+', '')}</span><span style="flex:1"></span><button class="sec" data-pz="selclear">Vider</button><button data-pz="mkcombo"${legs.length < 2 ? ' disabled title="Coche au moins 2 paris"' : ''}>Créer le combiné</button></div>`;
  }
  function carteSolo(s) {
    const pend = s.b.status === 'Pending' || !s.b.status;
    return `<div class="pz-combo"><div class="pz-ch">${pend ? `<label class="pz-ck" title="Cocher pour faire un combiné"><input type="checkbox" data-pz="sel" data-id="${esc(s.b.id)}"${sel.has(String(s.b.id)) ? ' checked' : ''}><b>Solo · ${cote(s.b.odds)}</b></label>` : `<b>Solo · ${cote(s.b.odds)}</b>`}${pastille(s.e, s.m)}</div><small class="mut">Mise ${eur(+s.b.stake || 0).replace('+', '')} · ${esc(s.b.date || '')}</small>${jambe(s, true)}</div>`;
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
  function parJour(arr, ms, rend, desc, cls) {
    const L = arr.map(x => ({ x, t: ms(x) })).sort((a, b) => desc ? b.t - a.t : a.t - b.t), G = [];
    L.forEach(o => { const k = isFinite(o.t) && o.t ? cleJour(o.t) : '?'; let g = G[G.length - 1]; if (!g || g.k !== k) { g = { k, t: o.t, a: [] }; G.push(g); } g.a.push(o.x); });
    return G.map(g => `<h3 class="pz-h3 pz-jour">${g.k === '?' ? 'Date inconnue' : esc(libJour(g.t))}</h3><div class="pz-grid">${g.a.map(rend).join('')}</div>`).join('');
  }
  function corpsCours(D) {
    const enCours = D.ouvertsC, live = enCours.filter(x => x.legs.some(l => l.m && l.m.st === 'in')), avenir = enCours.filter(x => !live.includes(x));
    const grp = (titre, arr) => arr.length ? `<h3 class="pz-h3">${titre}</h3><div class="pz-grid">${arr.slice().sort((a, b) => msCombo(a) - msCombo(b)).map(x => carteCombo(x, true)).join('')}</div>` : '';
    const solosO = D.ouvertsS.length ? `<h3 class="pz-h3">📌 Paris simples <span class="mut pz-hint">· coche-en plusieurs pour faire un combiné</span></h3>${parJour(D.ouvertsS, msSolo, carteSolo, false)}` : '';
    const venir = avenir.length ? `<h3 class="pz-h3 pz-sec">⏳ À venir</h3>${parJour(avenir, msCombo, x => carteCombo(x, true), false)}` : '';
    return (grp('🔴 En direct', live) + venir + solosO) || '<p class="mut">Aucun pari en cours. Ajoute-en un avec « ＋ Nouveau pari ».</p>';
  }
  function corpsHist(D) {
    const regles = D.C.filter(x => x.regle).sort((a, b) => (b.jour > a.jour ? 1 : -1)).slice(0, 30);
    const soloH = D.solos.filter(s => s.b.status === 'Won' || s.b.status === 'Lost').sort((a, b) => ((b.b.date || '') > (a.b.date || '') ? 1 : -1)).slice(0, 40);
    return `${regles.length ? `<h3 class="pz-h3 pz-sec">Combinés réglés</h3>${parJour(regles, msCombo, x => carteCombo(x, true), true)}` : ''}${soloH.length ? `<h3 class="pz-h3 pz-sec">Paris simples réglés</h3>${parJour(soloH, msSolo, carteSolo, true)}` : ''}` || '<p class="mut">Rien de réglé pour l\'instant.</p>';
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
    const ligne = `<div class="row pz-tabs">${ongletsHtml(D)}${filtre === 'cours' || filtre === 'hist' ? `<button class="pz-new" data-pz="new">＋ Nouveau pari</button><label class="pz-auto" title="Comme dans PronoTracker : règle Gagné / Perdu quand le match est terminé"><input type="checkbox" data-pz="auto"${auto ? ' checked' : ''}> Régler automatiquement</label>` : ''}</div>`;
    let haut = '', corps = '';
    if (filtre === 'cours') { haut = bilan(D, true); corps = corpsCours(D); }
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
  let stComp = new Set(), stMode = 'include', stMk = null, stCo = null, stOpen = {}, stJ = new Set(), stDcPer = 0, stSans = false;
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
    const solo = `<div class="card"><h2>📈 Évolution du bankroll <span class="mut pz-hint">· profit cumulé sur la sélection filtrée</span></h2>${svgCourbe(courbeS)}</div>
      ${cats}
      <div class="card"><h2>📅 Bilan quotidien · jour par jour</h2>${stTab(['JJ/MM/AAAA', 'Joués (G/P)', 'Gain net', 'ROI'], dLignes, 'Aucun résultat quotidien enregistré.')}</div>
      <div class="pz-grid pz-2"><div class="card"><h2>🎯 Stats par type de prono (marché)</h2><p class="mut pz-hint">Touche une ligne pour filtrer le Bilan.</p>${stTabMap(mkMap, null, 'stmk', stMk)}</div>
      <div class="card"><h2>💶 Stats par tranche de cote</h2><p class="mut pz-hint">Touche une ligne pour filtrer le Bilan.</p>${stTabMap(coMap, ST_TR, 'stco', stCo)}</div></div>
      <div class="card"><h2>👥 Stats par équipe : où tu gagnes, où tu perds</h2><p class="mut pz-hint">Compte tous tes paris terminés sur les matchs de l'équipe, quel que soit le marché. Seules les équipes avec au moins 3 paris sont listées.</p><div class="pz-grid pz-2"><div><h3 class="pz-h3">✅ Les plus rentables</h3>${eqT(eqL.filter(e => e.profit > 0).sort((x, y) => y.profit - x.profit).slice(0, 5))}</div><div><h3 class="pz-h3">⚠️ Les pièges (les plus coûteuses)</h3>${eqT(eqL.filter(e => e.profit < 0).sort((x, y) => x.profit - y.profit).slice(0, 5))}</div></div></div>`;
    return `<div class="row pz-tabs">${sw}</div>${ban}${kpis}${comboCard}<h2 class="pz-h2">Stats solo <span class="mut pz-hint">· chaque pari compté seul, y compris ceux des combinés</span></h2>${solo}`;
  }

  /* --- Tennis (paris saisis à la main : pas de score en direct) --- */
  function vueTennisPage(D) {
    const cours = corpsCours(D), hist = corpsHist(D);
    return `<div class="row pz-tabs"><button class="pz-new" data-pz="new">＋ Nouveau pari tennis</button></div>
      <p class="mut" style="margin:0">Les paris tennis se règlent à la main (✓ Gagné / ✗ Perdu) : Statify n'a pas de score en direct pour tes paris tennis.</p>${cours}${hist}${barreCombine(D)}${sel.size ? '<div class="pz-sp"></div>' : ''}`;
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

  /* --- Réglages --- */
  function vueReglagesPage() {
    const auto = lsGet(AUTO) === '1', mk = marchesFoot();
    return `<div class="pz-grid pz-2">
      <div class="card"><h2>⚡ Règlement automatique</h2><label class="pz-auto" style="font-size:14px;color:var(--txt)"><input type="checkbox" data-pz="auto"${auto ? ' checked' : ''}> Régler Gagné / Perdu quand le match est terminé</label><p class="mut" style="margin:8px 0 0">D'après le score final de Statify. Sinon, une bannière te propose « Tout régler ». Chaque règlement reste annulable.</p></div>
      <div class="card"><h2>✨ Combinés automatiques</h2><p class="mut" style="margin:0 0 10px">Associe tes paris simples à venir par deux, pour une cote totale d'environ 2,00–2,40 (jamais deux fois le même match). Tu peux annuler juste après.</p><button data-pz="autocombo">✨ Combiner mes paris simples maintenant</button></div>
      <div class="card"><h2>🎯 Types de marché (foot)</h2><div class="pz-mks">${mk.map((m, i) => `<span class="pz-mk">${esc(m)}<button class="sec" data-pz="mkdel" data-i="${i}" title="Retirer">✕</button></span>`).join('')}</div><div class="pz-fa"><input id="pz-mkn" class="pz-search" placeholder="Nouveau marché (ex. Double Chance)"><button data-pz="mkadd">Ajouter</button></div></div>
      <div class="card"><h2>💾 Données &amp; synchronisation</h2><div class="pz-fa" style="margin:0"><button class="sec" data-pz="csv">📄 Exporter l'historique (CSV)</button><button class="sec" data-pz="ext" data-b="btnExport">⬇️ Sauvegarde complète</button><button class="sec" data-pz="ext" data-b="btnImport">⬆️ Importer</button><button class="sec" data-pz="ext" data-b="btnCloud">☁️ Cloud</button></div><p class="mut" style="margin:10px 0 0">Le Cloud de Statify synchronise maintenant aussi tes paris entre appareils (dernier envoi gagnant : envoie depuis l'appareil à jour, puis récupère sur l'autre).</p><button class="sec pz-ib" data-pz="f" data-k="sync" style="margin-top:8px">☁️ Ancienne synchro PronoTracker (Supabase / Firebase)</button></div></div>`;
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
    D.ouvertsS.filter(s => s.b.date && s.b.date >= auj).forEach(s => { (parJour[s.b.date] ||= []).push(s.b); });
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
  try { if (typeof CLOUD_KEYS !== 'undefined') [KEY, MARCHES].forEach(k => { if (!CLOUD_KEYS.includes(k)) CLOUD_KEYS.push(k); }); } catch (e) {}

  /* ---------- Fiche d'un match : « Mes paris sur ce match » + ajouter un pari ---------- */
  function fiche(id) {
    setTimeout(() => {
      const box = document.querySelector('#modal .mbox'); if (!box || box.querySelector('.pz-fiche')) return;
      const it = donnees().parMatch.get(String(id)) || [];
      const m = matchs().find(x => String(x.id) === String(id));
      const ajout = m ? `<button class="sec pz-ib" data-pz="new" data-m="${esc(m.hn + ' vs ' + m.an)}" data-c="${esc(FLGN[m.lg] || '')}" data-d="${esc(jourDe(m.d))}">＋ Parier sur ce match</button>` : '';
      const html = `<div class="pz-fiche"><b>🎯 Mes paris sur ce match</b>${it.length ? ligneMatch(it) : '<p class="mut" style="margin:6px 0 0">Aucun pari sur ce match.</p>'}${ajout}</div>`;
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
  .pz-new{margin-left:auto}.pz-auto{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--mut);cursor:pointer}.pz-auto input{width:16px;height:16px;accent-color:var(--acc)}
  .pz-ban{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between;padding:10px 14px;border-radius:14px;background:color-mix(in srgb,var(--ok) 14%,transparent);font-weight:700;font-size:13.5px}
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
  @media (min-width:1100px){.pz-bar{left:252px;bottom:16px}}.pz-sp{height:150px}.pz-jour{font-size:12.5px;opacity:.85;margin-top:14px}  .pz-tbw{overflow-x:auto}.pz-tb{width:100%;border-collapse:collapse;font-size:12.5px}.pz-tb th{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);padding:6px 8px;text-align:center;border-bottom:1px solid var(--line);white-space:nowrap}.pz-tb td{padding:7px 8px;text-align:center;border-bottom:1px solid var(--line)}.pz-tb .l{text-align:left}.pz-clk{cursor:pointer}.pz-clk:hover,.pz-tb tr.pz-on{background:var(--field)}.pz-tb tr.pz-exc{background:rgba(220,60,60,.08)}.pz-pt{color:var(--acc)}  .pz-cat{border:1px solid var(--line);border-radius:14px;margin-top:10px;overflow:hidden}.pz-cath{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:12px 14px;cursor:pointer}.pz-cath b:first-child{flex:1;min-width:140px}.pz-catb{padding:4px 14px 14px;border-top:1px solid var(--line)}
  .pz-dfs{background:var(--field);border-radius:14px;padding:12px;margin:10px 0}.pz-dl{margin-top:8px}.pz-pb{height:6px;border-radius:6px;background:var(--line);overflow:hidden;margin-top:4px}.pz-pb i{display:block;height:100%;background:var(--bad)}
  .pz-jh,.pz-jr{display:grid;grid-template-columns:.8fr 1fr 1fr 1fr 1fr 1.2fr;gap:4px;font-size:12.5px;padding:8px 4px;text-align:center}.pz-jh{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)}.pz-jr{cursor:pointer;border-bottom:1px solid var(--line)}.pz-jr span:first-child{text-align:left}.pz-jr span:last-child{text-align:right}.pz-jh span:last-child{text-align:right}.pz-jh span:first-child{text-align:left}.pz-jd{padding:6px 10px;font-size:12px;border-bottom:1px solid var(--line);background:var(--field)}
  .pz-h2{font-size:16px;margin:18px 0 4px}
.pz-sec{font-size:15px}`; document.head.appendChild(st);

  // L'onglet « Pronos » s'ouvre ici au lieu d'aller sur prono.html ; actions sur les paris
  document.addEventListener('click', e => {
    const z = e.target.closest('[data-pz]');
    if (z) {
      const k = z.dataset.pz, id = z.dataset.id;
      if (k === 'sel') { if (z.checked) sel.add(String(id)); else sel.delete(String(id)); decorer(); return; }
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
      else if (k === 'ancopy') anCopier();
      else if (k === 'anexport') anExport();
      return;
    }
    const pa = e.target.closest('#tabs [data-act=pzanalyse]');
    if (pa) { e.preventDefault(); e.stopImmediatePropagation(); window.__pzVue = true; filtre = 'analyse'; decorer(); window.scrollTo(0, 0); return; }
    const p = e.target.closest('#tabs [data-act=pronos]');
    if (p) { e.preventDefault(); e.stopImmediatePropagation(); window.__pzVue = true; if (filtre === 'analyse' && window.innerWidth >= 1100) filtre = 'cours'; decorer(); window.scrollTo(0, 0); return; }
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
  setInterval(() => { try { decorer(); } catch (e) {} }, 5000);
})();
