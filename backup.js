/* Sauvegarde unique Statify + PronoTracker (les deux pages sont sur le même site : elles partagent le stockage du navigateur).
   Le fichier garde le format de Statify (games, fav, sched, notes, foot, ffav, ffavP) ET celui de PronoTracker (football, combos),
   donc les anciennes versions des deux appli savent encore le lire. Les réglages de synchro (Firebase / Supabase) n'y sont jamais mis. */
(function () {
  const PRONO_KEY = 'prono_tracker_multisport_data';
  const SETTINGS_RE = /^pronotracker_(ambiance|customMarkets|compFilters|compFilterMode|formReplie)$/;
  const lsJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  let cache = null;

  function pronoSettings() {
    const o = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (SETTINGS_RE.test(k)) o[k] = localStorage.getItem(k); } } catch (e) {}
    return o;
  }
  function pronoPart() {
    const st = lsJ(PRONO_KEY, {});
    return {
      football: Array.isArray(st.football) ? st.football : [],
      combos: { football: (st.combos && Array.isArray(st.combos.football)) ? st.combos.football : [] },
      pronoSettings: pronoSettings()
    };
  }
  function idbGet(k) {
    return new Promise(res => {
      try {
        const r = indexedDB.open('statify', 1);
        r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) {} };
        r.onsuccess = () => { try { const q = r.result.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); } catch (e) { res(undefined); } };
        r.onerror = () => res(undefined);
      } catch (e) { res(undefined); }
    });
  }
  // même règle que Statify au démarrage : la copie IndexedDB gagne si elle est plus récente (ou si localStorage est vide)
  async function bigGet(k, def) {
    const lt = +(localStorage.getItem('suivi-ts-' + k) || 0), local = lsJ(k, null);
    let rec; try { rec = await idbGet(k); } catch (e) {}
    if (rec && rec.v && (rec.t > lt + 2000 || local == null)) return rec.v;
    return local == null ? def : local;
  }
  async function prepare() {
    cache = {
      games: await bigGet('suivi-nba-v1', {}),
      fav: lsJ('suivi-nba-fav', { teams: [], players: {} }),
      sched: lsJ('suivi-nba-sched', []),
      notes: lsJ('suivi-nba-notes', {}),
      foot: await bigGet('suivi-foot-v1', { leagues: {} }),
      ffav: lsJ('suivi-foot-fav', []),
      ffavP: lsJ('suivi-foot-favp', [])
    };
    return cache;
  }
  // depuis PronoTracker : ses pronostics en mémoire + la copie de Statify préparée à l'avance
  function buildSync(pronoState) {
    if (!cache) return null;
    const ps = pronoState || lsJ(PRONO_KEY, {});
    return Object.assign({ v: 4, app: 'statify+prono', date: new Date().toISOString() }, cache, {
      football: Array.isArray(ps.football) ? ps.football : [],
      combos: { football: (ps.combos && Array.isArray(ps.combos.football)) ? ps.combos.football : [] },
      pronoSettings: pronoSettings()
    });
  }
  async function build(pronoState) { await prepare(); return buildSync(pronoState); }
  function stamp() {
    const now = Date.now();
    try { localStorage.setItem('pronotracker_lastBackup', new Date(now).toISOString()); } catch (e) {}
    try { localStorage.setItem('suivi-nba-backup', JSON.stringify({ last: now, snooze: 0 })); } catch (e) {}
  }
  // restauration des pronostics : on ne supprime JAMAIS un pari local ; la sauvegarde ajoute ou met à jour (même identifiant)
  function restoreProno(d) {
    const st = lsJ(PRONO_KEY, {});
    const merge = (cur, inc) => {
      inc = inc.filter(b => b && typeof b === 'object');
      const ids = new Set(inc.filter(b => b.id != null).map(b => String(b.id)));
      const keep = cur.filter(b => !(b && b.id != null && ids.has(String(b.id))));
      const upd = cur.length - keep.length;
      return { list: keep.concat(inc), added: inc.length - upd, upd };
    };
    const bets = merge(Array.isArray(st.football) ? st.football : [], d.football || []);
    const combos = merge((st.combos && Array.isArray(st.combos.football)) ? st.combos.football : [], (d.combos && Array.isArray(d.combos.football)) ? d.combos.football : []);
    if (bets.upd > 0 && !confirm(bets.upd + " pari(s) de la sauvegarde existent déjà sur cet appareil : la sauvegarde remplacera leur état (gagné / perdu / en cours). Continuer ?"))
      return ' · Pronos : non restaurés';
    st.football = bets.list;
    st.combos = Object.assign({}, st.combos || {}, { football: combos.list });
    try { localStorage.setItem(PRONO_KEY, JSON.stringify(st)); } catch (e) { return ' · Pronos : stockage plein, non restaurés'; }
    const set = d.pronoSettings || {};
    for (const k of Object.keys(set)) { if (SETTINGS_RE.test(k)) { try { localStorage.setItem(k, String(set[k])); } catch (e) {} } }
    return ' · Pronos : ' + bets.added + ' ajouté(s), ' + bets.upd + ' mis à jour';
  }
  window.StatifyBackup = { pronoPart, prepare, buildSync, build, stamp, restoreProno };
})();
