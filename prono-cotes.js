/* PronoTracker : cotes tennis du jour (Tennis Explorer, lues par ton robot Cloudflare) + combinés de 2 matchs à cotes basses.
   Utilise la même adresse de robot que l'ancien onglet Tennis (clé « prono-tennis-robot »). Aucun pari n'est créé : on copie le texte à coller. */
(function () {
  'use strict';
  const KEY_ROBOT = 'prono-tennis-robot', KEY_SEUIL = 'prono-cotes-seuil', KEY_MISE = 'prono-cotes-mise', KEY_OPEN = 'prono-cotes-open';
  const S = { robot: { url: '', key: '' }, day: null, busy: false, err: '', copies: [] };
  try { Object.assign(S.robot, JSON.parse(localStorage.getItem(KEY_ROBOT) || '{}')); } catch (e) {}
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = n => (Math.round(+n * 100) / 100).toFixed(2).replace('.', ',');
  const num = (k, d) => { try { const v = parseFloat(localStorage.getItem(k)); return v > 0 ? v : d; } catch (e) { return d; } };
  const iso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const BD = 'border:1px solid var(--line,#e2e8f0)';

  function vue() {
    const seuil = num(KEY_SEUIL, 1.5), mise = num(KEY_MISE, 1);
    const ctl = `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:8px 0;font-size:12px"><label>Cote du favori ≤ <input type="number" step="0.05" min="1" value="${seuil}" onchange="cotesReg('${KEY_SEUIL}',this.value)" style="width:70px;${BD};border-radius:8px;padding:3px 6px"></label><label>Mise <input type="number" step="0.5" min="0.5" value="${mise}" onchange="cotesReg('${KEY_MISE}',this.value)" style="width:70px;${BD};border-radius:8px;padding:3px 6px"> €</label><button type="button" onclick="cotesCharger(true)" style="${BD};border-radius:8px;padding:3px 10px;font-weight:700">↻ Actualiser</button></div>`;
    if (!S.robot.url || !S.robot.key) return `<p style="font-size:12px;margin:6px 0">Renseigne ton robot Cloudflare pour lire les cotes :</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="cotesUrl" placeholder="https://statify-robot.xxx.workers.dev" value="${esc(S.robot.url)}" style="flex:1;min-width:220px;${BD};border-radius:8px;padding:5px 8px"><input id="cotesKey" type="password" placeholder="SYNC_KEY" value="${esc(S.robot.key)}" style="width:160px;${BD};border-radius:8px;padding:5px 8px"><button type="button" onclick="cotesSaveRobot()" style="${BD};border-radius:8px;padding:5px 12px;font-weight:700">Enregistrer</button></div>`;
    if (S.busy && !S.day) return ctl + '<p style="font-size:12px;opacity:.7">Chargement des cotes…</p>';
    if (S.err && !S.day) return ctl + `<p style="font-size:12px;color:#dc2626;margin:6px 0">⚠️ ${esc(S.err)}</p>`;
    const D = S.day; if (!D) return ctl + '<p style="font-size:12px;opacity:.7">Touche « Actualiser » pour lire les cotes du jour.</p>';
    const ok = (D.matchs || []).filter(m => m.w !== 1 && m.w !== 2 && +m.c1 > 1 && +m.c2 > 1).map(m => { const n = +m.c1 <= +m.c2 ? 1 : 2; return { m, n, fav: n === 1 ? m.j1 : m.j2, adv: n === 1 ? m.j2 : m.j1, c: n === 1 ? +m.c1 : +m.c2 }; }).sort((a, b) => a.c - b.c);
    if (!ok.length) return ctl + '<p style="font-size:12px;opacity:.7;margin:6px 0">Aucun match avec cotes pour aujourd’hui (ou tous sont terminés).</p>';
    const bas = ok.filter(x => x.c <= seuil).slice(0, 12);
    const ligne = x => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--line,#eef2f7);${x.c <= seuil ? '' : 'opacity:.55'}"><span style="width:44px;font-size:11px;opacity:.7">${esc(x.m.heure || '')}</span><span style="flex:1;font-size:13px"><b>${esc(x.fav)}</b> <span style="opacity:.65">vs ${esc(x.adv)} · ${esc(x.m.tournoi || '')}</span></span><b style="font-size:14px">${f2(x.c)}</b></div>`;
    const P = []; for (let i = 0; i < bas.length; i++) for (let j = i + 1; j < bas.length; j++) P.push({ a: bas[i], b: bas[j], c: bas[i].c * bas[j].c });
    P.sort((a, b) => a.c - b.c); const top = P.slice(0, 8), d = iso();
    S.copies = top.map(p => [p.a, p.b].map(x => `${d} | ${x.m.j1} vs ${x.m.j2} | ${x.m.tournoi || 'Tennis'} | Vainqueur du match | ${x.fav} | ${mise} | ${x.c}`).join('\n'));
    const combos = top.length ? top.map((p, i) => `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line,#eef2f7)"><span style="flex:1;font-size:13px"><b>${esc(p.a.fav)}</b> + <b>${esc(p.b.fav)}</b></span><b>${f2(p.c)}</b><span style="color:#16a34a;font-weight:800;font-size:12px" title="gain net pour ${f2(mise)} €">+${f2((p.c - 1) * mise)} €</span><button type="button" onclick="cotesCopier(${i})" title="Copier" style="${BD};border-radius:8px;padding:2px 8px">📋</button></div>`).join('') : `<p style="font-size:12px;opacity:.7;margin:6px 0">${bas.length < 2 ? 'Moins de 2 matchs sous ' + f2(seuil) + ' : monte le seuil pour voir des combinés.' : ''}</p>`;
    return ctl + ok.slice(0, 14).map(ligne).join('') + `<div style="font-weight:800;font-size:12px;margin:12px 0 2px">Combinés de 2 matchs (du plus bas au plus haut)</div>` + combos + `<div style="font-size:11px;opacity:.65;margin-top:6px">Cotes Tennis Explorer · aujourd’hui · ${ok.length} match(s) avec cotes${D.perime ? ' · ⚠️ données mémorisées' : ''}</div>`;
  }
  function rendre() {
    const el = document.getElementById('cotesTennis'); if (!el) return;
    const body = el.querySelector('.ct-body'); if (body) body.innerHTML = vue();
  }
  async function charger(force) {
    if (!S.robot.url || !S.robot.key || S.busy) { rendre(); return; }
    if (!force && S.day && Date.now() - S.day._t < 5 * 60e3) { rendre(); return; }
    S.busy = true; S.err = ''; rendre();
    try {
      const r = await fetch(S.robot.url.replace(/\/+$/, '') + '/tennis?date=' + iso(), { headers: { 'x-key': S.robot.key }, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error('Clé refusée : vérifie la SYNC_KEY.');
      if (!r.ok || !j.ok) throw new Error(j.error || ('Le robot a répondu ' + r.status));
      j._t = Date.now(); S.day = j;
    } catch (e) { S.err = e.message === 'Failed to fetch' ? "Robot injoignable : vérifie l'adresse et ta connexion." : e.message; }
    S.busy = false; rendre();
  }
  window.cotesCharger = charger;
  window.cotesReg = (k, v) => { const x = parseFloat(v); if (x > 0) { try { localStorage.setItem(k, String(x)); } catch (e) {} } rendre(); };
  window.cotesSaveRobot = () => { const u = (document.getElementById('cotesUrl') || {}).value || '', k = (document.getElementById('cotesKey') || {}).value || ''; S.robot = { url: u.trim(), key: k.trim() }; try { localStorage.setItem(KEY_ROBOT, JSON.stringify(S.robot)); } catch (e) {} charger(true); };
  window.cotesCopier = i => { const t = S.copies[i]; if (!t) return; try { navigator.clipboard.writeText(t); } catch (e) {} const b = document.activeElement; if (b && b.tagName === 'BUTTON') { b.textContent = '✓'; setTimeout(() => { b.textContent = '📋'; }, 1200); } };

  function monter() {
    if (document.getElementById('cotesTennis')) return;
    const ancre = document.getElementById('resumeJour'); if (!ancre) return;
    const d = document.createElement('details'); d.id = 'cotesTennis';
    d.style.cssText = 'margin:10px 0;padding:10px 14px;border-radius:14px;background:var(--card,#fff);' + BD;
    let ouvert = true; try { ouvert = localStorage.getItem(KEY_OPEN) !== '0'; } catch (e) {}
    d.open = ouvert;
    d.innerHTML = '<summary style="cursor:pointer;font-weight:800;font-size:14px">🎾 Cotes tennis du jour · combinés cotes basses</summary><div class="ct-body"></div>';
    d.addEventListener('toggle', () => { try { localStorage.setItem(KEY_OPEN, d.open ? '1' : '0'); } catch (e) {} if (d.open && !S.day) charger(false); });
    ancre.parentNode.insertBefore(d, ancre.nextSibling);
    rendre(); if (d.open) charger(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monter); else monter();
  window.addEventListener('load', monter);
})();
