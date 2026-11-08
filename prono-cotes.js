/* PronoTracker : onglet « Tennis » = la même interface que « Foot » (historique, combinés, stats…) avec les matchs du jour
   et leurs cotes (Tennis Explorer, lus par ton robot Cloudflare). Un clic sur un joueur ajoute le pari ; deux matchs à cotes
   basses → un combiné. Les résultats sont lus par le robot et règlent les paris tout seuls.
   Utilise la même adresse de robot que l'ancien onglet Tennis (clé « prono-tennis-robot »). */
(function () {
  'use strict';
  const KEY_ROBOT = 'prono-tennis-robot', KEY_SEUIL = 'prono-cotes-seuil', KEY_MISE = 'prono-cotes-mise', KEY_AUTO = 'prono-cotes-auto';
  const S = { robot: { url: '', key: '' }, off: 0, days: {}, busy: false, err: '', copies: [], regBusy: false };
  try { Object.assign(S.robot, JSON.parse(localStorage.getItem(KEY_ROBOT) || '{}')); } catch (e) {}
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = n => (Math.round(+n * 100) / 100).toFixed(2).replace('.', ',');
  const num = (k, d) => { try { const v = parseFloat(localStorage.getItem(k)); return v > 0 ? v : d; } catch (e) { return d; } };
  const isoOf = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const BD = 'border:1px solid var(--line,#e2e8f0)';
  const inTennis = () => { try { return currentSport === 'tennis'; } catch (e) { return false; } };
  const mkKey = (d, m) => d + '|' + norm(m.j1) + '|' + norm(m.j2);
  const betOf = k => (state.tennis || []).find(b => b.tn && b.tn.k === k);

  /* ---------- lecture du robot ---------- */
  async function lireJour(iso) {
    const r = await fetch(S.robot.url.replace(/\/+$/, '') + '/tennis?date=' + iso, { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Clé refusée : vérifie la SYNC_KEY.');
    if (!r.ok || !j.ok) throw new Error(j.error || ('Le robot a répondu ' + r.status));
    j._t = Date.now(); return j;
  }
  async function charger(force) {
    if (!S.robot.url || !S.robot.key || S.busy) { majPanneau(); return; }
    const iso = isoOf(S.off), d = S.days[iso];
    if (!force && d && Date.now() - d._t < 5 * 60e3) { majPanneau(); return; }
    S.busy = true; S.err = ''; majPanneau();
    try { S.days[iso] = await lireJour(iso); if (inTennis() && autoOn()) genCombos(iso, false); }
    catch (e) { S.err = e.message === 'Failed to fetch' ? "Robot injoignable : vérifie l'adresse et ta connexion." : e.message; }
    S.busy = false; majPanneau();
  }

  /* ---------- ajout d'un pari / d'un combiné ---------- */
  function nouveauPari(iso, m, n, mise) {
    const k = mkKey(iso, m), c = n === 1 ? +m.c1 : +m.c2, who = n === 1 ? m.j1 : m.j2;
    return { id: Date.now() + Math.floor(Math.random() * 1000), date: iso, type: 'Single', match: m.j1 + ' vs ' + m.j2, comp: m.tournoi || 'Tennis', market: 'Vainqueur du match', prono: 'Victoire ' + who, odds: c, stake: mise, status: 'Pending', tn: { k, j1: m.j1, j2: m.j2, p: n, h: m.heure || '' } };
  }
  window.cotesPari = (iso, i, n) => {
    const m = ((S.days[iso] || {}).matchs || [])[i]; if (!m) return;
    const k = mkKey(iso, m), ex = betOf(k);
    if (ex) { if (!confirm('Tu as déjà un pari sur ce match (' + ex.prono + '). En ajouter un autre ?')) return; }
    state.tennis.unshift(nouveauPari(iso, m, n, num(KEY_MISE, 1))); saveState();
  };
  // Combinés automatiques : parmi les favoris à cote basse (≤ seuil) du jour, on forme des paires en associant les meilleures cotes
  // entre elles (1re avec 2e, 3e avec 4e…). Un match / un joueur ne sert qu'une seule fois, et jamais s'il est déjà dans un combiné ou a déjà un pari.
  const autoOn = () => { try { return localStorage.getItem(KEY_AUTO) !== '0'; } catch (e) { return true; } };
  function genCombos(iso, manuel) {
    const D = S.days[iso]; if (!D || iso < isoOf(0)) return 0;
    const seuil = num(KEY_SEUIL, 1.5), mise = num(KEY_MISE, 1), flag = 'prono-cotes-auto-' + iso;
    if (!manuel) { try { if (localStorage.getItem(flag)) return 0; } catch (e) {} }
    const dejaCombine = new Set(), dejaPari = new Set();
    const legIds = new Set(); (state.combos.tennis || []).forEach(c => (c.legIds || []).forEach(id => legIds.add(id)));
    (state.tennis || []).forEach(b => { if (b.date !== iso || !b.tn) return; dejaPari.add(norm(b.tn.j1) + '|' + norm(b.tn.j2)); if (b.comboId || legIds.has(b.id)) { dejaCombine.add(norm(b.tn.j1)); dejaCombine.add(norm(b.tn.j2)); } });
    const cand = (D.matchs || []).filter(m => m.w !== 1 && m.w !== 2 && +m.c1 > 1 && +m.c2 > 1)
      .map(m => { const n = +m.c1 <= +m.c2 ? 1 : 2; return { m, n, c: n === 1 ? +m.c1 : +m.c2 }; })
      .filter(x => x.c <= seuil && !dejaPari.has(norm(x.m.j1) + '|' + norm(x.m.j2)) && !dejaCombine.has(norm(x.m.j1)) && !dejaCombine.has(norm(x.m.j2)))
      .sort((a, b) => b.c - a.c);
    let n = 0;
    for (let i = 0; i + 1 < cand.length; i += 2) {
      const ids = [];
      [cand[i], cand[i + 1]].forEach(x => { const bet = nouveauPari(iso, x.m, x.n, mise); state.tennis.unshift(bet); ids.push(bet.id); });
      const combo = { id: Date.now() + Math.floor(Math.random() * 100000), stake: mise, legIds: ids, createdAt: new Date().toISOString(), auto: true };
      ids.forEach(id => { const bet = state.tennis.find(x => x.id === id); if (bet) bet.comboId = combo.id; });
      state.combos.tennis.push(combo); n++;
    }
    if (cand.length >= 2) { try { localStorage.setItem(flag, '1'); } catch (e) {} }
    if (n) saveState();
    if (manuel) alert(n ? n + ' combiné(s) créé(s).' : 'Aucun combiné possible : il faut au moins 2 matchs avec un favori ≤ ' + f2(seuil) + ' pas encore utilisés.');
    return n;
  }
  window.cotesGenerer = () => genCombos(isoOf(S.off), true);
  window.cotesAuto = on => { try { localStorage.setItem(KEY_AUTO, on ? '1' : '0'); } catch (e) {} if (on) genCombos(isoOf(S.off), false); majPanneau(); };

  /* ---------- règlement automatique d'après les résultats du robot ---------- */
  async function regler(manuel) {
    if (S.regBusy || !S.robot.url || !S.robot.key) return 0;
    const att = (state.tennis || []).filter(b => b.status === 'Pending' && b.tn && b.date <= isoOf(0));
    if (!att.length) return 0;
    S.regBusy = true; let n = 0;
    try {
      const dates = [...new Set(att.map(b => b.date))];
      for (const d of dates) {
        let J; try { J = await lireJour(d); } catch (e) { continue; }
        att.filter(b => b.date === d).forEach(b => {
          const m = (J.matchs || []).find(x => mkKey(d, x) === b.tn.k) || (J.matchs || []).find(x => norm(x.j1) === norm(b.tn.j1) && norm(x.j2) === norm(b.tn.j2));
          if (m && (m.w === 1 || m.w === 2)) { b.status = m.w === b.tn.p ? 'Won' : 'Lost'; n++; }
        });
      }
    } finally { S.regBusy = false; }
    if (n) saveState();
    if (manuel) alert(n ? n + ' pari(s) réglé(s) d’après les résultats.' : 'Aucun nouveau résultat lisible pour tes paris en cours (abandon, match pas fini ou score non lu : règle-le à la main).');
    return n;
  }
  window.cotesRegler = () => regler(true);

  /* ---------- panneau (au-dessus de l'historique, seulement dans l'onglet Tennis) ---------- */
  function vue() {
    const seuil = num(KEY_SEUIL, 1.5), mise = num(KEY_MISE, 1), iso = isoOf(S.off);
    const chip = (o, t) => `<button type="button" onclick="cotesJour(${o})" style="${BD};border-radius:999px;padding:3px 12px;font-weight:700;font-size:12px;${S.off === o ? 'background:#1d4ed8;color:#fff;border-color:#1d4ed8' : ''}">${t}</button>`;
    const ctl = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:8px 0;font-size:12px">${chip(0, "Aujourd'hui")}${chip(1, 'Demain')}<label title="Chaque jour, le tennis forme tout seul des combinés de 2 matchs avec les favoris à cote basse"><input type="checkbox" ${autoOn() ? 'checked' : ''} onchange="cotesAuto(this.checked)"> Combinés auto</label><label>Favori ≤ <input type="number" step="0.05" min="1" value="${seuil}" onchange="cotesReg('${KEY_SEUIL}',this.value)" style="width:64px;${BD};border-radius:8px;padding:2px 6px"></label><label>Mise <input type="number" step="0.5" min="0.5" value="${mise}" onchange="cotesReg('${KEY_MISE}',this.value)" style="width:64px;${BD};border-radius:8px;padding:2px 6px"> €</label><button type="button" onclick="cotesGenerer()" style="${BD};border-radius:8px;padding:2px 10px;font-weight:700">⚡ Générer</button><button type="button" onclick="cotesCharger(true)" style="${BD};border-radius:8px;padding:2px 10px;font-weight:700">↻ Cotes</button><button type="button" onclick="cotesRegler()" style="${BD};border-radius:8px;padding:2px 10px;font-weight:700" title="Lit les résultats et règle tes paris en cours">✓ Régler d’après les résultats</button></div>`;
    if (!S.robot.url || !S.robot.key) return `<p style="font-size:12px;margin:6px 0">Renseigne ton robot Cloudflare pour lire les matchs et les cotes :</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="cotesUrl" placeholder="https://statify-robot.xxx.workers.dev" value="${esc(S.robot.url)}" style="flex:1;min-width:220px;${BD};border-radius:8px;padding:5px 8px"><input id="cotesKey" type="password" placeholder="SYNC_KEY" value="${esc(S.robot.key)}" style="width:160px;${BD};border-radius:8px;padding:5px 8px"><button type="button" onclick="cotesSaveRobot()" style="${BD};border-radius:8px;padding:5px 12px;font-weight:700">Enregistrer</button></div>`;
    const D = S.days[iso];
    if (S.busy && !D) return ctl + '<p style="font-size:12px;opacity:.7">Chargement des matchs…</p>';
    if (S.err && !D) return ctl + `<p style="font-size:12px;color:#dc2626;margin:6px 0">⚠️ ${esc(S.err)}</p>`;
    if (!D) return ctl + '<p style="font-size:12px;opacity:.7">Touche « ↻ Cotes » pour lire les matchs.</p>';
    const ms = (D.matchs || []).map((m, i) => ({ m, i })).filter(x => x.m.w !== 1 && x.m.w !== 2);
    if (!ms.length) return ctl + '<p style="font-size:12px;opacity:.7;margin:6px 0">Aucun match à venir pour ce jour (ou tous sont terminés).</p>';
    const parT = {}; ms.forEach(x => { (parT[x.m.tournoi || 'Tennis'] = parT[x.m.tournoi || 'Tennis'] || []).push(x); });
    const btn = (x, n) => { const m = x.m, c = n === 1 ? m.c1 : m.c2, who = n === 1 ? m.j1 : m.j2, ex = betOf(mkKey(iso, m)), pris = ex && ex.tn.p === n; return `<button type="button" onclick="cotesPari('${iso}',${x.i},${n})" ${c > 1 ? '' : 'disabled'} title="Ajouter « Victoire ${esc(who)} »" style="${BD};border-radius:10px;padding:4px 10px;font-size:12.5px;text-align:left;${pris ? 'background:#16a34a;color:#fff;border-color:#16a34a;' : ''}${c > 1 ? '' : 'opacity:.4;'}"><b>${esc(who)}</b> ${c > 1 ? '<span style="font-weight:800">' + f2(c) + '</span>' : '<span style="opacity:.6">–</span>'}${pris ? ' ✓' : ''}</button>`; };
    const liste = Object.keys(parT).map(t => `<div style="font-size:11px;font-weight:800;opacity:.65;margin:10px 0 3px;text-transform:uppercase">${esc(t)}</div>` + parT[t].map(x => `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;flex-wrap:wrap"><span style="width:42px;font-size:11px;opacity:.7">${esc(x.m.heure || '')}</span>${btn(x, 1)}<span style="opacity:.5;font-size:11px">vs</span>${btn(x, 2)}</div>`).join('')).join('');
    return ctl + liste + `<div style="font-size:11px;opacity:.65;margin-top:10px">Combinés auto : les favoris à cote basse sont associés deux par deux (les meilleures cotes ensemble), un joueur n’est jamais dans deux combinés. · Matchs et cotes : Tennis Explorer (ATP / WTA, sans qualifications) via ton robot${D.perime ? ' · ⚠️ données mémorisées' : ''}</div>`;
  }
  function monter() {
    let el = document.getElementById('tnPicker'); if (el) return el;
    const ancre = document.getElementById('resumeJour'); if (!ancre) return null;
    el = document.createElement('div'); el.id = 'tnPicker';
    el.style.cssText = 'margin:10px 0;padding:12px 14px;border-radius:14px;background:var(--card,#fff);' + BD;
    el.innerHTML = '<div style="font-weight:800;font-size:14px">🎾 Matchs du jour & cotes · un clic sur un joueur ajoute le pari</div><div class="tn-body"></div>';
    ancre.parentNode.insertBefore(el, ancre.nextSibling); return el;
  }
  function majPanneau() {
    const el = monter(); if (!el) return;
    el.style.display = inTennis() ? '' : 'none';
    if (inTennis()) { const b = el.querySelector('.tn-body'); if (b) b.innerHTML = vue(); }
  }
  window.cotesCharger = charger;
  window.cotesJour = o => { S.off = o; charger(false); };
  window.cotesReg = (k, v) => { const x = parseFloat(v); if (x > 0) { try { localStorage.setItem(k, String(x)); } catch (e) {} } majPanneau(); };
  window.cotesSaveRobot = () => { const u = (document.getElementById('cotesUrl') || {}).value || '', k = (document.getElementById('cotesKey') || {}).value || ''; S.robot = { url: u.trim(), key: k.trim() }; try { localStorage.setItem(KEY_ROBOT, JSON.stringify(S.robot)); } catch (e) {} charger(true); };

  /* ---------- onglets Foot / Tennis / Analyseur ---------- */
  const ACTIF = 'px-4 py-2 rounded-xl transition bg-blue-600 text-white shadow-sm font-bold text-sm flex items-center gap-2';
  const INACTIF = 'px-4 py-2 rounded-xl transition text-slate-600 hover:text-slate-900 font-bold text-sm flex items-center gap-2';
  const sv0 = window.switchView;
  window.switchView = function (view) {
    const bt = document.getElementById('btnViewTennis');
    if (view === 'tennis') {
      if (sv0) sv0('tracker');
      if (currentSport !== 'tennis') switchSport('tennis');
      const t = document.getElementById('btnViewTracker'); if (t) t.className = INACTIF; if (bt) bt.className = ACTIF;
      majPanneau(); charger(false); regler(false); return;
    }
    if (bt) bt.className = INACTIF;
    if (currentSport !== 'football') { try { switchSport('football'); } catch (e) {} }
    const r = sv0 ? sv0.apply(this, arguments) : undefined; majPanneau(); return r;
  };
  // l'affichage suit chaque redessin de la page
  try { const r1 = render; render = function () { const x = r1.apply(this, arguments); try { majPanneau(); } catch (e) {} return x; }; } catch (e) {}
  // règlement automatique toutes les 5 minutes tant que l'onglet Tennis est ouvert
  setInterval(() => { if (inTennis() && !document.hidden) regler(false); }, 5 * 60e3);
  const css = document.createElement('style'); css.textContent = 'body[data-sport="tennis"] .foot-only,body[data-sport="tennis"] .qs-opts{display:none!important}'; document.head.appendChild(css);
  window.addEventListener('load', () => { monter(); majPanneau(); });
})();
