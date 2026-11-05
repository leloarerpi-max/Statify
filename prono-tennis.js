/* ================= PRONOS TENNIS =================
   Onglet « Tennis » de PronoTracker : calendrier du jour (ATP / WTA, tournois du circuit) avec les deux cotes de chaque match,
   et suivi de tes paris tennis. Les paris tennis sont rangés à part : ils ne se mélangent jamais avec les paris foot.
   Matchs et cotes : route /tennis du robot Cloudflare (worker.js). Gain net = (cote − 1) × mise. */
(function () {
  'use strict';
  const KEY_ROBOT = 'prono-tennis-robot';
  const KEY_BETS = 'prono_tennis_bets_v1';
  const S = {
    robot: { url: '', key: '' }, vue: 'cal', tour: 'all', jour: '', days: {}, busy: false, err: '',
    filtre: 'all', bets: [], mise: 1
  };
  try { Object.assign(S.robot, JSON.parse(localStorage.getItem(KEY_ROBOT) || '{}')); } catch (e) {}
  try { const b = JSON.parse(localStorage.getItem(KEY_BETS) || '[]'); if (Array.isArray(b)) S.bets = b; } catch (e) {}

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fr = (n, d = 2) => Number(n).toFixed(d).replace('.', ',');
  const signe = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fr(Math.abs(n)) + ' €';
  const eid = id => encodeURIComponent(id).replace(/'/g, '%27');
  const r2 = n => Math.round(n * 100) / 100;
  const root = () => document.getElementById('tennisViewContent');
  const sauverBets = () => { try { localStorage.setItem(KEY_BETS, JSON.stringify(S.bets)); } catch (e) {} };
  const ymdLocal = d => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const auj = () => ymdLocal(new Date());
  if (!S.jour) S.jour = auj();
  const decaler = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const joliJour = ymd => {
    const t = new Date(ymd + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
    return ymd === auj() ? "Aujourd'hui · " + t : ymd === decaler(auj(), 1) ? 'Demain · ' + t : ymd === decaler(auj(), -1) ? 'Hier · ' + t : t;
  };

  // ---- Calculs (fonctions pures) ----
  function calc(m) {
    if (!(m.c1 > 1) || !(m.c2 > 1)) return null;
    const bas = m.c1 <= m.c2 ? { j: m.j1, c: m.c1 } : { j: m.j2, c: m.c2 };
    const haut = m.c1 <= m.c2 ? { j: m.j2, c: m.c2 } : { j: m.j1, c: m.c1 };
    const tot = 1 / m.c1 + 1 / m.c2;
    bas.gain = r2(bas.c - 1); haut.gain = r2(haut.c - 1);
    bas.pct = (1 / bas.c) / tot * 100; haut.pct = (1 / haut.c) / tot * 100;
    return { bas, haut };
  }
  const matchId = (jour, m) => jour + '|' + m.j1 + '|' + m.j2;
  const gainPari = b => b.status === 'Won' ? r2((b.odds - 1) * b.stake) : b.status === 'Lost' ? -b.stake : 0;
  function bilan(bets) {
    const reg = bets.filter(b => b.status !== 'Pending');
    const sous = k => { const l = reg.filter(b => b.kind === k); return { n: l.length, g: l.filter(b => b.status === 'Won').length, p: r2(l.reduce((a, b) => a + gainPari(b), 0)) }; };
    const gagnes = reg.filter(b => b.status === 'Won').length;
    return { n: reg.length, gagnes, profit: r2(reg.reduce((a, b) => a + gainPari(b), 0)), mise: r2(reg.reduce((a, b) => a + b.stake, 0)), bas: sous('bas'), haut: sous('haut'), attente: bets.length - reg.length };
  }
  window.__tennisCalc = calc; window.__tennisBilan = bilan;

  // ---- Styles ----
  const BD = 'rgba(128,128,128,.32)';
  const card = 'border:1px solid ' + BD + ';border-radius:14px;padding:12px;margin-top:10px';
  const BLEU = '#60a5fa', AMBRE = '#fbbf24', VERT = '#16a34a', ROUGE = '#dc2626';
  const bt = (label, actif, on, extra) => `<button type="button" onclick="${on}" style="min-height:44px;padding:0 16px;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;${actif ? 'background:#1d4ed8;color:#fff;border:1px solid #3b82f6' : 'background:transparent;color:inherit;border:1px solid ' + BD};${extra || ''}">${label}</button>`;

  function bouton(m, kind, p, pari, jour) {
    const col = kind === 'bas' ? BLEU : AMBRE, lab = kind === 'bas' ? 'Cote basse' : 'Cote haute';
    const pris = pari && pari.prono === p.j;
    const st = pris ? `background:${col};color:#0a192c;border:2px solid ${col}` : `background:transparent;color:inherit;border:2px solid ${BD}`;
    return `<button type="button" onclick="tennisParier('${eid(matchId(jour, m))}','${kind}')" aria-pressed="${pris}" style="flex:1;min-height:76px;border-radius:12px;padding:8px 6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;${st}">
      <span style="font-size:11px;font-weight:700;opacity:.8">${lab}</span>
      <span style="font-size:13px;font-weight:700">${esc(p.j)}</span>
      <span style="font-size:18px;font-weight:800">${fr(p.c)}</span>
      <span style="font-size:12px;font-weight:800;color:${pris ? '#0a192c' : '#16a34a'}">+${fr(p.gain)} € net</span></button>`;
  }

  function carte(m, jour) {
    const c = calc(m), id = matchId(jour, m), pari = S.bets.find(b => b.id === id);
    if (!c) return `<div style="${card};border-style:dashed;display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:15px;font-weight:800">${esc(m.j1)} <span style="opacity:.6;font-weight:600">vs</span> ${esc(m.j2)}</span><span style="font-size:12px;opacity:.7;text-align:right">${esc(m.heure)} · cotes pas encore dispo</span></div>`;
    const etat = pari ? `<div style="margin-top:8px;font-size:12px;font-weight:700;color:#16a34a">Pari ajouté : ${esc(pari.prono)} · ${fr(pari.stake, pari.stake % 1 ? 2 : 0)} € · ${pari.status === 'Pending' ? 'en attente du résultat' : pari.status === 'Won' ? 'gagné' : 'perdu'}</div>` : '';
    return `<div style="${card}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span style="font-size:15px;font-weight:800">${esc(m.j1)} <span style="opacity:.6;font-weight:600">vs</span> ${esc(m.j2)}</span><span style="font-size:13px;font-weight:700;opacity:.7">${esc(m.heure)}</span></div>
      <div style="display:flex;gap:8px;margin-top:10px">${bouton(m, 'bas', c.bas, pari, jour)}${bouton(m, 'haut', c.haut, pari, jour)}</div>${etat}</div>`;
  }

  function vueCalendrier() {
    const data = S.days[S.jour];
    const cfgOk = S.robot.url && S.robot.key;
    let corps = '';
    if (data) {
      const ms = data.matchs.filter(m => S.tour === 'all' || m.tour === S.tour);
      if (!ms.length) corps = `<p style="text-align:center;opacity:.7;margin-top:24px">Aucun match de tournoi du circuit ce jour-là.</p>`;
      const groupes = []; const idx = {};
      ms.forEach(m => { const k = m.tour + '|' + m.tournoi; if (!(k in idx)) { idx[k] = groupes.length; groupes.push({ tour: m.tour, tournoi: m.tournoi, l: [] }); } groupes[idx[k]].l.push(m); });
      corps += groupes.map(g => `<div style="display:flex;align-items:center;gap:8px;margin-top:18px"><span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;background:rgba(128,128,128,.28)">${esc(g.tour)}</span><span style="font-size:14px;font-weight:800">${esc(g.tournoi)}</span></div>${g.l.map(m => carte(m, S.jour)).join('')}`).join('');
      const duJour = S.bets.filter(b => b.date === S.jour);
      const poss = r2(duJour.filter(b => b.status === 'Pending').reduce((a, b) => a + (b.odds - 1) * b.stake, 0));
      if (duJour.length) corps += `<div style="margin-top:18px;border:1px solid #2563eb;border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:13px;font-weight:700">${duJour.length} pari${duJour.length > 1 ? 's' : ''} ce jour-là</span>${poss > 0 ? `<span style="font-size:13px;font-weight:800;color:#16a34a">Gain possible : +${fr(poss)} €</span>` : ''}</div>`;
    } else if (cfgOk && !S.err) corps = '<p style="text-align:center;opacity:.7;margin-top:24px">Chargement…</p>';
    return `<p style="margin:2px 0 0;font-size:12px;opacity:.7">Tournois du circuit ATP / WTA · gain net pour 1 € de mise${data && data.maj ? ' · mis à jour à ' + new Date(data.maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;border:1px solid ${BD};border-radius:12px;padding:4px">
        <button type="button" aria-label="Jour précédent" onclick="tennisJour(-1)" style="width:44px;height:44px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer">&lsaquo;</button>
        <button type="button" onclick="tennisJour(0)" style="min-height:44px;border:0;background:transparent;color:inherit;font-size:14px;font-weight:800;cursor:pointer">${esc(joliJour(S.jour))}</button>
        <button type="button" aria-label="Jour suivant" onclick="tennisJour(1)" style="width:44px;height:44px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer">&rsaquo;</button></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center">
        ${bt('Tous', S.tour === 'all', "tennisSet('tour','all')")}${bt('ATP', S.tour === 'ATP', "tennisSet('tour','ATP')")}${bt('WTA', S.tour === 'WTA', "tennisSet('tour','WTA')")}
        <label style="margin-left:auto;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px">Mise
          <input id="tnMise" type="number" min="0.5" step="0.5" value="${S.mise}" onchange="tennisMise(this.value)" style="width:64px;min-height:44px;box-sizing:border-box;padding:6px;border-radius:10px;border:1px solid ${BD};background:transparent;color:inherit;font-weight:800;text-align:center"> €</label></div>
      ${corps}`;
  }

  function ligneBet(b) {
    const col = b.kind === 'bas' ? BLEU : AMBRE, lab = b.kind === 'bas' ? 'Favori' : 'Outsider';
    const badge = b.status === 'Won' ? 'background:#14532d;color:#86efac' : b.status === 'Lost' ? 'background:#7f1d1d;color:#fecaca' : 'background:rgba(128,128,128,.3);color:inherit';
    const bl = b.status === 'Won' ? 'Gagné' : b.status === 'Lost' ? 'Perdu' : 'En attente';
    const g = gainPari(b), gc = g > 0 ? '#16a34a' : g < 0 ? '#dc2626' : 'inherit';
    const actions = b.status === 'Pending'
      ? `<div style="display:flex;gap:8px;margin-top:10px"><button type="button" onclick="tennisRegler('${eid(b.id)}','Won')" style="flex:1;min-height:44px;border-radius:10px;border:2px solid ${VERT};background:transparent;color:${VERT};font-weight:800;font-size:13px;cursor:pointer">Gagné</button><button type="button" onclick="tennisRegler('${eid(b.id)}','Lost')" style="flex:1;min-height:44px;border-radius:10px;border:2px solid ${ROUGE};background:transparent;color:${ROUGE};font-weight:800;font-size:13px;cursor:pointer">Perdu</button></div>`
      : `<div style="margin-top:6px"><button type="button" onclick="tennisRegler('${eid(b.id)}','Pending')" style="min-height:44px;padding:0 4px;border:0;background:transparent;color:inherit;opacity:.7;text-decoration:underline;font-size:12px;cursor:pointer">Remettre en attente</button></div>`;
    return `<div style="${card};margin-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:13px;font-weight:700;opacity:.7">${esc(b.tournoi)} · ${esc(b.match)} · ${esc(b.date.slice(8, 10) + '/' + b.date.slice(5, 7))}</span>
        <span style="display:flex;align-items:center;gap:6px"><span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;${badge}">${bl}</span>
        <button type="button" aria-label="Supprimer ce pari" onclick="tennisSupprimer('${eid(b.id)}')" style="width:44px;height:44px;border:0;background:transparent;color:inherit;opacity:.6;font-size:16px;cursor:pointer">✕</button></span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px"><span style="font-size:15px;font-weight:800">${esc(b.prono)} <span style="font-size:11px;font-weight:800;color:#0a192c;background:${col};border-radius:6px;padding:2px 6px;margin-left:4px">${lab}</span></span><span style="font-size:15px;font-weight:800">${fr(b.odds)}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><span style="font-size:12px;opacity:.7">Mise ${fr(b.stake, b.stake % 1 ? 2 : 0)} €</span><span style="font-size:14px;font-weight:800;color:${gc}">${b.status === 'Pending' ? 'à régler' : signe(g)}</span></div>${actions}</div>`;
  }

  function vueSuivi() {
    const B = bilan(S.bets);
    const stat = (t, s, v, c) => `<div style="flex:1;${card};margin-top:0"><div style="font-size:11px;font-weight:700;opacity:.7">${t}</div><div style="font-size:20px;font-weight:800;color:${c || 'inherit'};margin-top:2px">${v}</div><div style="font-size:11px;opacity:.7;margin-top:2px">${s}</div></div>`;
    const col = n => n > 0 ? '#16a34a' : n < 0 ? '#dc2626' : 'inherit';
    let liste = S.bets.slice().sort((a, b) => (b.date + b.heure).localeCompare(a.date + a.heure));
    if (S.filtre === 'wait') liste = liste.filter(b => b.status === 'Pending'); else if (S.filtre === 'done') liste = liste.filter(b => b.status !== 'Pending');
    const attente = liste.filter(b => b.status === 'Pending'), regles = liste.filter(b => b.status !== 'Pending');
    return `<p style="margin:2px 0 0;font-size:12px;opacity:.7">Bilan sur les paris réglés · tes paris tennis restent séparés du foot</p>
      <div style="display:flex;gap:8px;margin-top:14px">${stat('Bénéfice total', B.n + ' pari' + (B.n > 1 ? 's' : '') + ' réglé' + (B.n > 1 ? 's' : ''), signe(B.profit), col(B.profit))}${stat('Taux de réussite', B.gagnes + ' gagné' + (B.gagnes > 1 ? 's' : '') + ' sur ' + B.n, B.n ? Math.round(B.gagnes / B.n * 100) + ' %' : '—')}</div>
      <div style="display:flex;gap:8px;margin-top:8px">${stat('Cote basse (favoris)', B.bas.n + ' pari' + (B.bas.n > 1 ? 's' : '') + ' · ' + B.bas.g + ' gagné' + (B.bas.g > 1 ? 's' : ''), signe(B.bas.p), col(B.bas.p))}${stat('Cote haute (outsiders)', B.haut.n + ' pari' + (B.haut.n > 1 ? 's' : '') + ' · ' + B.haut.g + ' gagné' + (B.haut.g > 1 ? 's' : ''), signe(B.haut.p), col(B.haut.p))}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">${bt('Tous', S.filtre === 'all', "tennisSet('filtre','all')")}${bt('En attente' + (B.attente ? ' (' + B.attente + ')' : ''), S.filtre === 'wait', "tennisSet('filtre','wait')")}${bt('Réglés', S.filtre === 'done', "tennisSet('filtre','done')")}</div>
      <div style="margin-top:6px">${liste.length ? attente.map(ligneBet).join('') + regles.map(ligneBet).join('') : `<p style="text-align:center;opacity:.7;margin-top:24px">Aucun pari pour l'instant. Va dans le calendrier et touche une cote.</p>`}</div>
      ${S.bets.length ? `<button type="button" onclick="tennisExport()" style="margin-top:16px;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid ${BD};background:transparent;color:inherit;font-weight:700;font-size:12px;cursor:pointer">Exporter mes paris tennis (CSV)</button>` : ''}`;
  }

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
    const data = S.days[S.jour];
    el.innerHTML = `<div class="surface" style="border:1px solid ${BD};border-radius:16px;padding:14px">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">
        <h2 style="margin:0;font-size:20px;font-weight:800">Tennis</h2>
        <div style="display:flex;gap:6px">${bt('Calendrier', S.vue === 'cal', "tennisSet('vue','cal')")}${bt('Mes paris' + (S.bets.length ? ' (' + S.bets.length + ')' : ''), S.vue === 'bets', "tennisSet('vue','bets')")}
        ${S.vue === 'cal' ? `<button type="button" onclick="tennisCharger(true)" ${S.busy ? 'disabled' : ''} aria-label="Actualiser" style="min-height:44px;padding:0 14px;border-radius:12px;font-weight:800;font-size:13px;background:#2563eb;color:#fff;border:0;cursor:pointer">${S.busy ? '…' : 'Actualiser'}</button>` : ''}</div></div>
      ${S.err ? `<p style="margin:10px 0 0;font-size:13px;color:#dc2626;font-weight:700">${esc(S.err)}</p>` : ''}
      ${data && data.avertissements && data.avertissements.length ? `<p style="margin:8px 0 0;font-size:12px;color:#d97706">${esc(data.avertissements.join(' · '))}</p>` : ''}
      ${S.vue === 'cal' ? vueCalendrier() : vueSuivi()}
      ${reglage()}
      <p style="font-size:11px;opacity:.55;margin-top:10px">Les cotes viennent de Tennis Explorer et peuvent différer de celles de ton bookmaker : vérifie la cote réelle avant de parier.</p></div>`;
  }

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

  // ---- Actions (appelées par les boutons) ----
  window.tennisCharger = charger;
  window.tennisOuvrir = () => charger(false);
  window.tennisSet = (k, v) => { S[k] = v; render(); };
  window.tennisJour = n => { S.jour = n === 0 ? auj() : decaler(S.jour, n); S.err = ''; render(); charger(false); };
  window.tennisMise = v => { const x = parseFloat(String(v).replace(',', '.')); S.mise = x > 0 ? x : 1; render(); };
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
  window.tennisParier = (id, kind) => {
    id = decodeURIComponent(id);
    const data = S.days[id.slice(0, 10)]; if (!data) return;
    const m = data.matchs.find(x => matchId(id.slice(0, 10), x) === id), c = m && calc(m); if (!c) return;
    const p = c[kind], i = S.bets.findIndex(b => b.id === id);
    if (i >= 0) {
      const b = S.bets[i];
      if (b.status !== 'Pending') return;                 // pari déjà réglé : on ne le touche pas
      if (b.prono === p.j) { S.bets.splice(i, 1); sauverBets(); render(); return; }   // 2e clic sur le même bouton : retire le pari
      S.bets.splice(i, 1);                                // l'autre joueur : remplace
    }
    S.bets.unshift({ id, date: id.slice(0, 10), heure: m.heure, tour: m.tour, tournoi: m.tournoi, match: m.j1 + ' vs ' + m.j2, prono: p.j, kind, odds: p.c, stake: S.mise, status: 'Pending' });
    sauverBets(); render();
  };
  window.tennisRegler = (id, st) => { id = decodeURIComponent(id); const b = S.bets.find(x => x.id === id); if (b) { b.status = st; sauverBets(); render(); } };
  window.tennisSupprimer = id => { id = decodeURIComponent(id); if (!confirm('Supprimer ce pari ?')) return; S.bets = S.bets.filter(b => b.id !== id); sauverBets(); render(); };
  window.tennisExport = () => {
    const l = [['Date', 'Heure', 'Circuit', 'Tournoi', 'Match', 'Prono', 'Type', 'Cote', 'Mise', 'Statut', 'Gain net']];
    S.bets.forEach(b => l.push([b.date, b.heure, b.tour, b.tournoi, b.match, b.prono, b.kind === 'bas' ? 'Cote basse' : 'Cote haute', fr(b.odds), fr(b.stake), b.status === 'Won' ? 'Gagné' : b.status === 'Lost' ? 'Perdu' : 'En attente', fr(gainPari(b))]));
    const csv = '﻿' + l.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'paris-tennis-' + auj() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  };
})();
