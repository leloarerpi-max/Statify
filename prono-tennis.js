/* ================= TENNIS : MATCHS ET STATISTIQUES =================
   Onglet « Tennis » de PronoTracker. Aucun pari, aucune cote : uniquement des matchs ATP et des statistiques.
   1) Calendrier : les matchs ATP du jour (tournois du circuit, sans qualifications), avec le vainqueur quand il est connu.
   2) Les matchs terminés sont enregistrés tout seuls (rien à saisir) : ils alimentent l'onglet « Joueurs »
      (palmarès, classement Elo de l'année, fiche joueur, duel, tournois, calendrier) défini dans prono-tennis-joueurs.js.
   3) Historique : relit les résultats depuis le 1er janvier, jour par jour.
   Les résultats tennis sont rangés à part : ils ne se mélangent jamais avec le foot.
   Matchs : route /tennis du robot Cloudflare (worker.js). */
(function () {
  'use strict';
  const KEY_ROBOT = 'prono-tennis-robot';
  const KEY_RES = 'prono_tennis_results_v1';       // matchs terminés enregistrés (même clé qu'avant : rien n'est perdu)
  const KEY_HISTO = 'prono_tennis_histo_v3';       // jours déjà importés dans l'historique (reprise possible)
  const KEY_DAYS = 'prono_tennis_days_v1';
  const KEY_CL = 'prono_tennis_cl_v1';              // dernier classement ATP en direct lu (affiché même hors ligne)
  const S = { onglet: 'cal', robot: { url: '', key: '' }, jour: '', fin: '', days: {}, busy: false, err: '', res: [], diag: '', majBusy: false, cl: { l: [], maj: 0, busy: false, err: '', n: 20, q: '' }, histo: { done: {}, busy: false, stop: false, ajoutes: 0, err: '' } };
  try { Object.assign(S.robot, JSON.parse(localStorage.getItem(KEY_ROBOT) || '{}')); } catch (e) {}
  try { const b = JSON.parse(localStorage.getItem(KEY_RES) || '[]'); if (Array.isArray(b)) S.res = b; } catch (e) {}
  try { const c = JSON.parse(localStorage.getItem(KEY_CL) || 'null'); if (c && Array.isArray(c.l)) { S.cl.l = c.l; S.cl.maj = c.maj || 0; } } catch (e) {}
  try { const d = JSON.parse(localStorage.getItem(KEY_HISTO) || '{}'); if (d && typeof d === 'object') S.histo.done = d; } catch (e) {}

  /* ---------- Outils ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  const matchId = (jour, m) => jour + '|' + m.j1 + '|' + m.j2;
  const estQualif = t => /qualif|\bqual\b|\(q\)/i.test(String(t || ''));
  const filtrer = () => S.res.filter(r => (r.w === 1 || r.w === 2) && !estQualif(r.tournoi) && r.tour === 'ATP');
  // Enregistre les matchs terminés d'une journée (vainqueur lu sur la page). Retourne le nombre de nouveaux matchs.
  // Score final lu par le robot : sets gagnés [2,1] et jeux par set ["6-4","6-7","7-5"] (absents si la page ne les donne pas)
  function scoreDe(m) {
    const o = {};
    if (Array.isArray(m.sets) && m.sets.length === 2 && m.sets.every(x => Number.isInteger(x) && x >= 0 && x <= 3)) o.sets = m.sets.slice();
    if (o.sets && Array.isArray(m.jeux) && m.jeux.length && m.jeux.length <= 5 && m.jeux.every(x => /^\d{1,2}-\d{1,2}$/.test(x))) o.jeux = m.jeux.slice();
    return o;
  }
  function enregistrer(jour, data) {
    let n = 0, maj = false;
    ((data && data.matchs) || []).forEach(m => {
      if ((m.w !== 1 && m.w !== 2) || m.tour !== 'ATP' || estQualif(m.tournoi) || !m.j1 || !m.j2) return;
      const id = matchId(jour, m), sc = scoreDe(m), ex = S.res.find(r => r.id === id);
      if (ex) { if (sc.sets && !ex.sets) { ex.sets = sc.sets; if (sc.jeux) ex.jeux = sc.jeux; maj = true; } return; }   // match déjà connu : on lui ajoute son score s'il n'en avait pas
      S.res.push(Object.assign({ id, date: jour, heure: m.heure, tour: m.tour, tournoi: m.tournoi, j1: m.j1, j2: m.j2, w: m.w, auto: true }, sc)); n++;
    });
    if (maj) { try { sauver(); } catch (e) {} }
    return n;
  }

  /* ---------- Styles ---------- */
  const BD = 'rgba(128,128,128,.32)';
  const card = 'border:1px solid ' + BD + ';border-radius:14px;padding:12px;margin-top:10px';
  const VERT = '#16a34a';
  const puce = (t, c) => `<span style="font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px;background:color-mix(in srgb,${c} 18%,transparent);color:${c};border:1px solid color-mix(in srgb,${c} 45%,transparent);white-space:nowrap">${t}</span>`;
  const bt = (label, actif, on) => `<button type="button" onclick="${on}" style="min-height:44px;padding:0 16px;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;${actif ? 'background:#1d4ed8;color:#fff;border:1px solid #3b82f6' : 'background:transparent;color:inherit;border:1px solid ' + BD}">${label}</button>`;
  const titreSect = t => `<div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.65;margin:22px 0 4px">${t}</div>`;
  const minutes = h => { const p = String(h || '').match(/^(\d{1,2}):(\d{2})$/); return p ? +p[1] * 60 + +p[2] : null; };
  const maintenantMin = () => minutes(new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).replace('24:', '00:'));
  function statutMatch(m, jour) {
    if (m.w === 1 || m.w === 2) return { k: 'fini', t: '✓ Terminé', c: VERT };
    const a0 = auj();
    if (jour > a0) return { k: 'avenir', t: 'À venir', c: '#2563eb' };
    if (jour < a0) return { k: 'inconnu', t: 'Résultat non lu', c: '#6b7280' };
    const mm = minutes(m.heure), now = maintenantMin();
    if (mm == null || now == null) return { k: 'avenir', t: "Aujourd'hui", c: '#2563eb' };
    if (now < mm) { const d = mm - now; return { k: 'avenir', t: d >= 60 ? 'Dans ' + Math.floor(d / 60) + ' h ' + String(d % 60).padStart(2, '0') : 'Dans ' + d + ' min', c: '#2563eb' }; }
    if (now < mm + 180) return { k: 'encours', t: '● En cours', c: '#dc2626' };
    return { k: 'inconnu', t: 'Terminé · résultat pas encore lu', c: '#d97706' };
  }

  /* ---------- Rang ATP et pays d'un joueur (rapprochés du classement en direct) ---------- */
  const sansAccent = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  let idxCl = { maj: -1, t: [] };
  // « Sinner J. » → cherche « Jannik Sinner » : même nom de famille (en fin de nom) et même initiale du prénom
  function trouverCl(nomTE) {
    if (idxCl.maj !== S.cl.maj) idxCl = { maj: S.cl.maj, t: S.cl.l.map(x => ({ x, n: ' ' + sansAccent(x.nom), i: sansAccent(x.nom)[0] })) };
    const parts = String(nomTE || '').trim().split(/\s+/); let ini = '';
    while (parts.length > 1 && /^[A-Za-z]\.?(-[A-Za-z]\.?)?$/.test(parts[parts.length - 1])) ini = ini || sansAccent(parts.pop())[0];
    const fam = sansAccent(parts.join(' ')); if (!fam) return null;
    const c = idxCl.t.filter(o => o.n.endsWith(' ' + fam) && (!ini || o.i === ini));
    return c.length === 1 ? c[0].x : null;
  }
  const pastilles = nom => { const x = trouverCl(nom); return x ? `<span title="Classement ATP en direct" style="font-size:10px;font-weight:800;padding:1px 6px;border-radius:6px;background:rgba(37,99,235,.16);color:#2563eb;border:1px solid rgba(37,99,235,.4)">#${esc(x.rang)}</span>${x.pays ? `<span title="Pays" style="font-size:10px;font-weight:800;padding:1px 6px;border-radius:6px;background:rgba(128,128,128,.2)">${esc(x.pays)}</span>` : ''}` : ''; };

  /* ---------- Calendrier ---------- */
  // Score d'un joueur sur sa ligne : sets gagnés (gras) puis jeux de chaque set
  function scoreLigne(m, n, gagne, extra) {
    const s = scoreDe(m); if (!s.sets) return '';
    const jeux = (s.jeux || []).map(x => x.split('-')[n - 1]);
    return `<span style="${extra || ''}display:inline-flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums;font-size:14px"><b style="font-size:16px;font-weight:800">${s.sets[n - 1]}</b>${jeux.map(j => `<span style="opacity:${gagne ? 1 : .75};min-width:12px;text-align:center">${j}</span>`).join('')}</span>`;
  }
  function carte(m, jour) {
    const stt = statutMatch(m, jour), ligne = (nom, n) => {
      const gagne = m.w === n, perd = (m.w === 1 || m.w === 2) && !gagne;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;margin-top:6px;${gagne ? 'background:color-mix(in srgb,#16a34a 16%,transparent);border:1px solid color-mix(in srgb,#16a34a 50%,transparent)' : 'border:1px solid ' + BD}${perd ? ';opacity:.6' : ''}"><span style="font-size:15px;font-weight:${gagne ? 800 : 600}">${esc(nom)}</span>${pastilles(nom)}${gagne ? '<span style="margin-left:auto;font-size:12px;font-weight:800;color:' + VERT + '">🏆 Vainqueur</span>' : ''}${scoreLigne(m, n, gagne, gagne ? '' : 'margin-left:auto;')}</div>`;
    };
    return `<div style="${card}"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:15px;font-weight:800;opacity:.85">${esc(m.heure) || '—'}</span>${puce(stt.t, stt.c)}</div>${ligne(m.j1, 1)}${ligne(m.j2, 2)}</div>`;
  }
  function bandeJours() {
    const fin = S.fin && S.fin <= decaler(auj(), 1) ? S.fin : decaler(auj(), 1), deb = auj().slice(0, 4) + '-01-01';
    const jours = Array.from({ length: 8 }, (_, i) => decaler(fin, i - 7));
    const nav = (txt, on, off, label) => `<button type="button" aria-label="${label}" onclick="${off ? '' : on}" style="flex:0 0 auto;min-width:40px;min-height:58px;border-radius:14px;font-size:18px;font-weight:800;cursor:${off ? 'default' : 'pointer'};pointer-events:${off ? 'none' : 'auto'};opacity:${off ? .3 : 1};background:transparent;color:inherit;border:1px solid ${BD}">${txt}</button>`;
    return `<div id="tnBande" role="tablist" style="display:flex;gap:6px;overflow-x:auto;margin-top:10px;padding-bottom:4px">${nav('‹', 'tennisSemaine(-1)', decaler(jours[0], -1) < deb, 'Semaine précédente')}${jours.map(j => {
      const n = S.res.filter(r => r.date === j && r.tour === 'ATP' && (r.w === 1 || r.w === 2)).length, actif = j === S.jour;
      const d = new Date(j + 'T12:00:00Z'), sem = d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
      return `<button type="button" role="tab" aria-selected="${actif}" onclick="tennisJourDate('${j}')" style="flex:0 0 auto;min-width:54px;min-height:58px;border-radius:14px;padding:6px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;${actif ? 'background:#1d4ed8;color:#fff;border:1px solid #3b82f6' : 'background:transparent;color:inherit;border:1px solid ' + BD}">
        <span style="font-size:11px;font-weight:700;opacity:.8;text-transform:capitalize">${j === auj() ? 'auj.' : esc(sem)}</span><span style="font-size:17px;font-weight:800">${d.getUTCDate()}</span>
        <span style="font-size:10px;font-weight:700;height:12px;opacity:.75">${n ? n + ' ✓' : ''}</span></button>`;
    }).join('')}${nav('›', 'tennisSemaine(1)', fin >= decaler(auj(), 1), 'Semaine suivante')}</div>
    <div style="margin-top:6px;display:flex;align-items:center;gap:8px;font-size:12px"><label for="tnDate" style="opacity:.75;font-weight:700">Aller à une date :</label><input id="tnDate" type="date" min="${deb}" max="${decaler(auj(), 1)}" value="${S.jour}" onchange="tennisDate(this.value)" style="min-height:40px;border-radius:10px;border:1px solid ${BD};background:transparent;color:inherit;padding:0 8px;font-size:13px"></div>`;
  }
  function vueCalendrier() {
    const data = S.days[S.jour], cfgOk = S.robot.url && S.robot.key;
    let corps = '';
    if (data) {
      const ms = data.matchs.filter(m => !estQualif(m.tournoi) && m.tour === 'ATP');
      if (!data.local && data.v !== 5) corps += `<div style="margin-top:12px;border:2px solid #dc2626;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700">⚠️ Ton robot Cloudflare n'est pas à jour (ancienne version de worker.js). Colle le dernier worker.js dans le Worker dont l'adresse est dans le réglage ci-dessous, clique sur Deploy, puis sur Actualiser.<br><span style="font-weight:600;font-size:12px">Version du robot reçue : ${data.v == null ? 'aucune (très ancienne)' : esc(data.v)} · attendue : 5. Adresse utilisée : ${esc(S.robot.url)}.</span></div>`;
      if (data.perime) corps += `<div style="margin-top:12px;border:1px solid #d97706;border-radius:12px;padding:8px 12px;font-size:12px;font-weight:700">⚠️ Calendrier mémorisé${data.maj ? ' (' + new Date(data.maj).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ')' : ''} : Tennis Explorer ne répond pas bien en ce moment. <button type="button" onclick="tennisCharger(true)" style="margin-left:6px;font-weight:800;text-decoration:underline;background:none;border:0;color:inherit;cursor:pointer">Réessayer</button></div>`;
      if (!ms.length) corps += `<div style="text-align:center;margin-top:22px"><div style="font-size:42px">🎾</div><p style="margin:6px 0 0;font-weight:800">Aucun match de tournoi du circuit ${data.raison ? 'trouvé pour ce jour.' : 'ce jour-là.'}</p>${data.raison ? `<p style="font-size:11px;opacity:.6;margin:4px 0 0">${esc(data.raison)}</p>` : ''}<button type="button" onclick="tennisCharger(true)" style="margin-top:12px;min-height:44px;padding:0 18px;border-radius:12px;font-weight:800;background:#2563eb;color:#fff;border:0;cursor:pointer">Réessayer</button></div>`;
      const groupes = [], idx = {};
      ms.forEach(m => { const k = m.tournoi; if (!(k in idx)) { idx[k] = groupes.length; groupes.push({ tournoi: m.tournoi, l: [] }); } groupes[idx[k]].l.push(m); });
      corps += groupes.map(g => {
        const faits = g.l.filter(m => m.w === 1 || m.w === 2).length;
        return `<div style="display:flex;align-items:center;gap:8px;margin-top:20px;padding-bottom:6px;border-bottom:2px solid ${BD}"><span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;background:rgba(128,128,128,.28)">ATP</span><span style="font-size:15px;font-weight:800">${esc(g.tournoi)}</span><span style="margin-left:auto;font-size:12px;opacity:.7">${faits}/${g.l.length} terminés</span></div>${g.l.map(m => carte(m, S.jour)).join('')}`;
      }).join('');
    } else if (cfgOk && !S.err) corps = '<p style="text-align:center;opacity:.7;margin-top:24px">Chargement…</p>';
    return `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;border:1px solid ${BD};border-radius:12px;padding:4px">
        <button type="button" aria-label="Jour précédent" onclick="tennisJour(-1)" style="width:44px;height:44px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer">&lsaquo;</button>
        <button type="button" onclick="tennisJour(0)" style="min-height:44px;border:0;background:transparent;color:inherit;font-size:14px;font-weight:800;cursor:pointer">${esc(joliJour(S.jour))}</button>
        <button type="button" aria-label="Jour suivant" onclick="tennisJour(1)" style="width:44px;height:44px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer">&rsaquo;</button></div>
      ${bandeJours()}${corps}`;
  }

  /* ---------- Classement ATP en direct (live-tennis.eu, lu par le robot) ---------- */
  function blocClassement(compact) {
    const c = S.cl, cfg = S.robot.url && S.robot.key, q = (c.q || '').trim().toLowerCase();
    let l = c.l; if (q) l = l.filter(x => String(x.nom).toLowerCase().includes(q) || String(x.pays || '').toLowerCase() === q);
    const vu = l.slice(0, compact ? 10 : q ? 30 : c.n);
    const ligne = x => `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid ${BD};font-size:13px"><span style="min-width:30px;font-weight:800">${esc(x.rang)}</span>
      <span style="min-width:0;flex:1"><span style="font-weight:700">${esc(x.nom)}</span> <span style="opacity:.6;font-size:11px">${esc(x.pays || '')}${x.age ? ' · ' + esc(x.age) + ' ans' : ''}</span>${x.resultat ? `<div style="font-size:11px;opacity:.65">${esc(x.resultat)}</div>` : ''}</span>
      <span style="text-align:right;white-space:nowrap"><b>${x.points != null ? esc(x.points) : '—'}</b>${x.variation ? `<div style="font-size:11px;font-weight:800;color:${x.variation > 0 ? VERT : '#dc2626'}">${x.variation > 0 ? '▲ +' : '▼ '}${esc(x.variation)}</div>` : ''}</span></div>`;
    return `<div style="${card};border-left:5px solid #2563eb"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div style="font-size:13px;font-weight:800">🌍 Classement ATP en direct</div>
        <button type="button" onclick="tennisClassement(true)" style="min-height:40px;padding:0 12px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;background:transparent;color:inherit;border:1px solid ${BD}">${c.busy ? '…' : 'Actualiser'}</button></div>
      <div style="font-size:11px;opacity:.7;margin-top:2px">Points en direct pendant les tournois · source : <a href="https://live-tennis.eu/fr/classement-atp-live" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">live-tennis.eu</a>${c.maj ? ' · lu à ' + new Date(c.maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
      ${c.err ? `<div style="font-size:12px;font-weight:700;margin-top:6px;color:#dc2626">${esc(c.err)}</div>` : ''}
 ${c.l.length ? `${compact ? '' : `<input type="search" value="${esc(c.q)}" placeholder="Chercher un joueur ou un pays (ex. Sinner, FRA)" onchange="tennisClFiltre(this.value)" style="margin-top:8px;width:100%;box-sizing:border-box;min-height:44px;border-radius:10px;border:1px solid ${BD};background:transparent;color:inherit;padding:0 10px;font-size:14px">`}<div style="margin-top:6px">${vu.map(ligne).join('') || '<p style="font-size:12px;opacity:.7">Aucun joueur trouvé.</p>'}</div>
        ${compact ? `<button type="button" onclick="tennisOnglet('cl')" style="margin-top:8px;min-height:40px;padding:0 12px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;background:transparent;color:inherit;border:1px solid ${BD}">Voir tout le classement</button>` : ''}
        ${!compact && !q && c.n < l.length ? `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${[50, 100, 150].filter(n => n > c.n && n <= Math.max(50, l.length)).map(n => `<button type="button" onclick="tennisClPlus(${n})" style="min-height:40px;padding:0 12px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;background:transparent;color:inherit;border:1px solid ${BD}">Afficher le top ${n}</button>`).join('')}</div>` : ''}`
        : (cfg ? '<p style="font-size:12px;opacity:.75;margin:8px 0 0">' + (c.busy ? 'Chargement…' : 'Appuie sur Actualiser pour lire le classement.') + '</p>' : '<p style="font-size:12px;opacity:.75;margin:8px 0 0">Renseigne d\'abord le robot (réglage en bas de page).</p>')}</div>`;
  }
  async function chargerClassement(force) {
    const c = S.cl; if (c.busy || !S.robot.url || !S.robot.key) return;
    if (!force && c.l.length && Date.now() - c.maj < 10 * 60e3) return;
    c.busy = true; c.err = ''; render();
    try {
      const r = await fetch(S.robot.url.replace(/\/+$/, '') + '/classement', { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
      const o = await r.json().catch(() => ({}));
      if (r.status === 404) throw new Error('Colle la dernière version de worker.js dans Cloudflare puis Deploy pour avoir le classement.');
      if (r.status === 401) throw new Error('Clé refusée : vérifie la SYNC_KEY.');
      if (!r.ok || !o.ok || !Array.isArray(o.joueurs)) throw new Error(o.error || ('Le robot a répondu ' + r.status));
      c.l = o.joueurs; c.maj = o.maj || Date.now();
      try { localStorage.setItem(KEY_CL, JSON.stringify({ l: c.l, maj: c.maj })); } catch (e) {}
    } catch (e) { c.err = e.message === 'Failed to fetch' ? (c.l.length ? 'Robot injoignable : dernier classement connu affiché.' : "Robot injoignable : vérifie l'adresse et ta connexion.") : e.message; }
    c.busy = false; render();
  }

  /* ---------- Historique depuis le 1er janvier ---------- */
  const DEBUT_HISTO = () => auj().slice(0, 4) + '-01-01';
  function blocHisto() {
    const h = S.histo, deb = DEBUT_HISTO(), hier = decaler(auj(), -1), tousJours = []; for (let j = deb; j <= hier; j = decaler(j, 1)) tousJours.push(j);
    const faits = tousJours.filter(j => h.done[j]).length, vides = tousJours.filter(j => h.done[j] === 2).length, reste = tousJours.length - faits, pc = tousJours.length ? Math.round(faits / tousJours.length * 100) : 0;
    const cfg = S.robot.url && S.robot.key, sansScore = S.res.filter(r => (r.w === 1 || r.w === 2) && r.tour === 'ATP' && !r.sets).length;
    const btn = (txt, on, c) => `<button type="button" onclick="${on}" style="min-height:44px;padding:0 14px;border-radius:10px;font-weight:800;font-size:13px;background:${c};color:#fff;border:0;cursor:pointer">${txt}</button>`;
    return `<div style="${card};border-left:5px solid #16a34a"><div style="font-size:13px;font-weight:800">📚 Historique depuis le 1er janvier ${deb.slice(0, 4)}</div>
      <p style="margin:6px 0 0;font-size:12px;opacity:.85">${reste <= 0 ? 'Tous les jours jusqu\'à hier sont importés.' : 'Relit les résultats ATP jour par jour (tournois principaux) pour remplir les statistiques de l\'année. Ça prend quelques minutes ; tu peux arrêter et reprendre : ce qui est fait est gardé.'}</p>
      <div style="height:6px;border-radius:999px;background:rgba(128,128,128,.25);margin-top:8px;overflow:hidden"><div style="height:100%;width:${pc}%;background:${pc === 100 ? '#16a34a' : '#2563eb'};transition:width .3s"></div></div>
      <div style="font-size:11px;opacity:.75;margin-top:4px">${faits} jour${faits > 1 ? 's' : ''} sur ${tousJours.length} traités · ${filtrer().length} matchs enregistrés${vides ? ' · ' + vides + ' jour' + (vides > 1 ? 's' : '') + ' sans match lu' : ''}${h.busy ? ' · en cours…' : ''}</div>
      ${h.err ? `<div style="font-size:12px;font-weight:700;margin-top:6px;color:#dc2626">${esc(h.err)}</div>` : ''}
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">${h.busy ? btn('Arrêter', 'tennisHistoStop()', '#6b7280') : vides ? btn('Refaire les jours sans match', 'tennisHistoVides()', '#d97706') : ''}${!h.busy && sansScore && cfg ? btn('Ajouter les scores (' + sansScore + ' matchs)', 'tennisHistoScores()', '#7c3aed') : ''}${h.busy ? '' : reste > 0 ? btn(faits ? 'Reprendre l\'import' : 'Importer depuis janvier', 'tennisHisto()', cfg ? '#16a34a' : '#6b7280') : ''}${h.busy ? '' : btn(S.majBusy ? '…' : 'Relire les 7 derniers jours', 'tennisSept()', cfg ? '#2563eb' : '#6b7280')}</div>
      ${cfg ? '' : '<div style="font-size:11px;opacity:.7;margin-top:6px">Renseigne d\'abord le robot (réglage en bas de page).</div>'}</div>`;
  }

  /* ---------- Réglage du robot ---------- */
  function reglage() {
    const cfgOk = S.robot.url && S.robot.key;
    const b = (txt, on, ml) => `<button type="button" onclick="${on}" style="min-height:44px;padding:0 14px;${ml ? 'margin-left:6px;' : ''}border-radius:10px;font-weight:700;font-size:12px;background:transparent;color:inherit;border:1px solid ${BD};cursor:pointer">${txt}</button>`;
    return `<details ${cfgOk ? '' : 'open'} style="margin-top:16px"><summary style="cursor:pointer;font-size:12px;font-weight:700;opacity:.8;min-height:44px;display:flex;align-items:center">Réglage du robot Cloudflare</summary>
      <p style="font-size:12px;opacity:.7;margin:6px 0">Adresse de ton robot (ex. https://statify-robot.ton-compte.workers.dev) et la clé SYNC_KEY.</p>
      <input id="tnUrl" placeholder="Adresse du robot" value="${esc(S.robot.url)}" autocomplete="off" style="width:100%;box-sizing:border-box;min-height:44px;padding:8px;border-radius:8px;border:1px solid ${BD};background:transparent;color:inherit;margin-bottom:6px">
      <input id="tnKey" type="password" placeholder="Clé SYNC_KEY" value="${esc(S.robot.key)}" autocomplete="off" style="width:100%;box-sizing:border-box;min-height:44px;padding:8px;border-radius:8px;border:1px solid ${BD};background:transparent;color:inherit;margin-bottom:6px">
      <button type="button" onclick="tennisSauver()" style="min-height:44px;padding:0 14px;border-radius:10px;font-weight:700;font-size:12px;background:#16a34a;color:#fff;border:0;cursor:pointer">Enregistrer et charger</button>
      ${b('Diagnostic', 'tennisDiag()', true)}${b('Diagnostic classement live', 'tennisDiagLive()', true)}
      ${S.diag ? `<p style="font-size:12px;opacity:.7;margin:8px 0 4px">Copie tout ce texte et envoie-le moi :</p><textarea readonly onclick="this.select()" style="width:100%;box-sizing:border-box;height:160px;font-size:11px;border-radius:8px;border:1px solid ${BD};background:transparent;color:inherit">${esc(S.diag)}</textarea>` : ''}</details>`;
  }

  /* ---------- Affichage général ---------- */
  // Dans Statify, Calendrier et Classement existent déjà (onglets Aujourd'hui / Classement) : on ne garde ici que Joueurs et Historique
  const INTEGRE = !document.getElementById('analyzerViewContent');
  const ONGLETS = INTEGRE ? [['jou', '👥 Joueurs'], ['his', '📚 Historique']] : [['cal', '📅 Calendrier'], ['cl', '🌍 Classement'], ['jou', '👥 Joueurs'], ['his', '📚 Historique']];
  if (INTEGRE && S.onglet === 'cal') S.onglet = 'jou';
  const barreOnglets = () => `<div role="tablist" style="display:flex;gap:6px;overflow-x:auto;margin-top:12px;padding-bottom:2px">${ONGLETS.map(([k, t]) => `<button type="button" role="tab" aria-selected="${S.onglet === k}" onclick="tennisOnglet('${k}')" style="flex:1 0 auto;min-height:46px;padding:0 14px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap;${S.onglet === k ? 'background:#1d4ed8;color:#fff;border:1px solid #3b82f6;box-shadow:0 4px 14px rgba(29,78,216,.3)' : 'background:transparent;color:inherit;border:1px solid ' + BD}">${t}</button>`).join('')}</div>`;
  function contenuOnglet() {
    const J = window.__tennisJoueurs;
    if (S.onglet === 'cl') return blocClassement();
    if (S.onglet === 'jou') return J ? J.bloc(filtrer(), BD, card) : '';
    if (S.onglet === 'his') return blocHisto();
    // Calendrier : sur grand écran, les matchs à gauche et, à droite, les faits marquants et le début du classement
    return `<div class="tnG"><div style="min-width:0">${vueCalendrier()}</div><div style="min-width:0"><div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.65;margin:14px 0 0">En ce moment</div>${J ? J.faitsHtml(filtrer(), BD) : ''}${blocClassement(true)}</div></div>`;
  }
  // Le tennis occupe presque toute la largeur de l'écran (le reste de l'appli garde sa largeur d'origine)
  function elargir(el) {
    try { const grand = window.innerWidth >= 1100; el.style.width = grand ? 'min(calc(100vw - 48px), 1700px)' : ''; el.style.position = grand ? 'relative' : ''; el.style.left = grand ? '50%' : ''; el.style.transform = grand ? 'translateX(-50%)' : ''; } catch (e) {}
  }
  function render() {
    const el = root(); if (!el) return;
    if (!INTEGRE) elargir(el);
    const data = S.days[S.jour];
    el.innerHTML = `<style>.tnG{display:grid;gap:14px}@media (min-width:1100px){.tnG{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}}</style><div class="surface" style="border:1px solid ${BD};border-radius:16px;padding:14px">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;border-radius:14px;padding:14px;color:#fff;background:linear-gradient(135deg,#14532d,#166534 55%,#a3e635 220%)">
        <div style="display:flex;align-items:center;gap:10px"><span style="font-size:30px" aria-hidden="true">🎾</span><div><h2 style="margin:0;font-size:20px;font-weight:800">Tennis</h2><p style="margin:2px 0 0;font-size:12px;opacity:.9">Matchs ATP, résultats et statistiques · ${filtrer().length} match${filtrer().length > 1 ? 's' : ''} enregistré${filtrer().length > 1 ? 's' : ''}</p></div></div>
        <button type="button" onclick="tennisCharger(true)" ${S.busy ? 'disabled' : ''} style="min-height:44px;padding:0 14px;border-radius:12px;font-weight:800;font-size:13px;background:#fff;color:#14532d;border:0;cursor:pointer">${S.busy ? '…' : 'Actualiser'}</button></div>
      ${S.err ? `<p style="margin:10px 0 0;font-size:13px;color:#dc2626;font-weight:700">${esc(S.err)}</p>` : ''}
      ${data && data.avertissements && data.avertissements.length ? `<p style="margin:8px 0 0;font-size:12px;color:#d97706">${esc(data.avertissements.join(' · '))}</p>` : ''}
      ${barreOnglets()}
      ${contenuOnglet()}
      ${S.onglet === 'his' && S.res.length ? `<button type="button" onclick="tennisExport()" style="margin-top:16px;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid ${BD};background:transparent;color:inherit;font-weight:700;font-size:12px;cursor:pointer">Exporter les matchs (CSV)</button>` : ''}
      ${reglage()}
      <p style="font-size:11px;opacity:.55;margin-top:10px">Les matchs et résultats viennent de Tennis Explorer. Les matchs terminés sont enregistrés automatiquement sur cet appareil.</p></div>`;
    try { const b = document.getElementById('tnBande'), a = b && b.querySelector('[aria-selected="true"]'); if (a) b.scrollLeft = a.offsetLeft - (b.clientWidth - a.clientWidth) / 2; } catch (e) {}   // le jour choisi reste visible dans la bande
  }

  /* ---------- Chargement des matchs ---------- */
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
      if (j.matchs && j.matchs.length && !j.perime) { ecrireMem(jour, j); if (enregistrer(jour, j)) sauver(); }
      setTimeout(() => { try { chargerClassement(false); } catch (e) {} }, 0);          // le classement se lit à part : une panne ici ne gêne jamais le calendrier
    } catch (e) {
      S.err = e.message === 'Failed to fetch' ? "Robot injoignable : vérifie l'adresse et ta connexion." : e.message;
      // le calendrier ne disparaît pas : on réaffiche le dernier connu sur cet appareil
      const m = lireMem()[jour];
      if (m && m.matchs && m.matchs.length && !(S.days[jour] && S.days[jour].matchs && S.days[jour].matchs.length)) S.days[jour] = Object.assign({ ok: true }, m, { perime: true, local: true });
    }
    S.busy = false; render();
  }

  /* ---------- Actions (appelées par les boutons) ---------- */
  window.tennisCharger = charger;
  window.tennisOnglet = k => { if (ONGLETS.some(o => o[0] === k)) { S.onglet = k; render(); try { window.scrollTo && window.scrollTo(0, 0); } catch (e) {} } };
  window.tennisOuvrir = () => charger(false);
  window.tennisRecharger = () => { try { const b = JSON.parse(localStorage.getItem(KEY_RES) || '[]'); if (Array.isArray(b)) S.res = b; } catch (e) {} render(); };
  window.tennisSemaine = n => { const max = decaler(auj(), 1), fin = S.fin && S.fin <= max ? S.fin : max; S.fin = decaler(fin, 7 * n); if (S.fin > max) S.fin = max; render(); };
  window.tennisJourDate = j => { S.jour = j; S.err = ''; render(); charger(false); };
  window.tennisDate = j => { if (!/^\d{4}-\d{2}-\d{2}$/.test(j || '')) return; const max = decaler(auj(), 1); if (j > max) j = max; S.fin = j >= decaler(auj(), -3) ? max : decaler(j, 3); if (S.fin > max) S.fin = max; window.tennisJourDate(j); };
  window.tennisJour = n => { S.jour = n === 0 ? auj() : decaler(S.jour, n); S.err = ''; render(); charger(false); };
  const dBase = () => S.robot.url.replace(/\/+$/, ''), dHead = () => ({ headers: { 'x-key': S.robot.key }, cache: 'no-store' });
  window.tennisDiag = async () => {
    S.diag = 'Chargement du diagnostic…'; render();
    try { const r = await fetch(dBase() + '/tennis?debug=1&date=' + S.jour, dHead()); S.diag = (await r.text()).slice(0, 12000); } catch (e) { S.diag = 'Erreur : ' + e.message; }
    render();
  };
  window.tennisDiagLive = async () => {
    S.diag = 'Chargement du diagnostic du classement live…'; render();
    try { const r = await fetch(dBase() + '/rdj-diag?h=live&grep=Alcaraz&first=1&w=900&p=' + encodeURIComponent('/fr/classement-atp-live'), dHead()); S.diag = (await r.text()).slice(0, 9000); } catch (e) { S.diag = 'Erreur : ' + e.message; }
    render();
  };
  window.tennisSauver = () => {
    S.robot = { url: (document.getElementById('tnUrl').value || '').trim(), key: (document.getElementById('tnKey').value || '').trim() };
    try { localStorage.setItem(KEY_ROBOT, JSON.stringify(S.robot)); } catch (e) {}
    S.days = {}; charger(true);
  };
  // Relit les 7 derniers jours (résultats manqués pendant que l'appli était fermée)
  window.tennisSept = async () => {
    if (S.majBusy || !S.robot.url || !S.robot.key) return;
    S.majBusy = true; render(); let n = 0;
    for (let i = 0; i < 7; i++) {
      const j = decaler(auj(), -i);
      try { const r = await fetch(dBase() + '/tennis?date=' + j, dHead()); const o = await r.json().catch(() => ({})); if (r.ok && o.ok) { S.days[j] = o; if (!o.perime) n += enregistrer(j, o); } } catch (e) {}
    }
    if (n) sauver(); S.majBusy = false; render();
  };
  // Redonne leur score aux matchs importés avant : on repasse seulement les jours qui contiennent un match sans score
  window.tennisHistoScores = () => {
    const jours = new Set(S.res.filter(r => (r.w === 1 || r.w === 2) && !r.sets).map(r => r.date));
    jours.forEach(j => { delete S.histo.done[j]; });
    try { localStorage.setItem(KEY_HISTO, JSON.stringify(S.histo.done)); } catch (e) {}
    window.tennisHisto();
  };
  window.tennisHistoVides = () => { Object.keys(S.histo.done).forEach(j => { if (S.histo.done[j] === 2) delete S.histo.done[j]; }); try { localStorage.setItem(KEY_HISTO, JSON.stringify(S.histo.done)); } catch (e) {} window.tennisHisto(); };
  window.tennisClassement = f => chargerClassement(f !== false);
  window.tennisClPlus = n => { S.cl.n = n; render(); };
  window.tennisClFiltre = q => { S.cl.q = String(q || ''); render(); };
  window.tennisHistoStop = () => { S.histo.stop = true; render(); };
  window.tennisHisto = async () => {
    const h = S.histo; if (h.busy || !S.robot.url || !S.robot.key) return;
    const deb = DEBUT_HISTO(), hier = decaler(auj(), -1), jours = []; for (let j = deb; j <= hier; j = decaler(j, 1)) if (!h.done[j]) jours.push(j);
    if (!jours.length) return;
    h.busy = true; h.stop = false; h.err = ''; h.ajoutes = 0; render();
    let i = 0, echecs = 0, fini = 0;
    const sauverH = () => { try { localStorage.setItem(KEY_HISTO, JSON.stringify(h.done)); } catch (e) {} sauver(); };
    const un = async () => {
      while (i < jours.length && !h.stop && echecs < 6) {
        const j = jours[i++];
        try {
          const r = await fetch(dBase() + '/tennis?date=' + j, dHead());
          if (r.status === 401 || r.status === 404) { h.err = r.status === 401 ? 'Clé du robot refusée : vérifie le réglage en bas de page.' : 'Le robot ne répond pas à cette adresse.'; h.stop = true; break; }
          const o = await r.json().catch(() => ({}));
          if (r.ok && o.ok && !o.perime) { h.ajoutes += enregistrer(j, o); h.done[j] = (o.matchs || []).length ? 1 : 2; echecs = 0; }   // 2 = aucun match lu ce jour-là (on pourra le refaire)
          else echecs++;
        } catch (e) { echecs++; }
        if (++fini % 8 === 0) { sauverH(); render(); }
        await new Promise(res => setTimeout(res, 700));
      }
    };
    try { await Promise.all([un(), un()]); } catch (e) {}
    if (echecs >= 6 && !h.err) h.err = 'Tennis Explorer ne répond pas bien en ce moment : réessaie plus tard, ce qui est fait est gardé.';
    h.busy = false; sauverH(); render();
  };
  window.tennisExport = () => {
    const l = [['Date', 'Heure', 'Tournoi', 'Joueur 1', 'Joueur 2', 'Vainqueur']];
    S.res.forEach(r => { if (r.w === 1 || r.w === 2) l.push([r.date, r.heure, r.tournoi, r.j1, r.j2, r.w === 1 ? r.j1 : r.j2]); });
    const csv = '﻿' + l.map(r => r.map(x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'tennis-matchs-' + auj() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  };
  window.__tennis = { etat: () => S, render: () => render(), enregistrer, filtrer, matchId };
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
