/* ================= PRONOS TENNIS =================
   Onglet « Tennis » de PronoTracker.
   1) Calendrier : matchs du jour (ATP / WTA, tournois du circuit) avec les deux cotes. Tu touches le VAINQUEUR de chaque match.
   2) Stats : pour tous les matchs saisis, ce que rapporterait 1 € joué toujours sur la cote basse (favori) ou toujours sur la cote haute
      (outsider), par tranche de cote, par circuit, par tournoi, et jour après jour.
   Les résultats tennis sont rangés à part : ils ne se mélangent jamais avec les paris foot.
   Matchs et cotes : route /tennis du robot Cloudflare (worker.js). Gain net pour 1 € = cote − 1 si ça gagne, −1 € sinon. */
(function () {
  'use strict';
  const KEY_ROBOT = 'prono-tennis-robot';
  const KEY_RES = 'prono_tennis_results_v1';
  const S = { robot: { url: '', key: '' }, vue: 'cal', tour: 'all', jour: '', days: {}, busy: false, err: '', res: [], strat: 'bas', diag: '', sans: false, sansBusy: false };
  try { Object.assign(S.robot, JSON.parse(localStorage.getItem(KEY_ROBOT) || '{}')); } catch (e) {}
  try { const b = JSON.parse(localStorage.getItem(KEY_RES) || '[]'); if (Array.isArray(b)) S.res = b; } catch (e) {}

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fr = (n, d = 2) => Number(n).toFixed(d).replace('.', ',');
  const signe = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fr(Math.abs(n)) + ' €';
  const r2 = n => Math.round(n * 100) / 100;
  const eid = id => encodeURIComponent(id).replace(/'/g, '%27');
  const root = () => document.getElementById('tennisViewContent');
  const sauver = () => { try { localStorage.setItem(KEY_RES, JSON.stringify(S.res)); } catch (e) {} };
  const ymdLocal = d => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const auj = () => ymdLocal(new Date());
  S.jour = auj();
  const decaler = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const joliJour = ymd => {
    const t = new Date(ymd + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
    return ymd === auj() ? "Aujourd'hui · " + t : ymd === decaler(auj(), 1) ? 'Demain · ' + t : ymd === decaler(auj(), -1) ? 'Hier · ' + t : t;
  };

  /* ---------- Calculs (fonctions pures) ---------- */
  const matchId = (jour, m) => jour + '|' + m.j1 + '|' + m.j2;
  const avecCotes = m => m && m.c1 > 1 && m.c2 > 1 && m.c1 !== m.c2;       // cotes égales : on ne peut pas dire qui est le favori
  // Pour un résultat saisi : qui était le favori, qui a gagné, et ce que 1 € aurait donné de chaque côté
  function info(r) {
    const bas = r.c1 < r.c2 ? 1 : 2, haut = bas === 1 ? 2 : 1;
    const cB = bas === 1 ? r.c1 : r.c2, cH = haut === 1 ? r.c1 : r.c2;
    const gagnantBas = r.w === bas;
    return { bas, haut, cB, cH, jB: bas === 1 ? r.j1 : r.j2, jH: haut === 1 ? r.j1 : r.j2, gagnantBas,
      gainB: gagnantBas ? r2(cB - 1) : -1, gainH: gagnantBas ? -1 : r2(cH - 1), gagnant: r.w === 1 ? r.j1 : r.j2 };
  }
  function stats(list) {
    const L = list.map(info), n = L.length, fav = L.filter(x => x.gagnantBas).length;
    const pB = r2(L.reduce((a, x) => a + x.gainB, 0)), pH = r2(L.reduce((a, x) => a + x.gainH, 0));
    return { n, fav, out: n - fav, pctFav: n ? fav / n * 100 : 0, pB, pH, roiB: n ? pB / n * 100 : 0, roiH: n ? pH / n * 100 : 0 };
  }
  const TRANCHES = [['moins de 1,15', 0, 1.15], ['1,15 à 1,29', 1.15, 1.3], ['1,30 à 1,44', 1.3, 1.45], ['1,45 à 1,59', 1.45, 1.6], ['1,60 à 1,79', 1.6, 1.8], ['1,80 à 1,99', 1.8, 2], ['2,00 à 2,49', 2, 2.5], ['2,50 à 2,99', 2.5, 3], ['3,00 à 3,99', 3, 4], ['4,00 et plus', 4, 1e9]];
  const trancheDe = c => (TRANCHES.find(t => c >= t[1] && c < t[2]) || [])[0];
  // Par tranche, pour la stratégie « toujours cote basse » (strat = 'bas') ou « toujours cote haute » ('haut') : on classe selon la cote jouée
  function parTranche(list, strat) {
    const m = new Map();
    list.forEach(r => {
      const x = info(r), cote = strat === 'bas' ? x.cB : x.cH, k = trancheDe(cote); if (!k) return;
      const o = m.get(k) || { label: k, n: 0, g: 0, profit: 0 };
      o.n++; if (strat === 'bas' ? x.gagnantBas : !x.gagnantBas) o.g++; o.profit = r2(o.profit + (strat === 'bas' ? x.gainB : x.gainH)); m.set(k, o);
    });
    return TRANCHES.map(t => m.get(t[0])).filter(Boolean).map(o => Object.assign(o, { pct: o.g / o.n * 100, roi: o.profit / o.n * 100 }));
  }
  function parCle(list, cleFn) {
    const m = new Map();
    list.forEach(r => { const k = cleFn(r); if (k) { (m.get(k) || m.set(k, []).get(k)).push(r); } });
    return [...m.entries()].map(([label, l]) => Object.assign({ label }, stats(l))).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }
  function cumul(list) {
    const j = {}; list.forEach(r => { const x = info(r), o = j[r.date] || (j[r.date] = { b: 0, h: 0 }); o.b = r2(o.b + x.gainB); o.h = r2(o.h + x.gainH); });
    let b = 0, h = 0; return Object.keys(j).sort().map(d => { b = r2(b + j[d].b); h = r2(h + j[d].h); return { d, b, h }; });
  }
  // Autres façons de regrouper (chaque fonction renvoie le libellé du groupe, ou rien)
  const ecartDe = r => { const x = info(r), e = x.cH - x.cB; return e < 0.5 ? 'Match très serré (écart < 0,50)' : e < 1 ? 'Écart 0,50 à 0,99' : e < 2 ? 'Écart 1,00 à 1,99' : 'Gros favori (écart ≥ 2,00)'; };
  const ORDRE_ECART = ['Match très serré (écart < 0,50)', 'Écart 0,50 à 0,99', 'Écart 1,00 à 1,99', 'Gros favori (écart ≥ 2,00)'];
  const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const jourSem = r => JOURS[new Date(r.date + 'T12:00:00Z').getUTCDay()];
  const moment = r => { const h = parseInt(String(r.heure).slice(0, 2), 10); return isNaN(h) ? null : h < 12 ? 'Matin (avant 12 h)' : h < 17 ? 'Après-midi (12 h à 17 h)' : 'Soir (après 17 h)'; };
  const ORDRE_MOMENT = ['Matin (avant 12 h)', 'Après-midi (12 h à 17 h)', 'Soir (après 17 h)'];
  const ORDRE_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const trier = (l, ordre) => l.sort((a, b) => ordre.indexOf(a.label) - ordre.indexOf(b.label));
  // Par joueur : bénéfice si tu avais joué 1 € sur ce joueur à chacun de ses matchs saisis
  function parJoueur(list, min) {
    const m = new Map();
    list.forEach(r => [1, 2].forEach(k => {
      const nom = k === 1 ? r.j1 : r.j2, c = k === 1 ? r.c1 : r.c2, o = m.get(nom) || { label: nom, n: 0, g: 0, profit: 0 };
      o.n++; if (r.w === k) { o.g++; o.profit = r2(o.profit + c - 1); } else o.profit = r2(o.profit - 1); m.set(nom, o);
    }));
    return [...m.values()].filter(o => o.n >= min).map(o => Object.assign(o, { pct: o.g / o.n * 100, roi: o.profit / o.n * 100 })).sort((a, b) => b.profit - a.profit);
  }
  const filtrer = () => S.res.filter(r => S.tour === 'all' || r.tour === S.tour);
  window.__tennis = { info, stats, parTranche, parCle, cumul, matchId, parJoueur, ecartDe, jourSem, moment };

  /* ---------- Styles ---------- */
  const BD = 'rgba(128,128,128,.32)';
  const card = 'border:1px solid ' + BD + ';border-radius:14px;padding:12px;margin-top:10px';
  const BLEU = '#60a5fa', AMBRE = '#fbbf24';
  const col = n => n > 0 ? '#16a34a' : n < 0 ? '#dc2626' : 'inherit';
  const pct = n => fr(n, 0) + ' %';
  const bt = (label, actif, on) => `<button type="button" onclick="${on}" style="min-height:44px;padding:0 16px;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;${actif ? 'background:#1d4ed8;color:#fff;border:1px solid #3b82f6' : 'background:transparent;color:inherit;border:1px solid ' + BD}">${label}</button>`;

  /* ---------- Calendrier ---------- */
  function boutonJoueur(m, n, jour, saisi) {
    const nom = n === 1 ? m.j1 : m.j2, cote = n === 1 ? m.c1 : m.c2, estBas = cote < (n === 1 ? m.c2 : m.c1);
    const gagne = saisi && saisi.w === n, perd = saisi && saisi.w !== n;
    const couleur = estBas ? BLEU : AMBRE;
    const st = gagne ? 'background:#16a34a;color:#fff;border:2px solid #16a34a' : `background:transparent;color:inherit;border:2px solid ${BD};${perd ? 'opacity:.55' : ''}`;
    return `<button type="button" onclick="tennisGagnant('${eid(matchId(jour, m))}',${n})" aria-pressed="${!!gagne}" style="flex:1;min-height:84px;border-radius:12px;padding:8px 6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;${st}">
      <span style="font-size:11px;font-weight:800;padding:1px 7px;border-radius:6px;${gagne ? 'background:rgba(255,255,255,.25)' : `background:${couleur};color:#0a192c`}">${estBas ? 'Cote basse' : 'Cote haute'}</span>
      <span style="font-size:13px;font-weight:700">${esc(nom)}</span>
      <span style="font-size:18px;font-weight:800">${fr(cote)}</span>
      <span style="font-size:11px;font-weight:700;${gagne ? '' : 'opacity:.75'}">${gagne ? 'Vainqueur' : 'Touche si gagnant'}</span></button>`;
  }
  function carte(m, jour) {
    const id = matchId(jour, m), saisi = S.res.find(r => r.id === id);
    const titre = `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span style="font-size:15px;font-weight:800">${esc(m.j1)} <span style="opacity:.6;font-weight:600">vs</span> ${esc(m.j2)}</span><span style="font-size:13px;font-weight:700;opacity:.7">${esc(m.heure)}</span></div>`;
    if (!avecCotes(m)) return `<div style="${card};border-style:dashed">${titre}<div style="font-size:12px;opacity:.7;margin-top:4px">${m.c1 > 1 && m.c2 > 1 ? 'Cotes identiques : favori impossible à déterminer.' : 'Cotes pas encore disponibles.'}</div></div>`;
    let bilan = '';
    if (!saisi && (m.w === 1 || m.w === 2)) bilan = `<div style="margin-top:8px;font-size:12px;opacity:.85">Résultat lu sur la page : <b>${esc(m.w === 1 ? m.j1 : m.j2)}</b> a gagné. Touche-le pour valider.</div>`;
    if (saisi) {
      const x = info(saisi);
      bilan = `<div style="margin-top:8px;font-size:12px;line-height:1.5"><b style="color:${x.gagnantBas ? BLEU : AMBRE}">${x.gagnantBas ? 'Cote basse gagnante (favori)' : 'Cote haute gagnante (surprise)'}</b><br>
        1 € sur la cote basse : <b style="color:${col(x.gainB)}">${signe(x.gainB)}</b> · 1 € sur la cote haute : <b style="color:${col(x.gainH)}">${signe(x.gainH)}</b></div>`;
    }
    return `<div style="${card}">${titre}<div style="display:flex;gap:8px;margin-top:10px">${boutonJoueur(m, 1, jour, saisi)}${boutonJoueur(m, 2, jour, saisi)}</div>${bilan}</div>`;
  }
  function vueCalendrier() {
    const data = S.days[S.jour], cfgOk = S.robot.url && S.robot.key;
    let corps = '', resume = '';
    if (data) {
      const ms = data.matchs.filter(m => S.tour === 'all' || m.tour === S.tour);
      if (!ms.length) corps = `<p style="text-align:center;opacity:.7;margin-top:24px">Aucun match de tournoi du circuit ce jour-là.</p>`;
      const groupes = [], idx = {};
      ms.forEach(m => { const k = m.tour + '|' + m.tournoi; if (!(k in idx)) { idx[k] = groupes.length; groupes.push({ tour: m.tour, tournoi: m.tournoi, l: [] }); } groupes[idx[k]].l.push(m); });
      corps += groupes.map(g => `<div style="display:flex;align-items:center;gap:8px;margin-top:18px"><span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;background:rgba(128,128,128,.28)">${esc(g.tour)}</span><span style="font-size:14px;font-weight:800">${esc(g.tournoi)}</span></div>${g.l.map(m => carte(m, S.jour)).join('')}`).join('');
      const jouables = ms.filter(avecCotes).length, saisis = ms.filter(m => S.res.some(r => r.id === matchId(S.jour, m))).length;
      const duJour = S.res.filter(r => r.date === S.jour && (S.tour === 'all' || r.tour === S.tour));
      const sj = stats(duJour);
      resume = `<div style="margin-top:14px;border:1px solid #2563eb;border-radius:12px;padding:10px 12px;font-size:13px"><b>${saisis} résultat${saisis > 1 ? 's' : ''} saisi${saisis > 1 ? 's' : ''} sur ${jouables}</b>${duJour.length ? ` · sur ces matchs, 1 € sur chaque cote basse : <b style="color:${col(sj.pB)}">${signe(sj.pB)}</b> · sur chaque cote haute : <b style="color:${col(sj.pH)}">${signe(sj.pH)}</b>` : ' · touche le vainqueur de chaque match'}</div>`;
    } else if (cfgOk && !S.err) corps = '<p style="text-align:center;opacity:.7;margin-top:24px">Chargement…</p>';
    return `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;border:1px solid ${BD};border-radius:12px;padding:4px">
        <button type="button" aria-label="Jour précédent" onclick="tennisJour(-1)" style="width:44px;height:44px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer">&lsaquo;</button>
        <button type="button" onclick="tennisJour(0)" style="min-height:44px;border:0;background:transparent;color:inherit;font-size:14px;font-weight:800;cursor:pointer">${esc(joliJour(S.jour))}</button>
        <button type="button" aria-label="Jour suivant" onclick="tennisJour(1)" style="width:44px;height:44px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer">&rsaquo;</button></div>
      ${resume}${corps}`;
  }

  /* ---------- Stats ---------- */
  function tab(titre, entetes, lignes) {
    if (!lignes.length) return '';
    return `<div style="${card}"><div style="font-size:13px;font-weight:800;margin-bottom:4px">${titre}</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="text-align:left;opacity:.65;font-size:11px">${entetes.map((h, i) => `<th style="padding:4px 6px;${i ? 'text-align:right' : 'padding-left:0'}">${h}</th>`).join('')}</tr></thead>
      <tbody>${lignes.map(l => `<tr style="border-top:1px solid ${BD}">${l.map((c, i) => `<td style="padding:8px 6px;${i ? 'text-align:right' : 'padding-left:0;font-weight:700'}${c && c.s ? ';' + c.s : ''}">${c && c.t != null ? c.t : c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }
  const P = n => ({ t: signe(n), s: `font-weight:800;color:${col(n)}` });
  function carteStrat(titre, sous, profit, roi, pc, color) {
    return `<div style="flex:1;${card};margin-top:0;min-width:140px"><div style="font-size:11px;font-weight:800;color:${color}">${titre}</div><div style="font-size:22px;font-weight:800;color:${col(profit)};margin-top:2px">${signe(profit)}</div><div style="font-size:11px;opacity:.75;margin-top:2px">${sous}</div><div style="font-size:11px;opacity:.75">Rendement ${roi > 0 ? '+' : roi < 0 ? '−' : ''}${fr(Math.abs(roi), 0)} % · gagne ${pc}</div></div>`;
  }
  function bilanHaut() {
    const L = filtrer(), s = stats(L);
    if (!s.n) return `<p style="text-align:center;opacity:.7;margin:14px 0 0;font-size:13px">Pas encore de résultat saisi. Touche le vainqueur de chaque match du calendrier : le bilan apparaît ici.</p>`;
    return `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        ${carteStrat('Toujours la cote basse (favori)', s.n + ' paris · ' + s.fav + ' gagnés', s.pB, s.roiB, pct(s.pctFav), BLEU)}
        ${carteStrat('Toujours la cote haute (outsider)', s.n + ' paris · ' + s.out + ' gagnés', s.pH, s.roiH, pct(100 - s.pctFav), AMBRE)}</div>
      <div style="${card}"><div style="font-size:13px;font-weight:800">Bénéfice cumulé</div><div style="position:relative;height:190px;margin-top:6px"><canvas id="tnChart" aria-label="Courbes du bénéfice cumulé"></canvas></div>
        <div style="font-size:11px;margin-top:6px;display:flex;gap:14px"><span><b style="color:${BLEU}">━</b> toujours cote basse</span><span><b style="color:${AMBRE}">━</b> toujours cote haute</span></div></div>`;
  }
  function detailBas() {
    const L = filtrer(), s = stats(L);
    if (!s.n) return '';
    const liste = L.slice().sort((a, b) => (b.date + b.heure).localeCompare(a.date + a.heure));
    const E5 = ['', 'Matchs', 'Favori gagne', 'Cote basse', 'Cote haute'];
    const duo = (titre, prem, l) => tab(titre, [prem].concat(E5.slice(1)), l.map(o => [o.label, o.n, pct(o.pctFav), P(o.pB), P(o.pH)]));
    const tr = strat => parTranche(L, strat).map(o => [o.label, o.n, o.g, pct(o.pct), P(o.profit), { t: (o.roi > 0 ? '+' : o.roi < 0 ? '−' : '') + fr(Math.abs(o.roi), 0) + ' %', s: 'color:' + col(o.roi) }]);
    const E6 = ['Cote', 'Matchs', 'Gagnés', 'Réussite', 'Bénéfice', 'Rendement'];
    const joueurs = parJoueur(L, 3);
    return `${tab('Par cote · toujours la cote basse (favori)', E6, tr('bas'))}
      ${tab('Par cote · toujours la cote haute (outsider)', E6, tr('haut'))}
      ${duo('Par circuit', 'Circuit', parCle(L, r => r.tour))}
      ${duo('Par tournoi', 'Tournoi', parCle(L, r => r.tournoi))}
      ${duo('Par écart entre les deux cotes', 'Écart', trier(parCle(L, ecartDe), ORDRE_ECART))}
      ${duo('Par moment de la journée', 'Moment', trier(parCle(L, moment), ORDRE_MOMENT))}
      ${duo('Par jour de la semaine', 'Jour', trier(parCle(L, jourSem), ORDRE_JOURS))}
      ${joueurs.length ? tab('Par joueur (3 matchs saisis ou plus) · si tu avais joué 1 € sur lui', ['Joueur', 'Matchs', 'Gagnés', 'Réussite', 'Bénéfice'], joueurs.slice(0, 15).map(o => [o.label, o.n, o.g, pct(o.pct), P(o.profit)])) : ''}
      <p style="font-size:11px;opacity:.6;margin:8px 0 0">« Favori gagne » = part des matchs où le joueur à la cote basse l'emporte. « Cote basse » / « Cote haute » = bénéfice si tu avais joué 1 € sur chaque favori / chaque outsider. Sur peu de matchs ces chiffres bougent beaucoup : ne conclus rien avant d'en avoir plusieurs dizaines (idéalement des centaines).</p>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-size:13px;font-weight:800;min-height:44px;display:flex;align-items:center">Résultats saisis (${liste.length})</summary>
        ${liste.map(r => { const x = info(r); return `<div style="${card};margin-top:6px;padding:8px 12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:12px;opacity:.7">${esc(r.date.slice(8, 10) + '/' + r.date.slice(5, 7))} · ${esc(r.tournoi)}${r.auto ? ' · lu automatiquement' : ''}</span><button type="button" aria-label="Supprimer ce résultat" onclick="tennisSupprimer('${eid(r.id)}')" style="width:44px;height:44px;border:0;background:transparent;color:inherit;opacity:.6;font-size:16px;cursor:pointer">✕</button></div>
          <div style="font-size:14px;font-weight:800"><span style="color:#16a34a">${esc(x.gagnant)}</span> bat ${esc(r.w === 1 ? r.j2 : r.j1)}</div>
          <div style="font-size:12px;margin-top:2px"><span style="color:${x.gagnantBas ? BLEU : AMBRE};font-weight:800">${x.gagnantBas ? 'Cote basse' : 'Cote haute'}</span> (${fr(x.gagnantBas ? x.cB : x.cH)}) · basse ${signe(x.gainB)} · haute ${signe(x.gainH)}</div></div>`; }).join('')}</details>
      <button type="button" onclick="tennisExport()" style="margin-top:16px;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid ${BD};background:transparent;color:inherit;font-weight:700;font-size:12px;cursor:pointer">Exporter les résultats (CSV)</button>`;
  }
  const sept = () => Array.from({ length: 7 }, (_, i) => decaler(auj(), -i));
  const aValider = () => { const o = []; Object.keys(S.days).forEach(j => (S.days[j].matchs || []).forEach(m => { if ((m.w === 1 || m.w === 2) && avecCotes(m) && !S.res.some(r => r.id === matchId(j, m))) o.push({ j, m }); })); return o; };
  const sansRes = () => sept().map(j => ({ j, l: ((S.days[j] && S.days[j].matchs) || []).filter(m => avecCotes(m) && !S.res.some(r => r.id === matchId(j, m)) && (S.tour === 'all' || m.tour === S.tour)) }));
  function panneauSans() {
    const v = aValider(), tot = sansRes().reduce((a, x) => a + x.l.length, 0);
    const banniere = v.length ? `<div style="margin-top:10px;border:1px solid #16a34a;border-radius:12px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:13px"><b>${v.length} résultat${v.length > 1 ? 's' : ''} lu${v.length > 1 ? 's' : ''} automatiquement</b> sur la page</span><button type="button" onclick="tennisValiderTout()" style="min-height:44px;padding:0 14px;border-radius:10px;font-weight:800;font-size:13px;background:#16a34a;color:#fff;border:0;cursor:pointer">Tout valider</button></div>` : '';
    let corps = '';
    if (S.sans) {
      corps = S.sansBusy ? '<p style="text-align:center;opacity:.7;margin-top:14px">Chargement des 7 derniers jours…</p>' : sansRes().filter(x => x.l.length).map(x => `<div style="font-size:13px;font-weight:800;margin-top:16px">${esc(joliJour(x.j))} · ${x.l.length} à saisir</div>${x.l.map(m => carte(m, x.j)).join('')}`).join('') || '<p style="text-align:center;opacity:.7;margin-top:14px">Rien à saisir : tous les matchs des 7 derniers jours ont un résultat (ou pas de cotes).</p>';
    }
    return `${banniere}<div style="margin-top:10px">${bt(S.sans ? 'Masquer les matchs sans résultat' : 'Matchs sans résultat (7 derniers jours)', S.sans, "tennisSans()")}</div>${corps}`;
  }
  const titreSect = t => `<div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.65;margin:22px 0 4px">${t}</div>`;

  function reglage() {
    const cfgOk = S.robot.url && S.robot.key;
    return `<details ${cfgOk ? '' : 'open'} style="margin-top:16px"><summary style="cursor:pointer;font-size:12px;font-weight:700;opacity:.8;min-height:44px;display:flex;align-items:center">Réglage du robot Cloudflare</summary>
      <p style="font-size:12px;opacity:.7;margin:6px 0">Adresse de ton robot (ex. https://statify-robot.ton-compte.workers.dev) et la clé SYNC_KEY.</p>
      <input id="tnUrl" placeholder="Adresse du robot" value="${esc(S.robot.url)}" autocomplete="off" style="width:100%;box-sizing:border-box;min-height:44px;padding:8px;border-radius:8px;border:1px solid ${BD};background:transparent;color:inherit;margin-bottom:6px">
      <input id="tnKey" type="password" placeholder="Clé SYNC_KEY" value="${esc(S.robot.key)}" autocomplete="off" style="width:100%;box-sizing:border-box;min-height:44px;padding:8px;border-radius:8px;border:1px solid ${BD};background:transparent;color:inherit;margin-bottom:6px">
      <button type="button" onclick="tennisSauver()" style="min-height:44px;padding:0 14px;border-radius:10px;font-weight:700;font-size:12px;background:#16a34a;color:#fff;border:0;cursor:pointer">Enregistrer et charger</button>
      <button type="button" onclick="tennisDiag()" style="min-height:44px;padding:0 14px;margin-left:6px;border-radius:10px;font-weight:700;font-size:12px;background:transparent;color:inherit;border:1px solid ${BD};cursor:pointer">Diagnostic</button>
      ${S.diag ? `<p style="font-size:12px;opacity:.7;margin:8px 0 4px">Copie tout ce texte et envoie-le moi :</p><textarea readonly onclick="this.select()" style="width:100%;box-sizing:border-box;height:160px;font-size:11px;border-radius:8px;border:1px solid ${BD};background:transparent;color:inherit">${esc(S.diag)}</textarea>` : ''}</details>`;
  }

  function render() {
    const el = root(); if (!el) return;
    const data = S.days[S.jour], n = filtrer().length;
    el.innerHTML = `<div class="surface" style="border:1px solid ${BD};border-radius:16px;padding:14px">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">
        <div><h2 style="margin:0;font-size:20px;font-weight:800">Tennis</h2><p style="margin:2px 0 0;font-size:12px;opacity:.7">Touche le vainqueur de chaque match · bilan sur ${n} match${n > 1 ? 's' : ''} saisi${n > 1 ? 's' : ''}</p></div>
        <button type="button" onclick="tennisCharger(true)" ${S.busy ? 'disabled' : ''} style="min-height:44px;padding:0 14px;border-radius:12px;font-weight:800;font-size:13px;background:#2563eb;color:#fff;border:0;cursor:pointer">${S.busy ? '…' : 'Actualiser'}</button></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">${bt('Tous', S.tour === 'all', "tennisSet('tour','all')")}${bt('ATP', S.tour === 'ATP', "tennisSet('tour','ATP')")}${bt('WTA', S.tour === 'WTA', "tennisSet('tour','WTA')")}</div>
      ${S.err ? `<p style="margin:10px 0 0;font-size:13px;color:#dc2626;font-weight:700">${esc(S.err)}</p>` : ''}
      ${data && data.avertissements && data.avertissements.length ? `<p style="margin:8px 0 0;font-size:12px;color:#d97706">${esc(data.avertissements.join(' · '))}</p>` : ''}
      ${titreSect('Bilan')}${bilanHaut()}
      ${titreSect('Calendrier du jour')}${vueCalendrier()}
      ${panneauSans()}
      ${S.res.length ? titreSect('Détail des stats') + detailBas() : ''}
      ${reglage()}
      <p style="font-size:11px;opacity:.55;margin-top:10px">Les cotes viennent de Tennis Explorer et peuvent différer de celles de ton bookmaker. Elles sont gardées au moment où tu saisis le résultat.</p></div>`;
    dessiner();
  }

  let chart = null;
  function dessiner() {
    try { if (chart) { chart.destroy(); chart = null; } } catch (e) {}
    const cv = document.getElementById('tnChart');
    if (!cv || !window.Chart) return;
    const pts = cumul(filtrer()); if (!pts.length) return;
    let tick = '#64748b', grid = 'rgba(128,128,128,.2)';
    try { tick = chartTick(); grid = chartGrid(); } catch (e) {}
    const ds = (k, c) => ({ data: pts.map(p => p[k]), borderColor: c, backgroundColor: c, tension: .25, pointRadius: 3, borderWidth: 2 });
    chart = new Chart(cv, { type: 'line', data: { labels: pts.map(p => p.d.slice(8, 10) + '/' + p.d.slice(5, 7)), datasets: [Object.assign(ds('b', BLEU), { label: 'Cote basse' }), Object.assign(ds('h', AMBRE), { label: 'Cote haute' })] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.dataset.label + ' : ' + signe(c.parsed.y) } } },
        scales: { x: { ticks: { color: tick }, grid: { color: grid } }, y: { ticks: { color: tick, callback: v => fr(v, 0) + ' €' }, grid: { color: grid } } } } });
  }

  /* ---------- Chargement des matchs ---------- */
  async function charger(force) {
    if (!S.robot.url || !S.robot.key) { S.err = ''; render(); return; }
    if (S.busy) return;
    const d = S.days[S.jour];
    if (!force && d && Date.now() - d.maj < 5 * 60e3) { render(); return; }
    const jour = S.jour;
    S.busy = true; S.err = ''; render();
    try {
      const r = await fetch(S.robot.url.replace(/\/+$/, '') + '/tennis?date=' + jour, { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error('Clé refusée : vérifie la SYNC_KEY.');
      if (!r.ok || !j.ok) throw new Error(j.error || ('Le robot a répondu ' + r.status + (r.status === 404 ? ' : colle la nouvelle version de worker.js dans Cloudflare puis Deploy.' : '')));
      S.days[jour] = j;
    } catch (e) { S.err = e.message === 'Failed to fetch' ? "Robot injoignable : vérifie l'adresse et ta connexion." : e.message; }
    S.busy = false; render();
  }

  /* ---------- Actions (appelées par les boutons) ---------- */
  window.tennisCharger = charger;
  window.tennisOuvrir = () => charger(false);
  window.tennisRecharger = () => { try { const b = JSON.parse(localStorage.getItem(KEY_RES) || '[]'); if (Array.isArray(b)) S.res = b; } catch (e) {} render(); };
  window.tennisSet = (k, v) => { S[k] = v; render(); };
  window.tennisJour = n => { S.jour = n === 0 ? auj() : decaler(S.jour, n); S.err = ''; render(); charger(false); };
  window.tennisDiag = async () => {
    S.diag = 'Chargement du diagnostic…'; render();
    try {
      const r = await fetch(S.robot.url.replace(/\/+$/, '') + '/tennis?debug=1&date=' + S.jour, { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
      S.diag = (await r.text()).slice(0, 12000);
    } catch (e) { S.diag = 'Erreur : ' + e.message; }
    render();
  };
  window.tennisSauver = () => {
    S.robot = { url: (document.getElementById('tnUrl').value || '').trim(), key: (document.getElementById('tnKey').value || '').trim() };
    try { localStorage.setItem(KEY_ROBOT, JSON.stringify(S.robot)); } catch (e) {}
    S.days = {}; charger(true);
  };
  // Touche le vainqueur : enregistre (ou change, ou retire si on retouche le même) le résultat, avec les cotes du moment
  window.tennisGagnant = (id, n) => {
    id = decodeURIComponent(id);
    const jour = id.slice(0, 10), data = S.days[jour]; if (!data) return;
    const m = data.matchs.find(x => matchId(jour, x) === id); if (!avecCotes(m)) return;
    const i = S.res.findIndex(r => r.id === id);
    if (i >= 0) {
      if (S.res[i].w === n) S.res.splice(i, 1); else S.res[i].w = n;
    } else S.res.push({ id, date: jour, heure: m.heure, tour: m.tour, tournoi: m.tournoi, j1: m.j1, j2: m.j2, c1: m.c1, c2: m.c2, w: n });
    sauver(); render();
  };
  async function chargerJour(j) {
    if (S.days[j] && Date.now() - S.days[j].maj < 5 * 60e3) return;
    try {
      const r = await fetch(S.robot.url.replace(/\/+$/, '') + '/tennis?date=' + j, { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
      const o = await r.json().catch(() => ({})); if (r.ok && o.ok) S.days[j] = o;
    } catch (e) {}
  }
  window.tennisSans = async () => {
    S.sans = !S.sans; render();
    if (!S.sans || !S.robot.url || !S.robot.key) return;
    S.sansBusy = true; render();
    for (const j of sept()) await chargerJour(j);
    S.sansBusy = false; render();
  };
  window.tennisValiderTout = () => {
    aValider().forEach(({ j, m }) => S.res.push({ id: matchId(j, m), date: j, heure: m.heure, tour: m.tour, tournoi: m.tournoi, j1: m.j1, j2: m.j2, c1: m.c1, c2: m.c2, w: m.w, auto: true }));
    sauver(); render();
  };
  window.tennisSupprimer = id => { id = decodeURIComponent(id); S.res = S.res.filter(r => r.id !== id); sauver(); render(); };
  window.tennisExport = () => {
    const l = [['Date', 'Heure', 'Circuit', 'Tournoi', 'Joueur 1', 'Cote 1', 'Joueur 2', 'Cote 2', 'Vainqueur', 'Gagnant', 'Gain cote basse', 'Gain cote haute']];
    S.res.forEach(r => { const x = info(r); l.push([r.date, r.heure, r.tour, r.tournoi, r.j1, fr(r.c1), r.j2, fr(r.c2), x.gagnant, x.gagnantBas ? 'Cote basse' : 'Cote haute', fr(x.gainB), fr(x.gainH)]); });
    const csv = '﻿' + l.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'tennis-resultats-' + auj() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  };
})();
