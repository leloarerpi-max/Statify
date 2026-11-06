/* Statify · Tennis · onglet « Joueurs »
   Statistiques sportives calculées uniquement à partir des matchs enregistrés (aucune cote utilisée) :
   palmarès, fiche joueur, duel, tournois, calendrier.
   Fichier isolé : s'il plante, le reste de l'appli n'est pas touché. */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fr = (n, d = 0) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
  const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const ORDRE_J = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const MOMENTS = ['Matin', 'Après-midi', 'Soir'];
  const momentDe = h => { const x = parseInt(String(h || '').slice(0, 2), 10); return isNaN(x) ? null : x < 12 ? 'Matin' : x < 17 ? 'Après-midi' : 'Soir'; };
  const cle = r => String(r.date || '') + ' ' + String(r.heure || '00:00');

  /* ---------- Calculs (purs, testables) ---------- */
  // res : [{date, heure, tournoi, j1, j2, w}] avec w = 1 ou 2
  function calculer(res) {
    const L = (res || []).filter(r => (r.w === 1 || r.w === 2) && r.j1 && r.j2).slice().sort((a, b) => cle(a).localeCompare(cle(b)));
    const P = new Map();
    const joueur = nom => { let p = P.get(nom); if (!p) { p = { nom, v: 0, d: 0, n: 0, suite: [], tournois: new Map(), moments: {}, duels: [], serieV: 0, plusLongueV: 0 }; P.set(nom, p); } return p; };
    L.forEach(r => {
      const g = r.w === 1 ? r.j1 : r.j2, l = r.w === 1 ? r.j2 : r.j1, a = joueur(g), b = joueur(l);
      a.v++; b.d++; a.n++; b.n++;
      a.suite.push(1); b.suite.push(0);
      a.serieV++; a.plusLongueV = Math.max(a.plusLongueV, a.serieV); b.serieV = 0;
      const mo = momentDe(r.heure);
      [[a, 1, b], [b, 0, a]].forEach(([p, gagne, adv]) => {
        const t = p.tournois.get(r.tournoi) || { nom: r.tournoi, v: 0, d: 0 }; gagne ? t.v++ : t.d++; p.tournois.set(r.tournoi, t);
        if (mo) { const m = p.moments[mo] || { v: 0, d: 0 }; gagne ? m.v++ : m.d++; p.moments[mo] = m; }
        p.duels.push({ date: r.date, heure: r.heure, tournoi: r.tournoi, adv: adv.nom, gagne: !!gagne });
      });
    });
    const liste = [...P.values()].map(p => {
      let serie = 0; for (let i = p.suite.length - 1; i >= 0 && p.suite[i] === p.suite[p.suite.length - 1]; i--) serie++;
      const sens = p.suite.length ? (p.suite[p.suite.length - 1] ? 1 : -1) : 0;
      return Object.assign(p, { pct: p.n ? p.v / p.n * 100 : 0, forme: p.suite.slice(-10), serie: sens * serie });
    });
    // tournois
    const T = new Map();
    L.forEach(r => { const t = T.get(r.tournoi) || { nom: r.tournoi, n: 0, j: new Map(), debut: r.date, fin: r.date }; t.n++; t.fin = r.date; t.debut = t.debut < r.date ? t.debut : r.date;
      const g = r.w === 1 ? r.j1 : r.j2, l = r.w === 1 ? r.j2 : r.j1;
      const a = t.j.get(g) || { nom: g, v: 0, d: 0 }; a.v++; t.j.set(g, a); const b = t.j.get(l) || { nom: l, v: 0, d: 0 }; b.d++; t.j.set(l, b); T.set(r.tournoi, t); });
    // calendrier
    const parJour = new Map(), parMois = Array(12).fill(0), parSem = {}, parMoment = {};
    L.forEach(r => {
      parJour.set(r.date, (parJour.get(r.date) || 0) + 1);
      const d = new Date(r.date + 'T12:00:00Z'); if (isNaN(d)) return;
      parMois[d.getUTCMonth()]++; const js = JOURS[d.getUTCDay()]; parSem[js] = (parSem[js] || 0) + 1;
      const mo = momentDe(r.heure); if (mo) parMoment[mo] = (parMoment[mo] || 0) + 1;
    });
    return { L, liste, joueurs: P, tournois: [...T.values()].sort((a, b) => b.n - a.n), parJour, parMois, parSem, parMoment };
  }
  // Faits marquants : quelques records de l'année, calculés sur les matchs enregistrés
  function faits(C) {
    if (!C.L.length) return [];
    const out = [], l = C.liste;
    const meilleur = (f, min) => l.filter(p => p.n >= (min || 1)).sort((a, b) => f(b) - f(a) || b.n - a.n)[0];
    const s1 = meilleur(p => p.plusLongueV), v1 = meilleur(p => p.v), a1 = meilleur(p => p.n), pc = meilleur(p => p.pct, 10), d1 = meilleur(p => p.d);
    const jour = [...C.parJour.entries()].sort((a, b) => b[1] - a[1])[0];
    if (s1 && s1.plusLongueV >= 3) out.push(['🔥', 'Plus longue série', s1.nom, s1.plusLongueV + ' victoires d\'affilée']);
    if (v1) out.push(['🏆', 'Plus de victoires', v1.nom, v1.v + ' victoires']);
    if (pc) out.push(['🎯', 'Meilleur % (10 matchs min.)', pc.nom, Math.round(pc.pct) + ' % · ' + pc.v + '–' + pc.d]);
    if (a1) out.push(['🏃', 'Le plus actif', a1.nom, a1.n + ' matchs']);
    if (d1 && d1.d >= 3) out.push(['🧱', 'Plus de défaites', d1.nom, d1.d + ' défaites']);
    if (jour) out.push(['📅', 'Jour le plus chargé', jour[0].slice(8, 10) + '/' + jour[0].slice(5, 7), jour[1] + ' matchs']);
    return out;
  }
  function duel(C, a, b) {
    const pa = C.joueurs.get(a); if (!pa || !C.joueurs.get(b)) return null;
    const l = pa.duels.filter(x => x.adv === b);
    return { a, b, va: l.filter(x => x.gagne).length, vb: l.filter(x => !x.gagne).length, matchs: l.slice().reverse() };
  }

  /* ---------- Affichage ---------- */
  const st = { vue: 'pal', tri: 'v', joueur: '', j2: '', tournoi: '' };
  const getC = res => calculer(res);
  const BLEU = '#60a5fa', VERT = '#16a34a', ROUGE = '#dc2626';
  const barre = (v, max, c) => `<div style="height:6px;border-radius:999px;background:rgba(128,128,128,.25);overflow:hidden;margin-top:3px"><div style="height:100%;width:${max ? Math.max(2, Math.round(v / max * 100)) : 0}%;background:${c}"></div></div>`;
  const forme = f => `<span style="display:inline-flex;gap:2px">${f.map(x => `<span title="${x ? 'Victoire' : 'Défaite'}" style="width:9px;height:9px;border-radius:2px;background:${x ? VERT : ROUGE}"></span>`).join('')}</span>`;
  const lien = nom => `<a href="#" onclick="tnJoueur(${esc(JSON.stringify(nom))});return false" style="color:inherit;font-weight:800;text-decoration:underline;text-decoration-color:rgba(128,128,128,.5)">${esc(nom)}</a>`;
  const bouton = (txt, actif, on, BD) => `<button type="button" onclick="${on}" style="min-height:40px;padding:0 12px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;${actif ? 'background:#1d4ed8;color:#fff;border:1px solid #3b82f6' : `background:transparent;color:inherit;border:1px solid ${BD}`}">${txt}</button>`;
  const champ = (id, val, ph, noms, on, BD) => `<input id="${id}" list="${id}L" value="${esc(val)}" placeholder="${ph}" onchange="${on}(this.value)" style="min-height:44px;border-radius:10px;border:1px solid ${BD};background:transparent;color:inherit;padding:0 10px;font-size:14px;width:100%;box-sizing:border-box"><datalist id="${id}L">${noms.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;

  function faitsHtml(res, BD) {
    try {
      const f = faits(getC(res || []));
      if (!f.length) return '';
      return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px">${f.map(x => `<div style="border:1px solid ${BD};border-radius:12px;padding:9px 10px"><div style="font-size:11px;opacity:.7">${x[0]} ${esc(x[1])}</div><div style="font-size:14px;font-weight:800;margin-top:2px">${esc(x[2])}</div><div style="font-size:11px;opacity:.75">${esc(x[3])}</div></div>`).join('')}</div>`;
    } catch (e) { return ''; }
  }
  function palmares(C, BD) {
    const defs = { v: ['Victoires', p => p.v, p => p.v + ' V'], d: ['Défaites', p => p.d, p => p.d + ' D'], n: ['Matchs joués', p => p.n, p => p.n + ' matchs'], pct: ['% de victoires (10 matchs min.)', p => p.pct, p => fr(p.pct, 0) + ' %'], s: ['Plus longue série de victoires', p => p.plusLongueV, p => p.plusLongueV + ' d\'affilée'] };
    const [titre, val, aff] = defs[st.tri] || defs.v;
    let l = C.liste.slice(); if (st.tri === 'pct') l = l.filter(p => p.n >= 10);
    l.sort((a, b) => val(b) - val(a) || b.n - a.n); l = l.slice(0, 15);
    const max = l.length ? val(l[0]) : 0;
    return `${faitsHtml(C.L, BD)}<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${Object.keys(defs).map(k => bouton(defs[k][0].replace(' (10 matchs min.)', ''), st.tri === k, `tnJx('tri','${k}')`, BD)).join('')}</div>
      <div style="font-size:13px;font-weight:800;margin-top:12px">${esc(titre)}</div>
      ${l.length >= 3 ? `<div style="display:flex;align-items:flex-end;gap:8px;margin-top:10px">${[1, 0, 2].map(i => { const p = l[i], h = [92, 70, 56][i], c = ['#f59e0b', '#94a3b8', '#b45309'][i]; return `<div style="flex:1;min-width:0;text-align:center"><div style="font-size:22px">${['🥇', '🥈', '🥉'][i]}</div><div style="font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${lien(p.nom)}</div><div style="margin-top:4px;height:${h}px;border-radius:10px 10px 0 0;background:color-mix(in srgb,${c} 30%,transparent);border:1px solid color-mix(in srgb,${c} 60%,transparent);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px">${esc(aff(p))}</div></div>`; }).join('')}</div>` : ''}
      ${l.length ? l.slice(l.length >= 3 ? 3 : 0).map((p, i) => `<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span>${i + 1 + (l.length >= 3 ? 3 : 0)}. ${lien(p.nom)}</span><span style="font-weight:800">${esc(aff(p))} <span style="opacity:.6;font-weight:600">· ${p.v}–${p.d}</span></span></div>${barre(val(p), max, st.tri === 'd' ? ROUGE : BLEU)}</div>`).join('') : '<p style="font-size:12px;opacity:.7">Pas encore assez de matchs.</p>'}`;
  }
  // Courbe de progression : victoires moins défaites, match après match
  function courbe(p) {
    if (p.suite.length < 3) return '';
    let c = 0; const pts = [0].concat(p.suite.map(x => (c += x ? 1 : -1))), mx = Math.max(1, ...pts.map(Math.abs)), W = 300, H = 90, n = pts.length - 1;
    const X = i => 4 + i / n * (W - 8), Y = v => H / 2 - v / mx * (H / 2 - 8);
    const d = pts.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' '), fin = pts[pts.length - 1];
    return `<div style="margin-top:12px"><div style="font-size:11px;opacity:.7;display:flex;justify-content:space-between"><span>Progression (victoires − défaites)</span><b style="color:${fin >= 0 ? VERT : ROUGE}">${fin > 0 ? '+' : ''}${fin}</b></div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="90" preserveAspectRatio="none" role="img" aria-label="Courbe de progression de ${esc(p.nom)}"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="rgba(128,128,128,.4)" stroke-dasharray="3 3"/><path d="${d}" fill="none" stroke="${fin >= 0 ? VERT : ROUGE}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg></div>`;
  }
  function fiche(C, BD) {
    const noms = C.liste.slice().sort((a, b) => b.n - a.n).map(p => p.nom), p = C.joueurs.get(st.joueur);
    let corps = '<p style="font-size:12px;opacity:.7;margin:10px 0 0">Tape un nom, ou touche un joueur dans le palmarès.</p>';
    if (p) {
      const tr = [...p.tournois.values()].sort((a, b) => (b.v + b.d) - (a.v + a.d)), mo = MOMENTS.filter(m => p.moments[m]);
      const g = (v, d) => `${v}–${d} <span style="opacity:.65">(${fr(v + d ? v / (v + d) * 100 : 0, 0)} %)</span>`;
      corps = `<div style="margin-top:12px"><div style="font-size:18px;font-weight:800">${esc(p.nom)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <div style="flex:1;min-width:110px"><div style="font-size:11px;opacity:.7">Bilan</div><div style="font-size:22px;font-weight:800">${p.v}–${p.d}</div><div style="font-size:11px;opacity:.75">${fr(p.pct, 0)} % de victoires</div></div>
          <div style="flex:1;min-width:110px"><div style="font-size:11px;opacity:.7">Série en cours</div><div style="font-size:22px;font-weight:800;color:${p.serie > 0 ? VERT : p.serie < 0 ? ROUGE : 'inherit'}">${p.serie > 0 ? p.serie + ' V' : p.serie < 0 ? -p.serie + ' D' : '—'}</div><div style="font-size:11px;opacity:.75">record : ${p.plusLongueV} V d'affilée</div></div>
          <div style="flex:1;min-width:110px"><div style="font-size:11px;opacity:.7">Matchs joués</div><div style="font-size:22px;font-weight:800">${p.n}</div><div style="font-size:11px;opacity:.75">${p.tournois.size} tournoi${p.tournois.size > 1 ? 's' : ''}</div></div></div>
        <div style="margin-top:10px;font-size:12px;font-weight:700">Forme (10 derniers) ${forme(p.forme)}</div>
        ${courbe(p)}
        <div style="font-size:13px;font-weight:800;margin-top:14px">Par tournoi</div>${tr.map(t => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px solid ${BD}"><span>${esc(t.nom)}</span><b>${g(t.v, t.d)}</b></div>`).join('')}
        ${mo.length ? `<div style="font-size:13px;font-weight:800;margin-top:14px">Selon le moment de la journée</div>${mo.map(m => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px solid ${BD}"><span>${m}</span><b>${g(p.moments[m].v, p.moments[m].d)}</b></div>`).join('')}` : ''}
        <div style="font-size:13px;font-weight:800;margin-top:14px">Derniers matchs</div>${p.duels.slice(-10).reverse().map(x => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:5px 0;border-top:1px solid ${BD}"><span style="opacity:.75">${esc(x.date.slice(8, 10) + '/' + x.date.slice(5, 7))} · ${esc(x.tournoi)}</span><span>contre ${lien(x.adv)} <b style="color:${x.gagne ? VERT : ROUGE}">${x.gagne ? 'V' : 'D'}</b></span></div>`).join('')}</div>`;
    } else if (st.joueur) corps = `<p style="font-size:12px;opacity:.8;margin-top:10px">Aucun joueur « ${esc(st.joueur)} » dans les matchs enregistrés. Utilise le nom comme sur Tennis Explorer (ex. « Sinner J. »).</p>`;
    return `<div style="margin-top:10px">${champ('tnJ1', st.joueur, 'Nom du joueur (ex. Sinner J.)', noms, 'tnJoueur', BD)}</div>${corps}`;
  }
  function duelVue(C, BD) {
    const noms = C.liste.slice().sort((a, b) => b.n - a.n).map(p => p.nom), d = st.joueur && st.j2 ? duel(C, st.joueur, st.j2) : null;
    let corps = '<p style="font-size:12px;opacity:.7;margin:10px 0 0">Choisis deux joueurs pour voir leurs confrontations parmi les matchs enregistrés.</p>';
    if (st.joueur && st.j2) corps = !d ? `<p style="font-size:12px;opacity:.8;margin-top:10px">Un des deux noms n'est pas dans les matchs enregistrés.</p>` : !d.matchs.length ? `<p style="font-size:13px;margin-top:10px">${esc(d.a)} et ${esc(d.b)} ne se sont pas affrontés dans les matchs enregistrés.</p>`
      : `<div style="margin-top:12px;text-align:center"><div style="font-size:28px;font-weight:800">${d.va} – ${d.vb}</div><div style="font-size:12px;opacity:.75">${esc(d.a)} contre ${esc(d.b)}</div></div>${d.matchs.map(x => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:6px 0;border-top:1px solid ${BD}"><span style="opacity:.75">${esc(x.date.slice(8, 10) + '/' + x.date.slice(5, 7))} · ${esc(x.tournoi)}</span><b>${esc(x.gagne ? d.a : d.b)}</b></div>`).join('')}`;
    return `<div style="margin-top:10px;display:grid;gap:8px">${champ('tnJ1', st.joueur, 'Joueur 1', noms, 'tnJoueur1', BD)}${champ('tnJ2', st.j2, 'Joueur 2', noms, 'tnJoueur2', BD)}</div>${corps}`;
  }
  function tournoisVue(C, BD) {
    const t = C.tournois.find(x => x.nom === st.tournoi);
    const liste = `<div style="margin-top:10px">${C.tournois.map(x => `<button type="button" onclick="tnTournoi(${esc(JSON.stringify(x.nom))})" style="display:flex;justify-content:space-between;width:100%;min-height:44px;align-items:center;padding:0 10px;margin-top:6px;border-radius:10px;font-size:13px;cursor:pointer;text-align:left;${t && t.nom === x.nom ? 'background:#1d4ed8;color:#fff;border:1px solid #3b82f6' : `background:transparent;color:inherit;border:1px solid ${BD}`}"><span>${esc(x.nom)}</span><b>${x.n} matchs</b></button>`).join('')}</div>`;
    if (!t) return liste || '<p style="font-size:12px;opacity:.7">Pas encore de matchs.</p>';
    const top = [...t.j.values()].sort((a, b) => b.v - a.v || a.d - b.d).slice(0, 8), max = top.length ? top[0].v : 0;
    return `${liste}<div style="margin-top:14px"><div style="font-size:15px;font-weight:800">${esc(t.nom)}</div><div style="font-size:12px;opacity:.75">${t.n} matchs · ${t.j.size} joueurs · du ${esc(t.debut.slice(8, 10) + '/' + t.debut.slice(5, 7))} au ${esc(t.fin.slice(8, 10) + '/' + t.fin.slice(5, 7))}</div>
      <div style="font-size:13px;font-weight:800;margin-top:10px">Qui va le plus loin (le plus de victoires)</div>${top.map(j => `<div style="margin-top:7px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${lien(j.nom)}</span><b>${j.v}–${j.d}</b></div>${barre(j.v, max, BLEU)}</div>`).join('')}</div>`;
  }
  // Grille de la saison (façon contributions GitHub) : une case par jour, plus ou moins foncée selon le nombre de matchs
  function grilleSaison(C, BD) {
    const jours = [...C.parJour.keys()].sort(); if (!jours.length) return '';
    const annee = jours[0].slice(0, 4), debut = new Date(annee + '-01-01T12:00:00Z'), fin = new Date(annee + '-12-31T12:00:00Z');
    const dec = (debut.getUTCDay() + 6) % 7, mx = Math.max(1, ...C.parJour.values()), cols = Math.ceil((dec + Math.round((fin - debut) / 864e5) + 1) / 7);
    let cells = '', mois = '';
    for (let c = 0; c < cols; c++) {
      let col = '';
      for (let r = 0; r < 7; r++) {
        const k = c * 7 + r - dec; if (k < 0 || k > 365) { col += '<span style="width:11px;height:11px"></span>'; continue; }
        const d = new Date(debut.getTime() + k * 864e5), iso = d.toISOString().slice(0, 10), n = C.parJour.get(iso) || 0;
        if (r === 0 && d.getUTCDate() <= 7) mois += `<span style="position:absolute;left:${c * 14}px;font-size:10px;opacity:.7">${MOIS[d.getUTCMonth()].replace('.', '')}</span>`;
        col += `<span title="${esc(iso.slice(8, 10) + '/' + iso.slice(5, 7))} : ${n} match${n > 1 ? 's' : ''}" style="width:11px;height:11px;border-radius:3px;background:${n ? `color-mix(in srgb,#16a34a ${Math.round(25 + n / mx * 75)}%,transparent)` : 'rgba(128,128,128,.18)'}"></span>`;
      }
      cells += `<div style="display:flex;flex-direction:column;gap:3px">${col}</div>`;
    }
    return `<div style="font-size:13px;font-weight:800;margin-top:12px">Ta saison jour par jour (${esc(annee)})</div><div style="overflow-x:auto;padding-bottom:6px"><div style="position:relative;height:14px;margin-top:6px;width:${cols * 14}px">${mois}</div><div style="display:flex;gap:3px;width:${cols * 14}px">${cells}</div></div>
      <div style="font-size:10px;opacity:.65;display:flex;align-items:center;gap:4px">Moins <span style="width:11px;height:11px;border-radius:3px;background:rgba(128,128,128,.18)"></span><span style="width:11px;height:11px;border-radius:3px;background:color-mix(in srgb,#16a34a 40%,transparent)"></span><span style="width:11px;height:11px;border-radius:3px;background:#16a34a"></span> Plus de matchs</div>`;
  }
  function calendrierVue(C, BD) {
    const mx = Math.max(1, ...C.parMois), top = [...C.parJour.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5), ms = Math.max(1, ...Object.values(C.parSem), 1), mm = Math.max(1, ...Object.values(C.parMoment), 1);
    return `${grilleSaison(C, BD)}<div style="font-size:13px;font-weight:800;margin-top:12px">Matchs par mois</div><div style="display:flex;align-items:flex-end;gap:4px;height:90px;margin-top:6px">${C.parMois.map((n, i) => `<div style="flex:1;text-align:center;font-size:10px"><div title="${n} matchs" style="height:${Math.round(n / mx * 60)}px;background:${BLEU};border-radius:4px 4px 0 0;min-height:${n ? 2 : 0}px"></div><div style="opacity:.7;margin-top:2px">${MOIS[i].replace('.', '')}</div><div style="font-weight:800">${n || ''}</div></div>`).join('')}</div>
      <div style="font-size:13px;font-weight:800;margin-top:14px">Jours les plus chargés</div>${top.map(([d, n]) => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px solid ${BD}"><span>${esc(d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4))}</span><b>${n} matchs</b></div>`).join('')}
      <div style="font-size:13px;font-weight:800;margin-top:14px">Par jour de la semaine</div>${ORDRE_J.filter(j => C.parSem[j]).map(j => `<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${j}</span><b>${C.parSem[j]}</b></div>${barre(C.parSem[j], ms, BLEU)}</div>`).join('')}
      <div style="font-size:13px;font-weight:800;margin-top:14px">Par moment de la journée</div>${MOMENTS.filter(m => C.parMoment[m]).map(m => `<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${m}</span><b>${C.parMoment[m]}</b></div>${barre(C.parMoment[m], mm, BLEU)}</div>`).join('')}`;
  }
  function bloc(res, BD, card) {
    try {
      BD = BD || 'rgba(128,128,128,.32)'; card = card || `border:1px solid ${BD};border-radius:14px;padding:12px;margin-top:10px`;
      const C = getC(res || []);
      if (!C.L.length) return `<div style="${card}"><div style="font-size:13px;font-weight:800">👥 Joueurs</div><p style="margin:6px 0 0;font-size:12px;opacity:.8">Les stats des joueurs apparaîtront quand des matchs seront enregistrés (saisis ou importés depuis janvier).</p></div>`;
      const vues = [['pal', 'Palmarès'], ['fiche', 'Fiche joueur'], ['duel', 'Duel'], ['tour', 'Tournois'], ['cal', 'Calendrier']];
      const corps = { pal: palmares, fiche, duel: duelVue, tour: tournoisVue, cal: calendrierVue }[st.vue] || palmares;
      return `<div style="${card};border-left:5px solid #f59e0b"><div style="font-size:13px;font-weight:800">👥 Joueurs · ${C.L.length} matchs, ${C.liste.length} joueurs</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${vues.map(([k, t]) => bouton(t, st.vue === k, `tnJx('vue','${k}')`, BD)).join('')}</div>${corps(C, BD)}</div>`;
    } catch (e) { return ''; }
  }

  /* ---------- Actions ---------- */
  const redraw = () => { try { window.__tennis && window.__tennis.render && window.__tennis.render(); } catch (e) {} };
  window.tnJx = (k, v) => { st[k] = v; redraw(); };
  window.tnJoueur = n => { st.joueur = String(n || '').trim(); st.vue = 'fiche'; redraw(); };
  window.tnJoueur1 = n => { st.joueur = String(n || '').trim(); redraw(); };
  window.tnJoueur2 = n => { st.j2 = String(n || '').trim(); redraw(); };
  window.tnTournoi = n => { st.tournoi = st.tournoi === n ? '' : String(n || ''); redraw(); };
  window.__tennisJoueurs = { calculer, duel, bloc, faits, faitsHtml, etat: st };
})();
