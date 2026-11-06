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
  const KEY_DET = 'prono_tennis_det_v1';      // détails de match lus (classement, face-à-face, saison)
  const KEY_RDJ = 'prono_tennis_rdj_v1';      // pronostics d'experts RueDesJoueurs lus par le robot
  const KEY_AUTO = 'prono_tennis_auto_v1';    // pronos auto figés avant le match
  const S = { robot: { url: '', key: '' }, vue: 'cal', tour: 'all', jour: '', days: {}, busy: false, err: '', res: [], strat: 'bas', diag: '', sans: false, sansBusy: false, det: {}, auto: [], detBusy: false, rdj: {}, rdjBusy: false };
  try { Object.assign(S.robot, JSON.parse(localStorage.getItem(KEY_ROBOT) || '{}')); } catch (e) {}
  try { const b = JSON.parse(localStorage.getItem(KEY_RES) || '[]'); if (Array.isArray(b)) S.res = b; } catch (e) {}
  try { const d = JSON.parse(localStorage.getItem(KEY_DET) || '{}'); if (d && typeof d === 'object') S.det = d; } catch (e) {}
  try { const d = JSON.parse(localStorage.getItem(KEY_RDJ) || '{}'); if (d && typeof d === 'object') S.rdj = d; } catch (e) {}
  try { const a = JSON.parse(localStorage.getItem(KEY_AUTO) || '[]'); if (Array.isArray(a)) S.auto = a; } catch (e) {}

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fr = (n, d = 2) => Number(n).toFixed(d).replace('.', ',');
  const signe = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fr(Math.abs(n)) + ' €';
  const r2 = n => Math.round(n * 100) / 100;
  const eid = id => encodeURIComponent(id).replace(/'/g, '%27');
  const root = () => document.getElementById('tennisViewContent');
  // Son (balle de tennis) à chaque validation, réglable ; confettis quand tous les matchs du jour sont saisis avec un jour gagnant
  const KEY_SON = 'prono-tennis-son';
  const sonOn = () => { try { return localStorage.getItem(KEY_SON) !== '0'; } catch (e) { return true; } };
  const jouerSon = () => { try { if (sonOn() && typeof Audio === 'function') { const a = new Audio('tennis-ball.mp3'); a.volume = .6; const p = a.play(); if (p && p.catch) p.catch(() => {}); } } catch (e) {} };
  function confettis() {
    try {
      if (typeof document.createElement !== 'function' || !document.body || !document.body.appendChild) return;
      const cols = ['#a3e635', '#fbbf24', '#60a5fa', '#f472b6', '#34d399'];
      for (let i = 0; i < 36; i++) {
        const c = document.createElement('span'); if (!c.animate) return;
        c.style.cssText = `position:fixed;top:-12px;left:${Math.random() * 100}vw;width:8px;height:12px;background:${cols[i % cols.length]};z-index:9999;pointer-events:none;border-radius:2px`;
        document.body.appendChild(c);
        const a = c.animate([{ transform: 'translateY(0) rotate(0)', opacity: 1 }, { transform: `translateY(${70 + Math.random() * 40}vh) rotate(${Math.random() * 720}deg)`, opacity: 0 }], { duration: 1600 + Math.random() * 1400, easing: 'ease-in' });
        a.onfinish = () => c.remove();
      }
    } catch (e) {}
  }
  // Après une saisie : son, et confettis si le jour est complet et gagnant sur au moins une des deux stratégies
  function fete(jour) {
    jouerSon();
    try {
      const data = S.days[jour]; if (!data) return;
      const ms = data.matchs.filter(m => !estQualif(m.tournoi) && m.tour === 'ATP' && avecCotes(m));
      if (!ms.length || !ms.every(m => S.res.some(r => r.id === matchId(jour, m)))) return;
      const sj = stats(S.res.filter(r => r.w !== 0 && r.date === jour && r.tour === 'ATP'));
      if (sj.n && (sj.pB > 0 || sj.pH > 0)) confettis();
    } catch (e) {}
  }
  const sauverAuto = () => { try { localStorage.setItem(KEY_AUTO, JSON.stringify(S.auto.slice(-1500))); } catch (e) {} };
  const sauverRdj = () => { try { const k = Object.keys(S.rdj); if (k.length > 400) k.sort((a, b) => (S.rdj[a].t || 0) - (S.rdj[b].t || 0)).slice(0, k.length - 400).forEach(x => delete S.rdj[x]); localStorage.setItem(KEY_RDJ, JSON.stringify(S.rdj)); } catch (e) {} };
  const detDe = m => { const x = S.rdj[m.id]; return x && x.trouve && (x.pick === 1 || x.pick === 2) ? Object.assign({}, S.det[m.id], { x }) : S.det[m.id]; };
  const sauverDet = () => { try { const k = Object.keys(S.det); if (k.length > 600) k.sort((a, b) => (S.det[a].t || 0) - (S.det[b].t || 0)).slice(0, k.length - 600).forEach(x => delete S.det[x]); localStorage.setItem(KEY_DET, JSON.stringify(S.det)); } catch (e) {} };
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
  const estQualif = t => /qualif|\bqual\b|\(q\)/i.test(String(t || ''));
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
  /* ---------- Prono auto : un choix calculé par l'appli, figé avant le match, puis réglé avec tes saisies ---------- */
  // Score = écart de probabilité des cotes (en log) + petits bonus : classement, face-à-face, bilan de la saison.
  // Les poids sont volontairement faibles : la cote reste le signal principal. Les stats diront si les bonus servent à quelque chose.
  const POIDS = { rang: 0.12, h2h: 0.25, saison: 0.8, expert: 0.35 };
  function pronoAuto(m, d) {
    const ln = Math.log, R = [], fav = m.c1 < m.c2 ? 1 : 2, nom = k => k === 1 ? m.j1 : m.j2;
    let sc = ln(m.c2 / m.c1);                                     // > 0 : le joueur 1 est favori des cotes
    const bonus = [];
    if (d && d.r1 > 0 && d.r2 > 0 && d.r1 !== d.r2) { const x = POIDS.rang * ln(d.r2 / d.r1); sc += x; bonus.push([x, `mieux classé : #${Math.min(d.r1, d.r2)} contre #${Math.max(d.r1, d.r2)}`, d.r1 < d.r2 ? 1 : 2]); }
    if (d && d.h1 != null && d.h2 != null && d.h1 + d.h2 >= 2 && d.h1 !== d.h2) { const x = POIDS.h2h * (d.h1 - d.h2) / (d.h1 + d.h2); sc += x; bonus.push([x, `mène le face-à-face ${Math.max(d.h1, d.h2)}–${Math.min(d.h1, d.h2)}`, d.h1 > d.h2 ? 1 : 2]); }
    if (d && d.w1 != null && d.l1 != null && d.w2 != null && d.l2 != null && d.w1 + d.l1 >= 10 && d.w2 + d.l2 >= 10) {
      const f1 = d.w1 / (d.w1 + d.l1), f2 = d.w2 / (d.w2 + d.l2), x = POIDS.saison * (f1 - f2);
      if (Math.abs(f1 - f2) >= 0.03) { sc += x; bonus.push([x, `meilleur bilan de la saison : ${fr(Math.max(f1, f2) * 100, 0)} % contre ${fr(Math.min(f1, f2) * 100, 0)} %`, f1 > f2 ? 1 : 2]); }
    }
    if (d && d.x && (d.x.pick === 1 || d.x.pick === 2)) { const x = d.x.pick === 1 ? POIDS.expert : -POIDS.expert; sc += x; bonus.push([x, 'pronostic de l\'expert RueDesJoueurs', d.x.pick]); }
    const p1 = 1 / (1 + Math.exp(-sc)), n = p1 >= 0.5 ? 1 : 2, conf = Math.max(p1, 1 - p1) * 100;
    const [pc1] = probas(m); R.push(`cotes : ${nom(fav)} favori (${fr(fav === 1 ? pc1 : 100 - pc1, 0)} %)`);
    bonus.forEach(b => { if (b[2] === n) R.push(b[1]); });
    return { n, conf, c: n === 1 ? m.c1 : m.c2, raisons: R, contreFavori: n !== fav, avecDetail: !!(d && (d.r1 != null || d.h1 != null || d.w1 != null || d.x)) };
  }
  const NIVEAUX = [['55 % ou moins', 0, 55.0001], ['55 à 65 %', 55.0001, 65], ['65 à 75 %', 65, 75], ['plus de 75 %', 75, 101]];
  const niveauDe = c => (NIVEAUX.find(x => c > x[1] && c <= x[2]) || NIVEAUX.find(x => c <= x[2]) || NIVEAUX[0])[0];
  // Pronos auto réglés : on rapproche chaque prono figé du résultat que tu as saisi (annulés exclus)
  function autoRegles() {
    const out = [];
    S.auto.forEach(a => { const r = S.res.find(x => x.id === a.id); if (!r || r.w === 0 || estQualif(r.tournoi)) return; const x = info(r); out.push({ a, r, ok: r.w === a.n, gain: r.w === a.n ? r2(a.c - 1) : -1, gainBas: x.gainB, avecFavori: !a.contreFavori }); });
    return out;
  }
  function statsAuto() {
    const L = autoRegles(), n = L.length, g = L.filter(x => x.ok).length;
    const somme = f => r2(L.reduce((t, x) => t + f(x), 0));
    return { L, n, g, profit: somme(x => x.gain), baseline: somme(x => x.gainBas), pct: n ? g / n * 100 : 0 };
  }
  // Fige les pronos des matchs à venir (jamais après le coup d'envoi : pas de « prono » écrit en connaissant le résultat)
  function figerAuto(jour) {
    const data = S.days[jour]; if (!data || !data.matchs) return;
    let ajout = 0;
    data.matchs.forEach(m => {
      if (m.tour !== 'ATP' || estQualif(m.tournoi) || !avecCotes(m)) return;
      const id = matchId(jour, m); if (S.auto.some(a => a.id === id)) return;
      if (S.res.some(r => r.id === id) || m.w === 1 || m.w === 2) return;
      const stt = statutMatch(m, jour, null); if (stt.k !== 'avenir') return;
      const pa = pronoAuto(m, detDe(m)), xr = S.rdj[m.id], xp = xr && xr.trouve && (xr.pick === 1 || xr.pick === 2) ? xr.pick : 0;
      S.auto.push({ id, date: jour, heure: m.heure, tournoi: m.tournoi, j1: m.j1, j2: m.j2, c1: m.c1, c2: m.c2, x: xp || undefined, n: pa.n, conf: r2(pa.conf), c: pa.c, contreFavori: pa.contreFavori, avecDetail: pa.avecDetail, t: Date.now() }); ajout++;
    });
    if (ajout) sauverAuto();
  }
  const filtrer = () => S.res.filter(r => r.w !== 0 && !estQualif(r.tournoi) && r.tour === 'ATP');
  const tousSaisis = () => S.res.filter(r => !estQualif(r.tournoi) && r.tour === 'ATP');
  window.__tennis = { info, stats, parTranche, parCle, cumul, matchId, parJoueur, ecartDe, jourSem, moment };
  window.__tennisAuto = { pronoAuto, statsAuto, niveauDe, figerAuto, POIDS, etat: () => S };

  /* ---------- Styles ---------- */
  const BD = 'rgba(128,128,128,.32)';
  const card = 'border:1px solid ' + BD + ';border-radius:14px;padding:12px;margin-top:10px';
  const BLEU = '#60a5fa', AMBRE = '#fbbf24';
  const col = n => n > 0 ? '#16a34a' : n < 0 ? '#dc2626' : 'inherit';
  const pct = n => fr(n, 0) + ' %';
  const bt = (label, actif, on) => `<button type="button" onclick="${on}" style="min-height:44px;padding:0 16px;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;${actif ? 'background:#1d4ed8;color:#fff;border:1px solid #3b82f6' : 'background:transparent;color:inherit;border:1px solid ' + BD}">${label}</button>`;

  /* ---------- Aides visuelles ---------- */
  const probas = m => { const a = 1 / m.c1, b = 1 / m.c2; return [a / (a + b) * 100, b / (a + b) * 100]; };   // probabilité « implicite » des cotes
  const minutes = h => { const p = String(h || '').match(/^(\d{1,2}):(\d{2})$/); return p ? +p[1] * 60 + +p[2] : null; };
  const maintenantMin = () => minutes(new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).replace('24:', '00:'));
  const puce = (t, c) => `<span style="font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px;background:color-mix(in srgb,${c} 18%,transparent);color:${c};border:1px solid color-mix(in srgb,${c} 45%,transparent);white-space:nowrap">${t}</span>`;
  function statutMatch(m, jour, saisi) {
    if (saisi) return saisi.w === 0 ? { k: 'annule', t: 'Annulé', c: '#6b7280' } : { k: 'valide', t: '✓ Validé', c: '#16a34a' };
    if (m.w === 1 || m.w === 2) return { k: 'fini', t: 'Terminé · à valider', c: '#16a34a' };
    const a0 = auj();
    if (jour > a0) return { k: 'avenir', t: 'À venir', c: '#2563eb' };
    if (jour < a0) return { k: 'saisir', t: 'À saisir', c: '#d97706' };
    const mm = minutes(m.heure), now = maintenantMin();
    if (mm == null || now == null) return { k: 'avenir', t: "Aujourd'hui", c: '#2563eb' };
    if (now < mm) { const d = mm - now; return { k: 'avenir', t: d >= 60 ? 'Dans ' + Math.floor(d / 60) + ' h ' + String(d % 60).padStart(2, '0') : 'Dans ' + d + ' min', c: '#2563eb' }; }
    if (now < mm + 180) return { k: 'encours', t: '● En cours', c: '#dc2626' };
    return { k: 'saisir', t: 'Terminé · à saisir', c: '#d97706' };
  }
  const barreProba = (pf, po) => `<div style="margin-top:10px" aria-label="Probabilité implicite : favori ${fr(pf, 0)} %, outsider ${fr(po, 0)} %"><div style="display:flex;height:8px;border-radius:999px;overflow:hidden;background:rgba(128,128,128,.25)"><div style="width:${pf}%;background:${BLEU}"></div><div style="width:${po}%;background:${AMBRE}"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;margin-top:3px"><span style="color:${BLEU}">${fr(pf, 0)} %</span><span style="opacity:.55;font-weight:600">chances selon les cotes</span><span style="color:${AMBRE}">${fr(po, 0)} %</span></div></div>`;

  /* ---------- Calendrier ---------- */
  function boutonJoueur(m, n, jour, saisi) {
    const nom = n === 1 ? m.j1 : m.j2, cote = n === 1 ? m.c1 : m.c2, estBas = cote < (n === 1 ? m.c2 : m.c1);
    const gagne = saisi && saisi.w === n, perd = saisi && saisi.w !== n;
    const couleur = estBas ? BLEU : AMBRE;
    const st = gagne ? 'background:#16a34a;color:#fff;border:2px solid #16a34a;box-shadow:0 4px 14px rgba(22,163,74,.35)' : `background:transparent;color:inherit;border:2px solid ${BD};border-top:4px solid ${couleur};${perd ? 'opacity:.5' : ''}`;
    return `<button type="button" onclick="tennisGagnant('${eid(matchId(jour, m))}',${n})" aria-pressed="${!!gagne}" style="flex:1;min-height:92px;border-radius:14px;padding:8px 6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;transition:transform .12s;${st}">
      <span style="font-size:11px;font-weight:800;padding:1px 7px;border-radius:6px;${gagne ? 'background:rgba(255,255,255,.25)' : `background:${couleur};color:#0a192c`}">${estBas ? 'Cote basse' : 'Cote haute'}</span>
      <span style="font-size:14px;font-weight:800">${esc(nom)}</span>
      <span style="font-size:20px;font-weight:800">${fr(cote)}</span>
      <span style="font-size:11px;font-weight:700;${gagne ? '' : 'opacity:.75'}">${gagne ? '🏆 Vainqueur' : 'Touche si gagnant'}</span></button>`;
  }
  // Ligne d'infos (classement, face-à-face, saison), prono auto et lien vers la page du match
  function infosMatch(m, jour, fav) {
    const d = detDe(m), sw = (a, b) => fav === 1 ? [a, b] : [b, a], morceaux = [];
    if (d && d.r1 > 0 && d.r2 > 0) { const [a, b] = sw(d.r1, d.r2); morceaux.push(`#${a} contre #${b}`); }
    if (d && d.h1 != null && d.h2 != null) { const [a, b] = sw(d.h1, d.h2); morceaux.push(`face-à-face ${a}–${b}`); }
    if (d && d.w1 != null && d.w2 != null) { const [a, b] = sw(d.w1 + '/' + d.l1, d.w2 + '/' + d.l2); morceaux.push(`saison ${a} contre ${b}`); }
    const rec = S.auto.find(a => a.id === matchId(jour, m)), pa = rec ? { n: rec.n, conf: rec.conf, contreFavori: rec.contreFavori, raisons: [] } : null;
    let auto = '';
    if (pa) auto = `<div style="margin-top:8px;font-size:12px"><span style="font-weight:800">🤖 Prono auto : ${esc(pa.n === 1 ? m.j1 : m.j2)}</span> · confiance ${fr(pa.conf, 0)} %${pa.contreFavori ? ' · ' + puce('contre le favori', '#a855f7') : ''}</div>`;
    else if (jour >= auj()) { const x = pronoAuto(m, d); auto = `<div style="margin-top:8px;font-size:12px;opacity:.85"><span style="font-weight:800">🤖 Prono auto : ${esc(x.n === 1 ? m.j1 : m.j2)}</span> · confiance ${fr(x.conf, 0)} %${x.contreFavori ? ' · ' + puce('contre le favori', '#a855f7') : ''}</div>`; }
    const xr = S.rdj[m.id];
    const expert = xr && xr.trouve ? `<div style="margin-top:8px;font-size:12px"><span style="font-weight:800">🎓 Expert RueDesJoueurs : ${xr.pick === 1 || xr.pick === 2 ? esc(xr.pick === 1 ? m.j1 : m.j2) : 'pas de choix clair'}</span> · cotes RDJ ${fr(xr.c1)} / ${fr(xr.c2)} · <a href="${esc(xr.url)}" target="_blank" rel="noopener" style="color:inherit;font-weight:700;text-decoration:underline">analyse ↗</a></div>` : '';
    const lien = m.id ? `<a href="https://www.tennisexplorer.com/match-detail/?id=${esc(m.id)}" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:inherit;opacity:.8;text-decoration:underline">Détail du match ↗</a>` : '';
    if (!morceaux.length && !auto && !lien && !expert) return '';
    return `<div style="margin-top:8px;font-size:12px;opacity:.9">${morceaux.length ? '📊 ' + esc(morceaux.join(' · ')) : ''}</div>${expert}${auto}${lien ? `<div style="margin-top:6px">${lien}</div>` : ''}`;
  }
  function carte(m, jour) {
    const id = matchId(jour, m), saisi = S.res.find(r => r.id === id), stt = statutMatch(m, jour, saisi);
    const entete = (a, b) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span style="display:flex;align-items:center;gap:8px"><span style="font-size:15px;font-weight:800;opacity:.85">${esc(m.heure) || '—'}</span>${puce(stt.t, stt.c)}</span></div>
      <div style="font-size:15px;font-weight:800;margin-top:6px">${esc(a)} <span style="opacity:.6;font-weight:600">vs</span> ${esc(b)}</div>`;
    if (!avecCotes(m)) return `<div style="${card};border-style:dashed">${entete(m.j1, m.j2)}<div style="font-size:12px;opacity:.7;margin-top:4px">${m.c1 > 1 && m.c2 > 1 ? 'Cotes identiques : favori impossible à déterminer.' : 'Cotes pas encore disponibles.'}</div></div>`;
    const fav = m.c1 < m.c2 ? 1 : 2, out = fav === 1 ? 2 : 1, [p1, p2] = probas(m), pf = fav === 1 ? p1 : p2, po = fav === 1 ? p2 : p1;
    let bilan = '';
    if (!saisi && (m.w === 1 || m.w === 2)) bilan = `<div style="margin-top:8px;font-size:12px;opacity:.85">Résultat lu sur la page : <b>${esc(m.w === 1 ? m.j1 : m.j2)}</b> a gagné. Touche-le pour valider.</div>`;
    if (saisi && saisi.w === 0) bilan = `<div style="margin-top:8px;font-size:12px"><b>Match annulé ou abandon : pari remboursé</b> · pas compté dans les stats</div>`;
    else if (saisi) {
      const x = info(saisi);
      bilan = `<div style="margin-top:8px;font-size:12px;line-height:1.5"><b style="color:${x.gagnantBas ? BLEU : AMBRE}">${x.gagnantBas ? 'Cote basse gagnante (favori)' : 'Cote haute gagnante (surprise)'}</b>${x.gagnantBas ? '' : ' ' + puce('🎉 Surprise !', AMBRE)}<br>
        1 € sur la cote basse : <b style="color:${col(x.gainB)}">${signe(x.gainB)}</b> · 1 € sur la cote haute : <b style="color:${col(x.gainH)}">${signe(x.gainH)}</b></div>`;
    }
    return `<div style="${card}">${entete(fav === 1 ? m.j1 : m.j2, fav === 1 ? m.j2 : m.j1)}<div style="display:flex;gap:8px;margin-top:10px">${boutonJoueur(m, fav, jour, saisi)}${boutonJoueur(m, out, jour, saisi)}</div>${barreProba(pf, po)}${infosMatch(m, jour, fav)}
      <button type="button" onclick="tennisAnnule('${eid(id)}')" style="margin-top:8px;min-height:44px;width:100%;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;${saisi && saisi.w === 0 ? 'background:#6b7280;color:#fff;border:1px solid #6b7280' : 'background:transparent;color:inherit;border:1px dashed ' + BD}">${saisi && saisi.w === 0 ? 'Annulé · remettre en jeu' : 'Abandon / annulé (pari remboursé)'}</button>${bilan}</div>`;
  }
  // Bande des jours : 6 jours passés, aujourd'hui, demain ; deux points = bilan du jour sur la cote basse / la cote haute
  function bandeJours() {
    const jours = Array.from({ length: 8 }, (_, i) => decaler(auj(), i - 6));
    const pt = (v, nom) => `<span title="${nom}" style="width:7px;height:7px;border-radius:50%;display:inline-block;background:${v == null ? 'rgba(128,128,128,.35)' : v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#9ca3af'}"></span>`;
    return `<div id="tnBande" role="tablist" style="display:flex;gap:6px;overflow-x:auto;margin-top:10px;padding-bottom:4px">${jours.map(j => {
      const l = S.res.filter(r => r.w !== 0 && r.date === j && r.tour === 'ATP'), sj = l.length ? stats(l) : null, actif = j === S.jour;
      const d = new Date(j + 'T12:00:00Z'), sem = d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
      return `<button type="button" role="tab" aria-selected="${actif}" onclick="tennisJourDate('${j}')" style="flex:0 0 auto;min-width:54px;min-height:58px;border-radius:14px;padding:6px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;${actif ? 'background:#1d4ed8;color:#fff;border:1px solid #3b82f6' : 'background:transparent;color:inherit;border:1px solid ' + BD}">
        <span style="font-size:11px;font-weight:700;opacity:.8;text-transform:capitalize">${j === auj() ? 'auj.' : esc(sem)}</span><span style="font-size:17px;font-weight:800">${d.getUTCDate()}</span>
        <span style="display:flex;gap:3px;height:8px">${pt(sj && sj.pB, 'Cote basse du jour')}${pt(sj && sj.pH, 'Cote haute du jour')}</span></button>`;
    }).join('')}</div>`;
  }
  function vueCalendrier() {
    const data = S.days[S.jour], cfgOk = S.robot.url && S.robot.key;
    let corps = '', resume = '';
    if (data) {
      const ms = data.matchs.filter(m => !estQualif(m.tournoi) && m.tour === 'ATP');
      if (!data.local && data.v !== 5) corps += `<div style="margin-top:12px;border:2px solid #dc2626;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700">⚠️ Ton robot Cloudflare n'est pas à jour (ancienne version de worker.js). Colle le dernier worker.js dans le Worker dont l'adresse est dans le réglage ci-dessous, clique sur Deploy, puis sur Actualiser.<br><span style="font-weight:600;font-size:12px">Version du robot reçue : ${data.v == null ? 'aucune (très ancienne)' : esc(data.v)} · attendue : 5. Adresse utilisée : ${esc(S.robot.url)}. Pour vérifier le code collé dans Cloudflare : Ctrl+F « tennis-v3 » doit le trouver.</span></div>`;
      if (data.perime) corps += `<div style="margin-top:12px;border:1px solid #d97706;border-radius:12px;padding:8px 12px;font-size:12px;font-weight:700">⚠️ Calendrier mémorisé${data.maj ? ' (' + new Date(data.maj).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ')' : ''} : Tennis Explorer ne répond pas bien en ce moment. Les cotes peuvent avoir changé. <button type="button" onclick="tennisCharger(true)" style="margin-left:6px;font-weight:800;text-decoration:underline;background:none;border:0;color:inherit;cursor:pointer">Réessayer</button></div>`;
      if (!ms.length) corps += `<div style="text-align:center;margin-top:22px"><div style="font-size:42px">🎾</div><p style="margin:6px 0 0;font-weight:800">Aucun match de tournoi du circuit ${data.raison ? 'trouvé pour ce jour.' : 'ce jour-là.'}</p><p style="margin:4px 0 0;font-size:12px;opacity:.65">${data.raison ? esc(data.raison) : S.jour >= auj() ? 'Le programme est publié par Tennis Explorer au fil de la journée : reviens un peu plus tard.' : 'Pas de tournoi ATP ce jour-là.'}</p><p style="margin:10px 0 0"><button type="button" onclick="tennisCharger(true)" style="min-height:44px;padding:0 16px;border-radius:12px;font-weight:800;background:#2563eb;color:#fff;border:0;cursor:pointer">Réessayer</button></p></div>`;
      const groupes = [], idx = {};
      ms.forEach(m => { const k = m.tour + '|' + m.tournoi; if (!(k in idx)) { idx[k] = groupes.length; groupes.push({ tour: m.tour, tournoi: m.tournoi, l: [] }); } groupes[idx[k]].l.push(m); });
      corps += groupes.map(g => {
        const fait = g.l.filter(m => S.res.some(r => r.id === matchId(S.jour, m))).length, tot = g.l.filter(avecCotes).length;
        return `<div style="display:flex;align-items:center;gap:8px;margin-top:20px;padding-bottom:6px;border-bottom:2px solid ${BD}"><span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;background:rgba(128,128,128,.28)">${esc(g.tour)}</span><span style="font-size:15px;font-weight:800;flex:1">${esc(g.tournoi)}</span><span style="font-size:12px;font-weight:700;opacity:.7">${fait}/${tot} saisis</span></div>${g.l.map(m => carte(m, S.jour)).join('')}`;
      }).join('');
      const jouables = ms.filter(avecCotes).length, saisis = ms.filter(m => S.res.some(r => r.id === matchId(S.jour, m))).length;
      const duJour = S.res.filter(r => r.w !== 0 && r.date === S.jour && r.tour === 'ATP');
      const sj = stats(duJour), prog = jouables ? Math.round(saisis / jouables * 100) : 0;
      resume = `<div style="position:sticky;top:6px;z-index:5;margin-top:14px;background:var(--card,#fff);border:1px solid #2563eb;border-radius:12px;padding:10px 12px;font-size:13px;box-shadow:0 6px 18px rgba(0,0,0,.12)"><b>${saisis} résultat${saisis > 1 ? 's' : ''} saisi${saisis > 1 ? 's' : ''} sur ${jouables}</b>${duJour.length ? ` · sur ces matchs, 1 € sur chaque cote basse : <b style="color:${col(sj.pB)}">${signe(sj.pB)}</b> · sur chaque cote haute : <b style="color:${col(sj.pH)}">${signe(sj.pH)}</b>` : ' · touche le vainqueur de chaque match'}
        <div style="height:6px;border-radius:999px;background:rgba(128,128,128,.25);margin-top:8px;overflow:hidden"><div style="height:100%;width:${prog}%;background:${prog === 100 ? '#16a34a' : '#2563eb'};transition:width .3s"></div></div>${aValider().length ? `<div style="margin-top:8px"><button type="button" onclick="tennisValiderTout()" style="min-height:44px;padding:0 14px;border-radius:10px;font-weight:800;font-size:13px;background:#16a34a;color:#fff;border:0;cursor:pointer">Tout valider (${aValider().length})</button></div>` : ''}</div>`;
    } else if (cfgOk && !S.err) corps = '<p style="text-align:center;opacity:.7;margin-top:24px">Chargement…</p>';
    return `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;border:1px solid ${BD};border-radius:12px;padding:4px">
        <button type="button" aria-label="Jour précédent" onclick="tennisJour(-1)" style="width:44px;height:44px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer">&lsaquo;</button>
        <button type="button" onclick="tennisJour(0)" style="min-height:44px;border:0;background:transparent;color:inherit;font-size:14px;font-weight:800;cursor:pointer">${esc(joliJour(S.jour))}</button>
        <button type="button" aria-label="Jour suivant" onclick="tennisJour(1)" style="width:44px;height:44px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer">&rsaquo;</button></div>
      ${bandeJours()}${resume}${corps}`;
  }

  /* ---------- Stats ---------- */
  function tab(titre, entetes, lignes) {
    if (!lignes.length) return '';
    return `<div style="${card}"><div style="font-size:13px;font-weight:800;margin-bottom:4px">${titre}</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="text-align:left;opacity:.65;font-size:11px">${entetes.map((h, i) => `<th style="padding:4px 6px;${i ? 'text-align:right' : 'padding-left:0'}">${h}</th>`).join('')}</tr></thead>
      <tbody>${lignes.map(l => `<tr style="border-top:1px solid ${BD}">${l.map((c, i) => `<td style="padding:8px 6px;${i ? 'text-align:right' : 'padding-left:0;font-weight:700'}${c && c.s ? ';' + c.s : ''}">${c && c.t != null ? c.t : c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }
  const P = n => ({ t: signe(n), s: `font-weight:800;color:${col(n)}` });
  function spark(vals, color) {
    if (vals.length < 2) return '';
    const W = 120, H = 34, mn = Math.min(0, ...vals), mx = Math.max(0, ...vals), sp = (mx - mn) || 1;
    const pts = vals.map((v, i) => (i / (vals.length - 1) * W).toFixed(1) + ',' + (H - 3 - (v - mn) / sp * (H - 6)).toFixed(1)).join(' ');
    const y0 = (H - 3 - (0 - mn) / sp * (H - 6)).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="34" preserveAspectRatio="none" aria-hidden="true" style="margin-top:6px"><line x1="0" y1="${y0}" x2="${W}" y2="${y0}" stroke="rgba(128,128,128,.4)" stroke-dasharray="3 3"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  function carteStrat(titre, sous, profit, roi, pc, color, serie) {
    return `<div style="flex:1;${card};margin-top:0;min-width:150px;border-left:5px solid ${color}"><div style="font-size:11px;font-weight:800;color:${color}">${titre}</div><div style="font-size:30px;font-weight:800;line-height:1.1;color:${col(profit)};margin-top:4px">${signe(profit)}</div><div style="font-size:11px;opacity:.75;margin-top:2px">${sous}</div><div style="font-size:11px;opacity:.75">Rendement ${roi > 0 ? '+' : roi < 0 ? '−' : ''}${fr(Math.abs(roi), 0)} % · gagne ${pc}</div>${spark(serie, color)}</div>`;
  }
  // « À retenir » : quelques phrases tirées des stats, avec prudence tant qu'il y a peu de matchs
  function aRetenir(L, s) {
    const l = [], tb = parTranche(L, 'bas').filter(o => o.n >= 3), th = parTranche(L, 'haut').filter(o => o.n >= 3);
    l.push(`Le favori (cote basse) gagne <b>${pct(s.pctFav)}</b> des matchs (${s.fav} sur ${s.n}), l'outsider <b>${pct(100 - s.pctFav)}</b>.`);
    if (s.pB !== s.pH) l.push(`Jusqu'ici, jouer <b>toujours la cote ${s.pB > s.pH ? 'basse' : 'haute'}</b> a mieux marché : <b style="color:${col(s.pB > s.pH ? s.pB : s.pH)}">${signe(s.pB > s.pH ? s.pB : s.pH)}</b> contre ${signe(s.pB > s.pH ? s.pH : s.pB)}.`);
    const best = (arr, nom) => { const o = arr.slice().sort((a, b) => b.profit - a.profit)[0]; if (o && o.profit > 0) l.push(`Meilleure tranche ${nom} : <b>${o.label}</b> → <b style="color:#16a34a">${signe(o.profit)}</b> (${o.n} matchs).`); };
    best(tb, 'cote basse'); best(th, 'cote haute');
    const tn = parCle(L, r => r.tournoi).filter(o => o.n >= 3).sort((a, b) => Math.max(b.pB, b.pH) - Math.max(a.pB, a.pH))[0];
    if (tn && Math.max(tn.pB, tn.pH) > 0) l.push(`Tournoi le plus rentable : <b>${esc(tn.label)}</b> (${signe(Math.max(tn.pB, tn.pH))} en jouant la cote ${tn.pB >= tn.pH ? 'basse' : 'haute'}).`);
    if (s.n < 30) l.push(`<span style="opacity:.75">Encore peu de matchs (${s.n}) : ces chiffres bougent beaucoup, ne conclus rien avant plusieurs dizaines.</span>`);
    return `<div style="${card};border-left:5px solid #a855f7"><div style="font-size:13px;font-weight:800">💡 À retenir</div><ul style="margin:6px 0 0;padding-left:18px;font-size:13px;line-height:1.6">${l.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
  }
  function bilanHaut() {
    const L = filtrer(), s = stats(L);
    if (!s.n) return `<div style="text-align:center;margin-top:14px"><div style="font-size:38px">🎾</div><p style="margin:4px 0 0;opacity:.75;font-size:13px">Pas encore de résultat saisi. Touche le vainqueur de chaque match du calendrier : le bilan apparaît ici.</p></div>`;
    const cu = cumul(L);
    return `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        ${carteStrat('Toujours la cote basse (favori)', s.n + ' paris · ' + s.fav + ' gagnés', s.pB, s.roiB, pct(s.pctFav), BLEU, cu.map(p => p.b))}
        ${carteStrat('Toujours la cote haute (outsider)', s.n + ' paris · ' + s.out + ' gagnés', s.pH, s.roiH, pct(100 - s.pctFav), AMBRE, cu.map(p => p.h))}</div>
      ${aRetenir(L, s)}
      <div style="${card}"><div style="font-size:13px;font-weight:800">Bénéfice cumulé</div><div style="position:relative;height:190px;margin-top:6px"><canvas id="tnChart" aria-label="Courbes du bénéfice cumulé"></canvas></div>
        <div style="font-size:11px;margin-top:6px;display:flex;gap:14px"><span><b style="color:${BLEU}">━</b> toujours cote basse</span><span><b style="color:${AMBRE}">━</b> toujours cote haute</span></div></div>`;
  }
  // « Suivre l'expert » : 1 € sur le choix de l'expert RueDesJoueurs, à la cote de Tennis Explorer, pour les matchs réglés
  function blocExpert() {
    const L = S.auto.filter(a => a.x === 1 || a.x === 2).map(a => ({ a, r: S.res.find(x => x.id === a.id) })).filter(o => o.r && o.r.w !== 0 && !estQualif(o.r.tournoi));
    if (!L.length) return '';
    const g = L.filter(o => o.r.w === o.a.x), profit = r2(L.reduce((t, o) => t + (o.r.w === o.a.x ? (o.a.x === 1 ? o.a.c1 : o.a.c2) - 1 : -1), 0)), bas = r2(L.reduce((t, o) => t + info(o.r).gainB, 0));
    return `<div style="${card};border-left:5px solid #0ea5e9"><div style="font-size:13px;font-weight:800">🎓 Suivre l'expert RueDesJoueurs · 1 € sur son choix</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><div style="flex:1;min-width:130px"><div style="font-size:11px;opacity:.7">Expert (${L.length} matchs)</div><div style="font-size:26px;font-weight:800;color:${col(profit)}">${signe(profit)}</div><div style="font-size:11px;opacity:.75">gagne ${pct(g.length / L.length * 100)}</div></div>
      <div style="flex:1;min-width:130px"><div style="font-size:11px;opacity:.7">Cote basse, mêmes matchs</div><div style="font-size:26px;font-weight:800;color:${col(bas)}">${signe(bas)}</div></div></div>
      ${L.length < 50 ? '<p style="font-size:11px;opacity:.65;margin:8px 0 0">Trop peu de matchs pour conclure : attends au moins 50 pronos réglés.</p>' : ''}</div>`;
  }
  function blocAuto() { return blocAutoBase() + blocExpert(); }
  function blocAutoBase() {
    if (!S.auto.length) return '';
    const st = statsAuto();
    if (!st.n) return `<div style="${card};border-left:5px solid #a855f7"><div style="font-size:13px;font-weight:800">🤖 Prono auto</div><p style="margin:6px 0 0;font-size:12px;opacity:.8">${S.auto.length} prono${S.auto.length > 1 ? 's' : ''} figé${S.auto.length > 1 ? 's' : ''} avant match. Ils seront réglés quand tu auras saisi les vainqueurs.</p></div>`;
    const lig = (label, l) => l.length ? [label, l.length, pct(l.filter(x => x.ok).length / l.length * 100), P(r2(l.reduce((t, x) => t + x.gain, 0))), P(r2(l.reduce((t, x) => t + x.gainBas, 0)))] : null;
    const niv = NIVEAUX.map(n => lig(n[0], st.L.filter(x => niveauDe(x.a.conf) === n[0]))).filter(Boolean);
    const acc = [lig("D'accord avec le favori des cotes", st.L.filter(x => x.avecFavori)), lig('Contre le favori des cotes', st.L.filter(x => !x.avecFavori))].filter(Boolean);
    return `<div style="${card};border-left:5px solid #a855f7"><div style="font-size:13px;font-weight:800">🤖 Prono auto · 1 € sur chaque prono</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><div style="flex:1;min-width:130px"><div style="font-size:11px;opacity:.7">Prono auto (${st.n} matchs)</div><div style="font-size:26px;font-weight:800;color:${col(st.profit)}">${signe(st.profit)}</div><div style="font-size:11px;opacity:.75">gagne ${pct(st.pct)}</div></div>
      <div style="flex:1;min-width:130px"><div style="font-size:11px;opacity:.7">Cote basse, mêmes matchs</div><div style="font-size:26px;font-weight:800;color:${col(st.baseline)}">${signe(st.baseline)}</div><div style="font-size:11px;opacity:.75">pour comparer</div></div></div>
      <p style="font-size:11px;opacity:.65;margin:8px 0 0">${st.profit > st.baseline ? 'Le prono auto fait mieux que la simple cote basse sur ces matchs.' : st.profit < st.baseline ? 'Le prono auto fait moins bien que la simple cote basse sur ces matchs.' : 'Même résultat que la cote basse.'} ${st.n < 50 ? 'Trop peu de matchs pour conclure : attends au moins 50 à 100 pronos réglés.' : ''}</p></div>
      ${tab('Prono auto par niveau de confiance', ['Confiance', 'Matchs', 'Réussite', 'Prono auto', 'Cote basse'], niv)}
      ${tab('Prono auto : avec ou contre le favori', ['Cas', 'Matchs', 'Réussite', 'Prono auto', 'Cote basse'], acc)}`;
  }
  // Carte de chaleur : une case par tranche de cote, verte si rentable, rouge sinon
  function chaleur(L) {
    const fond = roi => roi > 0 ? `rgba(22,163,74,${Math.min(.18 + roi / 100 * .6, .8).toFixed(2)})` : roi < 0 ? `rgba(220,38,38,${Math.min(.18 + -roi / 100 * .6, .8).toFixed(2)})` : 'rgba(128,128,128,.2)';
    const ligne = (titre, color, strat) => { const t = parTranche(L, strat); return t.length ? `<div style="font-size:12px;font-weight:800;color:${color};margin:10px 0 4px">${titre}</div><div style="display:flex;flex-wrap:wrap;gap:6px">${t.map(o => `<div title="${o.n} matchs · bénéfice ${signe(o.profit)}" style="flex:1 1 78px;min-width:78px;border-radius:10px;padding:7px 4px;text-align:center;background:${fond(o.roi)}"><div style="font-size:10px;opacity:.8;font-weight:700">${o.label}</div><div style="font-size:15px;font-weight:800">${o.roi > 0 ? '+' : o.roi < 0 ? '−' : ''}${fr(Math.abs(o.roi), 0)} %</div><div style="font-size:10px;opacity:.75">${o.n} match${o.n > 1 ? 's' : ''}</div></div>`).join('')}</div>` : ''; };
    const h = ligne('Cote basse jouée', BLEU, 'bas') + ligne('Cote haute jouée', AMBRE, 'haut');
    return h ? `<div style="${card}"><div style="font-size:13px;font-weight:800">🔥 Carte de chaleur · rendement par tranche de cote</div>${h}<div style="font-size:11px;opacity:.6;margin-top:8px">Vert = rentable, rouge = perdant (le rendement est le bénéfice pour 1 € joué). Survole une case pour le détail.</div></div>` : '';
  }
  function detailBas() {
    const L = filtrer(), s = stats(L);
    if (!s.n) return '';
    const liste = tousSaisis().sort((a, b) => (b.date + b.heure).localeCompare(a.date + a.heure));
    const E5 = ['', 'Matchs', 'Favori gagne', 'Cote basse', 'Cote haute'];
    const duo = (titre, prem, l) => tab(titre, [prem].concat(E5.slice(1)), l.map(o => [o.label, o.n, pct(o.pctFav), P(o.pB), P(o.pH)]));
    const tr = strat => parTranche(L, strat).map(o => [o.label, o.n, o.g, pct(o.pct), P(o.profit), { t: (o.roi > 0 ? '+' : o.roi < 0 ? '−' : '') + fr(Math.abs(o.roi), 0) + ' %', s: 'color:' + col(o.roi) }]);
    const E6 = ['Cote', 'Matchs', 'Gagnés', 'Réussite', 'Bénéfice', 'Rendement'];
    const joueurs = parJoueur(L, 3);
    return `${blocAuto()}
      ${chaleur(L)}
      ${tab('Par cote · toujours la cote basse (favori)', E6, tr('bas'))}
      ${tab('Par cote · toujours la cote haute (outsider)', E6, tr('haut'))}
      ${duo('Par circuit', 'Circuit', parCle(L, r => r.tour))}
      ${duo('Par tournoi', 'Tournoi', parCle(L, r => r.tournoi))}
      ${duo('Par écart entre les deux cotes', 'Écart', trier(parCle(L, ecartDe), ORDRE_ECART))}
      ${duo('Par moment de la journée', 'Moment', trier(parCle(L, moment), ORDRE_MOMENT))}
      ${duo('Par jour de la semaine', 'Jour', trier(parCle(L, jourSem), ORDRE_JOURS))}
      ${joueurs.length ? tab('Par joueur (3 matchs saisis ou plus) · si tu avais joué 1 € sur lui', ['Joueur', 'Matchs', 'Gagnés', 'Réussite', 'Bénéfice'], joueurs.slice(0, 15).map(o => [o.label, o.n, o.g, pct(o.pct), P(o.profit)])) : ''}
      <p style="font-size:11px;opacity:.6;margin:8px 0 0">« Favori gagne » = part des matchs où le joueur à la cote basse l'emporte. « Cote basse » / « Cote haute » = bénéfice si tu avais joué 1 € sur chaque favori / chaque outsider. Sur peu de matchs ces chiffres bougent beaucoup : ne conclus rien avant d'en avoir plusieurs dizaines (idéalement des centaines).</p>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-size:13px;font-weight:800;min-height:44px;display:flex;align-items:center">Résultats saisis (${liste.length}, dont ${liste.filter(r => r.w === 0).length} annulé${liste.filter(r => r.w === 0).length > 1 ? 's' : ''})</summary>
        ${liste.map(r => { if (r.w === 0) return `<div style="${card};margin-top:6px;padding:8px 12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:12px;opacity:.7">${esc(r.date.slice(8, 10) + '/' + r.date.slice(5, 7))} · ${esc(r.tournoi)}</span><button type="button" aria-label="Supprimer ce résultat" onclick="tennisSupprimer('${eid(r.id)}')" style="width:44px;height:44px;border:0;background:transparent;color:inherit;opacity:.6;font-size:16px;cursor:pointer">✕</button></div><div style="font-size:14px;font-weight:800">${esc(r.j1)} – ${esc(r.j2)}</div><div style="font-size:12px;margin-top:2px">Annulé / abandon : remboursé, hors stats</div></div>`; const x = info(r); return `<div style="${card};margin-top:6px;padding:8px 12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:12px;opacity:.7">${esc(r.date.slice(8, 10) + '/' + r.date.slice(5, 7))} · ${esc(r.tournoi)}${r.auto ? ' · lu automatiquement' : ''}</span><button type="button" aria-label="Supprimer ce résultat" onclick="tennisSupprimer('${eid(r.id)}')" style="width:44px;height:44px;border:0;background:transparent;color:inherit;opacity:.6;font-size:16px;cursor:pointer">✕</button></div>
          <div style="font-size:14px;font-weight:800"><span style="color:#16a34a">${esc(x.gagnant)}</span> bat ${esc(r.w === 1 ? r.j2 : r.j1)}</div>
          <div style="font-size:12px;margin-top:2px"><span style="color:${x.gagnantBas ? BLEU : AMBRE};font-weight:800">${x.gagnantBas ? 'Cote basse' : 'Cote haute'}</span> (${fr(x.gagnantBas ? x.cB : x.cH)}) · basse ${signe(x.gainB)} · haute ${signe(x.gainH)}</div></div>`; }).join('')}</details>
      <button type="button" onclick="tennisExport()" style="margin-top:16px;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid ${BD};background:transparent;color:inherit;font-weight:700;font-size:12px;cursor:pointer">Exporter les résultats (CSV)</button>`;
  }
  const sept = () => Array.from({ length: 7 }, (_, i) => decaler(auj(), -i));
  const aValider = () => { const o = []; Object.keys(S.days).forEach(j => (S.days[j].matchs || []).forEach(m => { if ((m.w === 1 || m.w === 2) && !estQualif(m.tournoi) && avecCotes(m) && !S.res.some(r => r.id === matchId(j, m))) o.push({ j, m }); })); return o; };
  const sansRes = () => sept().map(j => ({ j, l: ((S.days[j] && S.days[j].matchs) || []).filter(m => !estQualif(m.tournoi) && avecCotes(m) && !S.res.some(r => r.id === matchId(j, m)) && m.tour === 'ATP') }));
  function panneauSans() {
    const v = aValider(), tot = sansRes().reduce((a, x) => a + x.l.length, 0);
    const banniere = v.length && !S.days[S.jour] ? `<div style="margin-top:10px;border:1px solid #16a34a;border-radius:12px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:13px"><b>${v.length} résultat${v.length > 1 ? 's' : ''} lu${v.length > 1 ? 's' : ''} automatiquement</b> sur la page</span><button type="button" onclick="tennisValiderTout()" style="min-height:44px;padding:0 14px;border-radius:10px;font-weight:800;font-size:13px;background:#16a34a;color:#fff;border:0;cursor:pointer">Tout valider</button></div>` : '';
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
      <button type="button" onclick="tennisDiagDetail()" style="min-height:44px;padding:0 14px;margin-left:6px;border-radius:10px;font-weight:700;font-size:12px;background:transparent;color:inherit;border:1px solid ${BD};cursor:pointer">Diagnostic détail</button>
      <button type="button" onclick="tennisDiagExpert()" style="min-height:44px;padding:0 14px;margin-left:6px;border-radius:10px;font-weight:700;font-size:12px;background:transparent;color:inherit;border:1px solid ${BD};cursor:pointer">Diagnostic expert</button>
      ${S.diag ? `<p style="font-size:12px;opacity:.7;margin:8px 0 4px">Copie tout ce texte et envoie-le moi :</p><textarea readonly onclick="this.select()" style="width:100%;box-sizing:border-box;height:160px;font-size:11px;border-radius:8px;border:1px solid ${BD};background:transparent;color:inherit">${esc(S.diag)}</textarea>` : ''}</details>`;
  }

  function render() {
    const el = root(); if (!el) return;
    const data = S.days[S.jour], n = filtrer().length;
    el.innerHTML = `<div class="surface" style="border:1px solid ${BD};border-radius:16px;padding:14px">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;border-radius:14px;padding:14px;color:#fff;background:linear-gradient(135deg,#14532d,#166534 55%,#a3e635 220%)">
        <div style="display:flex;align-items:center;gap:10px"><span style="font-size:30px" aria-hidden="true">🎾</span><div><h2 style="margin:0;font-size:20px;font-weight:800">Tennis</h2><p style="margin:2px 0 0;font-size:12px;opacity:.9">Touche le vainqueur de chaque match · bilan sur ${n} match${n > 1 ? 's' : ''} saisi${n > 1 ? 's' : ''}</p></div></div>
        <div style="display:flex;gap:6px"><button type="button" onclick="tennisSon()" aria-label="${sonOn() ? 'Couper le son' : 'Activer le son'}" aria-pressed="${sonOn()}" style="width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.14);color:#fff;font-size:18px;cursor:pointer">${sonOn() ? '🔊' : '🔇'}</button>
        <button type="button" onclick="tennisCharger(true)" ${S.busy ? 'disabled' : ''} style="min-height:44px;padding:0 14px;border-radius:12px;font-weight:800;font-size:13px;background:#fff;color:#14532d;border:0;cursor:pointer">${S.busy ? '…' : 'Actualiser'}</button></div></div>
      ${S.err ? `<p style="margin:10px 0 0;font-size:13px;color:#dc2626;font-weight:700">${esc(S.err)}</p>` : ''}
      ${data && data.avertissements && data.avertissements.length ? `<p style="margin:8px 0 0;font-size:12px;color:#d97706">${esc(data.avertissements.join(' · '))}</p>` : ''}
      ${titreSect('Bilan')}${bilanHaut()}
      ${titreSect('Calendrier du jour')}${vueCalendrier()}
      ${panneauSans()}
      ${S.res.length ? titreSect('Détail des stats') + detailBas() : ''}
      ${reglage()}
      <p style="font-size:11px;opacity:.55;margin-top:10px">Les cotes viennent de Tennis Explorer et peuvent différer de celles de ton bookmaker. Elles sont gardées au moment où tu saisis le résultat.</p></div>`;
    dessiner();
    try { const b = document.getElementById('tnBande'), a = b && b.querySelector('[aria-selected="true"]'); if (a) b.scrollLeft = a.offsetLeft - (b.clientWidth - a.clientWidth) / 2; } catch (e) {}   // le jour choisi reste visible dans la bande
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
  const KEY_DAYS = 'prono_tennis_days_v1';
  const lireMem = () => { try { const o = JSON.parse(localStorage.getItem(KEY_DAYS) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
  const ecrireMem = (jour, j) => {
    try {
      const o = lireMem(); o[jour] = { jour, maj: j.maj, matchs: j.matchs };
      Object.keys(o).sort().slice(0, -12).forEach(k => delete o[k]);   // on ne garde que les 12 derniers jours
      localStorage.setItem(KEY_DAYS, JSON.stringify(o));
    } catch (e) {}
  };
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
      if (j.matchs && j.matchs.length && !j.perime) ecrireMem(jour, j);
    } catch (e) {
      S.err = e.message === 'Failed to fetch' ? "Robot injoignable : vérifie l'adresse et ta connexion." : e.message;
      // le calendrier ne disparaît pas : on réaffiche le dernier connu sur cet appareil
      const m = lireMem()[jour];
      if (m && m.matchs && m.matchs.length && !(S.days[jour] && S.days[jour].matchs && S.days[jour].matchs.length)) S.days[jour] = Object.assign({ ok: true }, m, { perime: true, local: true });
    }
    S.busy = false; render();
    chargerDetails(jour);
  }

  // Détails des matchs du jour (classement, face-à-face, saison) : lus un par un par le robot, gardés sur l'appareil
  // Pronostics d'experts (RueDesJoueurs) : une demande par match, gardée 2 h sur l'appareil. Une erreur ici ne bloque jamais le reste.
  const nomFamille = n => { const t = String(n || '').trim().split(/\s+/); while (t.length > 1 && /^[A-Za-z]\.?(-[A-Za-z]\.?)?$/.test(t[t.length - 1])) t.pop(); return t.join(' '); };
  async function chargerExperts(jour) {
    const data = S.days[jour];
    if (!data || !data.matchs || !S.robot.url || !S.robot.key || S.rdjBusy || S.rdjOff) return;
    const now = Date.now();
    const l = data.matchs.filter(m => m.tour === 'ATP' && !estQualif(m.tournoi) && avecCotes(m) && m.id && !/\//.test(m.j1 + m.j2) && statutMatch(m, jour, null).k === 'avenir')
      .filter(m => { const x = S.rdj[m.id]; return !x || now - (x.t || 0) > (x.trouve && x.pick ? 6 : 1.5) * 3600e3; }).slice(0, 24);
    if (!l.length) return;
    S.rdjBusy = true; let i = 0;
    const base = S.robot.url.replace(/\/+$/, '');
    const un = async () => {
      while (i < l.length && !S.rdjOff) {
        const m = l[i++];
        try {
          const r = await fetch(base + '/rdj?a=' + encodeURIComponent(nomFamille(m.j1)) + '&b=' + encodeURIComponent(nomFamille(m.j2)), { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
          if (r.status === 404 || r.status === 401) { S.rdjOff = true; break; }     // robot sans cette fonction : on s'en passe
          const o = await r.json().catch(() => ({}));
          if (r.ok && o.ok) S.rdj[m.id] = { t: Date.now(), trouve: !!o.trouve, pick: o.pick || 0, c1: o.c1, c2: o.c2, url: o.url || '' };
        } catch (e) {}
      }
    };
    try { await Promise.all([un(), un(), un()]); } catch (e) {}
    S.rdjBusy = false; sauverRdj();
  }
  async function chargerDetails(jour) {
    const data = S.days[jour];
    if (!data || !data.matchs) return;
    try { await chargerExperts(jour); } catch (e) { S.rdjBusy = false; }
    if (!S.robot.url || !S.robot.key || S.detBusy) { figerAuto(jour); render(); return; }
    const now = Date.now();
    const aLire = [...new Set(data.matchs.filter(m => m.tour === 'ATP' && !estQualif(m.tournoi) && avecCotes(m) && m.id).map(m => m.id))]
      .filter(id => { const d = S.det[id]; return !d || (d.vide && now - (d.t || 0) > 3 * 3600e3); }).slice(0, 24);
    if (!aLire.length) { const avant = S.auto.length; figerAuto(jour); if (S.auto.length !== avant) render(); return; }
    S.detBusy = true; let i = 0, stop = false;
    const base = S.robot.url.replace(/\/+$/, '');
    const un = async () => {
      while (i < aLire.length && !stop) {
        const id = aLire[i++];
        try {
          const r = await fetch(base + '/tennis-detail?id=' + encodeURIComponent(id), { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
          if (r.status === 404 || r.status === 401) { stop = true; break; }       // robot pas à jour : on s'en passe, sans insister
          const o = await r.json().catch(() => ({}));
          if (r.ok && o.ok) { const d = Object.assign({}, o); delete d.ok; delete d.v; delete d.id; S.det[id] = Object.assign(d, { t: Date.now(), vide: d.r1 == null && d.h1 == null && d.w1 == null }); }
        } catch (e) {}
      }
    };
    await Promise.all([un(), un(), un()]);
    S.detBusy = false; sauverDet(); figerAuto(jour); render();
  }

  /* ---------- Actions (appelées par les boutons) ---------- */
  window.tennisCharger = charger;
  window.tennisOuvrir = () => charger(false);
  window.tennisRecharger = () => { try { const b = JSON.parse(localStorage.getItem(KEY_RES) || '[]'); if (Array.isArray(b)) S.res = b; } catch (e) {} render(); };
  window.tennisSet = (k, v) => { S[k] = v; render(); };
  window.tennisJourDate = j => { S.jour = j; S.err = ''; render(); charger(false); };
  window.tennisSon = () => { try { localStorage.setItem(KEY_SON, sonOn() ? '0' : '1'); } catch (e) {} render(); };
  window.tennisJour = n => { S.jour = n === 0 ? auj() : decaler(S.jour, n); S.err = ''; render(); charger(false); };
  window.tennisDiag = async () => {
    S.diag = 'Chargement du diagnostic…'; render();
    try {
      const r = await fetch(S.robot.url.replace(/\/+$/, '') + '/tennis?debug=1&date=' + S.jour, { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
      S.diag = (await r.text()).slice(0, 12000);
    } catch (e) { S.diag = 'Erreur : ' + e.message; }
    render();
  };
  window.tennisDiagExpert = async () => {
    const data = S.days[S.jour], L = data ? (data.matchs || []).filter(x => x.tour === 'ATP' && x.id && !/\//.test(x.j1 + x.j2)) : [], m = L.find(x => S.rdj[x.id] && S.rdj[x.id].trouve) || L[0];
    if (!m) { S.diag = "Aucun match ATP pour ce jour : appuie d'abord sur Actualiser."; render(); return; }
    S.diag = 'Chargement du diagnostic expert…'; render();
    const base = S.robot.url.replace(/\/+$/, ''), H = { headers: { 'x-key': S.robot.key }, cache: 'no-store' };
    try {
      const r1 = await fetch(base + '/rdj?debug=1&a=' + encodeURIComponent(nomFamille(m.j1)) + '&b=' + encodeURIComponent(nomFamille(m.j2)), H), t1 = await r1.text();
      let t2 = '';
      try { const o = JSON.parse(t1); if (o.url) { const r2 = await fetch(base + '/rdj-diag?grep=logo%20Unibet&first=1&w=1600&p=' + encodeURIComponent(o.url.replace('https://www.ruedesjoueurs.com', '')), H); t2 = '\n\n--- Page du match (bloc des cotes Unibet) ---\n' + (await r2.text()); } } catch (e) {}
      S.diag = ('Match : ' + m.j1 + ' / ' + m.j2 + '\n' + t1 + t2).slice(0, 14000);
    } catch (e) { S.diag = 'Erreur : ' + e.message; }
    render();
  };
  window.tennisDiagDetail = async () => {
    const data = S.days[S.jour], m = data && (data.matchs || []).find(x => x.id);
    if (!m) { S.diag = "Aucun match avec identifiant pour ce jour : appuie d'abord sur Actualiser."; render(); return; }
    S.diag = 'Chargement du diagnostic du détail…'; render();
    try {
      const r = await fetch(S.robot.url.replace(/\/+$/, '') + '/tennis-detail?debug=1&id=' + encodeURIComponent(m.id), { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
      S.diag = (await r.text()).slice(0, 8000);
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
    sauver(); render(); if (S.res.some(r => r.id === id && r.w === n)) fete(jour);
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
  // Abandon / match annulé : pari remboursé, le match ne compte dans aucune stat. Retouche = remet en jeu.
  window.tennisAnnule = id => {
    id = decodeURIComponent(id);
    const jour = id.slice(0, 10), data = S.days[jour], i = S.res.findIndex(r => r.id === id);
    if (i >= 0 && S.res[i].w === 0) S.res.splice(i, 1);
    else if (i >= 0) S.res[i].w = 0;
    else {
      const m = data && data.matchs.find(x => matchId(jour, x) === id); if (!avecCotes(m)) return;
      S.res.push({ id, date: jour, heure: m.heure, tour: m.tour, tournoi: m.tournoi, j1: m.j1, j2: m.j2, c1: m.c1, c2: m.c2, w: 0 });
    }
    sauver(); render();
  };
  window.tennisSupprimer = id => { id = decodeURIComponent(id); S.res = S.res.filter(r => r.id !== id); sauver(); render(); };
  window.tennisExport = () => {
    const l = [['Date', 'Heure', 'Circuit', 'Tournoi', 'Joueur 1', 'Cote 1', 'Joueur 2', 'Cote 2', 'Vainqueur', 'Gagnant', 'Gain cote basse', 'Gain cote haute']];
    S.res.forEach(r => { if (r.w === 0) { l.push([r.date, r.heure, r.tour, r.tournoi, r.j1, fr(r.c1), r.j2, fr(r.c2), 'Annulé / abandon', 'Remboursé', '0,00', '0,00']); return; } const x = info(r); l.push([r.date, r.heure, r.tour, r.tournoi, r.j1, fr(r.c1), r.j2, fr(r.c2), x.gagnant, x.gagnantBas ? 'Cote basse' : 'Cote haute', fr(x.gainB), fr(x.gainH)]); });
    const csv = '﻿' + l.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'tennis-resultats-' + auj() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  };
})();

// ── Branchement de l'onglet 🎾 Tennis : tout est ici, le code du foot (prono.js) n'est pas modifié.
// Si quoi que ce soit échoue, le foot continue de fonctionner comme avant.
(function () {
  try {
    const suivantFoot = window.switchView;
    if (typeof suivantFoot !== 'function') return;
    const ACTIF = 'px-4 py-2 rounded-xl transition bg-blue-600 text-white shadow-sm font-bold text-sm flex items-center gap-2';
    const INACTIF = 'px-4 py-2 rounded-xl transition text-slate-600 hover:text-slate-900 font-bold text-sm flex items-center gap-2';
    const $ = id => document.getElementById(id);
    window.switchView = function (view) {
      const tn = $('tennisViewContent'), tb = $('btnViewTennis');
      if (view !== 'tennis') {
        try { if (tn) tn.classList.add('hidden'); if (tb) tb.className = INACTIF; } catch (e) {}
        return suivantFoot.apply(this, arguments);
      }
      try {
        suivantFoot('analyzer');                          // laisse le foot gérer son propre état…
        $('analyzerViewContent').classList.add('hidden'); // …puis on masque ses deux écrans
        $('trackerViewContent').classList.add('hidden');
        $('btnViewAnalyzer').className = INACTIF; $('btnViewTracker').className = INACTIF;
        if (tn) tn.classList.remove('hidden'); if (tb) tb.className = ACTIF;
        if (typeof window.tennisOuvrir === 'function') window.tennisOuvrir();
      } catch (e) { console.error('Onglet tennis :', e); suivantFoot('tracker'); }
    };
  } catch (e) { console.error(e); }
})();
