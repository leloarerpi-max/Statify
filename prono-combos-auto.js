// Calcul des paires « selon les cotes » (football) : combinés de 2 pronos dont la cote tombe autour de 2,00–2,40.
// Utilisé par le mode « Cotes ≈ 2,00–2,40 » des combinés automatiques existants (prono.js). Aucune interface ici.
(function () {
  'use strict';
  const DEF = { min: 2.00, cible: 2.20, ideal: 2.40, max: 3.00 };

  // Coût d'une paire : 0 = pile la cible. Entre min et idéal : écart à la cible. Au-dessus de l'idéal : toléré mais pénalisé.
  function cout(p, o) { return p <= o.ideal ? Math.abs(p - o.cible) : (o.ideal - o.cible) + (p - o.ideal) * 3; }
  const memeMatch = (a, b) => {
    const n = s => String(s || '').toLowerCase().replace(/vs|\-|\_/g, ' ').replace(/\s+/g, ' ').trim();
    return n(a.match) !== '' && n(a.match) === n(b.match);
  };

  // Choisit les paires : d'abord le plus de paires possible, puis la cote la plus proche de la cible.
  function paires(bets, opt) {
    const o = Object.assign({}, DEF, opt || {});
    const L = bets.filter(b => b && b.odds > 1);
    const n = L.length;
    const ok = (i, j) => { const p = L[i].odds * L[j].odds; return p >= o.min - 1e-9 && p <= o.max + 1e-9 && !memeMatch(L[i], L[j]); };
    if (n < 2) return [];
    let best = null;
    if (n <= 14) {                       // recherche exacte (petites journées)
      const used = new Array(n).fill(false);
      const cur = [];
      (function dfs(i, c) {
        while (i < n && used[i]) i++;
        if (i >= n) {
          if (!best || cur.length > best.p.length || (cur.length === best.p.length && c < best.c - 1e-9)) best = { p: cur.slice(), c };
          return;
        }
        used[i] = true;
        for (let j = i + 1; j < n; j++) if (!used[j] && ok(i, j)) {
          used[j] = true; cur.push([i, j]);
          dfs(i + 1, c + cout(L[i].odds * L[j].odds, o));
          cur.pop(); used[j] = false;
        }
        dfs(i + 1, c);                   // i reste seul
        used[i] = false;
      })(0, 0);
    } else {                             // grosses journées : glouton, meilleures paires d'abord
      const cand = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (ok(i, j)) cand.push([i, j, cout(L[i].odds * L[j].odds, o)]);
      cand.sort((a, b) => a[2] - b[2]);
      const u = new Set(), p = [];
      cand.forEach(([i, j]) => { if (!u.has(i) && !u.has(j)) { u.add(i); u.add(j); p.push([i, j]); } });
      best = { p };
    }
    const res = (best ? best.p : []).map(([i, j]) => ({ a: L[i], b: L[j], cote: Math.round(L[i].odds * L[j].odds * 100) / 100 }));
    return res.sort((x, y) => x.cote - y.cote);
  }

  const lib = { paires, DEF };
  try { window.__combosAuto = lib; } catch (e) {}
})();
