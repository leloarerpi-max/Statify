/* ================= PRONOS TENNIS =================
   Matchs du jour (ATP / WTA, tournois du circuit) + cotes, via le robot Cloudflare (route /tennis).
   Deux tableaux : gain net pour 1 € sur la cote la plus basse (favori) et sur la cote la plus haute (outsider).
   Gain net = cote − 1 (la mise de 1 € n'est pas comptée dans le gain). */
(function () {
  'use strict';
  const KEY = 'prono-tennis-robot';
  const S = { robot: { url: '', key: '' }, tour: 'all', tri: 'heure', data: null, busy: false, err: '' };
  try { Object.assign(S.robot, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fr = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const root = () => document.getElementById('tennisViewContent');

  // Calculs d'un match (fonction pure, testée à part)
  function calc(m) {
    if (!(m.c1 > 1) || !(m.c2 > 1)) return null;
    const bas = m.c1 <= m.c2 ? { j: m.j1, c: m.c1 } : { j: m.j2, c: m.c2 };
    const haut = m.c1 <= m.c2 ? { j: m.j2, c: m.c2 } : { j: m.j1, c: m.c1 };
    const inv1 = 1 / m.c1, inv2 = 1 / m.c2, tot = inv1 + inv2;
    bas.gain = Math.round((bas.c - 1) * 100) / 100;
    haut.gain = Math.round((haut.c - 1) * 100) / 100;
    bas.pct = (1 / bas.c) / tot * 100;      // chance de gagner selon la cote, marge du bookmaker retirée
    haut.pct = (1 / haut.c) / tot * 100;
    return { bas, haut, marge: (tot - 1) * 100 };
  }
  window.__tennisCalc = calc;

  function lignes() {
    const all = (S.data && S.data.matchs) || [];
    const ok = all.filter(m => S.tour === 'all' || m.tour === S.tour).map(m => ({ m, c: calc(m) }));
    const avec = ok.filter(x => x.c), sans = ok.filter(x => !x.c);
    return { avec, sans };
  }

  function tableau(titre, sous, cle, rows) {
    const tri = (a, b) => S.tri === 'gain' ? b.c[cle].gain - a.c[cle].gain : (a.m.heure.localeCompare(b.m.heure) || a.m.tournoi.localeCompare(b.m.tournoi));
    const r = rows.slice().sort(tri);
    const corps = r.map(x => {
      const p = x.c[cle];
      return `<tr style="border-top:1px solid rgba(128,128,128,.25)">
        <td style="padding:8px 6px;white-space:nowrap">${esc(x.m.heure)}</td>
        <td style="padding:8px 6px"><span style="opacity:.65;font-size:11px">${esc(x.m.tour)} · ${esc(x.m.tournoi)}</span><br><b>${esc(p.j)}</b> <span style="opacity:.65;font-size:11px">vs ${esc(cle === 'bas' ? x.c.haut.j : x.c.bas.j)}</span></td>
        <td style="padding:8px 6px;text-align:right;font-weight:700">${fr(p.c)}</td>
        <td style="padding:8px 6px;text-align:right;opacity:.75">${Math.round(p.pct)} %</td>
        <td style="padding:8px 6px;text-align:right;font-weight:800;color:#16a34a">+${fr(p.gain)} €</td></tr>`;
    }).join('');
    return `<div class="surface" style="border:1px solid rgba(128,128,128,.3);border-radius:16px;padding:14px;margin-top:14px;overflow-x:auto">
      <h3 style="margin:0;font-size:16px;font-weight:800">${titre}</h3>
      <p style="margin:2px 0 8px;font-size:12px;opacity:.7">${sous}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="text-align:left;font-size:11px;opacity:.7"><th style="padding:4px 6px">Heure</th><th style="padding:4px 6px">Match</th><th style="padding:4px 6px;text-align:right">Cote</th><th style="padding:4px 6px;text-align:right">Chance</th><th style="padding:4px 6px;text-align:right">Gain net / 1 €</th></tr></thead>
        <tbody>${corps || '<tr><td colspan="5" style="padding:14px;text-align:center;opacity:.7">Aucun match avec cotes.</td></tr>'}</tbody></table></div>`;
  }

  function btn(label, actif, on) {
    return `<button type="button" onclick="${on}" style="padding:7px 12px;border-radius:10px;font-weight:700;font-size:12px;border:1px solid rgba(128,128,128,.35);${actif ? 'background:#2563eb;color:#fff;border-color:#2563eb' : 'background:transparent;color:inherit'}">${label}</button>`;
  }

  function render() {
    const el = root(); if (!el) return;
    const cfgOk = S.robot.url && S.robot.key;
    const { avec, sans } = lignes();
    const maj = S.data && S.data.maj ? new Date(S.data.maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    el.innerHTML = `
      <div class="surface" style="border:1px solid rgba(128,128,128,.3);border-radius:16px;padding:14px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">
          <div><h2 style="margin:0;font-size:18px;font-weight:800">🎾 Pronos tennis du jour</h2>
            <p style="margin:2px 0 0;font-size:12px;opacity:.7">Tournois du circuit ATP / WTA · gain net pour 1 € de mise${maj ? ' · mis à jour à ' + maj : ''}</p></div>
          <button type="button" onclick="tennisCharger(true)" ${S.busy ? 'disabled' : ''} style="padding:8px 14px;border-radius:10px;font-weight:800;font-size:13px;background:#2563eb;color:#fff;border:0">${S.busy ? 'Chargement…' : '🔄 Actualiser'}</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center">
          ${btn('Tous', S.tour === 'all', "tennisSet('tour','all')")}${btn('ATP', S.tour === 'ATP', "tennisSet('tour','ATP')")}${btn('WTA', S.tour === 'WTA', "tennisSet('tour','WTA')")}
          <span style="opacity:.5;margin:0 4px">|</span><span style="font-size:12px;opacity:.7">Trier :</span>
          ${btn('Heure', S.tri === 'heure', "tennisSet('tri','heure')")}${btn('Plus gros gain', S.tri === 'gain', "tennisSet('tri','gain')")}
        </div>
        <details ${cfgOk ? '' : 'open'} style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;font-weight:700;opacity:.8">⚙️ Réglage du robot Cloudflare</summary>
          <p style="font-size:12px;opacity:.7;margin:6px 0">Adresse de ton robot (ex. https://statify-robot.ton-compte.workers.dev) et la clé SYNC_KEY.</p>
          <input id="tnUrl" placeholder="Adresse du robot" value="${esc(S.robot.url)}" autocomplete="off" style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;margin-bottom:6px">
          <input id="tnKey" type="password" placeholder="Clé SYNC_KEY" value="${esc(S.robot.key)}" autocomplete="off" style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;margin-bottom:6px">
          <button type="button" onclick="tennisSauver()" style="padding:7px 12px;border-radius:10px;font-weight:700;font-size:12px;background:#16a34a;color:#fff;border:0">Enregistrer et charger</button></details>
        ${S.err ? `<p style="margin:10px 0 0;font-size:13px;color:#dc2626;font-weight:700">⚠️ ${esc(S.err)}</p>` : ''}
        ${S.data && S.data.avertissements && S.data.avertissements.length ? `<p style="margin:8px 0 0;font-size:12px;color:#d97706">${esc(S.data.avertissements.join(' · '))}</p>` : ''}
      </div>
      ${S.data ? tableau('⬇️ Cote la plus basse (le favori)', 'Gagne souvent, rapporte peu : si tu mises 1 € et qu\'il gagne, tu gagnes ce montant net. S\'il perd, −1 €.', 'bas', avec) + tableau('⬆️ Cote la plus haute (l\'outsider)', 'Gagne plus rarement, rapporte beaucoup plus. S\'il perd, −1 €.', 'haut', avec) : (cfgOk && !S.err ? '<p style="text-align:center;opacity:.7;margin-top:20px">Chargement…</p>' : '')}
      ${S.data && sans.length ? `<p style="font-size:12px;opacity:.65;margin-top:10px">${sans.length} match(s) sans cote chez Tennis Explorer, non affichés : ${sans.slice(0, 6).map(x => esc(x.m.j1 + ' – ' + x.m.j2)).join(', ')}${sans.length > 6 ? '…' : ''}</p>` : ''}
      <p style="font-size:11px;opacity:.55;margin-top:10px">Chance = probabilité déduite des cotes, marge du bookmaker retirée. Un gros gain ne veut pas dire « rentable » : il faut que la vraie chance soit supérieure à celle que la cote suppose. Les cotes viennent de Tennis Explorer et peuvent différer de ton bookmaker.</p>`;
  }

  async function charger(force) {
    if (!S.robot.url || !S.robot.key) { S.err = ''; render(); return; }
    if (S.busy) return;
    if (!force && S.data && Date.now() - S.data.maj < 5 * 60e3) { render(); return; }
    S.busy = true; S.err = ''; render();
    try {
      const r = await fetch(S.robot.url.replace(/\/+$/, '') + '/tennis', { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error('Clé refusée : vérifie la SYNC_KEY.');
      if (!r.ok || !j.ok) throw new Error(j.error || ('Le robot a répondu ' + r.status + (r.status === 404 ? ' : colle la nouvelle version de worker.js dans Cloudflare puis Deploy.' : '')));
      S.data = j;
    } catch (e) { S.err = e.message === 'Failed to fetch' ? 'Robot injoignable : vérifie l\'adresse et ta connexion.' : e.message; }
    S.busy = false; render();
  }

  window.tennisCharger = charger;
  window.tennisSet = (k, v) => { S[k] = v; render(); };
  window.tennisSauver = () => {
    S.robot = { url: (document.getElementById('tnUrl').value || '').trim(), key: (document.getElementById('tnKey').value || '').trim() };
    try { localStorage.setItem(KEY, JSON.stringify(S.robot)); } catch (e) {}
    charger(true);
  };
  window.tennisOuvrir = () => charger(false);
})();
