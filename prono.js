    // Couleurs des graphiques selon le thème clair/sombre (même réglage que Statify)
    const chartGrid = () => document.documentElement.dataset.theme === 'light' ? '#f1f5f9' : '#1b3a5c';
    const chartTick = () => document.documentElement.dataset.theme === 'light' ? '#64748b' : '#8eaac8';
    try { if (window.Chart) Chart.defaults.color = chartTick(); } catch (e) {}
    let currentSport = 'football';
    let state = JSON.parse(localStorage.getItem('prono_tracker_multisport_data')) || { football: [] };
    // Le tennis n'existe plus dans l'appli : on purge toute donnée tennis restante.
    delete state.tennis;
    if (state.combos) delete state.combos.tennis;
    if (!state.combos) state.combos = {};
    if (!Array.isArray(state.combos.football)) state.combos.football = [];
    // Toute mise à 0 (ou absente) passe à 1 € : paris simples ET combinés, football.
    // Renvoie le nombre de mises corrigées.
    function corrigerMisesNulles() {
      let n = 0;
      ['football'].forEach(sp => {
        (state[sp] || []).forEach(b => {
          if (!(parseFloat(b.stake) > 0)) { b.stake = 1; n++; }
        });
        ((state.combos && state.combos[sp]) || []).forEach(c => {
          if (!(parseFloat(c.stake) > 0)) { c.stake = 1; n++; }
        });
      });
      return n;
    }
    // Remet d'équerre les combinés pour qu'aucun ne disparaisse de "Mes Combinés" :
    //  - un pari marqué comme faisant partie d'un combiné (comboId) dont le combiné n'existe plus
    //    est regroupé avec ses voisins pour recréer le combiné (mise 1 € si elle est inconnue) ;
    //    s'il reste seul, il redevient un pari simple ;
    //  - les sélections d'un combiné retrouvent leur lien (comboId) ;
    //  - les identifiants sont comparés sans tenir compte du type (nombre ou texte).
    // Renvoie le nombre de réparations.
    function repareCombines() {
      let n = 0;
      ['football'].forEach(sp => {
        const bets = state[sp] || [];
        if (!state.combos) state.combos = {};
        if (!Array.isArray(state.combos[sp])) state.combos[sp] = [];
        const combos = state.combos[sp];
        const betById = id => bets.find(b => String(b.id) === String(id));

        combos.forEach(c => {
          if (!Array.isArray(c.legIds)) { c.legIds = []; n++; }
          c.legIds.forEach(id => {
            const b = betById(id);
            if (b && String(b.comboId) !== String(c.id)) { b.comboId = c.id; n++; }
          });
        });

        const orphans = {};
        bets.forEach(b => {
          if (b.comboId === undefined || b.comboId === null || b.comboId === '') return;
          if (combos.some(c => String(c.id) === String(b.comboId))) return;
          (orphans[b.comboId] = orphans[b.comboId] || []).push(b);
        });
        Object.keys(orphans).forEach(cid => {
          const legs = orphans[cid];
          if (legs.length >= 2) {
            const stake = parseFloat(legs[0].stake) > 0 ? parseFloat(legs[0].stake) : 1;
            combos.push({ id: legs[0].comboId, stake: stake, legIds: legs.map(b => b.id), createdAt: new Date().toISOString() });
          } else {
            delete legs[0].comboId;
          }
          n++;
        });
      });
      return n;
    }

    {
      const fixes = corrigerMisesNulles() + repareCombines();
      if (fixes > 0) {
        try { localStorage.setItem('prono_tracker_multisport_data', JSON.stringify(state)); } catch (e) {}
      }
    }

    // Sélection en cours (cases cochées dans l'Historique) en vue de créer un combiné.
    let selectedBetIds = new Set();
    // Affichage de la liste "Mes Combinés" : pagination + état plié/déplié par combiné.
    const COMBOS_PAGE = 15;
    let visibleCombosCount = COMBOS_PAGE;
    let comboOverrides = {}; // { [comboId]: true|false } — ne contient que les combinés dépliés/repliés manuellement.
    
    let categoryChartInstances = {}; // instances Chart.js par catégorie (accordéons ouverts uniquement)
    let globalBankrollChartInstance = null; // instance Chart.js du graphique global (toujours visible)
    let currentQuickFilter = 'ALL';
    // Filtre Solo / Combinés / Tous, appliqué uniquement à la liste de l'Historique
    // (n'affecte pas le Bilan du haut, qui a déjà ses propres cartes Solo/Combiné séparées).
    let currentTypeFilter = 'ALL';
    // multi-sélection : vide = tous les championnats. Persistée pour survivre à un rechargement de page.
    let currentCompFilters = new Set(JSON.parse(localStorage.getItem('pronotracker_compFilters') || '[]'));
    let compFilterMode = localStorage.getItem('pronotracker_compFilterMode') || 'include'; // 'include' ou 'exclude'

    function saveCompFiltersToStorage() {
      localStorage.setItem('pronotracker_compFilters', JSON.stringify(Array.from(currentCompFilters)));
    }
    let currentMarketFilter = null;
    let currentOddsFilter = null;
    let currentSort = { field: 'date', dir: 'desc' };
    let lastDeletedBet = null;
    let undoTimeout = null;
    let importPreviewData = [];
    let editingBetId = null;
    const HISTORY_PAGE_SIZE = 25;
    let historyVisibleCount = HISTORY_PAGE_SIZE; // nombre de lignes affichées dans l'Historique

    // Réinitialise la pagination de l'Historique : à appeler à chaque fois qu'un filtre change,
    // pour ne pas rester bloqué sur une page qui n'a plus de sens avec la nouvelle sélection.
    function resetHistoryPagination() {
      historyVisibleCount = HISTORY_PAGE_SIZE;
    }

    function loadMoreHistory() {
      historyVisibleCount += HISTORY_PAGE_SIZE;
      render();
    }

    // Utilisé par les champs de filtre (recherche, championnat, plage de dates) : un changement
    // de filtre doit toujours ramener l'Historique à sa première page.
    function renderAfterFilterChange() {
      resetHistoryPagination();
      render();
    }

    // Types de marché : liste modifiable par l'utilisateur (ajout/suppression), persistée
    // définitivement dans le navigateur. footballMarkets par défaut au premier lancement.
    function loadMarkets() {
      const defaults = ["1N2", "BTTS", "Over/Under", "Buteur", "Mi-Temps", "Autre"];
      try {
        const stored = JSON.parse(localStorage.getItem('pronotracker_customMarkets'));
        if (Array.isArray(stored) && stored.length > 0) return stored;
      } catch (e) {}
      return defaults;
    }

    function saveMarketsToStorage() {
      localStorage.setItem('pronotracker_customMarkets', JSON.stringify(footballMarkets));
      if (window.syncSchedule) window.syncSchedule();
    }

    let footballMarkets = loadMarkets();

    function openMarketManager() {
      renderMarketManagerList();
      document.getElementById('marketManagerModal').classList.remove('hidden');
    }

    function closeMarketManager() {
      document.getElementById('marketManagerModal').classList.add('hidden');
    }

    function renderMarketManagerList() {
      const container = document.getElementById('marketManagerList');
      if (!container) return;

      if (footballMarkets.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 italic">Aucun type de marché pour l'instant.</p>`;
        return;
      }

      container.innerHTML = footballMarkets.map(m => {
        const count = (state.football || []).filter(b => b.market === m).length;
        const safeName = m.replace(/'/g, "\\'");
        return `
          <div class="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span class="text-xs font-semibold text-slate-700">${escAttr(m)}${count > 0 ? ` <span class="text-slate-400 font-normal">(${count} pari${count > 1 ? 's' : ''})</span>` : ''}</span>
            <button onclick="deleteMarketType('${safeName}')" class="text-slate-400 hover:text-rose-600 transition" title="Supprimer ce type de marché"><i class="fa-solid fa-trash-can"></i></button>
          </div>`;
      }).join('');
    }

    function addMarketType() {
      const input = document.getElementById('newMarketNameInput');
      const raw = input.value.trim();
      if (!raw) return;

      const exists = footballMarkets.some(m => m.toLowerCase() === raw.toLowerCase());
      if (exists) {
        alert("⚠️ Ce type de marché existe déjà.");
        return;
      }

      footballMarkets.push(raw);
      saveMarketsToStorage();
      input.value = '';
      renderMarketManagerList();
      refreshMarketSelects();
    }

    function deleteMarketType(name) {
      if (footballMarkets.length <= 1) {
        alert("⚠️ Il doit rester au moins un type de marché.");
        return;
      }

      const usageCount = (state.football || []).filter(b => b.market === name).length;
      const msg = usageCount > 0
        ? `${usageCount} pari(s) existant(s) utilisent "${name}". Ils garderont cette valeur, mais elle ne sera plus proposée pour les prochains paris.\n\nSupprimer quand même ce type de marché ?`
        : `Supprimer le type de marché "${name}" ?`;
      if (!confirm(msg)) return;

      footballMarkets = footballMarkets.filter(m => m !== name);
      saveMarketsToStorage();
      renderMarketManagerList();
      refreshMarketSelects();
    }

    // Repeuple le select du formulaire d'ajout (le seul construit une seule fois au chargement)
    // puis relance un rendu complet pour que les selects d'édition (modal + inline) suivent aussi.
    function refreshMarketSelects() {
      const marketSelect = document.getElementById('marketInput');
      if (marketSelect) {
        const previousValue = marketSelect.value;
        marketSelect.innerHTML = footballMarkets.map(m => `<option value="${escAttr(m)}">${escAttr(m)}</option>`).join('');
        marketSelect.value = footballMarkets.includes(previousValue) ? previousValue : (footballMarkets[0] || '');
      }
      render();
    }

    document.getElementById('dateInput').value = new Date().toISOString().split('T')[0];

    function getOddsBracket(odds) {
      if (odds < 1.50) return '1.00 – 1.49';
      if (odds < 2.00) return '1.50 – 1.99';
      return '2.00 et +';
    }

    function normalizeMatchName(str) {
      if (!str) return '';
      return str.toLowerCase().replace(/vs|\-|\_/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function saveState() {
      localStorage.setItem('prono_tracker_multisport_data', JSON.stringify(state));
      populateCompFilterOptions();
      render();
      if (window.syncSchedule) window.syncSchedule();
    }

    function setCompFilterMode(mode) {
      compFilterMode = mode;
      localStorage.setItem('pronotracker_compFilterMode', mode);
      updateCompFilterModeButtons();
      render();
      renderGroupedStats();
    }

    function updateCompFilterModeButtons() {
      const activeClass = "bg-white text-slate-800 shadow-sm";
      const inactiveClass = "text-slate-500 hover:text-slate-800";
      const inc = document.getElementById('btnCompModeInclude');
      const exc = document.getElementById('btnCompModeExclude');
      if (inc) inc.className = `px-3 py-1 rounded-lg transition text-[11px] font-bold whitespace-nowrap ${compFilterMode === 'include' ? activeClass : inactiveClass}`;
      if (exc) exc.className = `px-3 py-1 rounded-lg transition text-[11px] font-bold whitespace-nowrap ${compFilterMode === 'exclude' ? activeClass : inactiveClass}`;
    }

    function resetCompFilters() {
      currentCompFilters = new Set();
      saveCompFiltersToStorage();
      render();
      renderGroupedStats();
    }

    function applyTheme() {
      const theme = {
        main: 'var(--acc)', mainHover: 'color-mix(in srgb, var(--acc) 85%, #000)', iconColor: 'var(--blue)',
        cardBg: 'color-mix(in srgb, var(--blue) 8%, transparent)', cardBorder: 'color-mix(in srgb, var(--blue) 25%, transparent)', dividerBorder: 'color-mix(in srgb, var(--blue) 18%, transparent)',
        badgeBg: 'var(--acc)',
        boxFrom: 'color-mix(in srgb, var(--blue) 11%, transparent)', boxTo: 'color-mix(in srgb, var(--blue) 5%, transparent)', boxBorder: 'color-mix(in srgb, var(--blue) 28%, transparent)', boxText: 'var(--blue)', boxHint: 'var(--mut)',
        shadowRgb: '37, 99, 235'
      };

      const setStyle = (id, styles) => {
        const el = document.getElementById(id);
        if (!el) return;
        Object.assign(el.style, styles);
      };

      setStyle('perfIcon', { color: theme.iconColor });
      setStyle('perfCard', { backgroundColor: theme.cardBg, borderColor: theme.cardBorder });
      setStyle('perfDivider', { borderColor: theme.dividerBorder });
      setStyle('detailedStatsTitle', { color: theme.iconColor });
      setStyle('quickAddBox', { backgroundImage: `linear-gradient(to bottom right, ${theme.boxFrom}, ${theme.boxTo})`, borderColor: theme.boxBorder });
      setStyle('quickAddLabel', { color: theme.boxText });
      setStyle('quickAddHint', { color: theme.boxHint });
      setStyle('quickAddBtn', { backgroundColor: theme.main, color: 'var(--onacc)', boxShadow: `0 4px 10px rgba(${theme.shadowRgb}, 0.25)` });

      const btn = document.getElementById('quickAddBtn');
      if (btn) {
        btn.onmouseenter = () => { btn.style.backgroundColor = theme.mainHover; };
        btn.onmouseleave = () => { btn.style.backgroundColor = theme.main; };
      }
    }

    // ===================== ANALYSEUR DE PARIS (intégré au tracker) =====================

    let dernierRapportTexte = "";

    function echapper(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function fmt(v) { return (v === null || v === undefined) ? '—' : v + '%'; }
    // Réduction appliquée aux cotes du tableau des paris (4,88 %), pour retrouver la cote réellement
    // obtenue. La cote ajustée est arrondie à 2 décimales : ce qui est affiché est ce qui est enregistré.
    const REDUCTION_COTE_PCT = 4.88;
    function coteAjustee(v) {
        if (v === null || v === undefined || isNaN(v)) return v;
        return Math.round(v * (1 - REDUCTION_COTE_PCT / 100) * 100) / 100;
    }
    function fmtCote(v) { return (v === null || v === undefined) ? '—' : v.toFixed(2).replace('.', ','); }

    function directionLabel(cle) {
        const m = cle.match(/^(over|under)([\d.]+)$/);
        if (!m) return cle;
        const dir = m[1] === 'over' ? 'Plus de' : 'Moins de';
        const val = m[2].replace('.', ',');
        return `${dir} ${val} but(s)`;
    }

    // Compétitions connues (les coupes européennes d'abord, car un texte sur un match de C1
    // peut aussi citer la Ligue 1 pour la forme domestique d'une équipe).
    const LIGUES_CONNUES = [
        [/ligue\s+des\s+champions|champions\s+league/i, 'Ligue des Champions'],
        [/europa\s+conf[ée]rence\s+league|conf[ée]rence\s+league|ligue\s+conf[ée]rence|ligue\s+europa\s+conf[ée]rence/i, 'Ligue Conférence'],
        [/europa\s+league|ligue\s+europa/i, 'Europa League'],
        [/premier\s+league/i, 'Premier League'],
        [/la\s?liga|primera\s+divisi[oó]n/i, 'La Liga'],
        [/serie\s+a\b/i, 'Serie A'],
        [/bundesliga/i, 'Bundesliga'],
        [/ligue\s+1\b/i, 'Ligue 1'],
        [/ligue\s+2\b/i, 'Ligue 2'],
        [/eredivisie/i, 'Eredivisie'],
        [/primeira\s+liga|liga\s+portugal/i, 'Primeira Liga'],
        [/jupiler\s+pro\s+league/i, 'Jupiler Pro League'],
        [/s[üu]per\s+lig/i, 'Süper Lig'],
    ];

    // Si la compétition existe déjà dans le tracker (à la casse près), on reprend EXACTEMENT
    // l'orthographe déjà utilisée, pour ne pas créer de doublons dans les stats par championnat.
    function alignerSurCompetitionExistante(nom) {
        if (!nom) return nom;
        const existantes = Array.from(new Set((state.football || []).map(b => (b.comp || '').trim()).filter(Boolean)));
        const trouvee = existantes.find(c => c.toLowerCase() === nom.toLowerCase());
        return trouvee || nom;
    }

    function normaliserCompetition(brut) {
        for (const [re, nom] of LIGUES_CONNUES) {
            if (re.test(brut)) return alignerSurCompetitionExistante(nom);
        }
        return alignerSurCompetitionExistante(brut.trim());
    }

    // Devine la compétition d'après l'historique : cherche les paris déjà enregistrés où
    // apparaissent ces équipes. Priorité à une compétition commune aux deux équipes.
    function devinerCompetitionParEquipes(home, away) {
        if (!home || !away || typeof scMemeEquipe !== 'function') return null;
        const cH = {}, cA = {};
        (state.football || []).forEach(b => {
            const comp = (b.comp || '').trim();
            if (!comp || !b.match) return;
            const parts = String(b.match).split(/\s+(?:vs\.?|v|-|–|—)\s+/i);
            parts.forEach(nom => {
                if (scMemeEquipe(nom, home)) cH[comp] = (cH[comp] || 0) + 1;
                if (scMemeEquipe(nom, away)) cA[comp] = (cA[comp] || 0) + 1;
            });
        });
        const communes = Object.keys(cH).filter(c => cA[c]);
        if (communes.length) {
            communes.sort((a, b) => Math.min(cH[b], cA[b]) - Math.min(cH[a], cA[a]) || (cH[b] + cA[b]) - (cH[a] + cA[a]));
            return communes[0];
        }
        const tous = Object.assign({}, cH);
        Object.keys(cA).forEach(c => { tous[c] = (tous[c] || 0) + cA[c]; });
        const cles = Object.keys(tous).sort((a, b) => tous[b] - tous[a]);
        return cles.length ? cles[0] : null;
    }

    function extraireCompetition(texte, home, away) {
        // 1) Compétition explicitement étiquetée ("Compétition : ...", "League: ...", "Championnat : ...")
        let m = texte.match(/(?:Comp[ée]tition|Championnat|League|Tournament|Tournoi)\s*:\s*([^.\n|]+)/i);
        if (m && m[1].trim()) return normaliserCompetition(m[1].trim());

        // 2) Compétition connue citée dans le texte
        for (const [re, nom] of LIGUES_CONNUES) {
            if (re.test(texte)) return alignerSurCompetitionExistante(nom);
        }

        // 3) Compétition déjà utilisée dans le tracker (ex: une compétition personnalisée)
        const existantes = Array.from(new Set((state.football || []).map(b => (b.comp || '').trim()).filter(c => c.length >= 4)));
        existantes.sort((a, b) => b.length - a.length);
        const low = texte.toLowerCase();
        const trouvee = existantes.find(c => low.includes(c.toLowerCase()));
        if (trouvee) return trouvee;

        // 4) Déduction par les équipes, d'après les paris déjà enregistrés
        return devinerCompetitionParEquipes(home, away);
    }

    // Renvoie le nom du marché tel qu'il existe dans la liste déroulante du tracker
    // (footballMarkets : 1N2, BTTS, Over/Under, Buteur, Mi-Temps, Double Chance, + types ajoutés).
    function marcheDisponible(nom) {
        const trouve = footballMarkets.find(x => x.toLowerCase() === nom.toLowerCase());
        if (trouve) return trouve;
        const autre = footballMarkets.find(x => x.toLowerCase() === 'autre');
        return autre || nom;
    }

    // Traduit un candidat de l'Analyseur en (marché du tracker, pronostic au format du tracker).
    // Les pronostics reprennent les mêmes libellés que les suggestions du formulaire d'ajout :
    //   1N2        -> "Équipe A" / "Match nul" / "Équipe B"
    //   Mi-Temps   -> "Victoire Équipe A (MT)" / "Nul (MT)" / "Victoire Équipe B (MT)"
    //   Over/Under -> "Plus de 2.5 buts" / "Moins de 2.5 buts"
    //   BTTS       -> "Les deux équipes marquent" / "Une équipe ne marque pas"
    function separerMarchePronostic(label, home, away) {
        if (label === 'Match nul à la mi-temps') return { marche: marcheDisponible('Mi-Temps'), pronostic: 'Nul (MT)' };
        if (label === 'Match nul au score final') return { marche: marcheDisponible('1N2'), pronostic: 'Match nul' };
        if (label === `${home} gagne la 1ère mi-temps`) return { marche: marcheDisponible('Mi-Temps'), pronostic: `Victoire ${home} (MT)` };
        if (label === `${away} gagne la 1ère mi-temps`) return { marche: marcheDisponible('Mi-Temps'), pronostic: `Victoire ${away} (MT)` };
        if (label === `${home} gagne le match`) return { marche: marcheDisponible('1N2'), pronostic: home };
        if (label === `${away} gagne le match`) return { marche: marcheDisponible('1N2'), pronostic: away };
        let m = label.match(/^(Plus de|Moins de) ([\d,]+) but\(s\) en 1ère mi-temps$/);
        if (m) return { marche: marcheDisponible('Mi-Temps'), pronostic: `${m[1]} ${m[2].replace(',', '.')} buts en 1ère MT` };
        m = label.match(/^(Plus de|Moins de) ([\d,]+) but\(s\) sur le match complet$/);
        if (m) return { marche: marcheDisponible('Over/Under'), pronostic: `${m[1]} ${m[2].replace(',', '.')} buts` };
        if (label.includes('BTTS oui')) return { marche: marcheDisponible('BTTS'), pronostic: 'Les deux équipes marquent' };
        if (label.includes('BTTS non')) return { marche: marcheDisponible('BTTS'), pronostic: 'Une équipe ne marque pas' };
        return { marche: marcheDisponible('Autre'), pronostic: label };
    }

    // Règle : dès que le pronostic contient "MT" (mi-temps), le marché est forcément Mi-Temps.
    function marcheSelonPronostic(marche, pronostic) {
        return /\bMT\b/i.test(pronostic || '') ? marcheDisponible('Mi-Temps') : marche;
    }

    // Appelée quand on modifie le pronostic dans le tableau : bascule le marché sur Mi-Temps si besoin.
    function majMarcheDepuisPronostic(i) {
        const prono = document.getElementById(`prono-${i}`);
        const sel = document.getElementById(`marche-${i}`);
        if (!prono || !sel) return;
        const cible = marcheSelonPronostic(sel.value, prono.value);
        if (cible !== sel.value && Array.from(sel.options).some(o => o.value === cible)) sel.value = cible;
    }

    // Lit les valeurs (éventuellement corrigées à la main) d'une ligne du tableau de l'Analyseur.
    function lireLigneAnalyseur(i) {
        const donnees = window._donneesTableau;
        if (!donnees || !donnees.lignesTableau[i]) return null;
        const l = donnees.lignesTableau[i];
        const val = (id, repli) => {
            const el = document.getElementById(`${id}-${i}`);
            return el ? el.value.trim() : repli;
        };
        let mise = val('mise', '');
        if (!(parseFloat(mise.replace(',', '.')) > 0)) mise = '1';
        return {
            comp: val('comp', donnees.nomCompetition === 'Non spécifiée' ? '' : donnees.nomCompetition),
            marche: marcheSelonPronostic(val('marche', l.marche), val('prono', l.pronostic)),
            pronostic: val('prono', l.pronostic),
            cote: l.cote,
            mise: mise
        };
    }

    function extraireEquipes(texte) {
        let home = null, away = null;

        let m = texte.match(/The home team is ([^.]+)\./i);
        if (m) home = m[1].trim();
        m = texte.match(/The away team is ([^.]+)\./i);
        if (m) away = m[1].trim();

        if (!home) {
            m = texte.match(/L['’]équipe (?:à domicile|recevante|hôte) est ([^.]+)\./i);
            if (m) home = m[1].trim();
        }
        if (!away) {
            m = texte.match(/L['’]équipe (?:à l['’]extérieur|visiteuse) est ([^.]+)\./i);
            if (m) away = m[1].trim();
        }

        if (!home || !away) {
            m = texte.match(/Match\s*:\s*([^.]+?)\s+(?:vs\.?|contre)\s+([^.]+)\./i) ||
                texte.match(/([A-ZÀ-Ý][\wà-ÿ'\- ]+?)\s+(?:vs\.?|contre)\s+([A-ZÀ-Ý][\wà-ÿ'\- ]+)/);
            if (m) { home = home || m[1].trim(); away = away || m[2].trim(); }
        }
        return { home, away };
    }

    function parseResultatsEquipe(texte, team) {
        const t = echapper(team);
        const verbMapEN = { won: 'win', drew: 'draw', lost: 'loss' };
        const res = {
            home: { win: null, draw: null, loss: null },
            away: { win: null, draw: null, loss: null },
            homeFT: { win: null, draw: null, loss: null },
            awayFT: { win: null, draw: null, loss: null },
        };

        function collectEN(regexStr, obj) {
            const re = new RegExp(regexStr, 'gi');
            let m;
            while ((m = re.exec(texte))) obj[verbMapEN[m[1].toLowerCase()]] = parseInt(m[2], 10);
        }
        collectEN(`In ${t}'s home matches this season, ${t} (won|drew|lost) the first half in (\\d+)% of matches`, res.home);
        collectEN(`In ${t}'s away matches this season, ${t} (won|drew|lost) the first half in (\\d+)% of matches`, res.away);
        collectEN(`In ${t}'s home matches this season, ${t} (won|drew|lost) at full time in (\\d+)% of matches`, res.homeFT);
        collectEN(`In ${t}'s away matches this season, ${t} (won|drew|lost) at full time in (\\d+)% of matches`, res.awayFT);

        const verbeFR = '(a gagné|remporte|a remporté|gagne|a fait match nul|fait match nul|a été tenu en échec|a perdu|perd)';
        function verbeVersCleFR(v) {
            v = v.toLowerCase();
            if (v.includes('nul') || v.includes('tenu en échec')) return 'draw';
            if (v.includes('perd')) return 'loss';
            return 'win';
        }
        function collectFR(scopeStr, periodeStr, obj) {
            const re = new RegExp(`${scopeStr},\\s*${t} ${verbeFR} ${periodeStr} dans (\\d+)\\s?% des (?:matchs|cas)`, 'gi');
            let m;
            while ((m = re.exec(texte))) obj[verbeVersCleFR(m[1])] = parseInt(m[2], 10);
        }
        const scopeDomicileFR = `Dans les matchs (?:à domicile|domicile) de ${t}(?: cette saison)?`;
        const scopeExterieurFR = `Dans les matchs (?:à l['’]extérieur|extérieur) de ${t}(?: cette saison)?`;
        collectFR(scopeDomicileFR, 'la première mi-temps', res.home);
        collectFR(scopeExterieurFR, 'la première mi-temps', res.away);
        collectFR(scopeDomicileFR, '(?:le match|à la fin du match)', res.homeFT);
        collectFR(scopeExterieurFR, '(?:le match|à la fin du match)', res.awayFT);

        return res;
    }

    function parseButsEquipe(texte, team) {
        const t = echapper(team);
        const data = { home1H: {}, away1H: {}, homeFT: {}, awayFT: {} };

        function collectEN(regexStr, obj) {
            const re = new RegExp(regexStr, 'gi');
            let m;
            while ((m = re.exec(texte))) obj[`${m[1].toLowerCase()}${m[2]}`] = parseInt(m[3], 10);
        }
        collectEN(`In ${t}'s home matches this season, total first-half goals were (over|under) ([\\d.]+) in (\\d+)% of matches`, data.home1H);
        collectEN(`In ${t}'s away matches this season, total first-half goals were (over|under) ([\\d.]+) in (\\d+)% of matches`, data.away1H);
        collectEN(`In ${t}'s home matches this season, total match goals at full time were (over|under) ([\\d.]+) in (\\d+)% of matches`, data.homeFT);
        collectEN(`In ${t}'s away matches this season, total match goals at full time were (over|under) ([\\d.]+) in (\\d+)% of matches`, data.awayFT);

        function collectFR(scopeStr, sujetStr, obj) {
            const re = new RegExp(`${scopeStr},\\s*${sujetStr} était (supérieur|inférieur) à ([\\d.,]+) dans (\\d+)\\s?% des (?:matchs|cas)`, 'gi');
            let m;
            while ((m = re.exec(texte))) {
                const dir = m[1].toLowerCase() === 'supérieur' ? 'over' : 'under';
                const seuil = m[2].replace(',', '.');
                obj[`${dir}${seuil}`] = parseInt(m[3], 10);
            }
        }
        const scopeDomicileFR = `Dans les matchs (?:à domicile|domicile) de ${t}(?: cette saison)?`;
        const scopeExterieurFR = `Dans les matchs (?:à l['’]extérieur|extérieur) de ${t}(?: cette saison)?`;
        collectFR(scopeDomicileFR, 'le total de buts en première mi-temps', data.home1H);
        collectFR(scopeExterieurFR, 'le total de buts en première mi-temps', data.away1H);
        collectFR(scopeDomicileFR, 'le total de buts du match', data.homeFT);
        collectFR(scopeExterieurFR, 'le total de buts du match', data.awayFT);

        return data;
    }

    function parseBTTSEquipe(texte, team) {
        const t = echapper(team);
        const data = { home: {}, away: {} };

        function collectScopeEN(scope, obj) {
            let m = texte.match(new RegExp(`${scope}, both teams scored at full time in (\\d+)% of matches`, 'i'));
            if (m) obj.both = parseInt(m[1], 10);
            m = texte.match(new RegExp(`${scope}, at least one team failed to score at full time in (\\d+)% of matches`, 'i'));
            if (m) obj.fail = parseInt(m[1], 10);
        }
        collectScopeEN(`In ${t}'s home matches this season`, data.home);
        collectScopeEN(`In ${t}'s away matches this season`, data.away);

        function collectScopeFR(scope, obj) {
            let m = texte.match(new RegExp(`${scope},\\s*les deux équipes ont marqué dans (\\d+)\\s?% des (?:matchs|cas)`, 'i'));
            if (m) obj.both = parseInt(m[1], 10);
            m = texte.match(new RegExp(`${scope},\\s*au moins une équipe n['’]a pas marqué dans (\\d+)\\s?% des (?:matchs|cas)`, 'i'));
            if (m) obj.fail = parseInt(m[1], 10);
        }
        collectScopeFR(`Dans les matchs (?:à domicile|domicile) de ${t}(?: cette saison)?`, data.home);
        collectScopeFR(`Dans les matchs (?:à l['’]extérieur|extérieur) de ${t}(?: cette saison)?`, data.away);

        return data;
    }

    function parseCotes(texte, home, away) {
        const cotes = {};
        const th = echapper(home || '§§§');
        const ta = echapper(away || '§§§');
        let m;

        m = texte.match(new RegExp(`The odds for ${th} to win the first half are ([\\d.]+)`, 'i'));
        if (m) cotes.home_win_1H = parseFloat(m[1]);
        m = texte.match(new RegExp(`The odds for ${ta} to win the first half are ([\\d.]+)`, 'i'));
        if (m) cotes.away_win_1H = parseFloat(m[1]);
        m = texte.match(/The odds for a draw in the first half are ([\d.]+)/i);
        if (m) cotes.draw_1H = parseFloat(m[1]);
        m = texte.match(new RegExp(`The odds for ${th} to win at full time are ([\\d.]+)`, 'i'));
        if (m) cotes.home_win_FT = parseFloat(m[1]);
        m = texte.match(new RegExp(`The odds for ${ta} to win at full time are ([\\d.]+)`, 'i'));
        if (m) cotes.away_win_FT = parseFloat(m[1]);
        m = texte.match(/The odds for a draw at full time are ([\d.]+)/i);
        if (m) cotes.draw_FT = parseFloat(m[1]);
        let re = /The odds for the total first-half goals to be (over|under) ([\d.]+) are ([\d.]+)/gi;
        while ((m = re.exec(texte))) cotes[`${m[1].toLowerCase()}${m[2]}_1H`] = parseFloat(m[3]);
        re = /The odds for the total match goals at full time to be (over|under) ([\d.]+) are ([\d.]+)/gi;
        while ((m = re.exec(texte))) cotes[`${m[1].toLowerCase()}${m[2]}_FT`] = parseFloat(m[3]);
        m = texte.match(/The odds for both teams to score at full time are ([\d.]+)/i);
        if (m) cotes.btts_yes = parseFloat(m[1]);
        m = texte.match(/The odds for at least one team to fail to score at full time are ([\d.]+)/i);
        if (m) cotes.btts_no = parseFloat(m[1]);

        function siVide(cle, val) { if (cotes[cle] === undefined) cotes[cle] = val; }

        m = texte.match(new RegExp(`(?:La |Les )?cotes? pour que ${th} gagne la première mi-temps (?:est|sont) de ([\\d.,]+)`, 'i'));
        if (m) siVide('home_win_1H', parseFloat(m[1].replace(',', '.')));
        m = texte.match(new RegExp(`(?:La |Les )?cotes? pour que ${ta} gagne la première mi-temps (?:est|sont) de ([\\d.,]+)`, 'i'));
        if (m) siVide('away_win_1H', parseFloat(m[1].replace(',', '.')));
        m = texte.match(/(?:La |Les )?cotes? pour un match nul en première mi-temps (?:est|sont) de ([\d.,]+)/i);
        if (m) siVide('draw_1H', parseFloat(m[1].replace(',', '.')));
        m = texte.match(new RegExp(`(?:La |Les )?cotes? pour que ${th} gagne le match (?:est|sont) de ([\\d.,]+)`, 'i'));
        if (m) siVide('home_win_FT', parseFloat(m[1].replace(',', '.')));
        m = texte.match(new RegExp(`(?:La |Les )?cotes? pour que ${ta} gagne le match (?:est|sont) de ([\\d.,]+)`, 'i'));
        if (m) siVide('away_win_FT', parseFloat(m[1].replace(',', '.')));
        m = texte.match(/(?:La |Les )?cotes? pour un match nul au score final (?:est|sont) de ([\d.,]+)/i);
        if (m) siVide('draw_FT', parseFloat(m[1].replace(',', '.')));

        re = /cotes? pour que le total de buts en première mi-temps soit (supérieur|inférieur) à ([\d.,]+) (?:est|sont) de ([\d.,]+)/gi;
        while ((m = re.exec(texte))) {
            const dir = m[1].toLowerCase() === 'supérieur' ? 'over' : 'under';
            siVide(`${dir}${m[2].replace(',', '.')}_1H`, parseFloat(m[3].replace(',', '.')));
        }
        re = /cotes? pour que le total de buts du match soit (supérieur|inférieur) à ([\d.,]+) (?:est|sont) de ([\d.,]+)/gi;
        while ((m = re.exec(texte))) {
            const dir = m[1].toLowerCase() === 'supérieur' ? 'over' : 'under';
            siVide(`${dir}${m[2].replace(',', '.')}_FT`, parseFloat(m[3].replace(',', '.')));
        }
        m = texte.match(/cotes? pour que les deux équipes marquent (?:est|sont) de ([\d.,]+)/i);
        if (m) siVide('btts_yes', parseFloat(m[1].replace(',', '.')));
        m = texte.match(/cotes? pour qu['’]au moins une équipe ne marque pas (?:est|sont) de ([\d.,]+)/i);
        if (m) siVide('btts_no', parseFloat(m[1].replace(',', '.')));

        return cotes;
    }

    const MARQUEURS_INSTRUCTION = [
        'act as a', 'analyze this football match', 'be practical', 'focus on value',
        'never overstate', 'first, search the web', 'you must actively search',
        'for fresh external factors, focus only', 'do not infer', 'do not use rankings',
        'do not invent context', 'if an important external factor', 'mention the source type',
        'separate clearly', 'when a super stat is mentioned', 'then combine those fresh',
        'explain the strongest combined', 'clearly separate', 'the final answer must be written',
        'keep the analysis detailed', 'if recent external factors and datafoot',
        'do not use rankings, historical averages',
        'agis comme un', 'analyse ce match de football', 'sois pratique', 'concentre-toi sur la valeur',
        'ne surestime jamais', 'cherche d\u2019abord sur le web', 'tu dois activement rechercher',
        'mentionne le type de source', 's\u00e9pare clairement', 'la r\u00e9ponse finale doit \u00eatre r\u00e9dig\u00e9e',
    ];

    function estUneInstruction(phrase) {
        const p = phrase.toLowerCase();
        return MARQUEURS_INSTRUCTION.some(marqueur => p.includes(marqueur));
    }

    function extraireFacteursExternes(texte) {
        const mots = [
            'forfait', 'blessure', 'blessé', 'incertain', 'entraîneur', 'entraineur',
            'conférence', 'absent', 'suspendu', 'suspension', 'infirmerie',
            'injury', 'injured', 'doubtful', 'uncertain', 'unavailable', 'sidelined',
            'suspended', 'suspension', 'coach', 'press conference', 'absent', 'ruled out',
        ];
        const sentences = texte.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
        return sentences.filter(s => !estUneInstruction(s) && mots.some(mot => s.toLowerCase().includes(mot)));
    }

    function genererCandidats(home, away, resHome, resAway, butsHome, butsAway, bttsHome, bttsAway, cotes) {
        const candidats = [];

        function ajouter(label, pctA, pctB, cote, detail) {
            if (pctA == null && pctB == null) return;
            if (cote == null) return;
            let score, spread, nbSources;
            if (pctA != null && pctB != null) {
                score = (pctA + pctB) / 2;
                spread = Math.abs(pctA - pctB);
                nbSources = 2;
            } else {
                score = pctA != null ? pctA : pctB;
                spread = null;
                nbSources = 1;
            }
            const finalScore = nbSources === 2 ? (score - spread * 0.5) : (score - 15);
            candidats.push({ label, score, spread, nbSources, cote, detail, finalScore, conflit: nbSources === 2 && spread >= 60 });
        }

        ajouter(`${home} gagne la 1ère mi-temps`, resHome.home.win, resAway.away.loss, cotes.home_win_1H,
            `${home} (domicile) gagne sa 1ère MT ${fmt(resHome.home.win)} du temps · ${away} (extérieur) perd sa 1ère MT ${fmt(resAway.away.loss)} du temps`);
        ajouter(`Match nul à la mi-temps`, resHome.home.draw, resAway.away.draw, cotes.draw_1H,
            `${home} (domicile) nul en 1ère MT ${fmt(resHome.home.draw)} du temps · ${away} (extérieur) nul en 1ère MT ${fmt(resAway.away.draw)} du temps`);
        ajouter(`${away} gagne la 1ère mi-temps`, resHome.home.loss, resAway.away.win, cotes.away_win_1H,
            `${home} (domicile) perd sa 1ère MT ${fmt(resHome.home.loss)} du temps · ${away} (extérieur) gagne sa 1ère MT ${fmt(resAway.away.win)} du temps`);

        ajouter(`${home} gagne le match`, resHome.homeFT.win, resAway.awayFT.loss, cotes.home_win_FT,
            `${home} (domicile) gagne ${fmt(resHome.homeFT.win)} du temps · ${away} (extérieur) perd ${fmt(resAway.awayFT.loss)} du temps`);
        ajouter(`Match nul au score final`, resHome.homeFT.draw, resAway.awayFT.draw, cotes.draw_FT,
            `${home} (domicile) nul ${fmt(resHome.homeFT.draw)} du temps · ${away} (extérieur) nul ${fmt(resAway.awayFT.draw)} du temps`);
        ajouter(`${away} gagne le match`, resHome.homeFT.loss, resAway.awayFT.win, cotes.away_win_FT,
            `${home} (domicile) perd ${fmt(resHome.homeFT.loss)} du temps · ${away} (extérieur) gagne ${fmt(resAway.awayFT.win)} du temps`);

        const seuils1H = new Set([...Object.keys(butsHome.home1H), ...Object.keys(butsAway.away1H)]);
        seuils1H.forEach(cle => {
            ajouter(`${directionLabel(cle)} en 1ère mi-temps`, butsHome.home1H[cle], butsAway.away1H[cle], cotes[`${cle}_1H`],
                `${home} (domicile) ${fmt(butsHome.home1H[cle])} · ${away} (extérieur) ${fmt(butsAway.away1H[cle])}`);
        });

        const seuilsFT = new Set([...Object.keys(butsHome.homeFT), ...Object.keys(butsAway.awayFT)]);
        seuilsFT.forEach(cle => {
            ajouter(`${directionLabel(cle)} sur le match complet`, butsHome.homeFT[cle], butsAway.awayFT[cle], cotes[`${cle}_FT`],
                `${home} (domicile) ${fmt(butsHome.homeFT[cle])} · ${away} (extérieur) ${fmt(butsAway.awayFT[cle])}`);
        });

        ajouter(`Les deux équipes marquent (BTTS oui)`, bttsHome.home.both, bttsAway.away.both, cotes.btts_yes,
            `${home} (domicile) BTTS ${fmt(bttsHome.home.both)} · ${away} (extérieur) BTTS ${fmt(bttsAway.away.both)}`);
        ajouter(`Au moins une équipe ne marque pas (BTTS non)`, bttsHome.home.fail, bttsAway.away.fail, cotes.btts_no,
            `${home} (domicile) ${fmt(bttsHome.home.fail)} · ${away} (extérieur) ${fmt(bttsAway.away.fail)}`);

        return candidats;
    }

    // Repli quand le texte ne contient QUE des cotes (aucun % par équipe) : on classe les options
    // d'après la probabilité implicite des cotes, marge du bookmaker retirée. Aucune "valeur"
    // n'est calculée (pas de statistiques) : c'est seulement un classement du plus probable
    // selon le marché, en ignorant les cotes trop basses pour être intéressantes (< 1,40).
    function genererCandidatsCotesSeules(home, away, cotes) {
        const defs = [];
        const add = (label, cle, groupe) => { if (cotes[cle] != null) defs.push({ label, cle, groupe }); };
        add(`${home} gagne la 1ère mi-temps`, 'home_win_1H', '1H');
        add('Match nul à la mi-temps', 'draw_1H', '1H');
        add(`${away} gagne la 1ère mi-temps`, 'away_win_1H', '1H');
        add(`${home} gagne le match`, 'home_win_FT', 'FT');
        add('Match nul au score final', 'draw_FT', 'FT');
        add(`${away} gagne le match`, 'away_win_FT', 'FT');
        Object.keys(cotes).forEach(cle => {
            const m = cle.match(/^(over|under)([\d.]+)_(1H|FT)$/);
            if (!m) return;
            const lib = directionLabel(m[1] + m[2]) + (m[3] === '1H' ? ' en 1ère mi-temps' : ' sur le match complet');
            add(lib, cle, 'OU_' + m[3] + '_' + m[2]);
        });
        add('Les deux équipes marquent (BTTS oui)', 'btts_yes', 'BTTS');
        add('Au moins une équipe ne marque pas (BTTS non)', 'btts_no', 'BTTS');

        const somme = {}, nb = {};
        defs.forEach(d => { somme[d.groupe] = (somme[d.groupe] || 0) + 1 / cotes[d.cle]; nb[d.groupe] = (nb[d.groupe] || 0) + 1; });
        const res = [];
        defs.forEach(d => {
            const cote = cotes[d.cle];
            // Groupe complet (1N2 : 3 issues, O/U et BTTS : 2 issues) -> marge retirée ; sinon cote brute.
            const complet = (d.groupe === '1H' || d.groupe === 'FT') ? nb[d.groupe] === 3 : nb[d.groupe] === 2;
            const proba = (complet ? (1 / cote) / somme[d.groupe] : 1 / cote) * 100;
            if (cote < 1.40) return;
            res.push({ label: d.label, score: proba, spread: null, nbSources: 1, cote, cotesSeules: true,
                finalScore: proba - 15, conflit: false,
                detail: `Probabilité implicite des cotes ≈ ${Math.round(proba)} % (marge du bookmaker retirée${complet ? '' : ' impossible : marché incomplet'}). Aucune statistique en % fournie dans le texte.` });
        });
        return res;
    }

    // Convertit une date extraite du texte (formats variés) vers le format YYYY-MM-DD attendu
    // par le tracker. Repli sur la date du jour si le format n'est pas reconnu.
    function normalizeDateAnalyseur(str) {
        if (!str) return new Date().toISOString().split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
        const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) {
            const [, d, mo, y] = m;
            return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return new Date().toISOString().split('T')[0];
    }

    function analyserEtGenerer() {
        const rawText = document.getElementById('rawInput').value;
        if (!rawText.trim()) { alert("Veuillez coller du texte."); return; }

        let matchName = "Match de Football";
        let mm = rawText.match(/Match\s*:\s*([^.]+)\./i);
        if (mm) matchName = mm[1].trim();

        let matchDate = "Date non spécifiée";
        let md = rawText.match(/Date\s*:\s*([0-9\-\/]+)/i);
        if (md) matchDate = md[1].trim();

        const { home, away } = extraireEquipes(rawText);
        const facteursExternes = extraireFacteursExternes(rawText);
        const competition = extraireCompetition(rawText, home, away);

        let html = `<h3>Fiche de Match : ${matchName}<span class="badge">${matchDate}</span></h3>`;

        html += `<h3>1. Facteurs Externes & Infirmerie</h3><ul>`;
        if (facteursExternes.length) {
            facteursExternes.forEach(p => html += `<li>${p}</li>`);
        } else {
            html += `<li class="aucune-donnee">Aucun facteur externe critique isolé dans le texte fourni.</li>`;
        }
        html += `</ul>`;

        let candidats = [];
        if (home && away) {
            const resHome = parseResultatsEquipe(rawText, home);
            const resAway = parseResultatsEquipe(rawText, away);
            const butsHome = parseButsEquipe(rawText, home);
            const butsAway = parseButsEquipe(rawText, away);
            const bttsHome = parseBTTSEquipe(rawText, home);
            const bttsAway = parseBTTSEquipe(rawText, away);
            const cotes = parseCotes(rawText, home, away);

            candidats = genererCandidats(home, away, resHome, resAway, butsHome, butsAway, bttsHome, bttsAway, cotes);
            if (candidats.length === 0) candidats = genererCandidatsCotesSeules(home, away, cotes);
            candidats.sort((a, b) => (b.finalScore - a.finalScore) || (b.cote - a.cote));
        }

        html += `<h3>2. Paris calculés à partir des cotes et statistiques</h3>`;

        if (!home || !away) {
            html += `<p class="aucune-donnee">Impossible de calculer des paris : je n'ai pas trouvé les noms des deux équipes ("The home team is..." / "L'équipe à domicile est..."). Ce moteur fonctionne avec des textes structurés type Datafoot (cotes + statistiques en %), en français ou en anglais.</p>`;
        } else if (candidats.length === 0) {
            html += `<p class="aucune-donnee">Aucune cote ou statistique chiffrée exploitable trouvée pour ${home} / ${away}.</p>`;
        } else {
            const top3 = candidats.slice(0, 3);
            top3.forEach((c, i) => {
                html += `
                <div class="bet-card ${c.conflit ? 'conflit' : ''}">
                    <div class="bet-title">Option ${i + 1} : ${c.label} (cote ${fmtCote(c.cote)})</div>
                    <div class="bet-meta">Score de fiabilité calculé : ${Math.round(c.finalScore)}/100 ${c.cotesSeules ? '· d\'après les cotes seules (pas de statistiques), à confirmer' : c.nbSources === 1 ? '· une seule source de données, à confirmer' : ''} ${c.conflit ? '· ⚠️ signaux domicile/extérieur contradictoires' : ''}</div>
                    <p><strong>Détail :</strong> ${c.detail}</p>
                </div>`;
            });
        }

        html += `<div class="avertissement">Ces suggestions sont calculées par des règles mathématiques simples (moyenne et cohérence des % domicile/extérieur des deux équipes, croisés avec les cotes fournies) — ce n'est pas de l'intelligence artificielle et cela ne remplace pas un vrai jugement. Les pourcentages reposent souvent sur très peu de matchs cette saison : un score de 100% peut venir d'un seul match. Les paris sportifs comportent un risque financier et aucune méthode ne garantit un résultat.</div>`;

        const nomMatch = (home && away) ? `${home} vs ${away}` : matchName;
        const nomCompetition = competition || 'Non spécifiée';
        let lignesTableau = [];

        if (candidats.length) {
            const top3 = candidats.slice(0, 3);
            html += `<h3>3. Tableau des paris</h3>`;
            html += `<table class="paris-table"><thead><tr>
                <th>Date</th><th>Match</th><th>Compétition</th><th>Marché</th><th>Pronostic</th><th>Mise</th><th>Cote</th><th></th>
            </tr></thead><tbody>`;
            top3.forEach((c, i) => {
                const { marche, pronostic } = separerMarchePronostic(c.label, home, away);
                const listeMarches = footballMarkets.includes(marche) ? footballMarkets : [...footballMarkets, marche];
                const marcheOptions = listeMarches.map(mk => `<option value="${escAttr(mk)}" ${mk === marche ? 'selected' : ''}>${escAttr(mk)}</option>`).join('');
                html += `<tr>
                    <td>${matchDate}</td><td>${nomMatch}</td>
                    <td class="edit-cell"><input type="text" id="comp-${i}" list="compDatalist" value="${escAttr(competition || '')}" placeholder="Compétition" style="width:130px;"></td>
                    <td class="edit-cell"><select id="marche-${i}">${marcheOptions}</select></td>
                    <td class="edit-cell"><input type="text" id="prono-${i}" value="${escAttr(pronostic)}" oninput="majMarcheDepuisPronostic(${i})" style="width:190px;"></td>
                    <td class="mise-cell"><input type="text" id="mise-${i}" value="1" placeholder="1"></td>
                    <td title="Cote d'origine ${fmtCote(c.cote)} − ${String(REDUCTION_COTE_PCT).replace('.', ',')} %">${fmtCote(coteAjustee(c.cote))}</td>
                    <td style="white-space: nowrap;">
                        <button class="copie-ligne-btn" onclick="enregistrerPariAnalyseur(${i})" style="flex:none; padding:6px 10px; font-size:12px; background-color: var(--a-success-color); margin-right: 4px;" title="Enregistre ce pari directement dans l'onglet Football de ton tracker">💾 Enregistrer</button>
                        <button class="secondaire copie-ligne-btn" onclick="copierLigne(${i})" style="flex:none; padding:6px 10px; font-size:12px;">Copier</button>
                        <span class="enregistrer-confirm" id="enregistre-confirm-${i}">✓ Enregistré dans Football</span>
                    </td>
                </tr>`;
                lignesTableau.push({ marche, pronostic, cote: fmtCote(coteAjustee(c.cote)) });
            });
            html += `</tbody></table>`;
            html += `<div class="boutons" style="margin-top: 12px;">
                <button class="secondaire" onclick="copierTableau()" style="flex: none; padding: 10px 18px;">Copier les 3 lignes</button>
                <span class="copie-confirm" id="copieConfirm">✓ Copié dans le presse-papiers</span>
            </div>`;
        }

        window._donneesTableau = { matchDate, nomMatch, nomCompetition, lignesTableau };

        dernierRapportTexte = genererRapportTexte(matchName, matchDate, facteursExternes, candidats, home, away, nomMatch, nomCompetition);

        document.getElementById('resultContent').innerHTML = html;
        document.getElementById('outputPanel').style.display = 'block';
    }

    function genererRapportTexte(matchName, matchDate, facteursExternes, candidats, home, away, nomMatch, nomCompetition) {
        let lignes = [];
        lignes.push("=".repeat(60));
        lignes.push(`FICHE DE MATCH : ${matchName} (${matchDate})`);
        lignes.push("=".repeat(60));
        lignes.push("");
        lignes.push("1. FACTEURS EXTERNES & INFIRMERIE");
        lignes.push("-".repeat(40));
        if (facteursExternes.length) {
            facteursExternes.forEach(p => lignes.push(`  - ${p}`));
        } else {
            lignes.push("  Aucun facteur externe critique isolé.");
        }
        lignes.push("");
        lignes.push("2. PARIS CALCULÉS");
        lignes.push("-".repeat(40));
        if (!home || !away) {
            lignes.push("  Équipes non détectées (format non reconnu).");
        } else if (!candidats.length) {
            lignes.push("  Aucune donnée chiffrée exploitable.");
        } else {
            candidats.slice(0, 3).forEach((c, i) => {
                lignes.push(`  Option ${i + 1} : ${c.label} (cote ${fmtCote(c.cote)}) — fiabilité ${Math.round(c.finalScore)}/100`);
                lignes.push(`    ${c.detail}`);
            });
            lignes.push("");
            lignes.push("3. TABLEAU DES PARIS");
            lignes.push("-".repeat(40));
            lignes.push("Date | Match | Compétition | Marché | Pronostic | [Mise] | Cote");
            candidats.slice(0, 3).forEach(c => {
                const { marche, pronostic } = separerMarchePronostic(c.label, home, away);
                lignes.push(`${matchDate} | ${nomMatch} | ${nomCompetition} | ${marche} | ${pronostic} | 1 | ${fmtCote(coteAjustee(c.cote))}`);
            });
        }
        lignes.push("");
        lignes.push("Calcul par règles mathématiques, pas une garantie de résultat. Paris = risque financier.");
        lignes.push(`Généré le ${new Date().toLocaleString('fr-FR')}`);
        return lignes.join("\n");
    }

    // Enregistre directement la ligne i dans le tracker (onglet Football), sans passer par le
    // presse-papiers. La mise est optionnelle (0 par défaut) et pourra être corrigée dans l'Historique.
    function enregistrerPariAnalyseur(i) {
        const donnees = window._donneesTableau;
        const l = lireLigneAnalyseur(i);
        if (!donnees || !l) return;

        const miseRaw = l.mise.replace(',', '.');
        const miseVal = parseFloat(miseRaw) > 0 ? parseFloat(miseRaw) : 1;

        const oddsVal = parseFloat(String(l.cote).replace(',', '.'));

        const newBet = {
            id: Date.now() + i,
            date: normalizeDateAnalyseur(donnees.matchDate),
            type: 'Single',
            match: donnees.nomMatch,
            comp: l.comp,
            market: l.marche,
            prono: l.pronostic,
            odds: isNaN(oddsVal) ? 1 : oddsVal,
            stake: miseVal,
            status: 'Pending'
        };

        // L'Analyseur est dédié au football : le pari est toujours enregistré dans cet onglet.
        currentSport = 'football';
        state.football.unshift(newBet);
        saveState();

        // Le pari est enregistré : on vide le texte brut collé, prêt pour la prochaine analyse.
        // Le rapport et le tableau restent affichés (ils ne dépendent plus de la zone de texte).
        const rawInputEl = document.getElementById('rawInput');
        if (rawInputEl) rawInputEl.value = '';

        const confirmEl = document.getElementById(`enregistre-confirm-${i}`);
        if (confirmEl) {
            confirmEl.style.display = 'inline';
            setTimeout(() => { confirmEl.style.display = 'none'; }, 2500);
        }
    }

    function copierLigne(i) {
        const donnees = window._donneesTableau;
        const l = lireLigneAnalyseur(i);
        if (!donnees || !l) return;
        const texte = `${donnees.matchDate} | ${donnees.nomMatch} | ${l.comp || donnees.nomCompetition} | ${l.marche} | ${l.pronostic} | ${l.mise || '[Mise]'} | ${l.cote}`;

        function afficherConfirmationLigne() {
            const confirm = document.getElementById('copieConfirm');
            if (confirm) {
                confirm.style.display = 'inline';
                setTimeout(() => { confirm.style.display = 'none'; }, 2000);
            }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texte).then(afficherConfirmationLigne).catch(() => {
                fallbackCopie(texte, afficherConfirmationLigne);
            });
        } else {
            fallbackCopie(texte, afficherConfirmationLigne);
        }
    }

    function copierTableau() {
        const donnees = window._donneesTableau;
        if (!donnees || !donnees.lignesTableau.length) return;
        let lignes = ["Date | Match | Compétition | Marché | Pronostic | Mise | Cote"];
        donnees.lignesTableau.forEach((_, i) => {
            const l = lireLigneAnalyseur(i);
            if (!l) return;
            lignes.push(`${donnees.matchDate} | ${donnees.nomMatch} | ${l.comp || donnees.nomCompetition} | ${l.marche} | ${l.pronostic} | ${l.mise || '[Mise]'} | ${l.cote}`);
        });
        const texte = lignes.join("\n");

        function afficherConfirmation() {
            const confirm = document.getElementById('copieConfirm');
            if (confirm) {
                confirm.style.display = 'inline';
                setTimeout(() => { confirm.style.display = 'none'; }, 2000);
            }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texte).then(afficherConfirmation).catch(() => {
                fallbackCopie(texte, afficherConfirmation);
            });
        } else {
            fallbackCopie(texte, afficherConfirmation);
        }
    }

    function fallbackCopie(texte, callback) {
        const zone = document.createElement('textarea');
        zone.value = texte;
        zone.style.position = 'fixed';
        zone.style.opacity = '0';
        document.body.appendChild(zone);
        zone.select();
        try { document.execCommand('copy'); callback(); } catch (e) { alert("Impossible de copier automatiquement, sélectionnez le texte manuellement."); }
        document.body.removeChild(zone);
    }

    function exporterTxt() {
        if (!dernierRapportTexte) { alert("Génère d'abord un rapport."); return; }
        const blob = new Blob([dernierRapportTexte], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rapport_match.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ===================== FIN ANALYSEUR =====================

    function switchView(view) {
      const trackerBtn = document.getElementById('btnViewTracker');
      const analyzerBtn = document.getElementById('btnViewAnalyzer');
      const trackerContent = document.getElementById('trackerViewContent');
      const analyzerContent = document.getElementById('analyzerViewContent');

      const activeClass = "px-4 py-2 rounded-xl transition bg-blue-600 text-white shadow-sm font-bold text-sm flex items-center gap-2";
      const inactiveClass = "px-4 py-2 rounded-xl transition text-slate-600 hover:text-slate-900 font-bold text-sm flex items-center gap-2";

      if (view === 'analyzer') {
        trackerContent.classList.add('hidden');
        analyzerContent.classList.remove('hidden');
        trackerBtn.className = inactiveClass;
        analyzerBtn.className = activeClass;
      } else {
        trackerContent.classList.remove('hidden');
        analyzerContent.classList.add('hidden');
        trackerBtn.className = activeClass;
        analyzerBtn.className = inactiveClass;
      }
    }

    // Replie / déplie le formulaire "Ajouter un Pari" (état mémorisé sur cet appareil).
    function basculerFormulaire(replier) {
      const g = document.getElementById('mainGrid');
      if (g) g.classList.toggle('form-replie', !!replier);
      try { localStorage.setItem('pronotracker_formReplie', replier ? '1' : '0'); } catch (e) {}
    }
    try { if (localStorage.getItem('pronotracker_formReplie') === '1') document.addEventListener('DOMContentLoaded', () => basculerFormulaire(true)); } catch (e) {}

    function switchSport(sport) {
      currentSport = 'football';
      // Ne PAS réinitialiser currentCompFilters ici : cette fonction sert aussi d'init au
      // chargement de la page (window.onload), et les championnats inclus/exclus doivent
      // survivre à un rechargement.
      currentMarketFilter = null;
      currentOddsFilter = null;
      editingBetId = null;
      currentTypeFilter = 'ALL';
      selectedBetIds.clear();
      visibleCombosCount = COMBOS_PAGE;
      comboOverrides = {};
      applyTheme();
      updateCompFilterModeButtons();

      const marketSelect = document.getElementById('marketInput');
      marketSelect.innerHTML = '';
      const markets = footballMarkets;

      document.getElementById('headerSubtitle').textContent = "Suivi de performance";
      document.getElementById('formTitle').innerHTML = `<i class="fa-solid fa-plus-circle text-blue-600"></i> Ajouter un Pari`;
      document.getElementById('dailySectionTitle').innerHTML = `<i class="fa-solid fa-calendar-day text-emerald-600"></i> Bilan Quotidien Jour par Jour`;
      document.getElementById('labelMatch').textContent = "Match / Affiche";
      document.getElementById('labelComp').textContent = "Championnat";
      document.getElementById('matchInput').placeholder = "Ex: PSG vs OM";
      document.getElementById('compInput').placeholder = "Ex: Ligue 1";
      document.getElementById('footballCategoryCard').classList.remove('hidden');

      markets.forEach(m => marketSelect.innerHTML += `<option value="${m}">${m}</option>`);
      populateCompFilterOptions();
      render();
    }

    function importJSON(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const importedData = JSON.parse(e.target.result);
          if (importedData && typeof importedData === 'object' && importedData.football) {
            state = {
              football: Array.isArray(importedData.football) ? importedData.football : [],
              combos: {
                football: (importedData.combos && Array.isArray(importedData.combos.football)) ? importedData.combos.football : []
              }
            };
          } else if (importedData && Array.isArray(importedData.bets)) {
            state[currentSport] = importedData.bets;
          } else if (Array.isArray(importedData)) {
            state[currentSport] = importedData;
          } else {
            alert("⚠️ Format non reconnu."); return;
          }

          if (!state.combos) state.combos = {};
          if (!Array.isArray(state.combos.football)) state.combos.football = [];
          corrigerMisesNulles();
          repareCombines();

          ['football'].forEach(sp => {
            if (!state[sp]) state[sp] = [];
            state[sp].forEach(b => {
              delete b.source;
              if (!b.status) b.status = 'Pending';
              if (!b.type) b.type = 'Single';
              if (typeof b.comp === 'string') b.comp = b.comp.trim();
              if (typeof b.match === 'string') b.match = b.match.trim();
              if (typeof b.market === 'string') b.market = b.market.trim();
              if (typeof b.prono === 'string') b.prono = b.prono.trim();
            });
          });

          saveState();
          alert("✅ Importation réussie !");
        } catch (err) {
          alert("❌ Erreur : " + err.message);
        } finally {
          event.target.value = '';
        }
      };
      reader.readAsText(file);
    }

    function exportJSON() {
      const filename = `pronotracker_${new Date().toISOString().split('T')[0]}.json`;
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });

      // Sur iPhone/iPad, la méthode "lien de téléchargement" ne fonctionne pas de façon fiable.
      // On utilise le menu de partage natif (Enregistrer dans Fichiers, AirDrop, etc.) quand il est disponible.
      let file = null;
      try { file = new File([blob], filename, { type: 'application/json' }); } catch (e) {}

      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: 'Sauvegarde PronoTracker',
          text: 'Export de mes pronostics'
        }).then(() => {
          localStorage.setItem('pronotracker_lastBackup', new Date().toISOString());
          updateBackupBanner();
        }).catch(err => {
          if (err && err.name !== 'AbortError') {
            downloadBlobFallback(blob, filename);
          }
        });
      } else {
        downloadBlobFallback(blob, filename);
      }
    }

    function downloadBlobFallback(blob, filename) {
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = filename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
      localStorage.setItem('pronotracker_lastBackup', new Date().toISOString());
      updateBackupBanner();
    }

    function snoozeBackupBanner() {
      localStorage.setItem('pronotracker_backupSnooze', new Date().toISOString());
      document.getElementById('backupBanner').classList.add('hidden');
      document.getElementById('backupBanner').classList.remove('flex');
    }

    function updateBackupBanner() {
      const banner = document.getElementById('backupBanner');
      const textEl = document.getElementById('backupBannerText');
      const lastBackup = localStorage.getItem('pronotracker_lastBackup');
      const snooze = localStorage.getItem('pronotracker_backupSnooze');
      const totalBets = (state.football || []).length;

      if (totalBets === 0) {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
        return;
      }

      const daysSince = (isoStr) => (Date.now() - new Date(isoStr).getTime()) / (1000 * 60 * 60 * 24);

      // Synchro cloud active et à jour (dernière synchro réussie il y a moins de 3 jours) :
      // les données sont déjà sauvegardées dans le cloud, on n'affiche pas l'avertissement.
      try {
        const cfgSync = JSON.parse(localStorage.getItem('pronotracker_sync_cfg') || 'null');
        const stSync = JSON.parse(localStorage.getItem('pronotracker_sync_state') || 'null');
        if (cfgSync && stSync && stSync.last && (Date.now() - stSync.last) < 3 * 86400000) {
          banner.classList.add('hidden');
          banner.classList.remove('flex');
          return;
        }
      } catch (e) {}

      if (snooze && daysSince(snooze) < 1) {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
        return;
      }

      let daysSinceBackup = lastBackup ? daysSince(lastBackup) : Infinity;

      if (daysSinceBackup >= 3) {
        const label = lastBackup ? `il y a ${Math.floor(daysSinceBackup)} jour(s)` : "jamais effectuée";
        textEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Dernière sauvegarde : <strong>${label}</strong>. Tes données sont uniquement stockées sur cet appareil — pense à exporter régulièrement pour ne rien perdre.`;
        banner.classList.remove('hidden');
        banner.classList.add('flex');
      } else {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
      }
    }

    function exportCSV() {
      let csv = "Sport,ID,Date,Type,Match,Competition,Marche,Pronostic,Cote,Mise,Statut,Combine\n";
      ['football'].forEach(sp => {
        (state[sp] || []).forEach(b => {
          const comboLabel = b.comboId ? `Combiné #${b.comboId}` : '';
          csv += `"${sp}","${b.id}","${b.date}","${b.type || 'Single'}","${b.match}","${b.comp}","${b.market}","${b.prono}",${b.odds},${b.stake},"${b.status}","${comboLabel}"\n`;
        });
      });
      ['football'].forEach(sp => {
        (state.combos[sp] || []).forEach(combo => {
          const odds = comboOdds(sp, combo);
          csv += `"${sp}","${combo.id}","","Combiné","","","","",${odds.toFixed(2)},${combo.stake},"${comboStatus(sp, combo)}","${combo.legIds.length} sélections"\n`;
        });
      });
      const filename = `pronotracker_${new Date().toISOString().split('T')[0]}.csv`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

      let file = null;
      try { file = new File([blob], filename, { type: 'text/csv' }); } catch (e) {}

      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Export CSV PronoTracker' }).catch(() => {
          downloadBlobFallback(blob, filename);
        });
      } else {
        downloadBlobFallback(blob, filename);
      }
    }

    function normalizeMarketLabel(text, sport, fallback) {
      if (!text) return fallback;
      const patterns = [
        { pattern: /BTTS|(les\s+)?(deux|2)\s+équipes?\s+marquent/i, label: 'BTTS' },
        { pattern: /Over\/?Under/i, label: 'Over/Under' },
        { pattern: /Buteur/i, label: 'Buteur' },
        { pattern: /Mi[\s-]?Temps/i, label: 'Mi-Temps' },
        { pattern: /1N2|Résultat|Vainqueur/i, label: '1N2' }
      ];
      for (const item of patterns) {
        if (item.pattern.test(text)) return item.label;
      }
      return fallback;
    }

    function isDuplicateBet(sport, bet) {
      return (state[sport] || []).some(b =>
        b.date === bet.date &&
        normalizeMatchName(b.match) === normalizeMatchName(bet.match) &&
        b.market === bet.market &&
        (b.prono || '').toLowerCase().trim() === (bet.prono || '').toLowerCase().trim()
      );
    }

    function normalizeGluedText(str) {
      return str
        .replace(/(\.)([A-ZÀ-Ö])/g, '$1 $2')            // "J.Nom" -> "J. Nom"
        .replace(/([a-zà-öø-ÿ])([A-ZÀ-Ö])/g, '$1 $2')    // "MontréalTotal" -> "Montréal Total"
        .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])(\d)/g, '$1 $2')    // "jeux1.80" -> "jeux 1.80"
        .replace(/(\d-\d)(\d)/g, '$1 $2')                // "2-02.10" -> "2-0 2.10"
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    function parseAndAddMultipleBets() {
      const raw = document.getElementById('rawText').value.trim();
      if (!raw) return;

      // 0. Découpage robuste : si le texte a été collé sans retours à la ligne
      // (ex: copié depuis un tableau qui a perdu sa mise en forme), on insère
      // une coupure avant chaque date rencontrée (sauf si elle est déjà juste
      // après un retour à la ligne ou un pipe, pour ne pas casser le format "|date|...").
      const firstDateIdx = raw.search(/\d{2}[\/\.-]\d{2}[\/\.-]\d{4}/);
      const rawTrimmed = firstDateIdx > 0 ? raw.slice(firstDateIdx) : raw;
      const rawPrepped = rawTrimmed.replace(/(?<![\n|])(?=\d{2}[\/\.-]\d{2}[\/\.-]\d{4})/g, '\n');

      const lines = rawPrepped.split('\n').filter(l => l.trim() !== '');
      const defaultStake = parseFloat(document.getElementById('stakeInput').value) || 1;
      let skippedDuplicates = 0;
      const parsedBets = [];

      lines.forEach((line, i) => {
        let str = line.trim();
        if (!str) return;

        // 0. Retrait des pipes de début/fin de ligne (ex: format tableau "|champ1|champ2|...|")
        str = str.replace(/^\|+\s*/, '').replace(/\s*\|+$/, '');

        // 0bis. Sécurité : un score type "2-0" collé directement à la cote (ex: "2-02.10")
        // est ambigu — on sépare le score de ce qui suit pour ne pas perdre de chiffre.
        str = str.replace(/(\d-\d)(\d)/g, '$1 $2');

        // 1. Extraction de la date (JJ/MM/AAAA)
        let formattedDate = new Date().toISOString().split('T')[0];
        const dateMatch = str.match(/^(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})/);
        if (dateMatch) {
          const parts = dateMatch[1].split(/[\/\.-]/);
          formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          str = str.replace(dateMatch[0], '').trim();
        }

        // 2. Extraction de la cote à la fin de la ligne
        let odds = 1.50;
        const oddsMatch = str.match(/(\d+[\.,]\d{1,2})\s*$/);
        if (oddsMatch) {
          odds = parseFloat(oddsMatch[1].replace(',', '.'));
          str = str.substring(0, str.lastIndexOf(oddsMatch[1])).trim();
        }

        // 3. Traitement prioritaire des formats séparés par des pipes '|'
        if (str.includes('|')) {
          const parts = str.split('|').map(p => p.trim()).filter(p => p.length > 0);
          
          if (parts.length >= 3) {
            const matchName = parts[0].replace(/\s+-\s+/g, ' vs ').replace(/\s+/g, ' ').trim();
            const compName = parts[1];
            const sportDefault = '1N2';

            let marketName = sportDefault;
            let unresolvedMarket = false;
            if (parts.length >= 4) {
              const resolved = normalizeMarketLabel(parts[2], currentSport, null);
              if (resolved) {
                marketName = resolved;
              } else {
                marketName = 'Autre';
                unresolvedMarket = true;
              }
            }

            // Champ mise optionnel en dernière position (ex: ... | Pronostic | Mise)
            // Dès qu'il y a 5+ champs, le dernier est toujours traité comme "mise"
            // (même si c'est un placeholder du type "-" signifiant "pas de mise précisée")
            let pronoVal = parts[parts.length - 1];
            let stakeVal = defaultStake;
            if (parts.length >= 5) {
              pronoVal = parts[parts.length - 2];
              const lastAsNum = parseFloat(parts[parts.length - 1].replace(',', '.').replace('€', '').trim());
              if (!isNaN(lastAsNum) && /^[\d.,]+\s*€?$/.test(parts[parts.length - 1].trim())) {
                stakeVal = lastAsNum;
              }
            }

            const newBet = {
              id: Date.now() + i,
              date: formattedDate,
              type: 'Single',
              match: matchName,
              comp: compName,
              market: marketName,
              prono: pronoVal,
              odds: odds,
              stake: stakeVal,
              status: 'Pending',
              unresolved: unresolvedMarket
            };

            if (isDuplicateBet(currentSport, newBet)) {
              skippedDuplicates++;
              return;
            }

            parsedBets.push(newBet);
            return;
          }
        }

        // 4. Traitement par expressions régulières (Regex), avec repli sur texte "réparé"
        function regexParseLine(inputStr) {
          let s = inputStr;
          let market = '1N2';
          const marketPatterns = [
            { pattern: /BTTS|(les\s+)?(deux|2)\s+équipes?\s+marquent/i, label: 'BTTS' },
            { pattern: /Over\/?Under/i, label: 'Over/Under' },
            { pattern: /Buteur/i, label: 'Buteur' },
            { pattern: /Mi[\s-]?Temps/i, label: 'Mi-Temps' },
            { pattern: /1N2|Résultat|Vainqueur/i, label: '1N2' }
          ];

          let matchedMarket = false;
          for (let item of marketPatterns) {
            if (item.pattern.test(s)) {
              market = item.label;
              matchedMarket = true;
              s = s.replace(item.pattern, ' |MARKET| ');
              break;
            }
          }

          let comp = 'Autre';
          const compMatch = s.match(/(Ligue\s+Europa\s+Conf[ée]rence|Europa\s+Conf[ée]rence\s+League|Conf[ée]rence\s+League|Ligue\s+Conf[ée]rence|Ligue\s+Europa|Europa\s+League|Ligue\s+des\s+Champions|Champions\s+League|Ligue\s+1|Premier\s+League|La\s+Liga|Serie\s+A|Bundesliga)/i);

          if (compMatch) {
            comp = compMatch[0].trim();
            s = s.replace(compMatch[0], ' |COMP| ');
          }

          let matchName = "Affiche Inconnue";
          let prono = s;

          if (s.includes('|COMP|')) {
            const parts = s.split('|COMP|');
            matchName = parts[0].replace(/\s+vs\s+/i, ' vs ').replace(/\s+-\s+/g, ' vs ').replace(/\s+/g, ' ').trim();
            prono = parts[1].replace('|MARKET|', '').trim();
          } else if (s.includes('|MARKET|')) {
            const parts = s.split('|MARKET|');
            matchName = parts[0].replace(/\s+-\s+/g, ' vs ').replace(/\s+/g, ' ').trim();
            prono = parts[1].trim();
          }

          prono = prono.replace(/^Victoire de\s+/i, 'Vainqueur ').replace(/^\||\|$/g, '').trim();

          return { market, matchedMarket, comp, hasComp: !!compMatch, matchName, prono };
        }

        let result = regexParseLine(str);
        let usedRepair = false;
        if (!result.matchedMarket) {
          // Repli : le texte est peut-être collé sans espaces (ex: "ParisPlus de 2.5")
          // -> on tente de réparer les espaces manquants puis on réessaie.
          const repaired = normalizeGluedText(str);
          const retry = regexParseLine(repaired);
          if (retry.matchedMarket) {
            result = retry;
            usedRepair = true;
          }
        }

        const { market, comp, matchName, prono, matchedMarket } = result;

        const newBet = {
          id: Date.now() + i,
          date: formattedDate,
          type: 'Single',
          match: matchName,
          comp: comp,
          market: market,
          prono: prono,
          odds: odds,
          stake: defaultStake,
          status: 'Pending',
          unresolved: !matchedMarket,
          usedRepair
        };

        if (isDuplicateBet(currentSport, newBet)) {
          skippedDuplicates++;
          return;
        }

        parsedBets.push(newBet);
      });

      document.getElementById('rawText').value = '';

      if (parsedBets.length === 0) {
        alert(skippedDuplicates > 0
          ? `⏭️ Tous les paris analysés (${skippedDuplicates}) étaient déjà présents.`
          : `⚠️ Aucun pari n'a pu être extrait du texte.`);
        return;
      }

      openImportPreview(parsedBets, skippedDuplicates);
    }

    // --- Prévisualisation avant import : rien n'est ajouté à state tant que
    // l'utilisateur n'a pas cliqué sur "Valider et ajouter" dans la modal. ---

    function openImportPreview(bets, skippedDuplicates) {
      importPreviewData = bets.map(b => ({ ...b, include: true }));

      const infoEl = document.getElementById('importSkippedInfo');
      infoEl.textContent = skippedDuplicates > 0
        ? `⏭️ ${skippedDuplicates} doublon(s) déjà présent(s) ont été ignoré(s) automatiquement.`
        : '';

      renderImportPreview();
      document.getElementById('importPreviewModal').classList.remove('hidden');
    }

    function renderImportPreview() {
      const tbody = document.getElementById('importPreviewTbody');
      tbody.innerHTML = '';

      importPreviewData.forEach((b, i) => {
        const tr = document.createElement('tr');
        tr.className = b.unresolved ? 'bg-amber-50' : (b.usedRepair ? 'bg-blue-50/60' : '');
        tr.innerHTML = `
          <td class="p-2 align-top"><input type="checkbox" ${b.include ? 'checked' : ''} onchange="importPreviewData[${i}].include=this.checked; updateImportConfirmCount()"></td>
          <td class="p-2 align-top"><input class="input-field w-28 text-xs" value="${b.date || ''}" onchange="importPreviewData[${i}].date=this.value"></td>
          <td class="p-2 align-top"><input class="input-field w-44 text-xs" value="${b.match || ''}" onchange="importPreviewData[${i}].match=this.value"></td>
          <td class="p-2 align-top"><input class="input-field w-36 text-xs" value="${b.comp || ''}" onchange="importPreviewData[${i}].comp=this.value"></td>
          <td class="p-2 align-top"><input class="input-field w-32 text-xs ${b.unresolved ? 'text-amber-700 font-bold' : ''}" value="${b.market || ''}" onchange="importPreviewData[${i}].market=this.value"></td>
          <td class="p-2 align-top"><input class="input-field w-32 text-xs" value="${b.prono || ''}" onchange="importPreviewData[${i}].prono=this.value"></td>
          <td class="p-2 align-top"><input type="number" step="0.01" class="input-field w-16 text-xs" value="${b.odds}" onchange="importPreviewData[${i}].odds=parseFloat(this.value)"></td>
        `;
        tbody.appendChild(tr);
      });

      document.getElementById('importPreviewCount').textContent = `${importPreviewData.length} pari(s) analysé(s) — vérifie et corrige si besoin avant de valider`;
      updateImportConfirmCount();
    }

    function updateImportConfirmCount() {
      document.getElementById('importConfirmCount').textContent = importPreviewData.filter(b => b.include).length;
    }

    function closeImportPreview() {
      importPreviewData = [];
      document.getElementById('importPreviewModal').classList.add('hidden');
    }

    function confirmImportPreview() {
      const toAdd = importPreviewData.filter(b => b.include);
      toAdd.forEach(b => {
        delete b.include;
        delete b.unresolved;
        delete b.usedRepair;
        state[currentSport].unshift(b);
      });

      const addedCount = toAdd.length;
      closeImportPreview();
      saveState();
      alert(`✅ ${addedCount} pari(s) ajouté(s) !`);
    }

    // Sépare "Équipe A vs Équipe B" (ou "Équipe A - Équipe B") en deux noms d'équipe.
    // Retourne null si le format ne permet pas d'identifier deux équipes distinctes.
    function splitMatchTeams(matchStr) {
      if (!matchStr) return null;
      const parts = matchStr.split(/\s+vs\.?\s+|\s+-\s+/i).map(p => p.trim()).filter(Boolean);
      if (parts.length !== 2) return null;
      return { teamA: parts[0], teamB: parts[1] };
    }

    // Construit la liste de suggestions de pronostic pour un marché donné, à partir
    // des deux équipes si elles sont identifiables. Couvre les marchés par défaut et
    // reconnaît aussi les types de marché personnalisés dont le nom ressemble à un type connu.
    function buildPronoSuggestions(matchStr, marketStr) {
      const teams = splitMatchTeams(matchStr);
      const market = (marketStr || '').toLowerCase();

      if (/1n2|résultat|vainqueur/.test(market)) {
        if (!teams) return [];
        return [teams.teamA, 'Match nul', teams.teamB];
      }
      if (/btts|deux\s+équipes?\s+marquent/.test(market)) {
        return ['Les deux équipes marquent', 'Une équipe ne marque pas'];
      }
      if (/over\/?under/.test(market)) {
        return ['Plus de 1.5 buts', 'Plus de 2.5 buts', 'Moins de 2.5 buts', 'Plus de 3.5 buts'];
      }
      if (/mi[\s-]?temps/.test(market)) {
        if (!teams) return ['Nul à la Mi-Temps'];
        return [`Victoire ${teams.teamA} (MT)`, 'Nul (MT)', `Victoire ${teams.teamB} (MT)`];
      }
      return [];
    }

    // Met à jour les chips cliquables sous le champ Pronostic. Appelée à chaque saisie
    // du Match ou changement de Marché, pour éviter de retaper le pronostic à la main.
    function updatePronoSuggestions() {
      const container = document.getElementById('pronoSuggestions');
      if (!container) return;

      const matchVal = document.getElementById('matchInput')?.value || '';
      const marketVal = document.getElementById('marketInput')?.value || '';
      const suggestions = buildPronoSuggestions(matchVal, marketVal);

      if (suggestions.length === 0) {
        container.classList.add('hidden');
        container.classList.remove('flex');
        container.innerHTML = '';
        return;
      }

      container.classList.remove('hidden');
      container.classList.add('flex');
      container.innerHTML = suggestions.map(s => `
        <button type="button" onclick="document.getElementById('pronoInput').value='${s.replace(/'/g, "\\'")}'; document.getElementById('pronoInput').focus();"
          class="text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 transition">
          ${escAttr(s)}
        </button>
      `).join('');
    }

    // Vide Match + Pronostic (et les suggestions) pour repartir sur une nouvelle affiche
    // sans devoir effacer manuellement chaque champ. Conserve Championnat/Marché/Mise.
    function startNewMatch() {
      const matchInput = document.getElementById('matchInput');
      const pronoInput = document.getElementById('pronoInput');
      if (matchInput) matchInput.value = '';
      if (pronoInput) pronoInput.value = '';
      updatePronoSuggestions();
      if (matchInput) matchInput.focus();
    }

    function addBet(e) {
      e.preventDefault();

      const newBet = {
        id: Date.now(),
        date: document.getElementById('dateInput').value,
        type: document.getElementById('typeInput').value,
        match: document.getElementById('matchInput').value,
        comp: document.getElementById('compInput').value.trim(),
        market: document.getElementById('marketInput').value,
        prono: document.getElementById('pronoInput').value,
        odds: parseFloat(document.getElementById('oddsInput').value),
        stake: parseFloat(document.getElementById('stakeInput').value),
        status: 'Pending'
      };

      state[currentSport].unshift(newBet);
      
      const currentMatch = document.getElementById('matchInput').value;
      const currentComp = document.getElementById('compInput').value;
      const currentMarket = document.getElementById('marketInput').value;
      const currentStake = document.getElementById('stakeInput').value;

      document.getElementById('addBetForm').reset();
      document.getElementById('typeInput').value = 'Single';
      document.getElementById('stakeInput').value = currentStake || 1;
      document.getElementById('dateInput').value = new Date().toISOString().split('T')[0];
      
      document.getElementById('matchInput').value = currentMatch;
      document.getElementById('compInput').value = currentComp;
      document.getElementById('marketInput').value = currentMarket;

      saveState();
      updatePronoSuggestions();

      // Le Match/Championnat/Marché/Mise restent pré-remplis pour enchaîner plusieurs
      // paris rapidement : on ramène directement le focus sur le Pronostic, le seul
      // champ qui change presque toujours d'un pari à l'autre.
      const pronoInput = document.getElementById('pronoInput');
      if (pronoInput) {
        pronoInput.focus();
        pronoInput.select();
      }
    }

    // Préremplit le formulaire d'ajout à partir d'un pari existant (championnat, marché,
    // type, mise) : il ne reste plus qu'à changer le Match et la Cote pour un pari similaire.
    function duplicateBet(id) {
      const bet = state[currentSport].find(b => b.id === id);
      if (!bet) return;

      document.getElementById('compInput').value = bet.comp || '';
      document.getElementById('marketInput').value = bet.market || footballMarkets[0] || '';
      document.getElementById('typeInput').value = bet.type || 'Single';
      document.getElementById('stakeInput').value = bet.stake || 1;
      document.getElementById('matchInput').value = '';
      document.getElementById('pronoInput').value = '';
      document.getElementById('oddsInput').value = '';
      document.getElementById('dateInput').value = new Date().toISOString().split('T')[0];

      updatePronoSuggestions();

      const formCard = document.getElementById('addBetForm');
      if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const matchInput = document.getElementById('matchInput');
      if (matchInput) matchInput.focus();
    }

    function openEditModal(id) {
      const bet = state[currentSport].find(b => b.id === id);
      if (!bet) return;

      document.getElementById('editBetId').value = bet.id;
      document.getElementById('editDate').value = bet.date || '';
      document.getElementById('editMatch').value = bet.match || '';
      document.getElementById('editComp').value = bet.comp || '';
      document.getElementById('editProno').value = bet.prono || '';
      document.getElementById('editOdds').value = bet.odds || 1.01;
      document.getElementById('editStake').value = bet.stake || 1;

      const editMarketSelect = document.getElementById('editMarket');
      editMarketSelect.innerHTML = '';
      const markets = footballMarkets;
      
      markets.forEach(m => {
        const option = document.createElement('option');
        option.value = m;
        option.textContent = m;
        if (bet.market === m) option.selected = true;
        editMarketSelect.appendChild(option);
      });

      document.getElementById('editModal').classList.remove('hidden');
    }

    function closeEditModal() {
      document.getElementById('editModal').classList.add('hidden');
    }

    function saveEdit(e) {
      e.preventDefault();
      const id = parseInt(document.getElementById('editBetId').value);
      const bet = state[currentSport].find(b => b.id === id);

      if (bet) {
        bet.date = document.getElementById('editDate').value;
        bet.match = document.getElementById('editMatch').value;
        bet.comp = document.getElementById('editComp').value.trim();
        bet.market = document.getElementById('editMarket').value;
        bet.prono = document.getElementById('editProno').value;
        bet.odds = parseFloat(document.getElementById('editOdds').value);
        bet.stake = parseFloat(document.getElementById('editStake').value);

        saveState();
        closeEditModal();
      }
    }

    function escAttr(str) {
      return (str || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function marketOptionsHtml(selected) {
      const markets = footballMarkets;
      return markets.map(m => `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`).join('');
    }

    function startInlineEdit(id) {
      editingBetId = id;
      render();
    }

    function cancelInlineEdit() {
      editingBetId = null;
      render();
    }

    function saveInlineEdit(id, suffix) {
      const bet = state[currentSport].find(b => b.id === id);
      if (!bet) return;
      const val = (name) => document.getElementById(`inline${name}${suffix}-${id}`).value;

      bet.date = val('Date');
      bet.match = val('Match');
      bet.comp = val('Comp').trim();
      bet.market = val('Market');
      bet.prono = val('Prono');
      const newOdds = parseFloat(val('Odds'));
      const newStake = parseFloat(val('Stake'));
      if (!isNaN(newOdds) && newOdds > 1) bet.odds = newOdds;
      if (!isNaN(newStake) && newStake > 0) bet.stake = newStake;

      editingBetId = null;
      saveState();
    }

    function setQuickFilter(filter) {
      currentQuickFilter = filter;
      const buttons = {
        ALL: document.getElementById('btnFilterAll'),
        Pending: document.getElementById('btnFilterPending'),
        Settled: document.getElementById('btnFilterSettled'),
        Won: document.getElementById('btnFilterWon'),
        Lost: document.getElementById('btnFilterLost')
      };

      const activeClass = "px-3 py-1 rounded-lg transition bg-white text-slate-800 shadow-sm font-bold whitespace-nowrap";
      const inactiveClass = "px-3 py-1 rounded-lg transition text-slate-600 hover:text-slate-900 font-medium whitespace-nowrap";

      Object.entries(buttons).forEach(([key, btn]) => {
        if (btn) btn.className = (filter === key) ? activeClass : inactiveClass;
      });

      resetHistoryPagination();
      render();
    }

    function setTypeFilter(filter) {
      currentTypeFilter = filter;
      const buttons = {
        ALL: document.getElementById('btnFilterTypeAll'),
        SOLO: document.getElementById('btnFilterTypeSolo'),
        COMBO: document.getElementById('btnFilterTypeCombo')
      };

      const activeClass = "px-3 py-1 rounded-lg transition bg-white text-slate-800 shadow-sm font-bold whitespace-nowrap";
      const inactiveClass = "px-3 py-1 rounded-lg transition text-slate-600 hover:text-slate-900 font-medium whitespace-nowrap";

      Object.entries(buttons).forEach(([key, btn]) => {
        if (btn) btn.className = (filter === key) ? activeClass : inactiveClass;
      });

      resetHistoryPagination();
      render();
    }

    // Affiche la flèche du tri actif dans l'en-tête de la colonne concernée.
    function peindreFlechesTri() {
      ['betNum', 'date', 'match', 'prono', 'odds', 'stake', 'status'].forEach(f => {
        const el = document.getElementById('sort-' + f);
        if (el) el.textContent = (currentSort.field === f) ? (currentSort.dir === 'asc' ? '▲' : '▼') : '';
      });
    }

    function toggleSort(field) {
      if (currentSort.field === field) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.field = field;
        currentSort.dir = 'desc';
      }
      render();
    }

    function setStatus(id, targetStatus) {
      const bet = state[currentSport].find(b => b.id === id);
      if (bet) {
        bet.status = (bet.status === targetStatus) ? 'Pending' : targetStatus;
        saveState();
      }
    }

    function deleteBet(id) {
      const betIndex = state[currentSport].findIndex(b => b.id === id);
      if (betIndex !== -1) {
        const bet = state[currentSport][betIndex];
        // Si ce pari fait partie d'un combiné, on le retire du combiné ; si le combiné
        // n'a plus assez de sélections pour tenir debout, il est dissous.
        if (bet.comboId) {
          const combos = state.combos[currentSport] || [];
          const combo = combos.find(c => c.id === bet.comboId);
          if (combo) {
            combo.legIds = combo.legIds.filter(legId => legId !== id);
            if (combo.legIds.length < 2) {
              state.combos[currentSport] = combos.filter(c => c.id !== combo.id);
              // Le combiné n'existe plus : la sélection restante redevient un pari simple
              // (sinon elle garde un lien "fantôme" vers un combiné disparu).
              state[currentSport].forEach(b => { if (b.comboId === combo.id) delete b.comboId; });
            }
          }
        }
        delete bet.comboId;
        lastDeletedBet = { bet: bet, index: betIndex, sport: currentSport };
        state[currentSport].splice(betIndex, 1);
        saveState();

        const toast = document.getElementById('toastUndo');
        toast.classList.remove('hidden');

        if (undoTimeout) clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => {
          toast.classList.add('hidden');
          lastDeletedBet = null;
        }, 4000);
      }
    }

    function undoDelete() {
      if (lastDeletedBet) {
        state[lastDeletedBet.sport].splice(lastDeletedBet.index, 0, lastDeletedBet.bet);
        lastDeletedBet = null;
        document.getElementById('toastUndo').classList.add('hidden');
        saveState();
      }
    }

    function clearAll() {
      if (confirm(`Voulez-vous vraiment effacer tous les paris ${currentSport.toUpperCase()} ?`)) {
        state[currentSport] = [];
        state.combos[currentSport] = [];
        selectedBetIds.clear();
        saveState();
      }
    }

    function onFilterPeriodChange() {
      const period = document.getElementById('filterPeriod').value;
      document.getElementById('customDateRange').classList.toggle('hidden', period !== 'CUSTOM');
      resetHistoryPagination();
      render();
    }

    function filterByBetNumber(num) {
      const input = document.getElementById('searchInput');
      if (input.value.trim() === ('#' + num)) {
        input.value = '';
      } else {
        input.value = '#' + num;
      }
      render();
      const list = document.getElementById('betsTbody');
      if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function getBetChartNumbers() {
      const sortedBets = [...(state[currentSport] || [])].reverse();
      let step = 1;
      const map = {};
      sortedBets.forEach(b => {
        if (b.status === 'Pending') return;
        map[b.id] = step++;
      });
      return map;
    }

    function populateCompFilterOptions() {
      const select = document.getElementById('filterComp');
      const currentList = state[currentSport] || [];
      const comps = Array.from(new Set(currentList.map(b => (b.comp || '').trim()).filter(c => c)));
      comps.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

      if (select) {
        const previousValue = select.value;
        select.innerHTML = '<option value="ALL">Tous les championnats</option>' +
          comps.map(c => `<option value="${escAttr(c)}">${escAttr(c)}</option>`).join('');
        select.value = comps.includes(previousValue) ? previousValue : 'ALL';
      }

      // Alimente aussi le datalist utilisé par les champs de saisie (formulaire + édition)
      // pour suggérer les championnats déjà utilisés et limiter les fautes de frappe.
      const datalist = document.getElementById('compDatalist');
      if (datalist) {
        datalist.innerHTML = comps.map(c => `<option value="${escAttr(c)}"></option>`).join('');
      }
    }

    // Filtre "brut" (sans tri) selon TOUS les filtres actifs : recherche, période, statut,
    // championnats cochés (si demandé), marché, tranche de cote.
    // Préserve l'ordre d'origine du tableau (utile pour les séries et le graphique cumulé).
    function getStatsFilteredBetsRaw(applyCompCheckboxFilter, applyQuickStatusFilter = true, applyMarketOddsFilter = true, applyTypeFilter = true) {
      const currentList = state[currentSport] || [];
      const search = document.getElementById('searchInput').value.toLowerCase().trim();
      const chartNumbers = getBetChartNumbers();
      const searchIsNumber = /^#?\d+$/.test(search);
      const searchNum = searchIsNumber ? parseInt(search.replace('#', ''), 10) : null;
      const period = document.getElementById('filterPeriod').value;
      const dateFrom = document.getElementById('filterDateFrom')?.value || '';
      const dateTo = document.getElementById('filterDateTo')?.value || '';

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      const tomorrowObj = new Date(now);
      tomorrowObj.setDate(now.getDate() + 1);
      const tomorrowStr = tomorrowObj.toISOString().slice(0, 10);

      const currentMonthStr = now.toISOString().slice(0, 7);

      return currentList.filter(b => {
        const matchSearch = searchIsNumber
          ? (chartNumbers[b.id] === searchNum)
          : ((b.match || '').toLowerCase().includes(search) || 
             (b.prono || '').toLowerCase().includes(search) || 
             (b.comp || '').toLowerCase().includes(search));
        
        let matchQuick = true;
        if (applyQuickStatusFilter) {
          if (currentQuickFilter === 'Pending') matchQuick = (b.status === 'Pending');
          if (currentQuickFilter === 'Settled') matchQuick = (b.status !== 'Pending');
          if (currentQuickFilter === 'Won') matchQuick = (b.status === 'Won');
          if (currentQuickFilter === 'Lost') matchQuick = (b.status === 'Lost');
        }

        let matchPeriod = true;
        if (period === 'TODAY') {
          matchPeriod = (b.date || '') === todayStr;
        } else if (period === 'TOMORROW') {
          matchPeriod = (b.date || '') === tomorrowStr;
        } else if (period === 'THIS_MONTH') {
          matchPeriod = (b.date || '').startsWith(currentMonthStr);
        } else if (period === 'THIS_WEEK') {
          const betDate = new Date(b.date);
          matchPeriod = Math.ceil(Math.abs(now - betDate) / (1000 * 60 * 60 * 24)) <= 7;
        } else if (period === 'CUSTOM') {
          const betDateStr = b.date || '';
          if (dateFrom && betDateStr < dateFrom) matchPeriod = false;
          if (dateTo && betDateStr > dateTo) matchPeriod = false;
        }

        // Filtre par championnats cochés dans "Stats par Championnat".
        // Mode "include" (par défaut) : coché = seuls les championnats cochés sont gardés.
        // Mode "exclude" : coché = ce championnat est retiré du Bilan, tout le reste reste inclus.
        let matchComp = true;
        if (applyCompCheckboxFilter && currentCompFilters.size > 0) {
          const bCompKey = (b.comp || 'Non spécifié').trim();
          if (compFilterMode === 'exclude') {
            matchComp = !currentCompFilters.has(bCompKey);
          } else {
            matchComp = currentCompFilters.has(bCompKey);
          }
        }

        let matchHistoryComp = true;
        const compFilterVal = document.getElementById('filterComp')?.value || 'ALL';
        if (compFilterVal !== 'ALL') {
          matchHistoryComp = (b.comp || '').trim() === compFilterVal;
        }

        let matchMarket = true;
        if (applyMarketOddsFilter && currentMarketFilter) {
          matchMarket = (b.market || 'Autre') === currentMarketFilter;
        }

        let matchOdds = true;
        if (applyMarketOddsFilter && currentOddsFilter) {
          matchOdds = getOddsBracket(b.odds || 1) === currentOddsFilter;
        }

        // Filtre Solo / Combinés / Tous : réservé à l'Historique (voir applyTypeFilter),
        // n'affecte pas le Bilan du haut ni les tableaux de stats détaillées.
        let matchType = true;
        if (applyTypeFilter) {
          if (currentTypeFilter === 'SOLO') matchType = !b.comboId;
          else if (currentTypeFilter === 'COMBO') matchType = !!b.comboId;
        }

        return matchSearch && matchQuick && matchPeriod && matchComp && matchHistoryComp && matchMarket && matchOdds && matchType;
      });
    }

    // Utilisée par Performance Globale, Bilan Quotidien et le Graphique : mêmes filtres actifs
    // que le Bilan du haut (recherche/période/marché/cote/circuit + championnats cochés),
    // sans tri, pour préserver l'ordre chronologique d'origine.
    // Le filtre "Tous / En cours / Terminés" est volontairement ignoré ici : il ne sert
    // qu'à naviguer dans l'Historique, pas à restreindre le Bilan.
    function getStatsFilteredBets() {
      return getStatsFilteredBetsRaw(true, false, true, false);
    }

    // Source des tableaux "Stats par Type de Prono" et "Stats par Tranche de Cote" : mêmes
    // filtres actifs que le Bilan (recherche, période, championnats inclus/exclus, circuit),
    // mais SANS filtrer par marché/cote — ces deux tableaux construisent eux-mêmes ces
    // répartitions, donc s'auto-filtrer les viderait. Le statut Tous/En cours/Terminés est
    // ignoré aussi, comme pour le Bilan (seuls les paris terminés sont comptés plus bas).
    function getGroupedStatsSourceBets() {
      return getStatsFilteredBetsRaw(true, false, false, false);
    }

    function getFilteredAndSortedBets(applyCompCheckboxFilter = false) {
      const chartNumbers = getBetChartNumbers();
      let filtered = getStatsFilteredBetsRaw(applyCompCheckboxFilter);

      filtered.sort((a, b) => {
        if (currentSort.field === 'date') {
          let dateA = a.date || '';
          let dateB = b.date || '';
          if (dateA !== dateB) return currentSort.dir === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
          let matchA = normalizeMatchName(a.match);
          let matchB = normalizeMatchName(b.match);
          return matchA.localeCompare(matchB);
        } else if (currentSort.field === 'betNum') {
          // Les paris "En cours" (sans numéro) sont toujours renvoyés en dernier, quel que soit le sens du tri
          const numA = chartNumbers[a.id];
          const numB = chartNumbers[b.id];
          if (numA === undefined && numB === undefined) return 0;
          if (numA === undefined) return 1;
          if (numB === undefined) return -1;
          return currentSort.dir === 'asc' ? numA - numB : numB - numA;
        } else {
          // Colonne "Match" -> tri par compétition ; colonne "Pronostic" -> tri par marché
          // (à égalité, on départage par nom de match / par pronostic).
          const cleTri = { match: 'comp', prono: 'market' }[currentSort.field] || currentSort.field;
          const cleSecondaire = { match: 'match', prono: 'prono' }[currentSort.field] || null;
          const val = (x, k) => { let v = x[k] || ''; return typeof v === 'string' ? v.toLowerCase() : v; };
          let valA = val(a, cleTri), valB = val(b, cleTri);
          if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
          if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
          if (cleSecondaire) return String(val(a, cleSecondaire)).localeCompare(String(val(b, cleSecondaire)));
          return 0;
        }
      });

      return filtered;
    }

    // ===================== COMBINÉS =====================

    // Retrouve les paris (legs) d'un combiné dans la liste actuelle du sport.
    function comboLegs(sport, combo) {
      const list = state[sport] || [];
      return (combo.legIds || []).map(id => list.find(b => String(b.id) === String(id))).filter(Boolean);
    }

    function comboOdds(sport, combo) {
      return comboLegs(sport, combo).reduce((prod, leg) => prod * (leg.odds || 1), 1);
    }

    // Statut auto : Perdu dès qu'une sélection est perdue, Gagné si toutes le sont, sinon En cours.
    function comboStatus(sport, combo) {
      const legs = comboLegs(sport, combo);
      if (legs.some(l => l.status === 'Lost')) return 'Lost';
      if (legs.length > 0 && legs.every(l => l.status === 'Won')) return 'Won';
      return 'Pending';
    }

    function comboProfit(sport, combo) {
      const status = comboStatus(sport, combo);
      const stake = combo.stake || 0;
      if (status === 'Won') return (comboOdds(sport, combo) - 1) * stake;
      if (status === 'Lost') return -stake;
      return 0;
    }

    function toggleBetSelection(id, checked, checkboxEl) {
      if (checked) {
        const list = state[currentSport] || [];
        const bet = list.find(b => b.id === id);
        if (bet) {
          const newMatchKey = normalizeMatchName(bet.match);
          const conflict = Array.from(selectedBetIds).some(selId => {
            const selBet = list.find(b => b.id === selId);
            return selBet && newMatchKey && normalizeMatchName(selBet.match) === newMatchKey;
          });
          if (conflict) {
            alert(`⚠️ Impossible de combiner deux sélections du même match ("${bet.match}"). Choisis un pari sur un autre match.`);
            if (checkboxEl) checkboxEl.checked = false;
            return;
          }
        }
        selectedBetIds.add(id);
      } else {
        selectedBetIds.delete(id);
      }
      updateComboSelectionBar();
    }

    function clearBetSelection() {
      selectedBetIds.clear();
      updateComboSelectionBar();
      render();
    }

    function updateComboSelectionBar() {
      const bar = document.getElementById('comboSelectionBar');
      const text = document.getElementById('comboSelectionText');
      const count = selectedBetIds.size;
      if (count >= 2) {
        text.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${count} paris sélectionnés`;
        bar.classList.remove('hidden');
        bar.classList.add('flex');
      } else {
        bar.classList.add('hidden');
        bar.classList.remove('flex');
      }
    }

    function openComboModal() {
      if (selectedBetIds.size < 2) return;
      const list = state[currentSport] || [];
      const legs = Array.from(selectedBetIds).map(id => list.find(b => b.id === id)).filter(Boolean);
      if (legs.length < 2) return;

      const legsList = document.getElementById('comboModalLegsList');
      legsList.innerHTML = legs.map(l => `
        <div class="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
          <div class="min-w-0">
            <div class="font-bold text-slate-800 truncate">${l.match || ''}</div>
            <div class="text-[10px] text-slate-400 truncate">${l.prono || ''} (${l.market || ''})</div>
          </div>
          <span class="font-black text-blue-600 shrink-0">${(l.odds || 1).toFixed(2)}</span>
        </div>
      `).join('');

      const totalOdds = legs.reduce((prod, l) => prod * (l.odds || 1), 1);
      document.getElementById('comboModalTotalOdds').textContent = totalOdds.toFixed(2);

      // La mise reprend automatiquement celle du 1er pari sélectionné (modifiable).
      const firstId = Array.from(selectedBetIds)[0];
      const firstBet = list.find(b => b.id === firstId);
      document.getElementById('comboStakeInput').value = (firstBet && firstBet.stake) || 1;

      document.getElementById('comboModal').classList.remove('hidden');
    }

    function closeComboModal() {
      document.getElementById('comboModal').classList.add('hidden');
    }

    function confirmCreateCombo() {
      if (selectedBetIds.size < 2) { closeComboModal(); return; }

      const list = state[currentSport] || [];

      // Filet de sécurité : re-vérifie l'absence de doublon de match avant de créer le combiné.
      const legs = Array.from(selectedBetIds).map(id => list.find(b => b.id === id)).filter(Boolean);
      const matchKeys = legs.map(l => normalizeMatchName(l.match));
      const hasDuplicateMatch = matchKeys.some((key, i) => key && matchKeys.indexOf(key) !== i);
      if (hasDuplicateMatch) {
        alert("⚠️ Deux sélections de ce combiné portent sur le même match. Retire l'une d'elles avant de continuer.");
        return;
      }

      const stake = parseFloat(document.getElementById('comboStakeInput').value);
      if (!stake || stake <= 0) { alert("⚠️ Merci d'indiquer une mise valide pour le combiné."); return; }

      const combo = {
        id: Date.now(),
        stake: stake,
        legIds: Array.from(selectedBetIds),
        createdAt: new Date().toISOString()
      };

      combo.legIds.forEach(id => {
        const bet = list.find(b => b.id === id);
        if (bet) bet.comboId = combo.id;
      });

      state.combos[currentSport].push(combo);
      selectedBetIds.clear();
      closeComboModal();
      saveState();
    }

    // Dissout le combiné : les paris redeviennent des Simples normaux, comptés dans le Bilan Solo.
    function decombineCombo(comboId) {
      const combos = state.combos[currentSport] || [];
      const combo = combos.find(c => c.id === comboId);
      if (!combo) return;
      const list = state[currentSport] || [];
      combo.legIds.forEach(id => {
        const bet = list.find(b => b.id === id);
        if (bet) delete bet.comboId;
      });
      state.combos[currentSport] = combos.filter(c => c.id !== comboId);
      saveState();
    }

    // Supprime le combiné ET les paris qui le composent.
    function deleteComboWithLegs(comboId) {
      if (!confirm("Supprimer ce combiné et les paris qui le composent ?")) return;
      const combos = state.combos[currentSport] || [];
      const combo = combos.find(c => c.id === comboId);
      if (!combo) return;
      state[currentSport] = (state[currentSport] || []).filter(b => !combo.legIds.includes(b.id));
      state.combos[currentSport] = combos.filter(c => c.id !== comboId);
      saveState();
    }

    // --- Affichage compact des combinés : une ligne par combiné, détail au clic ---
    let comboFilter = 'ALL'; // ALL | Pending | Won | Lost
    let comboSearch = '';    // texte recherché (équipe, match, pronostic, compétition)

    function normTexte(t) {
      return (t || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function setComboSearch(v) {
      comboSearch = v || '';
      visibleCombosCount = COMBOS_PAGE;
      renderCombos();
    }

    // Par défaut tout est replié : la liste reste courte et lisible. Un clic déplie le détail.
    function isComboExpanded(comboId) {
      return comboOverrides.hasOwnProperty(comboId) ? comboOverrides[comboId] : false;
    }

    function toggleComboExpand(comboId) {
      comboOverrides[comboId] = !isComboExpanded(comboId);
      renderCombos();
    }

    function toggleAllCombos(expand) {
      (state.combos[currentSport] || []).forEach(c => { comboOverrides[c.id] = expand; });
      renderCombos();
    }

    function setComboFilter(f) {
      comboFilter = f;
      visibleCombosCount = COMBOS_PAGE;
      renderCombos();
    }

    function loadMoreCombos() {
      visibleCombosCount += COMBOS_PAGE;
      renderCombos();
    }

    function showAllCombos() {
      visibleCombosCount = Infinity;
      renderCombos();
    }

    function fmtMoney(v, withSign) {
      const txt = Math.abs(v).toFixed(2).replace('.', ',');
      return (withSign ? (v > 0 ? '+' : v < 0 ? '−' : '') : '') + txt + ' €';
    }

    // ===================== SCORES DES MATCHS (football-data.org) =====================
    // Affiche seulement le score à côté des paris : rien n'est validé automatiquement.
    const SC_KEY = 'pronotracker_scores', SC_CFG = 'pronotracker_scores_cfg';
    const SC_BASE = 'https://api.football-data.org';
    function scLire(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
    function scEcrire(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    let scoresCache = scLire(SC_KEY, {});
    let scLog = '';

    function heureMatch(b) {
      const r = scoresCache[b.id];
      if (!r || !r.ko) return '';
      const d = new Date(r.ko);
      if (isNaN(d)) return '';
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    function scoreHtml(b) {
      const r = scoresCache[b.id];
      if (!r) return '';
      let txt = '';
      if (r.st === 'FINISHED' && r.h != null) txt = `Score final : ${r.h}-${r.a}` + (r.hh != null ? ` · mi-temps ${r.hh}-${r.ha}` : '');
      else if (r.st === 'POSTPONED' || r.st === 'SUSPENDED' || r.st === 'CANCELLED') txt = 'Match reporté / annulé';
      else if (r.st === 'PAUSED' && r.h != null) txt = `Mi-temps : ${r.h}-${r.a}`;
      else if (r.st === 'IN_PLAY' && r.h != null) {
        const mn = Number(r.mn), it = Number(r.it);
        let temps = '';
        if (Number.isFinite(mn) && mn > 0) {
          if (it > 0) temps = ` · ${mn}+${it}'`;
          else if (r.src === 'espn') {
            // ESPN donne la minute au moment de la lecture : on y ajoute le temps écoulé depuis.
            const lim = r.per === 1 ? 45 : r.per === 2 ? 90 : r.per === 3 ? 105 : r.per === 4 ? 120 : 90;
            const v = mn + Math.max(0, Math.floor((Date.now() - (r.t || Date.now())) / 60000));
            temps = v > lim ? ` · ${lim}+'` : ` · ${v}'`;
          } else temps = ` · ${mn}'`;
        }
        txt = `En cours : ${r.h}-${r.a}${temps}`;
      }
      else return '';
      return `<div class="text-[10px] font-extrabold text-violet-700">⚽ ${txt}</div>`;
    }

    const SC_JETONS_IGNORES = new Set(['fc', 'cf', 'ac', 'as', 'sc', 'us', 'ssc', 'afc', 'rc', 'rcd', 'sv', 'vfb', 'vfl', 'fsv', 'tsg', 'og', 'ogc', 'ca', 'cd', 'ud', 'sd', 'de', 'la', 'le', 'the', 'el', 'club', 'calcio', 'fk']);
    function scJetons(nom) {
      const n = (nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const alias = { psg: ['paris', 'saint', 'germain'], om: ['marseille'], ol: ['lyon'], utd: ['united'], spurs: ['tottenham'], barca: ['barcelona'], atleti: ['atletico'] };
      return n.split(' ').filter(t => t && !SC_JETONS_IGNORES.has(t)).flatMap(t => alias[t] || [t]);
    }
    function scJetonEgal(x, y) { return x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x))); }
    // 2 = même nom, 1 = un nom contenu dans l'autre, 0 = pas la même équipe
    function scMemeEquipe(a, b) {
      const ta = scJetons(a), tb = scJetons(b);
      if (!ta.length || !tb.length) return 0;
      if (ta.join(' ') === tb.join(' ')) return 2;
      const [pt, gd] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
      return pt.every(x => gd.some(y => scJetonEgal(x, y))) ? 1 : 0;
    }
    function scMemeEquipeMatch(nomPari, m, cote) {
      return Math.max(scMemeEquipe(nomPari, m[cote].name), scMemeEquipe(nomPari, m[cote].shortName), scMemeEquipe(nomPari, m[cote].tla));
    }
    function scJourLocal(utc) {
      const d = new Date(utc);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function scEcartJours(d1, d2) { return Math.abs((new Date(d1 + 'T12:00:00') - new Date(d2 + 'T12:00:00')) / 86400000); }
    function scTrouverMatch(bet, matchs) {
      const parts = String(bet.match || '').split(/\s+(?:vs\.?|contre|-|–)\s+/i);
      if (parts.length < 2) return null;
      let best = null, bestScore = 0;
      matchs.forEach(m => {
        if (!m.homeTeam || !m.awayTeam || !bet.date) return;
        if (scEcartJours(scJourLocal(m.utcDate), bet.date) > 1) return;
        const h = scMemeEquipeMatch(parts[0], m, 'homeTeam'), a = scMemeEquipeMatch(parts[1], m, 'awayTeam');
        if (h && a && h + a > bestScore) { bestScore = h + a; best = m; }
      });
      return best;
    }
    function scAjouterJours(d, n) {
      const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n);
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    }
    const scPause = ms => new Promise(r => setTimeout(r, ms));

    // ===== VÉRIFICATEUR DE CHAMPIONNATS =====
    const VC_IGN = 'pronotracker_comp_ignores';
    const vcEstEurope = c => /champions|europa|conf[ée]rence|coupe|cup|supercoupe/i.test(c || '');
    let vcLignes = [];

    function vcAnalyser() {
      const bets = (state.football || []).filter(b => b.match);
      const info = bets.map(b => ({
        b, comp: (b.comp || '').trim(),
        eq: String(b.match).split(/\s+(?:vs\.?|v|-|–|—)\s+/i).slice(0, 2).map(n => scJetons(n))
      }));
      const meme = (ta, tb) => {
        if (!ta.length || !tb.length) return false;
        if (ta.join(' ') === tb.join(' ')) return true;
        const [pt, gd] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
        return pt.every(x => gd.some(y => scJetonEgal(x, y)));
      };
      // Championnat national principal d'une équipe, hors pari analysé (au moins 2 paris)
      const topNational = (tokens, sauf) => {
        const c = {};
        info.forEach(o => {
          if (o.b === sauf || !o.comp || vcEstEurope(o.comp)) return;
          if (o.eq.some(t => meme(t, tokens))) c[o.comp] = (c[o.comp] || 0) + 1;
        });
        const k = Object.keys(c).sort((x, y) => c[y] - c[x]);
        return k.length && c[k[0]] >= 2 ? { comp: k[0], n: c[k[0]], tout: c } : null;
      };
      const ignores = new Set(scLire(VC_IGN, []));
      const lignes = [];
      const groupes = {};
      info.forEach(o => { const k = o.b.date + '|' + String(o.b.match).toLowerCase(); (groupes[k] = groupes[k] || new Set()).add(o.comp); });

      info.forEach(o => {
        if (ignores.has(String(o.b.id))) return;
        const [h, a] = o.eq;
        let sugg = null, raison = '';
        if (!o.comp) {
          sugg = devinerCompetitionParEquipes((o.b.match.split(/\s+(?:vs\.?|v|-|–|—)\s+/i)[0] || ''), (o.b.match.split(/\s+(?:vs\.?|v|-|–|—)\s+/i)[1] || ''));
          raison = 'Championnat vide';
        } else if (h && a) {
          const th = topNational(h, o.b), ta = topNational(a, o.b);
          if (th && ta && th.comp === ta.comp && th.comp !== o.comp) {
            sugg = th.comp; raison = `Les deux équipes jouent ailleurs en ${th.comp} (${th.n} et ${ta.n} paris)`;
          } else if (!vcEstEurope(o.comp)) {
            const un = th && !ta ? th : ta && !th ? ta : null;
            if (un && un.n >= 3 && !un.tout[o.comp] && un.comp !== o.comp) {
              sugg = un.comp; raison = `Une des équipes est toujours notée ${un.comp} (${un.n} paris)`;
            }
          }
        }
        const dbl = groupes[o.b.date + '|' + String(o.b.match).toLowerCase()];
        if (!sugg && dbl && dbl.size > 1) { sugg = o.comp; raison = 'Ce même match existe avec deux championnats différents'; }
        if (raison) lignes.push({ id: o.b.id, date: o.b.date, match: o.b.match, comp: o.comp, sugg: sugg || '', raison });
      });
      return lignes.sort((x, y) => (y.date || '').localeCompare(x.date || ''));
    }

    function ouvrirVerifComp() {
      let m = document.getElementById('compModal');
      if (!m) {
        m = document.createElement('div');
        m.id = 'compModal';
        m.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50';
        document.body.appendChild(m);
      }
      m.classList.remove('hidden');
      vcLignes = vcAnalyser();
      vcDessiner();
    }
    function fermerVerifComp() { const m = document.getElementById('compModal'); if (m) m.classList.add('hidden'); }

    function vcDessiner() {
      const m = document.getElementById('compModal');
      if (!m) return;
      const comps = Array.from(new Set((state.football || []).map(b => (b.comp || '').trim()).filter(Boolean))).sort();
      const lignes = vcLignes.map((l, i) => `
        <div class="border border-slate-200 rounded-xl p-3 space-y-2" id="vcL${i}">
          <div class="flex justify-between gap-2 text-xs">
            <div class="font-bold text-slate-800">${escAttr(l.match)}</div>
            <div class="text-slate-400 shrink-0">${escAttr(l.date || '')}</div>
          </div>
          <div class="text-[11px] text-slate-500">Actuellement : <b class="text-rose-600">${escAttr(l.comp || 'vide')}</b> · ${escAttr(l.raison)}</div>
          <div class="flex flex-wrap items-center gap-2">
            <select id="vcS${i}" class="input-field text-xs py-1">
              ${l.sugg ? '' : '<option value="">— choisir —</option>'}
              ${comps.map(c => `<option value="${escAttr(c)}" ${c === l.sugg ? 'selected' : ''}>${escAttr(c)}</option>`).join('')}
            </select>
            <button onclick="vcCorriger(${i})" class="text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg">Corriger</button>
            <button onclick="vcIgnorer(${i})" class="text-[11px] font-bold text-slate-500 hover:text-slate-700 px-2 py-1">Garder tel quel</button>
          </div>
        </div>`).join('');
      m.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[88vh] flex flex-col">
          <div class="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
            <div>
              <h3 class="font-extrabold text-sm text-slate-800">🔎 Vérification des championnats</h3>
              <p class="text-[11px] text-slate-500 mt-1">Compare le championnat de chaque pari avec celui des autres paris des mêmes équipes. Les matchs de coupe d'Europe entre équipes de pays différents sont considérés normaux.</p>
            </div>
            <button onclick="fermerVerifComp()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="p-4 space-y-3 overflow-y-auto">
            ${vcLignes.length ? `<p class="text-xs font-bold text-slate-700">${vcLignes.length} pari(s) à vérifier</p>${lignes}
            <button onclick="vcToutCorriger()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2.5 rounded-lg text-xs">Tout corriger avec les choix ci-dessus</button>`
            : '<p class="text-sm text-emerald-700 font-bold">✅ Aucune incohérence trouvée.</p>'}
          </div>
        </div>`;
    }

    function vcAppliquer(i) {
      const l = vcLignes[i]; if (!l) return false;
      const v = (document.getElementById('vcS' + i) || {}).value;
      if (!v) return false;
      const bet = (state.football || []).find(b => b.id === l.id);
      if (!bet) return false;
      bet.comp = v;
      return true;
    }
    function vcCorriger(i) {
      if (!vcAppliquer(i)) { alert('Choisis d\'abord un championnat dans la liste.'); return; }
      saveState();
      vcLignes = vcAnalyser(); vcDessiner();
    }
    function vcToutCorriger() {
      let n = 0;
      vcLignes.forEach((l, i) => { if (vcAppliquer(i)) n++; });
      if (n) saveState();
      vcLignes = vcAnalyser(); vcDessiner();
    }
    function vcIgnorer(i) {
      const l = vcLignes[i]; if (!l) return;
      const liste = scLire(VC_IGN, []); liste.push(String(l.id)); scEcrire(VC_IGN, liste);
      vcLignes = vcAnalyser(); vcDessiner();
    }

    function ouvrirScores() {
      let m = document.getElementById('scoresModal');
      if (!m) {
        m = document.createElement('div');
        m.id = 'scoresModal';
        m.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50';
        document.body.appendChild(m);
      }
      m.classList.remove('hidden');
      dessinerScores();
    }
    function fermerScores() { const m = document.getElementById('scoresModal'); if (m) m.classList.add('hidden'); }

    function dessinerScores(enCours) {
      const m = document.getElementById('scoresModal');
      if (!m) return;
      const cfg = scLire(SC_CFG, {});
      const nbAttente = (state.football || []).filter(b => b.status === 'Pending').length;
      m.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[88vh] flex flex-col">
          <div class="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
            <div>
              <h3 class="font-extrabold text-sm text-slate-800">⚽ Scores des matchs</h3>
              <p class="text-[11px] text-slate-500 mt-1">Affiche le score à côté de tes paris « En cours ». Rien n'est validé automatiquement : c'est toi qui cliques ✅ / ❌.</p>
            </div>
            <button onclick="fermerScores()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="p-4 space-y-3 overflow-y-auto">
            <p class="text-[11px] text-slate-600">Source principale : <b>ESPN</b> (gratuit, sans clé, avec la minute du match). Championnats couverts : Ligue 1, Ligue 2, Premier League, Liga, Serie A, Bundesliga, Ligue des Champions, Europa League et Conférence League.</p>
            <label class="block text-[11px] font-bold text-slate-600">Clé football-data.org (facultative, sert de secours)
              <input id="scKey" type="password" autocomplete="off" value="${escAttr(cfg.key || '')}" placeholder="Colle ta clé ici (ou laisse vide)" class="input-field w-full text-xs mt-1 font-mono">
            </label>
            <p class="text-[10px] text-slate-400">Utilisée seulement pour les matchs qu'ESPN ne trouve pas. Elle reste sur cet appareil.</p>
            <details class="text-[11px] text-slate-500">
              <summary class="cursor-pointer font-bold">Avancé : adresse d'un relais (seulement si le navigateur bloque l'appel)</summary>
              <input id="scRelay" type="text" value="${escAttr(cfg.relay || '')}" placeholder="https://mon-relais.exemple.com" class="input-field w-full text-xs mt-2 font-mono">
            </details>
            <label class="flex items-center gap-2 text-[11px] font-bold text-slate-600">
              <input id="scAuto" type="checkbox" ${cfg.auto === false ? '' : 'checked'}> Actualiser automatiquement (appli ouverte) : toutes les minutes pendant un match, sinon toutes les 5 minutes
            </label>
            <button onclick="scRecuperer()" ${enCours ? 'disabled' : ''} class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2.5 rounded-lg text-xs transition ${enCours ? 'opacity-50' : ''}">
              <i class="fa-solid fa-rotate mr-1"></i> ${enCours ? 'Recherche en cours…' : `Récupérer les scores (${nbAttente} pari(s) en cours)`}
            </button>
            <div id="scLog" class="text-[11px] text-slate-600 whitespace-pre-line">${scLog}</div>
          </div>
        </div>`;
    }

    let scEnCours = false;
    function scModalOuverte() { const m = document.getElementById('scoresModal'); return !!(m && !m.classList.contains('hidden')); }

    // ---------- Source principale : ESPN (gratuit, sans clé, avec la minute) ----------
    const SC_ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
    function scSlugEspn(comp) {
      const c = (comp || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!c || /\bq\b|qualif/.test(c)) return null;           // tours de qualification : non couverts
      if (/^ligue 1$/.test(c)) return 'fra.1';
      if (/^ligue 2$/.test(c)) return 'fra.2';
      if (/^premier league$/.test(c)) return 'eng.1';
      if (/^(la )?liga$/.test(c)) return 'esp.1';
      if (/^serie a$/.test(c)) return 'ita.1';
      if (/^bundesliga$/.test(c)) return 'ger.1';
      if (/^ligue des champions$/.test(c)) return 'uefa.champions';
      if (/^ligue europa$/.test(c)) return 'uefa.europa';
      if (/^ligue conference$/.test(c)) return 'uefa.europa.conf';
      return null;
    }
    function scStatutEspn(st) {
      const t = (st && st.type) || {}, n = String(t.name || '');
      if (/POSTPONED/.test(n)) return 'POSTPONED';
      if (/CANCEL|ABANDON/.test(n)) return 'CANCELLED';
      if (/SUSPEND/.test(n)) return 'SUSPENDED';
      if (/DELAY/.test(n)) return 'TIMED';
      if (/HALFTIME/.test(n)) return 'PAUSED';
      if (t.state === 'in') return 'IN_PLAY';
      if (t.state === 'post') return t.completed === false ? 'SUSPENDED' : 'FINISHED';
      return 'TIMED';
    }
    function scEspnVersMatch(e) {
      const c = e && e.competitions && e.competitions[0]; if (!c) return null;
      const h = (c.competitors || []).find(x => x.homeAway === 'home'), a = (c.competitors || []).find(x => x.homeAway === 'away');
      if (!h || !a || !h.team || !a.team) return null;
      const eq = x => ({ name: x.team.displayName || '', shortName: x.team.shortDisplayName || x.team.name || '', tla: x.team.abbreviation || '' });
      const sc = x => { const n = parseInt(x.score, 10); return Number.isFinite(n) ? n : null; };
      const stt = e.status || {};
      const mm = /(\d+)'?(?:\s*\+\s*(\d+))?/.exec(String(stt.displayClock || ''));
      return { homeTeam: eq(h), awayTeam: eq(a), utcDate: e.date, esp: { h: sc(h), a: sc(a), st: scStatutEspn(stt), per: +stt.period || 0, mn: mm ? +mm[1] : null, it: mm && mm[2] != null ? +mm[2] : null } };
    }
    // Interroge ESPN pour les paris dont le championnat est couvert. Renvoie les identifiants de paris trouvés.
    async function scEspnRecuperer(bets) {
      const trouves = new Set();
      const uniq = [...new Set(bets.map(b => { const s = scSlugEspn(b.comp); return s ? s + '|' + b.date : null; }).filter(Boolean))];
      if (!uniq.length) return { trouves, ok: 0, essais: 0 };
      const parSlug = {};
      let ok = 0;
      for (let i = 0; i < uniq.length; i += 6) {
        await Promise.all(uniq.slice(i, i + 6).map(async k => {
          const [slug, jour] = k.split('|');
          try {
            const r = await fetch(SC_ESPN + slug + '/scoreboard?dates=' + jour.replace(/-/g, ''), { cache: 'no-store' });
            if (!r.ok) return;
            const d = await r.json(); ok++;
            (d.events || []).forEach(e => { const m = scEspnVersMatch(e); if (m) (parSlug[slug] = parSlug[slug] || []).push(m); });
          } catch (e) {}
        }));
      }
      bets.forEach(b => {
        const s = scSlugEspn(b.comp); if (!s) return;
        const m = scTrouverMatch(b, parSlug[s] || []);
        if (!m) return;
        const x = m.esp;
        scoresCache[b.id] = { h: x.h, a: x.a, st: x.st, mn: x.mn, it: x.it, per: x.per, ko: m.utcDate, src: 'espn', t: Date.now() };
        trouves.add(b.id);
      });
      return { trouves, ok, essais: uniq.length };
    }

    // ---------- Secours : football-data.org (clé facultative) ----------
    async function scFdRecuperer(bets, key, relay, silencieux, dessiner) {
      const base = relay || SC_BASE;
      const jours = [...new Set(bets.map(b => b.date))].sort();
      const fenetres = [];
      jours.forEach(j => {
        const last = fenetres[fenetres.length - 1];
        if (last && scEcartJours(last.from, j) <= 6) last.to = j; else fenetres.push({ from: j, to: j });
      });
      let matchs = [];
      try {
        for (let i = 0; i < fenetres.length; i++) {
          if (i > 0) { if (!silencieux) { scLog = `Pause pour respecter la limite de football-data (${i}/${fenetres.length})…`; dessiner(true); } await scPause(6500); }
          const f = fenetres[i];
          const url = `${base}/v4/matches?dateFrom=${scAjouterJours(f.from, -1)}&dateTo=${scAjouterJours(f.to, 1)}`;
          let rep;
          try { rep = await fetch(url, { headers: { 'X-Auth-Token': key } }); }
          catch (e) { return { erreur: 'football-data injoignable (blocage « CORS » ou pas de connexion)', introuvables: bets, ok: 0 }; }
          if (rep.status === 429) return { erreur: 'football-data : trop de requêtes, réessaie dans une minute', introuvables: bets, ok: 0 };
          if (rep.status === 400 || rep.status === 401 || rep.status === 403) return { erreur: 'football-data : clé refusée (' + rep.status + ')', introuvables: bets, ok: 0 };
          if (!rep.ok) return { erreur: 'football-data : erreur du service (' + rep.status + ')', introuvables: bets, ok: 0 };
          const data = await rep.json();
          matchs = matchs.concat(data.matches || []);
        }
      } catch (e) { return { erreur: 'football-data : réponse illisible', introuvables: bets, ok: 0 }; }
      let ok = 0; const introuvables = [];
      bets.forEach(b => {
        const m = scTrouverMatch(b, matchs);
        if (!m) { introuvables.push(b); return; }
        const sc = m.score || {};
        const fin2 = sc.regularTime || sc.fullTime || {};
        scoresCache[b.id] = { h: fin2.home, a: fin2.away, hh: (sc.halfTime || {}).home, ha: (sc.halfTime || {}).away, st: m.status, mn: m.minute, it: m.injuryTime, ko: m.utcDate, src: 'fd', t: Date.now() };
        ok++;
      });
      return { erreur: null, introuvables, ok };
    }

    // auto = true : actualisation silencieuse (matchs d'hier et d'aujourd'hui dont le score final n'est pas connu).
    async function scRecuperer(auto) {
      if (scEnCours) return;
      const silencieux = auto === true;
      const cfgSauve = scLire(SC_CFG, {});
      let key = (cfgSauve.key || '').trim(), relay = cfgSauve.relay || '';
      if (!silencieux) {
        key = ((document.getElementById('scKey') || {}).value || '').trim();
        relay = ((document.getElementById('scRelay') || {}).value || '').trim().replace(/\/+$/, '');
        const autoBox = document.getElementById('scAuto');
        scEcrire(SC_CFG, { key, relay, auto: autoBox ? autoBox.checked : cfgSauve.auto });
      }
      const dessiner = (x) => { if (!silencieux || scModalOuverte()) dessinerScores(x); };

      const aujStr = jourLocal();
      const limite = scAjouterJours(aujStr, silencieux ? -1 : -10);
      const tous = (state.football || []).filter(b => b.status === 'Pending' && b.date && b.date <= aujStr);
      let bets = tous.filter(b => b.date >= limite);
      if (silencieux) bets = bets.filter(b => !(scoresCache[b.id] && scoresCache[b.id].st === 'FINISHED'));
      const anciens = silencieux ? 0 : tous.length - bets.length;
      if (!bets.length) {
        if (!silencieux) { scLog = 'Aucun pari « En cours » des 10 derniers jours à vérifier.' + (anciens ? `\n${anciens} pari(s) plus ancien(s) ignoré(s).` : ''); dessinerScores(); }
        return;
      }

      scEnCours = true;
      if (!silencieux) { scLog = ''; dessinerScores(true); }
      let nbEspn = 0, esp = { trouves: new Set(), ok: 0, essais: 0 }, fd = null;
      try {
        esp = await scEspnRecuperer(bets);
        nbEspn = esp.trouves.size;
        const restants = bets.filter(b => !esp.trouves.has(b.id));
        if (restants.length && key) fd = await scFdRecuperer(restants, key, relay, silencieux, dessiner);
        else fd = { erreur: null, introuvables: restants, ok: 0 };
      } catch (e) {
        fd = { erreur: 'erreur inattendue : ' + e.message, introuvables: [], ok: 0 };
      }
      const ids = new Set((state.football || []).map(b => String(b.id)));
      Object.keys(scoresCache).forEach(k => { if (!ids.has(k)) delete scoresCache[k]; });
      scEcrire(SC_KEY, scoresCache);

      const lignes = [];
      lignes.push(`✅ ${nbEspn + fd.ok} match(s) trouvé(s) sur ${bets.length}` + (nbEspn || fd.ok ? ` (ESPN : ${nbEspn}${key ? ` · football-data : ${fd.ok}` : ''})` : '') + '.');
      if (esp.essais && !esp.ok) lignes.push('⚠️ ESPN n\'a pas répondu' + (key ? ' : football-data a pris le relais.' : '. Tu peux ajouter une clé football-data comme secours.'));
      if (fd.erreur) lignes.push('⚠️ ' + fd.erreur + '.');
      if (anciens) lignes.push(`${anciens} pari(s) « En cours » de plus de 10 jours ignoré(s).`);
      if (fd.introuvables.length) lignes.push(`\nNon trouvés (compétition non couverte ou nom d'équipe différent) :\n• ` + fd.introuvables.slice(0, 15).map(b => b.match).join('\n• '));
      scLog = lignes.join('\n');
      scEnCours = false;
      if (!silencieux || scModalOuverte()) dessinerScores();
      render();
    }

    // Actualisation automatique (appli visible) : toutes les minutes tant qu'un match de tes paris est
    // en cours ou sur le point de commencer, sinon toutes les 5 minutes. ESPN n'a pas besoin de clé.
    function scLiveEnCours() {
      const now = Date.now();
      return (state.football || []).some(b => {
        if (b.status !== 'Pending') return false;
        const r = scoresCache[b.id];
        if (!r || r.st === 'FINISHED') return false;
        if (r.st === 'IN_PLAY' || r.st === 'PAUSED') return true;
        const t = Date.parse(r.ko || '');
        return !!t && t < now + 15 * 60000 && t > now - 3.5 * 3600000;
      });
    }
    let scDerniereAuto = 0;
    function scAutoTick() {
      try {
        if (document.hidden || !navigator.onLine) return;
        const cfg = scLire(SC_CFG, {});
        if (cfg.auto === false) return;
        const delai = scLiveEnCours() ? 60000 : 5 * 60000;
        if (Date.now() - scDerniereAuto < delai - 2000) return;
        scDerniereAuto = Date.now();
        scRecuperer(true);
      } catch (e) {}
    }
    setInterval(scAutoTick, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scAutoTick(); });
    window.addEventListener('load', () => setTimeout(scAutoTick, 4000));

    // ===================== GÉNÉRATEUR DE COMBINÉS =====================
    // Principe : les paris sont rangés dans l'ordre où ils ont été ajoutés ; le 1er est combiné avec
    // le dernier, le 2e avec l'avant-dernier, et ainsi de suite. S'il y en a un nombre impair, celui
    // du milieu reste en simple. Deux paris du même match ne sont jamais combinés ensemble.
    let dernierLotCombines = null;

    function jourLocal() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    let genJour = null;
    const GEN_PREF = 'pronotracker_gen_pref';
    // Championnats exclus par défaut des combinés (modifiable avec les cases dans la fenêtre).
    // Version 2 : ajout de la Ligue Europa et de la Ligue Conférence aux exclusions de départ.
    const GEN_DEFAUT = ['Ligue 2', 'Ligue Europa', 'Ligue Conférence', 'Ligue Europa Q', 'Ligue Conférence Q'];
    let genExclus = (() => {
      const pref = scLire(GEN_PREF, null);
      const liste = new Set((pref && pref.exclus) || ['Ligue 2']);
      if (!pref || pref.v !== 2) { GEN_DEFAUT.forEach(c => liste.add(c)); scEcrire(GEN_PREF, { exclus: Array.from(liste), v: 2 }); }
      return liste;
    })();
    let genRefaire = true;

    // Combinés « refaisables » du jour : tous leurs paris sont de ce jour et encore en cours.
    function combosRefaisables(jour) {
      const parId = {};
      (state.football || []).forEach(b => { parId[String(b.id)] = b; });
      return (state.combos.football || []).filter(c => {
        const legs = (c.legIds || []).map(id => parId[String(id)]);
        return legs.length && legs.every(b => b && b.date === jour && b.status === 'Pending');
      });
    }

    function calculerPaires(jour) {
      const list = state.football || [];
      const refaisables = genRefaire ? combosRefaisables(jour) : [];
      const libres = new Set();
      refaisables.forEach(c => (c.legIds || []).forEach(id => libres.add(String(id))));
      const dansCombo = new Set();
      (state.combos.football || []).forEach(c => (c.legIds || []).forEach(id => dansCombo.add(String(id))));
      const eligibles = list
        .filter(b => libres.has(String(b.id)) || (!b.comboId && !dansCombo.has(String(b.id))))
        .filter(b => b.date === jour)
        .filter(b => !genExclus.has((b.comp || '').trim()))
        .slice()
        .sort((a, b) => (Number(a.id) - Number(b.id)));
      const paires = [], restes = [];
      let i = 0, j = eligibles.length - 1;
      while (i < j) {
        const x = eligibles[i], y = eligibles[j];
        const kx = normalizeMatchName(x.match), ky = normalizeMatchName(y.match);
        if (kx && kx === ky) { restes.push(x, y); }       // même match : pas de combiné
        else paires.push([x, y]);
        i++; j--;
      }
      if (i === j) restes.push(eligibles[i]);
      return { paires, restes, refaisables };
    }

    function ouvrirGenerateurCombines() {
      let m = document.getElementById('genComboModal');
      if (!m) {
        m = document.createElement('div');
        m.id = 'genComboModal';
        m.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50';
        document.body.appendChild(m);
      }
      m.classList.remove('hidden');
      genJour = jourLocal();
      majApercuGenerateur();
    }

    function fermerGenerateurCombines() {
      const m = document.getElementById('genComboModal');
      if (m) m.classList.add('hidden');
    }

    function genBasculerComp(nom, coche) {
      if (coche) genExclus.add(nom); else genExclus.delete(nom);
      scEcrire(GEN_PREF, { exclus: Array.from(genExclus), v: 2 });
      majApercuGenerateur();
    }

    function majApercuGenerateur() {
      const m = document.getElementById('genComboModal');
      if (!m) return;
      if (!genJour) genJour = jourLocal();
      const { paires, restes, refaisables } = calculerPaires(genJour);
      const f = n => (Number(n) || 1).toFixed(2).replace('.', ',');
      const compsDuJour = Array.from(new Set((state.football || []).filter(b => b.date === genJour).map(b => (b.comp || '').trim()).filter(Boolean))).sort();
      genExclus.forEach(c => { if (!compsDuJour.includes(c)) compsDuJour.push(c); });
      const caseComps = compsDuJour.map(c => `
        <label class="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-lg px-2 py-1">
          <input type="checkbox" ${genExclus.has(c) ? 'checked' : ''} onchange="genBasculerComp(this.getAttribute('data-c'), this.checked)" data-c="${escAttr(c)}"> ${escAttr(c)}
        </label>`).join(' ');
      const lignes = paires.map(([x, y], k) => `
        <div class="text-[11px] px-3 py-2 border-b border-slate-100">
          <div class="font-bold text-slate-700">Combiné ${k + 1} · cote ${f((x.odds || 1) * (y.odds || 1))} · mise ${f(x.stake || 1)} €</div>
          <div class="text-slate-600 truncate">① ${escAttr(x.match || '')} — ${escAttr(x.prono || '')} <span class="text-blue-600 font-bold">${f(x.odds)}</span></div>
          <div class="text-slate-600 truncate">② ${escAttr(y.match || '')} — ${escAttr(y.prono || '')} <span class="text-blue-600 font-bold">${f(y.odds)}</span></div>
        </div>`).join('');
      m.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[88vh] flex flex-col">
          <div class="p-4 border-b border-slate-100">
            <h3 class="font-extrabold text-sm text-slate-800"><i class="fa-solid fa-wand-magic-sparkles text-violet-600 mr-1"></i> Générer les combinés</h3>
            <p class="text-[11px] text-slate-500 mt-1">1er pari ajouté + dernier, 2e + avant-dernier, et ainsi de suite. Chaque combiné reprend la mise du 1er pari. Seuls les paris de la date choisie (aujourd'hui par défaut) sont utilisés.</p>
            <label class="block text-[11px] font-bold text-slate-600 mt-3">Paris du jour :
              <input type="date" id="genJour" value="${genJour}" onchange="genJour = this.value; majApercuGenerateur()" class="input-field w-full text-xs mt-1">
            </label>
            <div class="mt-3">
              <div class="text-[11px] font-bold text-slate-600 mb-1">Ne pas utiliser ces championnats (cochés = exclus) :</div>
              <div class="flex flex-wrap gap-1.5">${caseComps || '<span class="text-[11px] text-slate-400 italic">Aucun pari ce jour-là</span>'}</div>
            </div>
            ${combosAvecExclus().length ? `<button onclick="sortirExclusDesCombines()" class="mt-3 w-full text-[11px] font-bold bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 px-3 py-2 rounded-lg">Retirer ces championnats des ${combosAvecExclus().length} combiné(s) déjà faits (tous jours confondus)</button>` : ''}
            <label class="flex items-start gap-2 text-[11px] font-bold text-slate-600 mt-3">
              <input type="checkbox" class="mt-0.5" ${genRefaire ? 'checked' : ''} onchange="genRefaire = this.checked; majApercuGenerateur()">
              <span>Refaire les combinés de ce jour déjà créés (seulement ceux dont tous les paris sont encore en cours)${refaisables.length ? ` — ${refaisables.length} concerné(s)` : ''}</span>
            </label>
          </div>
          <div class="overflow-y-auto flex-1">${lignes || '<p class="text-xs text-slate-400 italic p-4">Aucune paire possible : il faut au moins 2 paris ce jour-là (de matchs différents).</p>'}</div>
          <div class="p-4 border-t border-slate-100 flex items-center gap-2">
            <span class="text-[11px] text-slate-500 flex-1">${paires.length} combiné(s)${restes.length ? ` · ${restes.length} pari(s) restent en simple` : ''}</span>
            <button onclick="fermerGenerateurCombines()" class="text-xs font-bold text-slate-500 px-3 py-2">Annuler</button>
            <button onclick="genererCombines()" ${paires.length || refaisables.length ? '' : 'disabled'} class="text-xs font-bold bg-violet-600 text-white px-4 py-2 rounded-lg ${paires.length || refaisables.length ? '' : 'opacity-40'}">Générer ${paires.length}</button>
          </div>
        </div>`;
    }

    function genererCombines() {
      const jour = genJour || jourLocal();
      const { paires, refaisables } = calculerPaires(jour);
      if (!paires.length && !refaisables.length) return;
      // 1) Défaire les anciens combinés refaisables (mémorisés pour pouvoir annuler)
      const defaits = [];
      const parId = {};
      (state.football || []).forEach(b => { parId[String(b.id)] = b; });
      refaisables.forEach(c => {
        defaits.push({ combo: JSON.parse(JSON.stringify(c)) });
        (c.legIds || []).forEach(id => { const b = parId[String(id)]; if (b) delete b.comboId; });
      });
      const sup = new Set(refaisables.map(c => String(c.id)));
      state.combos.football = (state.combos.football || []).filter(c => !sup.has(String(c.id)));
      // 2) Créer les nouveaux
      const base = Date.now();
      const ids = [];
      paires.forEach(([x, y], k) => {
        const combo = { id: base + k, stake: parseFloat(x.stake) > 0 ? parseFloat(x.stake) : 1, legIds: [x.id, y.id], createdAt: new Date().toISOString() };
        x.comboId = combo.id; y.comboId = combo.id;
        state.combos.football.push(combo);
        ids.push(combo.id);
      });
      dernierLotCombines = { ids, defaits };
      fermerGenerateurCombines();
      saveState();
      const bar = document.getElementById('annulerGenBar');
      if (bar) bar.remove();
      const box = document.getElementById('combosListContainer');
      const txt = `✓ ${ids.length} combiné(s) généré(s)` + (defaits.length ? ` · ${defaits.length} ancien(s) remplacé(s)` : '');
      if (box) box.insertAdjacentHTML('beforebegin', `<div id="annulerGenBar" class="flex items-center justify-between gap-3 bg-violet-50 border border-violet-200 text-violet-800 text-xs font-semibold px-4 py-2 rounded-xl"><span>${txt}</span><button onclick="annulerGeneration()" class="font-bold underline">Annuler cette génération</button></div>`);
    }

    function annulerGeneration() {
      if (!dernierLotCombines) return;
      const lot = new Set(dernierLotCombines.ids.map(String));
      (state.football || []).forEach(b => { if (b.comboId != null && lot.has(String(b.comboId))) delete b.comboId; });
      state.combos.football = (state.combos.football || []).filter(c => !lot.has(String(c.id)));
      // Remettre les anciens combinés
      const parId = {};
      (state.football || []).forEach(b => { parId[String(b.id)] = b; });
      (dernierLotCombines.defaits || []).forEach(d => {
        state.combos.football.push(d.combo);
        (d.combo.legIds || []).forEach(id => { const b = parId[String(id)]; if (b) b.comboId = d.combo.id; });
      });
      dernierLotCombines = null;
      const bar = document.getElementById('annulerGenBar');
      if (bar) bar.remove();
      saveState();
    }

    // ---- Retirer des championnats des combinés déjà faits ----
    let derniereSortie = null;
    function combosAvecExclus() {
      if (!genExclus.size) return [];
      const parId = {};
      (state.football || []).forEach(b => { parId[String(b.id)] = b; });
      return (state.combos.football || []).filter(c => (c.legIds || []).some(id => { const b = parId[String(id)]; return b && genExclus.has((b.comp || '').trim()); }));
    }
    function sortirExclusDesCombines() {
      const concernes = combosAvecExclus();
      if (!concernes.length) return;
      if (!confirm(`Retirer ${Array.from(genExclus).join(', ')} de ${concernes.length} combiné(s) ?\n\nLe pari exclu devient un pari simple, et l'autre pari du combiné aussi. Aucun pari n'est supprimé. Tu pourras annuler juste après.`)) return;
      const parId = {};
      (state.football || []).forEach(b => { parId[String(b.id)] = b; });
      const snapshot = concernes.map(c => JSON.parse(JSON.stringify(c)));
      const supprimes = new Set();
      concernes.forEach(c => {
        const reste = [];
        (c.legIds || []).forEach(id => {
          const b = parId[String(id)];
          if (!b) return;
          if (genExclus.has((b.comp || '').trim())) delete b.comboId; else reste.push(b);
        });
        if (reste.length >= 2) c.legIds = reste.map(b => b.id);
        else { reste.forEach(b => delete b.comboId); supprimes.add(String(c.id)); }
      });
      state.combos.football = (state.combos.football || []).filter(c => !supprimes.has(String(c.id)));
      derniereSortie = snapshot;
      fermerGenerateurCombines();
      saveState();
      const bar = document.getElementById('annulerGenBar');
      if (bar) bar.remove();
      const box = document.getElementById('combosListContainer');
      if (box) box.insertAdjacentHTML('beforebegin', `<div id="annulerGenBar" class="flex items-center justify-between gap-3 bg-violet-50 border border-violet-200 text-violet-800 text-xs font-semibold px-4 py-2 rounded-xl"><span>✓ ${concernes.length} combiné(s) modifié(s)</span><button onclick="annulerSortieExclus()" class="font-bold underline">Annuler</button></div>`);
    }
    function annulerSortieExclus() {
      if (!derniereSortie) return;
      const parId = {};
      (state.football || []).forEach(b => { parId[String(b.id)] = b; });
      derniereSortie.forEach(old => {
        const i = state.combos.football.findIndex(c => String(c.id) === String(old.id));
        if (i >= 0) state.combos.football[i] = old; else state.combos.football.push(old);
        (old.legIds || []).forEach(id => { const b = parId[String(id)]; if (b) b.comboId = old.id; });
      });
      derniereSortie = null;
      const bar = document.getElementById('annulerGenBar');
      if (bar) bar.remove();
      saveState();
    }

    function renderCombos() {
      const container = document.getElementById('combosListContainer');
      if (!container) return;
      const combos = state.combos[currentSport] || [];

      if (combos.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 italic">Aucun combiné pour l'instant. Coche 2 paris ou plus dans l'Historique pour en créer un.</p>`;
        return;
      }

      // Statut / cote / gain calculés une seule fois par combiné.
      const rows = combos.map(c => {
        const legs = comboLegs(currentSport, c);
        // Date du combiné = date de son match le plus tardif (ISO AAAA-MM-JJ, donc comparable en texte).
        const date = legs.reduce((mx, l) => (l.date && l.date > mx ? l.date : mx), '');
        return {
          combo: c,
          legs: legs,
          date: date,
          status: comboStatus(currentSport, c),
          odds: comboOdds(currentSport, c),
          profit: comboProfit(currentSport, c)
        };
      }).sort((a, b) => (b.date.localeCompare(a.date)) || (Number(b.combo.id) - Number(a.combo.id)));

      const count = { Pending: 0, Won: 0, Lost: 0 };
      let settledStake = 0, totalProfit = 0;
      rows.forEach(r => {
        count[r.status]++;
        if (r.status !== 'Pending') { settledStake += (r.combo.stake || 0); totalProfit += r.profit; }
      });
      const roi = settledStake > 0 ? (totalProfit / settledStake) * 100 : null;
      const profitCls = totalProfit > 0 ? 'text-emerald-600' : totalProfit < 0 ? 'text-rose-600' : 'text-slate-500';

      const termes = normTexte(comboSearch).split(/\s+/).filter(Boolean);
      const matchRecherche = r => {
        if (!termes.length) return true;
        const texte = normTexte(r.legs.map(l => `${l.match} ${l.prono} ${l.comp} ${l.market}`).join(' '));
        return termes.every(t => texte.includes(t));
      };
      const filtered = rows.filter(r => (comboFilter === 'ALL' || r.status === comboFilter) && matchRecherche(r));
      const visible = filtered.slice(0, visibleCombosCount);

      const pill = (key, label, n) => {
        const active = comboFilter === key;
        return `<button onclick="setComboFilter('${key}')" class="px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${active ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}">${label} <span class="${active ? 'text-violet-200' : 'text-slate-400'}">${n}</span></button>`;
      };

      let html = `
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${pill('ALL', 'Tous', rows.length)}
            ${pill('Pending', '⏳ En cours', count.Pending)}
            ${pill('Won', '✅ Gagnés', count.Won)}
            ${pill('Lost', '❌ Perdus', count.Lost)}
          </div>
          <div class="text-[11px] text-slate-500 font-semibold">
            Bilan réglés : <span class="font-black ${profitCls}">${fmtMoney(totalProfit, true)}</span>${roi !== null ? ` · ROI <span class="font-black ${profitCls}">${roi >= 0 ? '+' : '−'}${Math.abs(roi).toFixed(1).replace('.', ',')} %</span>` : ''}
          </div>
        </div>`;

      if (visible.length === 0) {
        html += `<p class="text-xs text-slate-400 italic pt-2">${termes.length ? 'Aucun combiné ne correspond à cette recherche.' : 'Aucun combiné dans cette catégorie.'}</p>`;
      }

      const barColor = { Pending: 'border-l-amber-400', Won: 'border-l-emerald-500', Lost: 'border-l-rose-500' };
      const dotColor = { Pending: 'bg-amber-400', Won: 'bg-emerald-500', Lost: 'bg-rose-500' };

      html += `<div class="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">`;
      html += visible.map(r => {
       try {
        const { combo, legs, status, odds, profit } = r;
        const expanded = isComboExpanded(combo.id);
        const potentiel = (combo.stake || 0) * odds;

        // Résumé : "Lyon · PSG · Nice" (les noms trop longs sont tronqués par le CSS)
        const resume = legs.length ? legs.map(l => escAttr(l.match || '?')).join('  ·  ') : '⚠️ Sélections introuvables (paris supprimés ?)';
        const dots = legs.map(l => `<span class="inline-block w-1.5 h-1.5 rounded-full ${dotColor[l.status] || dotColor.Pending}"></span>`).join('');

        let gain;
        if (status === 'Pending') gain = `<span class="text-slate-400" title="Gain potentiel">→ ${fmtMoney(potentiel)}</span>`;
        else gain = `<span class="font-black ${profit > 0 ? 'text-emerald-600' : 'text-rose-600'}">${fmtMoney(profit, true)}</span>`;

        const head = `
          <div onclick="toggleComboExpand(${combo.id})" class="border-l-4 ${barColor[status]} px-3 py-2.5 cursor-pointer select-none hover:bg-slate-50 transition flex items-center gap-3">
            <i class="fa-solid fa-chevron-${expanded ? 'down' : 'right'} text-slate-300 text-[10px] w-2 shrink-0"></i>
            <div class="min-w-0 flex-1">
              <div class="text-xs font-bold text-slate-800 truncate">${resume}</div>
              <div class="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 font-semibold">
                <span class="inline-flex items-center gap-0.5">${dots}</span>
                <span>${legs.length} sél.</span>${r.date ? `<span>· ${r.date.split('-').reverse().join('/')}</span>` : ''}
              </div>
            </div>
            <div class="text-right shrink-0 leading-tight">
              <div class="text-xs"><span class="font-black text-blue-600">${odds.toFixed(2).replace('.', ',')}</span> <span class="text-slate-400">×</span> <span class="font-bold text-slate-700">${fmtMoney(combo.stake || 0)}</span></div>
              <div class="text-[11px] mt-0.5">${gain}</div>
            </div>
          </div>`;

        if (!expanded) return `<div>${head}</div>`;

        const legsHtml = legs.map(l => `
          <div class="flex items-center gap-2 text-[11px] px-3 py-1.5">
            <span class="inline-block w-2 h-2 rounded-full shrink-0 ${dotColor[l.status] || dotColor.Pending}"></span>
            <span class="min-w-0 flex-1 truncate text-slate-700"><span class="font-bold">${escAttr(l.match || '')}</span> <span class="text-slate-400">— ${escAttr(l.prono || '')}</span></span>
            <span class="font-bold text-blue-600 shrink-0">${(l.odds || 1).toFixed(2).replace('.', ',')}</span>
          </div>`).join('');

        return `
          <div>
            ${head}
            <div class="bg-slate-50 border-l-4 ${barColor[status]} divide-y divide-slate-100">${legsHtml}</div>
            <div class="bg-slate-50 border-l-4 ${barColor[status]} flex justify-end gap-3 px-3 py-2">
              <button onclick="decombineCombo(${combo.id})" class="text-[11px] font-bold text-slate-500 hover:text-slate-800"><i class="fa-solid fa-link-slash mr-1"></i>Décombiner</button>
              <button onclick="deleteComboWithLegs(${combo.id})" class="text-[11px] font-bold text-rose-500 hover:text-rose-700"><i class="fa-solid fa-trash-can mr-1"></i>Supprimer tout</button>
            </div>
          </div>`;
       } catch (e) {
        return `<div class="px-3 py-2.5 text-xs text-rose-600 border-l-4 border-l-rose-500">⚠️ Combiné #${r.combo.id} illisible (${escAttr(e.message)})</div>`;
       }
      }).join('');
      html += `</div>`;

      html += `<div class="flex items-center justify-between pt-1 text-[11px] font-bold">
        <span class="flex gap-3">
          <button onclick="toggleAllCombos(true)" class="text-violet-600 hover:text-violet-800">Tout déplier</button>
          <button onclick="toggleAllCombos(false)" class="text-slate-500 hover:text-slate-700">Tout replier</button>
        </span>
        ${filtered.length > visibleCombosCount ? `<span class="flex gap-3"><button onclick="loadMoreCombos()" class="text-violet-600 hover:text-violet-800">Voir plus (+${Math.min(COMBOS_PAGE, filtered.length - visibleCombosCount)})</button><button onclick="showAllCombos()" class="text-slate-500 hover:text-slate-700">Tout afficher (${filtered.length})</button></span>` : `<span class="text-slate-400 font-semibold">${filtered.length} affiché(s)</span>`}
      </div>`;

      container.innerHTML = html;
    }

    // ===================== FIN COMBINÉS =====================

    function renderDailyStats() {
      const tbody = document.getElementById('dailyStatsTbody');
      tbody.innerHTML = '';
      
      const sportBets = getStatsFilteredBets();
      const dailyMap = {};

      sportBets.forEach(b => {
        if (!b.date) return;
        const d = b.date;
        if (!dailyMap[d]) {
          dailyMap[d] = { total: 0, won: 0, lost: 0, stake: 0, profit: 0 };
        }

        const target = dailyMap[d];
        if (b.status !== 'Pending') {
          target.total++;
          const stake = b.stake || 0;
          const odds = b.odds || 1;
          if (b.status === 'Won') {
            target.won++;
            target.profit += (odds - 1) * stake;
            target.stake += stake;
          } else if (b.status === 'Lost') {
            target.lost++;
            target.profit -= stake;
            target.stake += stake;
          }
        }
      });

      const dates = Object.keys(dailyMap).sort((a, b) => b.localeCompare(a));

      if (dates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-slate-400 font-normal">Aucun résultat quotidien enregistré.</td></tr>`;
        return;
      }

      dates.forEach(d => {
        const day = dailyMap[d];
        const roi = day.stake > 0 ? ((day.profit / day.stake) * 100).toFixed(1) : '0.0';
        const profClass = day.profit > 0 ? 'text-emerald-600 font-bold' : day.profit < 0 ? 'text-rose-600 font-bold' : 'text-slate-600';
        const dateFormatted = d.split('-').reverse().join('/');

        tbody.innerHTML += `
          <tr class="hover:bg-slate-50 transition">
            <td class="p-2 text-left font-bold text-slate-800 whitespace-nowrap">${dateFormatted}</td>
            <td class="p-2 border-l border-slate-100">${day.total} (${day.won}G/${day.lost}P)</td>
            <td class="p-2 ${profClass}">${day.profit >= 0 ? '+' : ''}${day.profit.toFixed(2)} €</td>
            <td class="p-2 ${profClass}">${roi >= 0 ? '+' : ''}${roi} %</td>
          </tr>
        `;
      });
    }

    function renderGroupedStats() {
      const currentList = getGroupedStatsSourceBets();

      const marketMap = {}, oddsMap = {};

      const oddsBracketOrder = ['1.00 – 1.49', '1.50 – 1.99', '2.00 et +'];

      currentList.forEach(b => {
        if (b.status === 'Pending') return;

        const marketKey = b.market || 'Autre';
        const oddsKey = getOddsBracket(b.odds || 1);

        if (!marketMap[marketKey]) marketMap[marketKey] = { total: 0, won: 0, lost: 0, stake: 0, profit: 0 };
        if (!oddsMap[oddsKey]) oddsMap[oddsKey] = { total: 0, won: 0, lost: 0, stake: 0, profit: 0 };

        const stake = b.stake || 0;
        const odds = b.odds || 1;

        [marketMap[marketKey], oddsMap[oddsKey]].forEach(target => {
          target.total++;
          target.stake += stake;
          if (b.status === 'Won') {
            target.won++;
            target.profit += (odds - 1) * stake;
          } else if (b.status === 'Lost') {
            target.profit -= stake;
          }
        });
      });

      // --- Stats par équipe ---
      (function () {
        const best = document.getElementById('teamBestTbody'), worst = document.getElementById('teamWorstTbody');
        if (!best || !worst) return;
        const equipes = {};
        currentList.forEach(b => {
          if (b.status !== 'Won' && b.status !== 'Lost') return;
          const parts = String(b.match || '').split(/\s+(?:vs\.?|contre|-|–)\s+/i).map(x => x.trim()).filter(Boolean);
          if (parts.length !== 2) return;
          const mise = parseFloat(b.stake) || 0, cote = parseFloat(b.odds) || 1;
          const gain = b.status === 'Won' ? (cote - 1) * mise : -mise;
          parts.forEach(nom => {
            const cle = scJetons(nom).join(' ') || nom.toLowerCase();
            const e = equipes[cle] || (equipes[cle] = { noms: {}, n: 0, w: 0, profit: 0 });
            e.noms[nom] = (e.noms[nom] || 0) + 1;
            e.n++; if (b.status === 'Won') e.w++; e.profit += gain;
          });
        });
        const liste = Object.values(equipes).filter(e => e.n >= 3).map(e => {
          e.nom = Object.keys(e.noms).sort((a, c) => e.noms[c] - e.noms[a])[0];
          return e;
        });
        const ligne = e => `<tr><td class="p-2 text-left font-bold text-slate-800">${escAttr(e.nom)}</td><td class="p-2">${e.n}</td>
          <td class="p-2">${Math.round(e.w / e.n * 100)} %</td>
          <td class="p-2 font-bold ${e.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${e.profit >= 0 ? '+' : ''}${e.profit.toFixed(2)} €</td></tr>`;
        const vide = '<tr><td colspan="4" class="p-3 text-slate-400 italic">Pas encore assez de paris (3 minimum par équipe).</td></tr>';
        const gagnantes = liste.filter(e => e.profit > 0).sort((a, c) => c.profit - a.profit).slice(0, 5);
        const perdantes = liste.filter(e => e.profit < 0).sort((a, c) => a.profit - c.profit).slice(0, 5);
        best.innerHTML = gagnantes.map(ligne).join('') || vide;
        worst.innerHTML = perdantes.map(ligne).join('') || vide;
      })();

      const oddsMapOrdered = {};
      oddsBracketOrder.forEach(k => { if (oddsMap[k]) oddsMapOrdered[k] = oddsMap[k]; });

      function populateTable(tbodyId, mapData, clickableType) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        tbody.innerHTML = '';
        const keys = Object.keys(mapData);

        const filterInfo = {
          market: { current: currentMarketFilter, fn: 'toggleMarketFilter' },
          odds: { current: currentOddsFilter, fn: 'toggleOddsFilter' }
        };

        if (keys.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-slate-400 font-normal">Aucune donnée disponible.</td></tr>`;
        } else {
          keys.forEach(k => {
            const item = mapData[k];
            const winRate = item.total > 0 ? ((item.won / item.total) * 100).toFixed(1) : '0.0';
            const roi = item.stake > 0 ? ((item.profit / item.stake) * 100).toFixed(1) : '0.0';
            const profClass = item.profit > 0 ? 'text-emerald-600 font-extrabold' : item.profit < 0 ? 'text-rose-600 font-extrabold' : 'text-slate-700';
            const info = clickableType ? filterInfo[clickableType] : null;
            const isActive = info && info.current === k;
            const rowClasses = clickableType
              ? `hover:bg-blue-50 transition cursor-pointer ${isActive ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`
              : 'hover:bg-slate-50 transition';
            const rowAttrs = clickableType ? `onclick="${info.fn}('${k.replace(/'/g, "\\'")}')"` : '';

            tbody.innerHTML += `
              <tr class="${rowClasses}" ${rowAttrs}>
                <td class="p-2.5 text-left font-bold text-slate-800">${k}${isActive ? ' <span class=\"text-blue-600\">●</span>' : ''}</td>
                <td class="p-2.5">${item.total}</td>
                <td class="p-2.5">${winRate} %</td>
                <td class="p-2.5 ${profClass}">${item.profit >= 0 ? '+' : ''}${item.profit.toFixed(2)} €</td>
                <td class="p-2.5 ${profClass}">${roi >= 0 ? '+' : ''}${roi} %</td>
              </tr>
            `;
          });
        }
      }

      populateTable('marketStatsTbody', marketMap, 'market');
      populateTable('oddsStatsTbody', oddsMapOrdered, 'odds');
    }

    function toggleCompFilterCheckbox(key) {
      if (currentCompFilters.has(key)) currentCompFilters.delete(key);
      else currentCompFilters.add(key);
      saveCompFiltersToStorage();
      resetHistoryPagination();
      render();
      renderGroupedStats();
    }

    // Filtre l'Historique sur un championnat précis (paris en cours + terminés confondus)
    // et y amène l'utilisateur. N'affecte pas les cases à cocher du Bilan.
    function viewCompInHistory(key) {
      const select = document.getElementById('filterComp');
      if (select) select.value = key;
      setQuickFilter('ALL'); // au cas où "En cours"/"Terminés" était actif ; déclenche déjà le rendu
      const list = document.getElementById('betsTbody');
      if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Coche/décoche tous les championnats d'UNE catégorie (n'affecte pas les autres catégories).
    function toggleCategoryAllCompFilters(slug, checkAll) {
      const cat = FOOTBALL_CATEGORY_ORDER.find(c => footballCategorySlugs[c] === slug);
      if (!cat) return;
      const isOther = cat === 'Autres / Non classés';
      const currentList = state.football || [];
      const keys = new Set();
      currentList.forEach(b => {
        if (b.status === 'Pending') return;
        const bCat = getFootballCategory(b.comp);
        const matches = isOther ? (bCat === null) : (bCat === cat);
        if (!matches) return;
        keys.add((b.comp || 'Non spécifié').trim());
      });

      if (checkAll) keys.forEach(k => currentCompFilters.add(k));
      else keys.forEach(k => currentCompFilters.delete(k));

      saveCompFiltersToStorage();
      render();
      renderGroupedStats();
    }

    // Classe un championnat de football dans l'une des 3 grandes catégories.
    // Retourne null si le championnat ne correspond à aucune des 3 (auquel cas
    // le pari n'apparaît pas dans ce bloc de synthèse, mais reste visible partout ailleurs).
    function getFootballCategory(compStr) {
      if (!compStr) return null;
      const text = compStr.trim();

      // Les coupes européennes sont vérifiées avant "Ligue 1/2" pour éviter tout
      // conflit avec "Ligue des Champions" / "Ligue Europa".
      if (/champions\s*league|ligue\s+des\s+champions|europa\s+league|ligue\s+europa|conf[ée]rence\s+league|ligue\s+conf[ée]rence/i.test(text)) {
        return 'Coupes Européennes';
      }
      if (/premier\s+league|la\s*liga|primera\s*divisi[oó]n|\bliga\b(?!\s*(portugal|mx|argentina|femenina))|serie\s+a|bundesliga|ligue\s+1\b/i.test(text)) {
        return 'Top 5 Européen';
      }
      if (/ligue\s+2\b|national\b/i.test(text)) {
        return 'L2 / National';
      }
      return null;
    }

    const FOOTBALL_CATEGORY_ORDER = ['Top 5 Européen', 'Coupes Européennes', 'L2 / National', 'Autres / Non classés'];
    const footballCategorySlugs = { 'Top 5 Européen': 'top5', 'Coupes Européennes': 'coupes', 'L2 / National': 'l2national', 'Autres / Non classés': 'autres' };
    const footballCategoryColors = { 'Top 5 Européen': '#2563eb', 'Coupes Européennes': '#d97706', 'L2 / National': '#059669', 'Autres / Non classés': '#64748b' };
    let categoryAccordionOpen = {}; // état ouvert/fermé de chaque accordéon, conservé entre les rendus

    function toggleCategoryAccordion(slug) {
      categoryAccordionOpen[slug] = !categoryAccordionOpen[slug];
      renderFootballCategoryStats();
    }

    // Construit un petit tableau (Joués/Réussite/Profit/ROI) pour une sous-répartition
    // (par marché ou par tranche de cote) à l'intérieur d'un bloc de catégorie.
    function buildMiniStatsTable(map, orderedKeys) {
      const keys = orderedKeys ? orderedKeys.filter(k => map[k]) : Object.keys(map);
      if (keys.length === 0) {
        return `<p class="text-[11px] text-slate-400 italic">Aucune donnée.</p>`;
      }
      const rows = keys.map(k => {
        const item = map[k];
        const winRate = item.total > 0 ? ((item.won / item.total) * 100).toFixed(1) : '0.0';
        const roi = item.stake > 0 ? ((item.profit / item.stake) * 100).toFixed(1) : '0.0';
        const profClass = item.profit > 0 ? 'text-emerald-600 font-bold' : item.profit < 0 ? 'text-rose-600 font-bold' : 'text-slate-700';
        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="p-1.5 text-left font-semibold text-slate-700">${k}</td>
            <td class="p-1.5 text-center">${item.total}</td>
            <td class="p-1.5 text-center">${winRate} %</td>
            <td class="p-1.5 text-center ${profClass}">${item.profit >= 0 ? '+' : ''}${item.profit.toFixed(2)} €</td>
            <td class="p-1.5 text-center ${profClass}">${roi >= 0 ? '+' : ''}${roi} %</td>
          </tr>`;
      }).join('');

      return `
        <table class="w-full text-[11px]">
          <thead>
            <tr class="text-slate-400 font-bold border-b border-slate-100">
              <th class="p-1.5 text-left">—</th>
              <th class="p-1.5">Joués</th>
              <th class="p-1.5">Réussite</th>
              <th class="p-1.5">Profit</th>
              <th class="p-1.5">ROI</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">${rows}</tbody>
        </table>`;
    }

    // Construit le sous-tableau "Par Championnat" (avec cases à cocher) à l'intérieur
    // d'un bloc de catégorie. Cocher une ou plusieurs lignes filtre le Bilan du haut
    // (currentCompFilters est global et partagé entre toutes les catégories).
    // Le comportement des cases dépend de compFilterMode ('include' = ne garder que ceux
    // cochés / 'exclude' = retirer ceux cochés, tout le reste reste inclus).
    function buildCompCheckboxTable(bets, slug) {
      const compMap = {};
      bets.forEach(b => {
        const key = (b.comp || 'Non spécifié').trim();
        if (!compMap[key]) compMap[key] = { total: 0, won: 0, stake: 0, profit: 0 };
        const t = compMap[key];
        const s = b.stake || 0, o = b.odds || 1;
        t.total++; t.stake += s;
        if (b.status === 'Won') { t.won++; t.profit += (o - 1) * s; }
        else if (b.status === 'Lost') { t.profit -= s; }
      });

      const keys = Object.keys(compMap).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
      if (keys.length === 0) {
        return `<p class="text-[11px] text-slate-400 italic">Aucune donnée.</p>`;
      }

      const checkboxTitle = compFilterMode === 'exclude'
        ? "Cocher pour exclure ce championnat du Bilan"
        : "Cocher pour ne garder que ce championnat dans le Bilan";

      const rows = keys.map(k => {
        const item = compMap[k];
        const isChecked = currentCompFilters.has(k);
        const winRate = item.total > 0 ? ((item.won / item.total) * 100).toFixed(1) : '0.0';
        const roi = item.stake > 0 ? ((item.profit / item.stake) * 100).toFixed(1) : '0.0';
        const profClass = item.profit > 0 ? 'text-emerald-600 font-bold' : item.profit < 0 ? 'text-rose-600 font-bold' : 'text-slate-700';
        const safeKey = k.replace(/'/g, "\\'");
        const rowHighlight = isChecked ? (compFilterMode === 'exclude' ? 'bg-rose-50' : 'bg-blue-50') : '';
        return `
          <tr class="hover:bg-blue-50 transition ${rowHighlight}">
            <td class="p-1.5 text-center"><input type="checkbox" title="${checkboxTitle}" ${isChecked ? 'checked' : ''} onchange="toggleCompFilterCheckbox('${safeKey}')"></td>
            <td class="p-1.5 text-left font-semibold text-slate-700 cursor-pointer" onclick="toggleCompFilterCheckbox('${safeKey}')">${k}${isChecked && compFilterMode === 'exclude' ? ' <span class="text-rose-500 font-bold text-[10px]">(exclu)</span>' : ''}</td>
            <td class="p-1.5 text-center"><span class="text-blue-600 font-bold cursor-pointer hover:underline" onclick="viewCompInHistory('${safeKey}')" title="Voir ces paris dans l'historique (en cours + terminés)">${item.total}</span></td>
            <td class="p-1.5 text-center">${winRate} %</td>
            <td class="p-1.5 text-center ${profClass}">${item.profit >= 0 ? '+' : ''}${item.profit.toFixed(2)} €</td>
            <td class="p-1.5 text-center ${profClass}">${roi >= 0 ? '+' : ''}${roi} %</td>
          </tr>`;
      }).join('');

      const selectAllTitle = compFilterMode === 'exclude'
        ? "Tout cocher / tout décocher (exclure tous ces championnats)"
        : "Tout cocher / tout décocher";

      return `
        <table class="w-full text-[11px]">
          <thead>
            <tr class="text-slate-400 font-bold border-b border-slate-100">
              <th class="p-1.5 text-center w-6"><input type="checkbox" id="compSelectAll-${slug}" onchange="toggleCategoryAllCompFilters('${slug}', this.checked)" title="${selectAllTitle}"></th>
              <th class="p-1.5 text-left">Championnat</th>
              <th class="p-1.5">Joués</th>
              <th class="p-1.5">Réussite</th>
              <th class="p-1.5">Profit</th>
              <th class="p-1.5">ROI</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">${rows}</tbody>
        </table>`;
    }

    function renderFootballCategoryStats() {
      const container = document.getElementById('footballCategoryAccordion');
      if (!container) return;
      if (currentSport !== 'football') { container.innerHTML = ''; return; }

      // Détruit les graphiques existants avant de reconstruire le HTML (les canvas vont être remplacés).
      Object.values(categoryChartInstances).forEach(inst => { if (inst) inst.destroy(); });
      categoryChartInstances = {};

      const currentList = state.football || [];
      const oddsBracketOrder = ['1.00 – 1.49', '1.50 – 1.99', '2.00 et +'];
      const chartNumbers = getBetChartNumbers();
      const betsBySlug = {}; // conservé pour instancier les graphiques après insertion du HTML

      const modeHint = compFilterMode === 'exclude'
        ? "coche pour exclure du Bilan (le reste des championnats reste inclus)"
        : "coche pour n'inclure que ceux cochés dans le Bilan";

      container.innerHTML = FOOTBALL_CATEGORY_ORDER.map(cat => {
        const slug = footballCategorySlugs[cat];
        const isOther = cat === 'Autres / Non classés';
        const bets = currentList.filter(b => {
          if (b.status === 'Pending') return false;
          const bCat = getFootballCategory(b.comp);
          return isOther ? (bCat === null) : (bCat === cat);
        });
        betsBySlug[slug] = bets;

        let total = 0, won = 0, stake = 0, profit = 0, oddsSum = 0;
        const marketMap = {};
        const oddsMap = {};

        bets.forEach(b => {
          const s = b.stake || 0;
          const o = b.odds || 1;
          total++;
          oddsSum += o;
          stake += s;

          const marketKey = b.market || 'Autre';
          const oddsKey = getOddsBracket(o);
          if (!marketMap[marketKey]) marketMap[marketKey] = { total: 0, won: 0, stake: 0, profit: 0 };
          if (!oddsMap[oddsKey]) oddsMap[oddsKey] = { total: 0, won: 0, stake: 0, profit: 0 };

          [marketMap[marketKey], oddsMap[oddsKey]].forEach(t => { t.total++; t.stake += s; });

          if (b.status === 'Won') {
            won++;
            const gain = (o - 1) * s;
            profit += gain;
            marketMap[marketKey].won++; marketMap[marketKey].profit += gain;
            oddsMap[oddsKey].won++; oddsMap[oddsKey].profit += gain;
          } else if (b.status === 'Lost') {
            profit -= s;
            marketMap[marketKey].profit -= s;
            oddsMap[oddsKey].profit -= s;
          }
        });

        const winRate = total > 0 ? ((won / total) * 100).toFixed(1) : '0.0';
        const avgOdds = total > 0 ? (oddsSum / total).toFixed(2) : '1.00';
        const roi = stake > 0 ? ((profit / stake) * 100).toFixed(1) : '0.0';
        const profClass = profit > 0 ? 'text-emerald-600' : profit < 0 ? 'text-rose-600' : 'text-slate-800';
        const isOpen = !!categoryAccordionOpen[slug];

        const catColor = footballCategoryColors[cat];

        return `
          <div class="card overflow-hidden" style="border-left: 4px solid ${catColor};">
            <button type="button" onclick="toggleCategoryAccordion('${slug}')" class="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 transition">
              <span class="text-xs font-bold text-slate-800 flex items-center gap-2">
                <i class="fa-solid ${isOther ? 'fa-circle-question' : 'fa-layer-group'}" style="color: ${catColor};"></i> ${cat}
              </span>
              <span class="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
                <span class="hidden sm:inline">${total} pari(s)</span>
                <span class="${profClass} font-bold">${profit >= 0 ? '+' : ''}${profit.toFixed(2)} €</span>
                <span class="${profClass}">ROI ${roi >= 0 ? '+' : ''}${roi} %</span>
                <i class="fa-solid fa-chevron-${isOpen ? 'up' : 'down'} text-slate-400"></i>
              </span>
            </button>
            <div class="${isOpen ? '' : 'hidden'} px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div><span class="text-[9px] font-bold text-slate-400 uppercase block">Joués</span><span class="text-sm font-black text-slate-800">${total}</span></div>
                <div><span class="text-[9px] font-bold text-slate-400 uppercase block">Réussite</span><span class="text-sm font-black text-slate-800">${winRate} %</span></div>
                <div><span class="text-[9px] font-bold text-slate-400 uppercase block">Cote Moy.</span><span class="text-sm font-black text-slate-800">${avgOdds}</span></div>
                <div><span class="text-[9px] font-bold text-slate-400 uppercase block">Profit Net</span><span class="text-sm font-black ${profClass}">${profit >= 0 ? '+' : ''}${profit.toFixed(2)} €</span></div>
                <div><span class="text-[9px] font-bold text-slate-400 uppercase block">ROI</span><span class="text-sm font-black ${profClass}">${roi >= 0 ? '+' : ''}${roi} %</span></div>
              </div>
              ${isOpen ? `
              <div>
                <h4 class="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Évolution Cumulée</h4>
                <div class="h-40 w-full">
                  <canvas id="categoryChart-${slug}"></canvas>
                </div>
              </div>` : ''}
              <div>
                <h4 class="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Par Championnat <span class="normal-case font-normal text-slate-400">— ${modeHint}</span></h4>
                <div class="overflow-x-auto">${buildCompCheckboxTable(bets, slug)}</div>
              </div>
              <div>
                <h4 class="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Par Type de Prono</h4>
                <div class="overflow-x-auto">${buildMiniStatsTable(marketMap)}</div>
              </div>
              <div>
                <h4 class="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Par Tranche de Cote</h4>
                <div class="overflow-x-auto">${buildMiniStatsTable(oddsMap, oddsBracketOrder)}</div>
              </div>
            </div>
          </div>`;
      }).join('');

      // Instancie un mini-graphique uniquement pour les accordéons actuellement ouverts.
      FOOTBALL_CATEGORY_ORDER.forEach(cat => {
        const slug = footballCategorySlugs[cat];
        if (!categoryAccordionOpen[slug]) return;
        const canvas = document.getElementById(`categoryChart-${slug}`);
        if (canvas) renderCategoryChart(slug, canvas, betsBySlug[slug], footballCategoryColors[cat], chartNumbers);

        // État "tout coché / partiellement coché" de la case globale de la catégorie.
        const selectAllBox = document.getElementById(`compSelectAll-${slug}`);
        if (selectAllBox) {
          const catKeys = new Set((betsBySlug[slug] || []).map(b => (b.comp || 'Non spécifié').trim()));
          const checkedCount = [...catKeys].filter(k => currentCompFilters.has(k)).length;
          selectAllBox.checked = catKeys.size > 0 && checkedCount === catKeys.size;
          selectAllBox.indeterminate = checkedCount > 0 && checkedCount < catKeys.size;
        }
      });
    }

    // Trace l'évolution cumulée du profit pour une seule catégorie, dans son mini-graphique.
    function renderCategoryChart(slug, canvas, bets, color, chartNumbers) {
      const ctx = canvas.getContext('2d');
      const sortedBets = [...bets].reverse(); // bets déjà filtrés (non-pending + catégorie), remis en ordre chronologique

      let cum = 0;
      const labels = ["Début"];
      const data = [0];

      sortedBets.forEach(b => {
        let change = 0;
        if (b.status === 'Won') change = ((b.odds || 1) - 1) * (b.stake || 0);
        else if (b.status === 'Lost') change = -(b.stake || 0);
        cum += change;
        labels.push(`#${chartNumbers[b.id]}`);
        data.push(parseFloat(cum.toFixed(2)));
      });

      const gradient = ctx.createLinearGradient(0, 0, 0, 160);
      gradient.addColorStop(0, hexToRgba(color, 0.15));
      gradient.addColorStop(1, hexToRgba(color, 0));

      categoryChartInstances[slug] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            borderColor: color,
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: (evt, elements) => {
            if (elements.length > 0) {
              const idx = elements[0].index;
              if (idx > 0) {
                const betNum = parseInt(labels[idx].replace('#', ''), 10);
                if (!isNaN(betNum)) filterByBetNumber(betNum);
              }
            }
          },
          onHover: (evt, elements) => {
            evt.native.target.style.cursor = elements.length > 0 && elements[0].index > 0 ? 'pointer' : 'default';
          },
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { grid: { color: chartGrid() }, ticks: { color: chartTick(), font: { size: 9, weight: 'bold' } } },
            y: { grid: { color: chartGrid() }, ticks: { color: chartTick(), font: { size: 9, weight: 'bold' } } }
          }
        }
      });
    }

    // Trace l'évolution cumulée du profit sur TOUTE la sélection filtrée (mêmes filtres
    // que le Bilan du haut), sans avoir besoin d'ouvrir un accordéon de catégorie.
    function renderGlobalBankrollChart() {
      const canvas = document.getElementById('globalBankrollChart');
      if (!canvas) return;

      const chartNumbers = getBetChartNumbers();
      const bets = getStatsFilteredBets().filter(b => b.status !== 'Pending');
      const sortedBets = [...bets].reverse(); // remis en ordre chronologique

      let cum = 0;
      const labels = ["Début"];
      const data = [0];

      sortedBets.forEach(b => {
        let change = 0;
        if (b.status === 'Won') change = ((b.odds || 1) - 1) * (b.stake || 0);
        else if (b.status === 'Lost') change = -(b.stake || 0);
        cum += change;
        labels.push(`#${chartNumbers[b.id]}`);
        data.push(parseFloat(cum.toFixed(2)));
      });

      if (globalBankrollChartInstance) {
        globalBankrollChartInstance.destroy();
        globalBankrollChartInstance = null;
      }

      if (sortedBets.length === 0) {
        const ctxEmpty = canvas.getContext('2d');
        ctxEmpty.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const finalProfit = cum;
      const color = finalProfit >= 0 ? '#059669' : '#e11d48';
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 220);
      gradient.addColorStop(0, hexToRgba(color, 0.18));
      gradient.addColorStop(1, hexToRgba(color, 0));

      globalBankrollChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            borderColor: color,
            backgroundColor: gradient,
            fill: true,
            tension: 0.3,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: color
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: (evt, elements) => {
            if (elements.length > 0) {
              const idx = elements[0].index;
              if (idx > 0) {
                const betNum = parseInt(labels[idx].replace('#', ''), 10);
                if (!isNaN(betNum)) filterByBetNumber(betNum);
              }
            }
          },
          onHover: (evt, elements) => {
            evt.native.target.style.cursor = elements.length > 0 && elements[0].index > 0 ? 'pointer' : 'default';
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Bilan cumulé : ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)} €`
              }
            }
          },
          scales: {
            x: { grid: { color: chartGrid() }, ticks: { color: chartTick(), font: { size: 10, weight: 'bold' }, maxTicksLimit: 12 } },
            y: { grid: { color: chartGrid() }, ticks: { color: chartTick(), font: { size: 10, weight: 'bold' } } }
          }
        }
      });
    }

    function toggleMarketFilter(key) {
      currentMarketFilter = (currentMarketFilter === key) ? null : key;
      resetHistoryPagination();
      render();
      renderGroupedStats();
      const list = document.getElementById('betsTbody');
      if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function toggleOddsFilter(key) {
      currentOddsFilter = (currentOddsFilter === key) ? null : key;
      resetHistoryPagination();
      render();
      renderGroupedStats();
      const list = document.getElementById('betsTbody');
      if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderActiveFiltersBanner() {
      const banner = document.getElementById('activeFiltersBanner');
      // Bannière masquée à la demande : les filtres restent actifs, seul l'affichage
      // des petites puces récapitulatives (championnats exclus/marché/cote...) est retiré.
      if (banner) {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
        banner.innerHTML = '';
      }
      return;
    }

    function clearHistoryCompFilter() {
      const select = document.getElementById('filterComp');
      if (select) select.value = 'ALL';
      resetHistoryPagination();
      render();
    }

    function hasActiveStatsFilters() {
      const search = document.getElementById('searchInput')?.value.trim() || '';
      const period = document.getElementById('filterPeriod')?.value || 'ALL';
      const historyComp = document.getElementById('filterComp')?.value || 'ALL';
      return !!(
        currentCompFilters.size > 0 ||
        currentMarketFilter ||
        currentOddsFilter ||
        search !== '' ||
        period !== 'ALL' ||
        historyComp !== 'ALL'
      );
    }

    function resetAllStatsFilters() {
      currentCompFilters = new Set();
      saveCompFiltersToStorage();
      currentMarketFilter = null;
      currentOddsFilter = null;

      document.getElementById('searchInput').value = '';
      document.getElementById('filterPeriod').value = 'ALL';
      document.getElementById('customDateRange').classList.add('hidden');
      const compSelect = document.getElementById('filterComp');
      if (compSelect) compSelect.value = 'ALL';

      setQuickFilter('ALL'); // appelle déjà render()
      setTypeFilter('ALL');
    }

    function render() {
      peindreFlechesTri();
      updateBackupBanner();
      updateComboSelectionBar();

      renderActiveFiltersBanner();

      const currentList = state[currentSport] || [];
      // L'historique respecte le filtre Tous/En cours/Terminés, la recherche, la période, etc.
      // mais PAS les championnats cochés dans "Stats par Championnat" (ceux-ci ne servent
      // qu'à recalculer le Bilan).
      const filteredBets = getFilteredAndSortedBets(false);
      // Le Bilan (KPI) suit les mêmes filtres "réels" que l'historique (recherche, période,
      // marché, cote, circuit, championnats cochés) mais ignore volontairement le filtre
      // Tous/En cours/Terminés : cliquer sur "En cours" ne doit pas vider le Bilan Net Total.
      const kpiBets = getStatsFilteredBets();
      // Cote/Mise Moy., ROI et Bilan Solo (cartes du haut) portent sur TOUS les paris,
      // qu'ils soient combinés ou non : chaque pari compte pour sa propre mise/cote en Solo,
      // et les combinés sont comptés EN PLUS dans le Bilan Combiné (voir statProfitCombo).
      const soloKpiBets = kpiBets;
      const tbody = document.getElementById('betsTbody');
      const cardsMobile = document.getElementById('betsCardsMobile');
      tbody.innerHTML = '';
      cardsMobile.innerHTML = '';

      // Compteurs des onglets (Tous / En cours / Terminés) : toujours sur l'ensemble
      // des paris du sport, indépendamment des filtres actifs.
      let totalBets = currentList.length, tabPendingCount = 0, tabSettledCount = 0, tabWonCount = 0, tabLostCount = 0;
      currentList.forEach(b => {
        if (b.status === 'Pending') tabPendingCount++;
        else {
          tabSettledCount++;
          if (b.status === 'Won') tabWonCount++;
          if (b.status === 'Lost') tabLostCount++;
        }
      });
      document.getElementById('countAll').textContent = totalBets;
      document.getElementById('countPending').textContent = tabPendingCount;
      document.getElementById('countSettled').textContent = tabSettledCount;
      document.getElementById('countWon').textContent = tabWonCount;
      document.getElementById('countLost').textContent = tabLostCount;

      const tabSoloCount = currentList.filter(b => !b.comboId).length;
      const tabComboCount = currentList.filter(b => b.comboId).length;
      const countTypeAllEl = document.getElementById('countTypeAll');
      const countTypeSoloEl = document.getElementById('countTypeSolo');
      const countTypeComboEl = document.getElementById('countTypeCombo');
      if (countTypeAllEl) countTypeAllEl.textContent = totalBets;
      if (countTypeSoloEl) countTypeSoloEl.textContent = tabSoloCount;
      if (countTypeComboEl) countTypeComboEl.textContent = tabComboCount;

      // Bilan (cartes KPI en haut) : calculé uniquement sur les paris qui passent
      // les filtres actifs (championnat / marché / cote / circuit / recherche / période / statut).
      let wonBets = 0, lostBets = 0, settledBets = 0, profit = 0, totalStake = 0, oddsSum = 0;
      soloKpiBets.forEach(b => {
        if (b.status === 'Won') { wonBets++; settledBets++; profit += ((b.odds || 1) - 1) * (b.stake || 0); totalStake += (b.stake || 0); oddsSum += (b.odds || 1); }
        else if (b.status === 'Lost') { lostBets++; settledBets++; profit -= (b.stake || 0); totalStake += (b.stake || 0); oddsSum += (b.odds || 1); }
      });

      // Bannière "Bilan calculé sur la sélection filtrée..." masquée à la demande :
      // les filtres continuent d'agir normalement sur le Bilan, seul le rappel visuel est retiré.
      const statsBanner = document.getElementById('statsFilterBanner');
      if (statsBanner) {
        statsBanner.classList.add('hidden');
        statsBanner.classList.remove('flex');
      }

      const chartNumbers = getBetChartNumbers();
      const visibleBets = filteredBets.slice(0, historyVisibleCount);

      visibleBets.forEach((b) => {
        let statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-extrabold inline-block">⏳ En cours</span>`;
        if (b.status === 'Won') statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold inline-block">✅ Gagné</span>`;
        if (b.status === 'Lost') statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] bg-rose-50 text-rose-700 border border-rose-200 font-extrabold inline-block">❌ Perdu</span>`;

        const betNum = chartNumbers[b.id];
        const numBadge = betNum
          ? `<span onclick="filterByBetNumber(${betNum})" class="cursor-pointer font-black text-slate-500 hover:text-blue-600 hover:underline" title="Filtrer sur ce pari">#${betNum}</span>`
          : `<span class="text-slate-300">–</span>`;

        const isEditing = (b.id === editingBetId);
        const marketOpts = marketOptionsHtml(b.market);

        const comboSelectCell = b.comboId
          ? `<td class="p-3 align-middle text-center" title="Fait partie d'un combiné"><i class="fa-solid fa-link text-violet-500 text-xs"></i></td>`
          : `<td class="p-3 align-middle text-center"><input type="checkbox" ${selectedBetIds.has(b.id) ? 'checked' : ''} onchange="toggleBetSelection(${b.id}, this.checked, this)" class="w-3.5 h-3.5 accent-violet-600"></td>`;
        const comboMatchBadge = b.comboId ? `<span class="text-violet-500" title="Fait partie d'un combiné"><i class="fa-solid fa-link"></i></span> ` : '';

        const tr = document.createElement('tr');
        tr.className = `hover:bg-slate-50 transition border-b border-slate-100 ${isEditing ? 'bg-blue-50/50' : ''}`;

        if (isEditing) {
          tr.innerHTML = `
            <td colspan="9" class="p-4">
              <div class="grid grid-cols-4 gap-3">
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Date</label>
                  <input type="date" id="inlineDate-${b.id}" value="${escAttr(b.date)}" class="input-field w-full text-xs">
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Marché</label>
                  <select id="inlineMarket-${b.id}" class="input-field w-full text-xs">${marketOpts}</select>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Cote</label>
                  <input type="number" step="0.01" min="1.01" id="inlineOdds-${b.id}" value="${b.odds || 1}" class="input-field w-full text-xs font-black text-blue-600">
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Mise (€)</label>
                  <input type="number" step="0.01" min="0.01" id="inlineStake-${b.id}" value="${b.stake || 0}" class="input-field w-full text-xs font-black">
                </div>
                <div class="col-span-2">
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Match</label>
                  <input type="text" id="inlineMatch-${b.id}" value="${escAttr(b.match)}" class="input-field w-full text-xs font-bold">
                </div>
                <div class="col-span-2">
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Compétition</label>
                  <input type="text" id="inlineComp-${b.id}" value="${escAttr(b.comp)}" class="input-field w-full text-xs">
                </div>
                <div class="col-span-4">
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Pronostic</label>
                  <input type="text" id="inlineProno-${b.id}" value="${escAttr(b.prono)}" class="input-field w-full text-xs">
                </div>
              </div>
              <div class="flex justify-end gap-2 pt-3 mt-3 border-t border-blue-100">
                <button onclick="cancelInlineEdit()" class="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs hover:bg-white transition">Annuler</button>
                <button onclick="saveInlineEdit(${b.id}, '')" class="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition">Enregistrer</button>
              </div>
            </td>
          `;
        } else {
          tr.innerHTML = `
            ${comboSelectCell}
            <td class="p-3 align-middle text-center text-xs whitespace-nowrap">${numBadge}</td>
            <td class="p-3 align-middle text-xs text-blue-600 font-bold whitespace-nowrap">${b.date || ''}${heureMatch(b) ? `<div class="text-[10px] text-slate-500 font-semibold">${heureMatch(b)}</div>` : ''}</td>
            <td class="p-3 align-middle font-semibold text-slate-800">
              <div class="text-xs font-bold text-slate-900">${comboMatchBadge}${b.match || ''}</div>
              <div class="text-[10px] text-slate-400 font-medium">${b.comp || ''}</div>
              ${scoreHtml(b)}
            </td>
            <td class="p-3 align-middle font-medium text-slate-800">
              ${b.prono || ''} <span class="text-slate-400 text-xs font-normal">(${b.market || ''})</span>
            </td>
            <td class="p-3 align-middle text-center font-black text-blue-600 text-xs bg-blue-50/30 rounded-lg">${(b.odds || 1).toFixed(2)}</td>
            <td class="p-3 align-middle text-center font-bold text-slate-800 whitespace-nowrap">${b.stake || 0} €</td>
            <td class="p-3 align-middle text-center">${statusBadge}</td>
            <td class="p-3 align-middle text-right whitespace-nowrap">
              <div class="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button onclick="setStatus(${b.id}, 'Won')" title="Gagné" class="w-7 h-7 flex items-center justify-center rounded-lg border transition shadow-sm text-xs ${b.status === 'Won' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-600 border-slate-200'}"><i class="fa-solid fa-check"></i></button>
                <button onclick="setStatus(${b.id}, 'Lost')" title="Perdu" class="w-7 h-7 flex items-center justify-center rounded-lg border transition shadow-sm text-xs ${b.status === 'Lost' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-600 border-slate-200'}"><i class="fa-solid fa-xmark"></i></button>
                <button onclick="startInlineEdit(${b.id})" title="Modifier" class="w-7 h-7 flex items-center justify-center bg-white text-slate-600 hover:text-blue-600 rounded-lg border border-slate-200 transition shadow-sm text-xs"><i class="fa-solid fa-pen"></i></button>
                <button onclick="duplicateBet(${b.id})" title="Dupliquer (même championnat/marché)" class="w-7 h-7 flex items-center justify-center bg-white text-slate-600 hover:text-amber-600 rounded-lg border border-slate-200 transition shadow-sm text-xs"><i class="fa-solid fa-copy"></i></button>
                <button onclick="deleteBet(${b.id})" title="Supprimer" class="w-7 h-7 flex items-center justify-center bg-white text-slate-400 hover:text-rose-600 rounded-lg border border-slate-200 transition shadow-sm text-xs"><i class="fa-solid fa-trash-can"></i></button>
              </div>
            </td>
          `;
        }
        tbody.appendChild(tr);

        const card = document.createElement('div');
        card.className = 'card p-3.5 space-y-2.5' + (isEditing ? ' ring-2 ring-blue-300' : '');

        if (isEditing) {
          card.innerHTML = `
            <div class="space-y-2.5">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Date</label>
                  <input type="date" id="inlineDateM-${b.id}" value="${escAttr(b.date)}" class="input-field w-full text-xs">
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Marché</label>
                  <select id="inlineMarketM-${b.id}" class="input-field w-full text-xs">${marketOpts}</select>
                </div>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Match</label>
                <input type="text" id="inlineMatchM-${b.id}" value="${escAttr(b.match)}" class="input-field w-full text-xs font-bold">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Compétition</label>
                <input type="text" id="inlineCompM-${b.id}" value="${escAttr(b.comp)}" class="input-field w-full text-xs">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Pronostic</label>
                <input type="text" id="inlinePronoM-${b.id}" value="${escAttr(b.prono)}" class="input-field w-full text-xs">
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Cote</label>
                  <input type="number" step="0.01" id="inlineOddsM-${b.id}" value="${b.odds || 1}" class="input-field w-full text-xs">
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Mise (€)</label>
                  <input type="number" step="0.01" id="inlineStakeM-${b.id}" value="${b.stake || 0}" class="input-field w-full text-xs">
                </div>
              </div>
              <div class="flex justify-end gap-2 pt-1">
                <button onclick="cancelInlineEdit()" class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs">Annuler</button>
                <button onclick="saveInlineEdit(${b.id}, 'M')" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs">Enregistrer</button>
              </div>
            </div>
          `;
        } else {
          const comboCheckboxMobile = b.comboId
            ? `<i class="fa-solid fa-link text-violet-500 text-xs mt-0.5" title="Fait partie d'un combiné"></i>`
            : `<input type="checkbox" ${selectedBetIds.has(b.id) ? 'checked' : ''} onchange="toggleBetSelection(${b.id}, this.checked, this)" class="w-3.5 h-3.5 mt-0.5 accent-violet-600 shrink-0">`;
          card.innerHTML = `
            <div class="flex justify-between items-start gap-2">
              <div class="flex items-start gap-2 min-w-0">
                ${comboCheckboxMobile}
                <div class="min-w-0">
                  <div class="text-xs font-bold text-slate-900 truncate">${numBadge} ${b.match || ''}</div>
                  <div class="text-[10px] text-slate-400 font-medium truncate">${b.comp || ''} · <span class="text-blue-600 font-bold">${b.date || ''}${heureMatch(b) ? ' · ' + heureMatch(b) : ''}</span></div>
                  ${scoreHtml(b)}
                </div>
              </div>
              ${statusBadge}
            </div>
            <div class="text-xs font-medium text-slate-800 bg-slate-50 rounded-lg px-2.5 py-1.5">
              ${b.prono || ''} <span class="text-slate-400 font-normal">(${b.market || ''})</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-3 text-xs">
                <span class="font-black text-blue-600">${(b.odds || 1).toFixed(2)}</span>
                <span class="font-bold text-slate-700">${b.stake || 0} €</span>
              </div>
              <div class="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button onclick="setStatus(${b.id}, 'Won')" title="Gagné" class="w-8 h-8 flex items-center justify-center rounded-lg border transition shadow-sm text-xs ${b.status === 'Won' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-600 border-slate-200'}"><i class="fa-solid fa-check"></i></button>
                <button onclick="setStatus(${b.id}, 'Lost')" title="Perdu" class="w-8 h-8 flex items-center justify-center rounded-lg border transition shadow-sm text-xs ${b.status === 'Lost' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-600 border-slate-200'}"><i class="fa-solid fa-xmark"></i></button>
                <button onclick="startInlineEdit(${b.id})" title="Modifier" class="w-8 h-8 flex items-center justify-center bg-white text-slate-600 rounded-lg border border-slate-200 transition shadow-sm text-xs"><i class="fa-solid fa-pen"></i></button>
                <button onclick="duplicateBet(${b.id})" title="Dupliquer" class="w-8 h-8 flex items-center justify-center bg-white text-slate-600 rounded-lg border border-slate-200 transition shadow-sm text-xs"><i class="fa-solid fa-copy"></i></button>
                <button onclick="deleteBet(${b.id})" title="Supprimer" class="w-8 h-8 flex items-center justify-center bg-white text-slate-400 rounded-lg border border-slate-200 transition shadow-sm text-xs"><i class="fa-solid fa-trash-can"></i></button>
              </div>
            </div>
          `;
        }
        cardsMobile.appendChild(card);
      });

      if (filteredBets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">Aucun pari dans cette vue.</td></tr>`;
        cardsMobile.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">Aucun pari dans cette vue.</div>`;
      } else if (filteredBets.length > visibleBets.length) {
        const remaining = filteredBets.length - visibleBets.length;
        const loadMoreRow = document.createElement('tr');
        loadMoreRow.innerHTML = `
          <td colspan="9" class="p-3 text-center">
            <button onclick="loadMoreHistory()" class="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-4 py-2 transition">
              <i class="fa-solid fa-chevron-down mr-1"></i> Charger plus (${remaining} restant${remaining > 1 ? 's' : ''})
            </button>
          </td>`;
        tbody.appendChild(loadMoreRow);

        const loadMoreCard = document.createElement('button');
        loadMoreCard.onclick = loadMoreHistory;
        loadMoreCard.className = 'w-full text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl px-4 py-2.5 transition';
        loadMoreCard.innerHTML = `<i class="fa-solid fa-chevron-down mr-1"></i> Charger plus (${remaining} restant${remaining > 1 ? 's' : ''})`;
        cardsMobile.appendChild(loadMoreCard);
      }


      const roi = totalStake > 0 ? (profit / totalStake) * 100 : 0;
      const avgOdds = settledBets > 0 ? (oddsSum / settledBets) : 0;
      const avgStake = settledBets > 0 ? (totalStake / settledBets) : 0;
      
      document.getElementById('statRisk').textContent = `${avgOdds.toFixed(2)} @ ${avgStake.toFixed(1)}€`;

      const profitEl = document.getElementById('statProfit');
      profitEl.textContent = (profit >= 0 ? '+' : '') + profit.toFixed(2) + ' €';
      profitEl.className = 'text-xl font-black ' + (profit > 0 ? 'text-emerald-600' : profit < 0 ? 'text-rose-600' : 'text-slate-800');

      const roiEl = document.getElementById('statROI');
      roiEl.textContent = (roi >= 0 ? '+' : '') + roi.toFixed(1) + ' %';
      roiEl.className = 'text-xl font-black ' + (roi > 0 ? 'text-emerald-600' : roi < 0 ? 'text-rose-600' : 'text-slate-800');

      // Bilan Net Total Combiné : somme des combinés réglés (Gagné/Perdu) du sport courant.
      // Volontairement indépendant des filtres du Bilan (championnat/marché/cote/période),
      // un combiné pouvant mélanger plusieurs marchés/championnats différents.
      const combosForSport = state.combos[currentSport] || [];
      let comboBilan = 0, comboSettledStake = 0;
      combosForSport.forEach(combo => {
        const status = comboStatus(currentSport, combo);
        if (status === 'Won' || status === 'Lost') {
          comboBilan += comboProfit(currentSport, combo);
          comboSettledStake += (combo.stake || 0);
        }
      });
      const profitComboEl = document.getElementById('statProfitCombo');
      if (profitComboEl) {
        profitComboEl.textContent = (comboBilan >= 0 ? '+' : '') + comboBilan.toFixed(2) + ' €';
        profitComboEl.className = 'text-xl font-black ' + (comboBilan > 0 ? 'text-emerald-600' : comboBilan < 0 ? 'text-rose-600' : 'text-slate-800');
      }

      const roiCombo = comboSettledStake > 0 ? (comboBilan / comboSettledStake) * 100 : 0;
      const roiComboEl = document.getElementById('statROICombo');
      if (roiComboEl) {
        roiComboEl.textContent = (roiCombo >= 0 ? '+' : '') + roiCombo.toFixed(1) + ' %';
        roiComboEl.className = 'text-xl font-black ' + (roiCombo > 0 ? 'text-emerald-600' : roiCombo < 0 ? 'text-rose-600' : 'text-slate-800');
      }

      renderCombos();
      renderDailyStats();
      renderGroupedStats();
      renderFootballCategoryStats();
      renderGlobalBankrollChart();
      if (window.majAmbianceAuto) window.majAmbianceAuto();
    }

    function hexToRgba(hex, alpha) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }


    // ===================== AMBIANCES (fonds saisonniers) =====================
    (function () {
      // groupe : saisons / fêtes / ambiances
      const AMBIANCES = {
        automne:   { label: '🍂 Automne',            groupe: 'Saisons' },
        hiver:     { label: '❄️ Hiver',              groupe: 'Saisons' },
        printemps: { label: '🌸 Printemps',          groupe: 'Saisons' },
        ete:       { label: '☀️ Été',                groupe: 'Saisons' },
        halloween: { label: '🎃 Halloween',          groupe: 'Fêtes' },
        noel:      { label: '🎄 Noël',               groupe: 'Fêtes' },
        victoire:  { label: '🎉 Victoire (confettis)', groupe: 'Fêtes' },
        stade:     { label: '⚽ Soir de match',      groupe: 'Ambiances' },
        ldc:       { label: '⭐ Soirée européenne',  groupe: 'Ambiances' },
        ocean:     { label: '🌊 Océan',              groupe: 'Ambiances' },
        couchant:  { label: '🌅 Coucher de soleil',  groupe: 'Ambiances' },
        aurore:    { label: '🌌 Aurore boréale',     groupe: 'Ambiances' },
        pluie:     { label: '🌧️ Pluie douce',        groupe: 'Ambiances' },
        classique: { label: '⚪ Classique (uni)',    groupe: 'Ambiances' }
      };

      // Auto : saison météo (hémisphère nord), avec Halloween (25-31 oct.) et Noël (1-26 déc.).
      function saisonDuJour() {
        const d = new Date(), m = d.getMonth(), j = d.getDate();
        if (m === 9 && j >= 25) return 'halloween';
        if (m === 11 && j <= 26) return 'noel';
        if (m === 11 || m <= 1) return 'hiver';
        if (m <= 4) return 'printemps';
        if (m <= 7) return 'ete';
        return 'automne';
      }

      // ---- Auto intelligent : l'ambiance suit ton activité du jour et l'heure ----
      const HEURE_SOIR = 18; // à partir de cette heure, des paris en cours = "soir de match"

      function dateLocale() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }

      // Paris simples du jour (football) : bilan des réglés, nombre de paris en cours.
      function bilanDuJour() {
        const today = dateLocale();
        let profit = 0, regles = 0, enCours = 0;
        ['football'].forEach(sp => (state[sp] || []).forEach(b => {
          if (b.date !== today) return;
          const mise = parseFloat(b.stake) || 0, cote = parseFloat(b.odds) || 1;
          if (b.status === 'Won') { profit += (cote - 1) * mise; regles++; }
          else if (b.status === 'Lost') { profit -= mise; regles++; }
          else enCours++;
        }));
        return { profit: profit, regles: regles, enCours: enCours };
      }

      // mode 'auto' (intelligent) ou 'saison' (date uniquement).
      // Renvoie { nom (le fond), effets (animations en plus), raison }.
      //  - Soir de match / soirée européenne : remplacent le fond (pelouse / bleu étoilé).
      //  - Sinon le fond reste la saison (ou la fête) ; confettis (journée gagnante) et
      //    pluie (journée perdante) s'ajoutent PAR-DESSUS.
      function resoudreAuto(mode) {
        const saison = saisonDuJour();
        const fete = saison === 'halloween' || saison === 'noel';
        if (mode === 'saison') return { nom: saison, effets: [], raison: fete ? 'Période de fête' : 'Selon la saison' };

        const b = bilanDuJour();
        const d = new Date(), h = d.getHours(), jour = d.getDay(); // 2 = mardi, 3 = mercredi
        const euro = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2).replace('.', ',') + ' €';

        if (h >= HEURE_SOIR && b.enCours > 0)
          return (jour === 2 || jour === 3)
            ? { nom: 'ldc', effets: [], raison: 'Soirée européenne : ' + b.enCours + ' pari(s) en cours' }
            : { nom: 'stade', effets: [], raison: 'Soir de match : ' + b.enCours + ' pari(s) en cours' };

        const base = fete ? 'Période de fête' : 'Selon la saison';
        if (b.regles > 0 && b.profit > 0)
          return { nom: saison, effets: ['victoire'], raison: base + ' + confettis : journée gagnante (' + euro(b.profit) + ')' };
        if (b.regles > 0 && b.profit < 0)
          return { nom: saison, effets: ['pluie'], raison: base + ' + pluie : journée perdante (' + euro(b.profit) + ')' };
        return { nom: saison, effets: [], raison: base };
      }

      // forme : feuille | neige | petale | lumiere | chauvesouris | bulle | etoile | confetti | pluie
      const PARTICULES = {
        automne:   { forme: 'feuille', couleurs: ['#c2410c', '#ea580c', '#d97706', '#b45309', '#f59e0b'], n: 22, v: 0.55 },
        hiver:     { forme: 'neige',   couleurs: ['#ffffff'], n: 60, v: 0.45 },
        printemps: { forme: 'petale',  couleurs: ['#f9a8d4', '#fbcfe8', '#f472b6', '#fde68a'], n: 26, v: 0.5 },
        ete:       { forme: 'lumiere', couleurs: ['#fde047', '#fbbf24', '#ffffff'], n: 24, v: 0.25 },
        halloween: { forme: 'chauvesouris', couleurs: ['#4c1d95', '#581c87', '#3b0764'], n: 9, v: 1 },
        noel:      { forme: 'neige',   couleurs: ['#ffffff', '#ffffff', '#fcd34d'], n: 55, v: 0.45 },
        victoire:  { forme: 'confetti', couleurs: ['#f59e0b', '#ec4899', '#38bdf8', '#22c55e', '#a855f7', '#ef4444'], n: 34, v: 0.8 },
        ldc:       { forme: 'etoile',  couleurs: ['#ffffff', '#fef9c3', '#c7d2fe'], n: 38, v: 0, fixe: true },
        ocean:     { forme: 'bulle',   couleurs: ['#ffffff'], n: 26, v: 0.5 },
        couchant:  { forme: 'lumiere', couleurs: ['#fb923c', '#f472b6', '#fde68a'], n: 20, v: 0.2 },
        aurore:    { forme: 'etoile',  couleurs: ['#ffffff', '#a7f3d0', '#ddd6fe'], n: 26, v: 0, fixe: true },
        pluie:     { forme: 'pluie',   couleurs: ['#64748b'], n: 70, v: 1 }
      };

      const canvas = document.createElement('canvas');
      canvas.id = 'ambianceCanvas';
      document.body.insertBefore(canvas, document.body.firstChild);
      const ctx = canvas.getContext('2d');
      let parts = [], raf = null, w = 0, h = 0, dpr = 1, config = null, last = 0;

      const reduit = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function redim() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth; h = window.innerHeight;
        canvas.width = w * dpr; canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function nouvelle(initial, c) {
        const f = c.forme;
        const taille = f === 'neige' ? 1.5 + Math.random() * 3
                     : f === 'lumiere' ? 6 + Math.random() * 16
                     : f === 'etoile' ? 2 + Math.random() * 4
                     : f === 'bulle' ? 3 + Math.random() * 9
                     : f === 'chauvesouris' ? 9 + Math.random() * 7
                     : f === 'confetti' ? 4 + Math.random() * 4
                     : f === 'pluie' ? 8 + Math.random() * 12
                     : 7 + Math.random() * 7;
        const monte = (f === 'lumiere' || f === 'bulle');
        const p = {
          cfg: c,
          x: Math.random() * w,
          y: initial ? Math.random() * h : (monte ? h + 20 : -20),
          r: taille,
          vy: (0.4 + Math.random() * 0.9) * c.v * (monte ? -0.6 : 1),
          vx: (Math.random() - 0.5) * 0.5,
          ang: Math.random() * Math.PI * 2,
          va: (Math.random() - 0.5) * 0.03,
          ph: Math.random() * Math.PI * 2,
          couleur: c.couleurs[Math.floor(Math.random() * c.couleurs.length)],
          alpha: monte && f === 'lumiere' ? 0.10 + Math.random() * 0.18 : 0.55 + Math.random() * 0.35
        };
        if (f === 'pluie') { p.vy = (7 + Math.random() * 5) * c.v; p.vx = -1.2; p.alpha = 0.18 + Math.random() * 0.25; }
        if (f === 'etoile') { p.alpha = 0.5 + Math.random() * 0.4; p.y = Math.random() * h; }
        if (f === 'chauvesouris') {
          p.vx = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 1.1);
          p.vy = 0; p.y = h * (0.1 + Math.random() * 0.7); p.x = initial ? Math.random() * w : (p.vx > 0 ? -30 : w + 30);
          p.alpha = 0.55;
        }
        if (f === 'confetti') p.va = (Math.random() - 0.5) * 0.12;
        return p;
      }

      function dessine(p) {
        const f = p.cfg.forme;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.fillStyle = p.couleur;
        if (f === 'neige') {
          ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
        } else if (f === 'lumiere') {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r);
          g.addColorStop(0, p.couleur); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
        } else if (f === 'feuille') {
          ctx.rotate(p.ang);
          ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(80,30,0,.45)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(-p.r, 0); ctx.lineTo(p.r, 0); ctx.stroke();
        } else if (f === 'petale') {
          ctx.rotate(p.ang);
          ctx.beginPath(); ctx.ellipse(0, 0, p.r * 0.75, p.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        } else if (f === 'bulle') {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(-p.r * 0.35, -p.r * 0.35, p.r * 0.2, 0, Math.PI * 2); ctx.fill();
        } else if (f === 'etoile') {
          // étoile à 4 branches qui scintille
          ctx.globalAlpha = p.alpha * (0.45 + 0.55 * Math.abs(Math.sin(p.ph * 1.4)));
          const r = p.r;
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.8); ctx.quadraticCurveTo(r * 0.25, -r * 0.25, r * 1.8, 0);
          ctx.quadraticCurveTo(r * 0.25, r * 0.25, 0, r * 1.8);
          ctx.quadraticCurveTo(-r * 0.25, r * 0.25, -r * 1.8, 0);
          ctx.quadraticCurveTo(-r * 0.25, -r * 0.25, 0, -r * 1.8);
          ctx.fill();
        } else if (f === 'confetti') {
          ctx.rotate(p.ang);
          ctx.scale(1, Math.cos(p.ph * 2));
          ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        } else if (f === 'pluie') {
          ctx.strokeStyle = p.couleur; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.vx * 1.5, p.r); ctx.stroke();
        } else if (f === 'chauvesouris') {
          const batt = Math.sin(p.ph * 4);               // battement d'ailes
          const s = p.r / 10, dir = p.vx > 0 ? 1 : -1;
          ctx.scale(dir * s, s);
          ctx.beginPath(); ctx.ellipse(0, 0, 3, 4.5, 0, 0, Math.PI * 2); ctx.fill();   // corps
          ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(-1.2, -7); ctx.lineTo(0, -4.5); ctx.lineTo(1.2, -7); ctx.lineTo(2, -4); ctx.fill(); // oreilles
          [-1, 1].forEach(side => {
            ctx.beginPath();
            ctx.moveTo(side * 2, -1);
            ctx.quadraticCurveTo(side * 9, -9 - batt * 5, side * 16, -2 - batt * 6);
            ctx.quadraticCurveTo(side * 12, 0, side * 10, 3);
            ctx.quadraticCurveTo(side * 6, 1, side * 4, 4);
            ctx.quadraticCurveTo(side * 3, 2, side * 2, 3);
            ctx.closePath(); ctx.fill();
          });
        }
        ctx.restore();
      }

      function boucle(t) {
        raf = requestAnimationFrame(boucle);
        if (t - last < 33) return; // ~30 images/s, suffisant et léger
        last = t;
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < parts.length; i++) {
          let p = parts[i];
          const f = p.cfg.forme;
          p.ph += 0.02;
          if (!p.cfg.fixe) {
            if (f === 'chauvesouris') {
              p.x += p.vx; p.y += Math.sin(p.ph * 1.5) * 0.9;
              if (p.x < -40 || p.x > w + 40) { p = parts[i] = nouvelle(false, p.cfg); }
            } else {
              p.x += p.vx + Math.sin(p.ph) * (f === 'neige' ? 0.35 : f === 'pluie' ? 0 : 0.6);
              p.y += p.vy;
              p.ang += p.va;
              if (p.y > h + 24 || p.y < -30 || p.x < -30 || p.x > w + 30) p = parts[i] = nouvelle(false, p.cfg);
            }
          }
          dessine(p);
        }
      }

      function arreter() {
        if (raf) cancelAnimationFrame(raf);
        raf = null; parts = [];
        ctx.clearRect(0, 0, w, h);
      }

      // noms : une ou plusieurs ambiances dont on cumule les animations (ex. saison + confettis).
      function demarrer(noms) {
        arreter();
        const cfgs = noms.map(n => PARTICULES[n]).filter(Boolean);
        config = cfgs.length ? cfgs : null;
        if (!config || reduit()) return;
        redim();
        cfgs.forEach(c => {
          const n = Math.round(c.n * (w < 640 ? 0.55 : 1));
          for (let i = 0; i < n; i++) parts.push(nouvelle(true, c));
        });
        raf = requestAnimationFrame(boucle);
      }

      function choixSauvegarde() {
        try { return localStorage.getItem('pronotracker_ambiance') || 'auto'; } catch (e) { return 'auto'; }
      }

      let courant = null;
      const estAuto = c => c === 'auto' || c === 'saison';

      function appliquer(choix) {
        let nom, effets = [], raison = '';
        if (estAuto(choix)) { const r = resoudreAuto(choix); nom = r.nom; effets = r.effets; raison = r.raison; }
        else nom = AMBIANCES[choix] ? choix : saisonDuJour();
        const cle = nom + '|' + effets.join(',');
        if (cle !== courant) {            // on ne relance les animations que si quelque chose change vraiment
          courant = cle;
          document.body.setAttribute('data-ambiance', nom);
          demarrer([nom].concat(effets));
        }
        const sel = document.getElementById('ambianceSelect');
        if (sel) {
          const nomCourt = k => AMBIANCES[k].label.replace(/^\S+\s/, '');
          const oa = sel.querySelector('option[value="auto"]'), os = sel.querySelector('option[value="saison"]');
          // Le libellé "Auto" montre toujours ce que l'Auto choisirait en ce moment, même si tu as fixé une ambiance à la main.
          const ra = resoudreAuto('auto');
          if (oa) oa.textContent = '🎨 Auto intelligent — ' + nomCourt(ra.nom) + (ra.effets.length ? ' + ' + (ra.effets[0] === 'victoire' ? 'confettis' : 'pluie') : '');
          if (os) os.textContent = '📅 Auto saisons — ' + nomCourt(saisonDuJour());
          sel.value = (estAuto(choix) || AMBIANCES[choix]) ? choix : 'auto';
          sel.title = estAuto(choix) ? 'Auto : ' + raison : 'Ambiance choisie manuellement';
        }
      }

      // Recalcule l'ambiance automatique (appelée à chaque mise à jour des paris et toutes les 5 min).
      window.majAmbianceAuto = function () {
        const c = choixSauvegarde();
        if (estAuto(c)) appliquer(c);
      };

      window.changerAmbiance = function (choix) {
        try { localStorage.setItem('pronotracker_ambiance', choix); } catch (e) {}
        appliquer(choix);
      };

      // Menu : "Auto" indique l'ambiance du moment, puis les ambiances par groupe.
      const sel = document.getElementById('ambianceSelect');
      if (sel) {
        let html = `<option value="auto">🎨 Auto intelligent</option><option value="saison">📅 Auto saisons</option>`;
        ['Saisons', 'Fêtes', 'Ambiances'].forEach(g => {
          html += `<optgroup label="${g}">` +
            Object.keys(AMBIANCES).filter(k => AMBIANCES[k].groupe === g)
              .map(k => `<option value="${k}">${AMBIANCES[k].label}</option>`).join('') + `</optgroup>`;
        });
        sel.innerHTML = html;
      }

      window.addEventListener('resize', () => { if (config && !reduit()) { redim(); } });
      // Économie de batterie : pause quand l'onglet est caché.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = null; } }
        else if (config && !reduit() && !raf && parts.length) raf = requestAnimationFrame(boucle);
      });

      appliquer(choixSauvegarde());
      setInterval(window.majAmbianceAuto, 5 * 60 * 1000);
    })();


    // ===================== SYNCHRONISATION CLOUD (Supabase) =====================
    // Principe : chaque pari / combiné est un "élément" horodaté. À chaque synchro on lit le cloud,
    // on fusionne élément par élément (le plus récent gagne, les suppressions sont propagées),
    // puis on réécrit le cloud si besoin. Les données restent aussi sur l'appareil (fonctionne hors ligne).
    (function () {
      const CFG_KEY = 'pronotracker_sync_cfg';       // { url, key, code }
      const ST_KEY = 'pronotracker_sync_state';      // { snap, ver, last }
      const BACKUP_KEY = 'pronotracker_presync_backup';
      const TOMBSTONE_MS = 90 * 24 * 3600 * 1000;    // les suppressions sont mémorisées 90 jours
      const POLL_MS = 30000;

      const SCHEMA_SQL = `-- PronoTracker : table de synchronisation (à exécuter UNE fois dans Supabase > SQL Editor)
create table if not exists public.pronotracker_sync (
  code_hash  text primary key,
  data       jsonb  not null default '{}'::jsonb,
  version    bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Table verrouillée : personne ne peut la lire ou l'écrire directement.
alter table public.pronotracker_sync enable row level security;
revoke all on table public.pronotracker_sync from anon, authenticated;

-- Lecture : renvoie les données si la version a changé depuis p_since.
create or replace function public.pt_get(p_key text, p_since bigint default -1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.pronotracker_sync;
begin
  if p_key is null or length(p_key) <> 64 then raise exception 'cle invalide'; end if;
  select * into r from public.pronotracker_sync where code_hash = p_key;
  if not found then
    return jsonb_build_object('exists', false, 'version', 0);
  end if;
  if r.version = p_since then
    return jsonb_build_object('exists', true, 'version', r.version, 'unchanged', true);
  end if;
  return jsonb_build_object('exists', true, 'version', r.version, 'data', r.data);
end;
$$;

-- Écriture : n'aboutit que si la version attendue est la bonne (évite d'écraser un autre appareil).
create or replace function public.pt_put(p_key text, p_data jsonb, p_expected bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cur bigint;
begin
  if p_key is null or length(p_key) <> 64 then raise exception 'cle invalide'; end if;
  if pg_column_size(p_data) > 8000000 then raise exception 'donnees trop volumineuses'; end if;

  select version into cur from public.pronotracker_sync where code_hash = p_key for update;
  if not found then
    if p_expected <> 0 then
      return jsonb_build_object('ok', false, 'version', 0);
    end if;
    begin
      insert into public.pronotracker_sync (code_hash, data, version) values (p_key, p_data, 1);
    exception when unique_violation then
      select version into cur from public.pronotracker_sync where code_hash = p_key;
      return jsonb_build_object('ok', false, 'version', cur);
    end;
    return jsonb_build_object('ok', true, 'version', 1);
  end if;

  if cur <> p_expected then
    return jsonb_build_object('ok', false, 'version', cur);
  end if;
  update public.pronotracker_sync
     set data = p_data, version = cur + 1, updated_at = now()
   where code_hash = p_key;
  return jsonb_build_object('ok', true, 'version', cur + 1);
end;
$$;

revoke all on function public.pt_get(text, bigint) from public;
revoke all on function public.pt_put(text, jsonb, bigint) from public;
grant execute on function public.pt_get(text, bigint) to anon, authenticated;
grant execute on function public.pt_put(text, jsonb, bigint) to anon, authenticated;`;

      // ---------- utilitaires ----------
      const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
      const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
      const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };

      function stable(v) {
        if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
        if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
        return JSON.stringify(v);
      }
      function hash53(str) {
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0, ch; i < str.length; i++) {
          ch = str.charCodeAt(i);
          h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
      }
      const hv = v => hash53(stable(v));

      // SHA-256 (le serveur ne reçoit que l'empreinte du code, jamais le code lui-même)
      function sha256hex(str) {
        const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
        const msg = unescape(encodeURIComponent(str)), l = msg.length;
        const nb = (((l + 8) >> 6) + 1), w = new Array(nb * 16).fill(0), W = new Array(64);
        for (let i = 0; i < l; i++) w[i >> 2] |= msg.charCodeAt(i) << (24 - (i % 4) * 8);
        w[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
        w[nb * 16 - 1] = l * 8;
        const rotr = (x, n) => (x >>> n) | (x << (32 - n));
        let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
        for (let b = 0; b < nb; b++) {
          for (let t = 0; t < 16; t++) W[t] = w[b * 16 + t] | 0;
          for (let t = 16; t < 64; t++) {
            const s0 = rotr(W[t-15], 7) ^ rotr(W[t-15], 18) ^ (W[t-15] >>> 3);
            const s1 = rotr(W[t-2], 17) ^ rotr(W[t-2], 19) ^ (W[t-2] >>> 10);
            W[t] = (W[t-16] + s0 + W[t-7] + s1) | 0;
          }
          let [a, b2, c, d, e, f, g, h] = H;
          for (let t = 0; t < 64; t++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[t] + W[t]) | 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b2) ^ (a & c) ^ (b2 & c);
            const t2 = (S0 + maj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0;
          }
          const v = [a, b2, c, d, e, f, g, h];
          H = H.map((x, i) => (x + v[i]) | 0);
        }
        return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
      }
      window._ptSha256 = sha256hex; // exposé pour les tests

      const normCode = c => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      function genCode() {
        const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const a = new Uint8Array(24); (window.crypto || window.msCrypto).getRandomValues(a);
        let s = ''; for (let i = 0; i < 24; i++) s += al[a[i] % al.length];
        return s.match(/.{4}/g).join('-');
      }
      const fmtCode = c => (normCode(c).match(/.{1,4}/g) || []).join('-');
      const b64e = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const b64d = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
      const encodeCfg = c => 'PT2.' + b64e(c.type === 'firebase'
        ? Object.assign({ t: 'fb', p: c.projectId, k: c.key, c: c.code }, c.fsHost ? { h: c.fsHost } : {})
        : { t: 'sb', u: c.url, k: c.key, c: c.code });
      function decodeCfg(s) {
        s = (s || '').trim();
        if (s.indexOf('#sync=') >= 0) s = s.split('#sync=')[1];
        if (s.startsWith('PT1.')) {                                   // ancien format : Supabase
          const o = b64d(s.slice(4));
          if (!o.u || !o.k || !o.c) throw new Error('Configuration incomplète');
          return { type: 'supabase', url: o.u, key: o.k, code: o.c };
        }
        if (!s.startsWith('PT2.')) throw new Error('Configuration non reconnue');
        const o = b64d(s.slice(4));
        if (o.t === 'fb') {
          if (!o.p || !o.k || !o.c) throw new Error('Configuration incomplète');
          return Object.assign({ type: 'firebase', projectId: o.p, key: o.k, code: o.c }, o.h ? { fsHost: o.h } : {});
        }
        if (!o.u || !o.k || !o.c) throw new Error('Configuration incomplète');
        return { type: 'supabase', url: o.u, key: o.k, code: o.c };
      }

      // ---------- éléments synchronisés ----------
      // f:<id> pari football · cf:<id> combinés · m = types de marché
      function itemsLocal() {
        const out = {};
        [['football', 'f']].forEach(([sp, p]) => {
          (state[sp] || []).forEach(b => { out[p + ':' + b.id] = b; });
          ((state.combos && state.combos[sp]) || []).forEach(c => { out['c' + p + ':' + c.id] = c; });
        });
        out.m = footballMarkets;
        return out;
      }

      // Compare l'état actuel au dernier état synchronisé (snap) pour repérer ce qui a changé ici.
      function detectLocal(snap, firstMode, now) {
        const items = itemsLocal(), loc = {};
        let dirty = false, deletions = 0;
        for (const k in items) {
          const v = items[k], h = hv(v), s = snap && snap[k];
          if (firstMode) loc[k] = { v: v, h: h, t: 0 };
          else if (s && !s.d && s.h === h) loc[k] = { v: v, h: h, t: s.t };
          else { loc[k] = { v: v, h: h, t: now }; dirty = true; }
        }
        if (!firstMode) for (const k in snap) {
          if (k in items) continue;
          const s = snap[k];
          if (s.d) loc[k] = { d: true, t: s.t };
          else { loc[k] = { d: true, t: now }; dirty = true; if (!/^c?t:/.test(k)) deletions++; }
        }
        return { loc: loc, dirty: dirty, deletions: deletions };
      }

      function mergeItems(remote, loc, firstMode, now) {
        const res = {}, keys = new Set(Object.keys(remote).concat(Object.keys(loc)));
        keys.forEach(k => {
          if (/^c?t:/.test(k)) return;                                  // anciens éléments tennis : retirés du cloud
          const L = loc[k], R = remote[k];
          if (L && !R) { if (!L.d) res[k] = { v: L.v, t: L.t || now }; return; }
          if (!L && R) { res[k] = R; return; }
          if (firstMode && k === 'm' && !R.d) {                       // 1re synchro : on réunit les types de marché
            const u = (R.v || []).slice(); (L.v || []).forEach(x => { if (u.indexOf(x) < 0) u.push(x); });
            res[k] = { v: u, t: now }; return;
          }
          res[k] = (L.t > R.t) ? (L.d ? { d: true, t: L.t } : { v: L.v, t: L.t }) : R;
        });
        for (const k in res) if (res[k].d && now - res[k].t > TOMBSTONE_MS) delete res[k];
        return res;
      }

      // Reporte le résultat de la fusion dans les données locales. Renvoie true si quelque chose a changé.
      function applyResult(res) {
        let changed = false;
        [['football', 'f']].forEach(([sp, p]) => {
          const rebuild = (list, prefix) => {
            const seen = new Set(), next = [];
            (list || []).forEach(x => {
              const k = prefix + ':' + x.id, r = res[k]; seen.add(k);
              if (!r || r.d) { changed = true; return; }
              if (hv(x) !== hv(r.v)) { next.push(r.v); changed = true; } else next.push(x);
            });
            const fresh = Object.keys(res).filter(k => k.startsWith(prefix + ':') && !res[k].d && !seen.has(k))
              .map(k => res[k].v).sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
            if (fresh.length) changed = true;
            return fresh.concat(next);
          };
          state[sp] = rebuild(state[sp], p);
          state.combos[sp] = rebuild(state.combos[sp], 'c' + p);
        });
        const m = res.m;
        if (m && !m.d && Array.isArray(m.v) && m.v.length && hv(m.v) !== hv(footballMarkets)) {
          footballMarkets = m.v.slice(); saveMarketsToStorage(); changed = true; window._ptMarketsChanged = true;
        }
        return changed;
      }

      function snapFromResult(res) {
        const snap = {};
        for (const k in res) snap[k] = res[k].d ? { d: 1, t: res[k].t } : { h: hv(res[k].v), t: res[k].t };
        return snap;
      }

      // ---------- réseau ----------
      async function rpc(cfg, fn, body) {
        const headers = { 'Content-Type': 'application/json', 'apikey': cfg.key };
        if (/^eyJ/.test(cfg.key)) headers['Authorization'] = 'Bearer ' + cfg.key;
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 25000);
        try {
          const r = await fetch(cfg.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl.signal });
          if (!r.ok) { let t = ''; try { t = await r.text(); } catch (e) {} throw new Error('Erreur ' + r.status + (t ? ' — ' + t.slice(0, 160) : '')); }
          return await r.json();
        } finally { clearTimeout(to); }
      }

      // ---------- services cloud (même interface : get / put) ----------
      // get(cfg, keyHash, since) → { exists, version, unchanged?, data?: { items }, token?, n? }
      // put(cfg, keyHash, doc, expectedVersion, got) → { ok, version }
      const FIREBASE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // === PronoTracker : à AJOUTER dans ton bloc existant, sans toucher au reste ===
    match /pronotracker/{code} {
      allow get, create, update: if code.matches('^[0-9a-f]{64}$');
      allow list, delete: if false;
      match /chunks/{n} {
        allow get, create, update, delete: if code.matches('^[0-9a-f]{64}$') && n.matches('^[0-9]{1,3}$');
      }
    }

  }
}`;

      const supabaseBackend = {
        async get(cfg, keyHash, since) { return rpc(cfg, 'pt_get', { p_key: keyHash, p_since: since }); },
        async put(cfg, keyHash, doc, expected) { return rpc(cfg, 'pt_put', { p_key: keyHash, p_data: doc, p_expected: expected }); }
      };

      // Firestore (API REST, sans bibliothèque). Les données sont découpées en blocs de 600 000 caractères
      // (limite Firestore : 1 Mo par document) et écrites en UNE transaction avec contrôle de version.
      const FS_CHUNK = 600000;
      const fsDoc = (cfg, path) => 'projects/' + cfg.projectId + '/databases/(default)/documents/' + path;
      async function fsPost(cfg, endpoint, body) {
        const host = cfg.fsHost || 'https://firestore.googleapis.com';
        const url = host + '/v1/projects/' + encodeURIComponent(cfg.projectId) + '/databases/(default)/documents' + endpoint + '?key=' + encodeURIComponent(cfg.key);
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 25000);
        try {
          const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
          if (!r.ok) {
            let j = null; try { j = await r.json(); } catch (e) {}
            const er = new Error('Erreur ' + r.status + (j && j.error && j.error.message ? ' — ' + String(j.error.message).slice(0, 160) : ''));
            er.status = j && j.error && j.error.status; er.httpCode = r.status;
            throw er;
          }
          return await r.json();
        } finally { clearTimeout(to); }
      }
      const firebaseBackend = {
        async get(cfg, keyHash, since) {
          const base = 'pronotracker/' + keyHash;
          const r1 = await fsPost(cfg, ':batchGet', { documents: [fsDoc(cfg, base)] });
          const hit = (r1 || []).find(x => x.found || x.missing);
          if (!hit || hit.missing) return { exists: false, version: 0 };
          const f = hit.found.fields || {};
          const version = parseInt(f.v && f.v.integerValue, 10) || 0, n = parseInt(f.n && f.n.integerValue, 10) || 0;
          const token = hit.found.updateTime;
          if (version === since) return { exists: true, version: version, unchanged: true, token: token, n: n };
          const parts = new Array(n);
          if (n) {
            const r2 = await fsPost(cfg, ':batchGet', { documents: Array.from({ length: n }, (_, i) => fsDoc(cfg, base + '/chunks/' + i)) });
            (r2 || []).forEach(x => { if (x.found) { const i = parseInt(x.found.name.split('/').pop(), 10); parts[i] = x.found.fields && x.found.fields.d ? x.found.fields.d.stringValue || '' : ''; } });
          }
          for (let i = 0; i < n; i++) if (parts[i] === undefined) throw new Error('Données incomplètes dans Firestore (bloc ' + i + ' manquant)');
          return { exists: true, version: version, token: token, n: n, data: JSON.parse(parts.join('') || '{}') };
        },
        async put(cfg, keyHash, doc, expected, got) {
          const base = 'pronotracker/' + keyHash;
          // JSON 100 % ASCII : un caractère = un octet, le découpage ne peut jamais couper un caractère en deux
          const json = JSON.stringify(doc).replace(/[\u007f-￿]/g, c => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
          const parts = []; for (let i = 0; i < json.length; i += FS_CHUNK) parts.push(json.slice(i, i + FS_CHUNK));
          if (!parts.length) parts.push('');
          const version = expected + 1;
          const writes = [{
            update: { name: fsDoc(cfg, base), fields: { v: { integerValue: String(version) }, n: { integerValue: String(parts.length) } } },
            currentDocument: got && got.exists ? { updateTime: got.token } : { exists: false }
          }];
          parts.forEach((p, i) => writes.push({ update: { name: fsDoc(cfg, base + '/chunks/' + i), fields: { d: { stringValue: p } } } }));
          for (let i = parts.length; i < ((got && got.n) || 0); i++) writes.push({ delete: fsDoc(cfg, base + '/chunks/' + i) });
          try { await fsPost(cfg, ':commit', { writes: writes }); return { ok: true, version: version }; }
          catch (e) {
            if (e.status === 'FAILED_PRECONDITION' || e.status === 'ABORTED' || e.status === 'ALREADY_EXISTS' || e.httpCode === 409) return { ok: false, version: -1 };
            throw e;
          }
        }
      };
      const backendFor = cfg => cfg && cfg.type === 'firebase' ? firebaseBackend : supabaseBackend;

      // ---------- statut ----------
      let status = { kind: 'off', msg: '' }, running = false, again = false, paused = false, timer = null;
      function setStatus(kind, msg) { status = { kind: kind, msg: msg || '' }; paintStatus(); }
      function hhmm(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
      function paintStatus() {
        const dot = document.getElementById('syncDot'), icon = document.getElementById('syncIcon'), lab = document.getElementById('syncLabel'), btn = document.getElementById('syncBtn');
        if (dot && icon && lab && btn) {
          const st = lsGet(ST_KEY);
          const cfg = !!lsGet(CFG_KEY);
          const colors = { off: 'bg-slate-300', idle: 'bg-emerald-500', syncing: 'bg-sky-500', error: 'bg-rose-500' };
          dot.className = 'w-2 h-2 rounded-full ' + (colors[status.kind] || colors.off);
          icon.className = 'fa-solid ' + (status.kind === 'syncing' ? 'fa-arrows-rotate fa-spin text-sky-500' : status.kind === 'error' ? 'fa-triangle-exclamation text-rose-500' : cfg ? 'fa-cloud text-sky-500' : 'fa-cloud text-slate-400');
          lab.textContent = status.kind === 'error' ? 'Sync !' : 'Sync';
          btn.title = status.kind === 'off' ? 'Synchronisation désactivée — clique pour la configurer'
            : status.kind === 'syncing' ? 'Synchronisation en cours…'
            : status.kind === 'error' ? 'Erreur : ' + status.msg
            : 'Synchronisé' + (st && st.last ? ' à ' + hhmm(st.last) : '');
        }
        paintModalStatus();
      }

      // ---------- synchronisation ----------
      const isConfigured = () => { const c = lsGet(CFG_KEY); return !!(c && c.key && c.code && (c.type === 'firebase' ? c.projectId : c.url)); };

      async function syncNow(reason) {
        if (!isConfigured()) { setStatus('off'); return; }
        if (running) { again = true; return; }
        if (paused && reason !== 'manual') return;
        if (navigator.onLine === false) { setStatus('error', 'Hors ligne — nouvel essai dès le retour du réseau'); return; }
        paused = false; running = true; setStatus('syncing');
        try {
          const cfg = lsGet(CFG_KEY), keyHash = sha256hex(normCode(cfg.code));
          for (let attempt = 0; attempt < 4; attempt++) {
            const st = lsGet(ST_KEY) || { snap: null, ver: -1 };
            const firstMode = !st.snap;
            // 1) lecture du cloud (allégée si rien n'a bougé)
            const pre = detectLocal(st.snap, firstMode, Date.now());
            const since = (!firstMode && !pre.dirty && st.ver >= 0) ? st.ver : -1;
            const svc = backendFor(cfg);
            const got = await svc.get(cfg, keyHash, since);
            if (got.unchanged) { st.last = Date.now(); lsSet(ST_KEY, st); setStatus('idle'); break; }
            const remoteItems = (got.exists && got.data && got.data.items) || {};
            const remoteVer = got.version || 0;

            // 2) fusion (tout est synchrone à partir d'ici : aucune modification perdue entre-temps)
            const now = Date.now();
            const det = detectLocal(st.snap, firstMode, now);
            const nLocal = Object.keys(det.loc).filter(k => k !== 'm' && !det.loc[k].d).length;
            const nRemote = Object.keys(remoteItems).filter(k => k !== 'm' && !remoteItems[k].d).length;
            if (firstMode && nLocal > 0 && nRemote > 0 && !st.confirmedFirst) {
              const ok = confirm('Première synchronisation\n\nCet appareil contient ' + nLocal + ' élément(s) (paris et combinés), le cloud en contient ' + nRemote + '.\n\nLes deux seront FUSIONNÉS : rien n\'est supprimé. Si un même pari diffère, la version du cloud est conservée. Une copie de sécurité de cet appareil est gardée.\n\nContinuer ?');
              if (!ok) { paused = true; setStatus('error', 'Fusion annulée — clique sur Sync pour réessayer'); return; }
              lsSet(BACKUP_KEY, { at: Date.now(), state: state, markets: footballMarkets });
            }
            const nSnapLive = st.snap ? Object.keys(st.snap).filter(k => !st.snap[k].d).length : 0;
            if (!firstMode && det.deletions > Math.max(30, nSnapLive * 0.25)) {
              const ok = confirm('⚠️ ' + det.deletions + ' élément(s) ont disparu de cet appareil depuis la dernière synchronisation.\n\nSi c\'est voulu, ils seront aussi supprimés sur tes autres appareils. Sinon, annule : rien ne sera envoyé.\n\nConfirmer la suppression ?');
              if (!ok) { paused = true; setStatus('error', 'Suppression massive refusée — rien n\'a été envoyé'); return; }
            }

            const res = mergeItems(remoteItems, det.loc, firstMode, now);
            const changedLocal = applyResult(res);
            if (changedLocal) {
              repareCombines(); corrigerMisesNulles();
              lsSet('prono_tracker_multisport_data', state);
              populateCompFilterOptions();
              if (window._ptMarketsChanged) { window._ptMarketsChanged = false; refreshMarketSelects(); }
              render();
            }
            st.snap = snapFromResult(res); st.confirmedFirst = true;

            // 3) écriture dans le cloud si le résultat diffère de ce qui y est déjà
            const remoteSnap = {};
            for (const k in remoteItems) remoteSnap[k] = remoteItems[k].d ? { d: 1, t: remoteItems[k].t } : { h: hv(remoteItems[k].v), t: remoteItems[k].t };
            const needPush = !got.exists || stable(remoteSnap) !== stable(st.snap);
            if (!needPush) { st.ver = remoteVer; st.last = Date.now(); lsSet(ST_KEY, st); setStatus('idle'); break; }
            lsSet(ST_KEY, st);
            const doc = { v: 1, items: res };
            const put = await svc.put(cfg, keyHash, doc, remoteVer, got);
            if (put.ok) { st.ver = put.version; st.last = Date.now(); lsSet(ST_KEY, st); setStatus('idle'); break; }
            st.ver = -1; lsSet(ST_KEY, st);                // un autre appareil a écrit entre-temps : on recommence
            if (attempt === 3) throw new Error('Conflit répété — réessaie dans un instant');
          }
        } catch (e) {
          setStatus('error', e && e.name === 'AbortError' ? 'Délai dépassé' : (e && e.message) || 'Erreur inconnue');
        } finally {
          running = false;
          if (again) { again = false; setTimeout(() => syncNow('again'), 300); }
        }
      }

      function schedule(ms) {
        if (!isConfigured()) return;
        clearTimeout(timer);
        timer = setTimeout(() => syncNow('save'), ms == null ? 2500 : ms);
      }
      window.syncSchedule = schedule;
      window.syncNow = syncNow;
      window._ptSync = { syncNow: syncNow, getStatus: () => status };

      // ---------- interface ----------
      let modal = null, draft = null;
      const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      function ensureModal() {
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'syncModal';
        modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4';
        modal.addEventListener('click', e => { if (e.target === modal) window.closeSyncModal(); });
        document.body.appendChild(modal);
        return modal;
      }

      function paintModalStatus() {
        const el = document.getElementById('syncModalStatus');
        if (!el) return;
        const st = lsGet(ST_KEY);
        const map = {
          idle: ['text-emerald-700 bg-emerald-50 border-emerald-200', 'fa-circle-check', 'Synchronisé' + (st && st.last ? ' à ' + hhmm(st.last) : '')],
          syncing: ['text-sky-700 bg-sky-50 border-sky-200', 'fa-arrows-rotate fa-spin', 'Synchronisation en cours…'],
          error: ['text-rose-700 bg-rose-50 border-rose-200', 'fa-triangle-exclamation', status.msg],
          off: ['text-slate-600 bg-slate-50 border-slate-200', 'fa-cloud', 'En attente']
        };
        const m = map[status.kind] || map.off;
        el.className = 'text-xs font-semibold rounded-xl border px-3 py-2.5 flex items-center gap-2 ' + m[0];
        el.innerHTML = '<i class="fa-solid ' + m[1] + '"></i><span>' + esc(m[2]) + '</span>';
      }

      function renderModal() {
        const m = ensureModal(), cfg = lsGet(CFG_KEY), on = isConfigured();
        const d = draft || (cfg && !on ? cfg : null) || { type: 'firebase', url: '', key: '', projectId: '', code: '' };
        const type = on ? cfg.type || 'supabase' : (d.type || 'firebase');
        const inp = 'input-field w-full text-xs';
        const tab = (t, lab) => `<button onclick="syncSetType('${t}')" class="flex-1 px-3 py-2 rounded-lg text-xs font-bold transition ${type === t ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}">${lab}</button>`;
        const fb = type === 'firebase';
        m.innerHTML = `
          <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div class="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 class="font-extrabold text-slate-800 text-sm flex items-center gap-2"><i class="fa-solid fa-cloud text-sky-500"></i> Synchronisation entre appareils</h3>
              <button onclick="closeSyncModal()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div id="syncModalStatus"></div>

            ${on ? `
            <div class="space-y-2">
              <p class="text-xs text-slate-600">Service : <b>${fb ? 'Firebase (Firestore)' : 'Supabase'}</b>. Tes paris sont envoyés dans ton espace cloud et récupérés automatiquement sur tous les appareils configurés (toutes les 30 s, et à chaque modification).</p>
              <div class="flex flex-wrap gap-2">
                <button onclick="syncNow('manual')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition flex items-center gap-1.5"><i class="fa-solid fa-arrows-rotate"></i> Synchroniser maintenant</button>
                <button onclick="syncCopyCfg()" class="border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold px-3.5 py-2 rounded-lg text-xs transition flex items-center gap-1.5"><i class="fa-solid fa-copy"></i> Copier la configuration (pour mon portable)</button>
              </div>
              <p id="syncCopyMsg" class="text-[11px] text-emerald-700 font-semibold hidden">✓ Copié. Colle-le sur ton portable (Sync → « Coller la configuration »).</p>
              <div class="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Ton code : <span class="font-mono font-bold text-slate-700 select-all">${esc(fmtCode(cfg.code))}</span><br>Il sert de mot de passe : toute personne qui l'a peut lire tes paris. Ne le partage pas.</div>
              <button onclick="syncDisable()" class="text-[11px] text-rose-600 hover:text-rose-800 font-bold">Désactiver la synchronisation sur cet appareil</button>
            </div>` : `
            <div class="space-y-3">
              <p class="text-xs text-slate-600">Ton espace cloud garde tes paris et les envoie à tous tes appareils. À faire <b>une seule fois</b> ; ensuite, sur le portable, il suffit de coller la configuration.</p>
              <div class="flex gap-1 bg-slate-100 rounded-xl p-1">${tab('firebase', 'Firebase')}${tab('supabase', 'Supabase')}</div>

              <details class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                <summary class="text-xs font-bold text-slate-700 cursor-pointer">1 · Préparer ${fb ? 'Firebase' : 'Supabase'} (première fois seulement)</summary>
                ${fb ? `
                <ol class="list-decimal ml-5 mt-2 space-y-1 text-[11px] text-slate-600">
                  <li>Ouvre <b>console.firebase.google.com</b> et choisis ton projet.</li>
                  <li><b>Build → Firestore Database</b> : si la base n'existe pas, clique sur <b>Créer une base de données</b> (région Europe, mode production).</li>
                  <li>Onglet <b>Règles</b> : <u>ajoute</u> le bloc ci-dessous <u>à l'intérieur</u> de <code>match /databases/{database}/documents { … }</code>, sans supprimer tes règles actuelles, puis <b>Publier</b>.</li>
                  <li><b>Paramètres du projet (⚙️) → Général</b> : note l'<b>ID du projet</b>. Dans « Vos applications », crée une app Web (icône &lt;/&gt;) si tu n'en as pas, puis copie la <b>clé API</b> (<code>apiKey</code>).</li>
                </ol>` : `
                <ol class="list-decimal ml-5 mt-2 space-y-1 text-[11px] text-slate-600">
                  <li>Crée un compte gratuit sur <b>supabase.com</b>, puis un nouveau projet (région Europe).</li>
                  <li>Menu <b>SQL Editor</b> → <b>New query</b> → colle le script ci-dessous → <b>Run</b>.</li>
                  <li>Menu <b>Project Settings → API</b> : copie <b>Project URL</b> et la clé <b>anon public</b>.</li>
                </ol>`}
                <textarea id="syncSql" readonly rows="${fb ? 11 : 6}" class="mt-2 w-full text-[10px] font-mono border border-slate-200 rounded-lg p-2 bg-white text-slate-600"></textarea>
                <button onclick="syncCopySql()" class="mt-1.5 text-[11px] font-bold text-blue-600 hover:text-blue-800"><i class="fa-solid fa-copy mr-1"></i>Copier ${fb ? 'les règles' : 'le script'}</button>
                <span id="syncSqlMsg" class="text-[11px] text-emerald-700 font-semibold ml-2 hidden">✓ Copié</span>
              </details>

              <div class="space-y-2">
                <div class="text-xs font-bold text-slate-700">2 · Connecter cet appareil</div>
                ${fb ? `
                <input id="syncProject" class="${inp}" placeholder="ID du projet Firebase (ex. mon-projet-1a2b3)" value="${esc(d.projectId)}" autocomplete="off">
                <input id="syncKey" class="${inp}" placeholder="Clé API (apiKey, commence par AIza…)" value="${esc(d.key)}" autocomplete="off">` : `
                <input id="syncUrl" class="${inp}" placeholder="Project URL (https://xxxx.supabase.co)" value="${esc(d.url)}" autocomplete="off">
                <input id="syncKey" class="${inp}" placeholder="Clé anon public" value="${esc(d.key)}" autocomplete="off">`}
                <div class="flex gap-2">
                  <input id="syncCode" class="${inp} font-mono" placeholder="Code de synchronisation" value="${esc(d.code ? fmtCode(d.code) : '')}" autocomplete="off">
                  <button onclick="syncGenCode()" class="shrink-0 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold px-3 py-2 rounded-lg text-xs transition">Générer</button>
                </div>
                <p class="text-[10px] text-slate-500">Premier appareil : clique sur « Générer ». Autre appareil : saisis le même code (ou colle la configuration ci-dessous).</p>
                <button onclick="syncEnable()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2.5 rounded-lg text-xs transition flex items-center justify-center gap-1.5"><i class="fa-solid fa-cloud-arrow-up"></i> Activer la synchronisation</button>
                <div class="border-t border-slate-100 pt-2 space-y-1.5">
                  <div class="text-xs font-bold text-slate-700">Ou : coller la configuration d'un autre appareil</div>
                  <div class="flex gap-2"><input id="syncPaste" class="${inp} font-mono" placeholder="PT2.…" autocomplete="off"><button onclick="syncApplyPaste()" class="shrink-0 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold px-3 py-2 rounded-lg text-xs transition">Appliquer</button></div>
                </div>
              </div>
              <p id="syncFormMsg" class="text-xs text-rose-600 font-semibold hidden"></p>
            </div>`}

            <div class="flex justify-end pt-2 border-t border-slate-100">
              <button onclick="closeSyncModal()" class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition text-xs">Fermer</button>
            </div>
          </div>`;
        const ta = document.getElementById('syncSql'); if (ta) ta.value = fb ? FIREBASE_RULES : SCHEMA_SQL;
        paintModalStatus();
      }

      function formMsg(t) { const el = document.getElementById('syncFormMsg'); if (el) { el.textContent = t || ''; el.classList.toggle('hidden', !t); } }
      function copyText(t, okId) {
        const done = () => { const e = document.getElementById(okId); if (e) { e.classList.remove('hidden'); setTimeout(() => e.classList.add('hidden'), 3000); } };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => fallbackCopie(t, done));
        else fallbackCopie(t, done);
      }

      window.openSyncModal = function () { renderModal(); ensureModal().classList.remove('hidden'); };
      window.closeSyncModal = function () { draft = null; if (modal) modal.classList.add('hidden'); };
      window.syncGenCode = function () { document.getElementById('syncCode').value = genCode(); };
      window.syncCopySql = function () { const t = (document.getElementById('syncSql') || {}).value || SCHEMA_SQL; copyText(t, 'syncSqlMsg'); };
      window.syncCopyCfg = function () { const c = lsGet(CFG_KEY); if (c) copyText(encodeCfg(c), 'syncCopyMsg'); };
      window.syncApplyPaste = function () {
        try { draft = decodeCfg(document.getElementById('syncPaste').value); renderModal(); formMsg(''); }
        catch (e) { formMsg('Configuration invalide : ' + e.message); }
      };
      window.syncDisable = function () {
        if (!confirm('Désactiver la synchronisation sur cet appareil ?\n\nTes données restent ici et dans le cloud ; elles ne seront simplement plus mises à jour automatiquement.')) return;
        lsDel(CFG_KEY); lsDel(ST_KEY); paused = false; setStatus('off'); renderModal();
      };
      // Lit les champs saisis (pour ne rien perdre quand on change d'onglet).
      function readForm() {
        const g = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
        return { type: (draft && draft.type) || 'firebase', url: g('syncUrl'), projectId: g('syncProject'), key: g('syncKey'), code: g('syncCode') };
      }
      window.syncSetType = function (t) { const f = readForm(); f.type = t; draft = f; renderModal(); };
      window.syncEnable = async function () {
        const f = readForm(), type = (draft && draft.type) || 'firebase', code = normCode(f.code);
        let cfg;
        if (type === 'firebase') {
          if (!/^[a-z0-9][a-z0-9-]{3,}$/i.test(f.projectId)) return formMsg('Saisis l\'ID du projet Firebase (visible dans Paramètres du projet → Général).');
          if (f.key.length < 20) return formMsg('Colle la clé API (apiKey) de ton application Web Firebase.');
          cfg = { type: 'firebase', projectId: f.projectId, key: f.key, code: code };
        } else {
          const url = f.url.replace(/\/+$/, '');
          if (!/^https:\/\/.+/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) return formMsg('L\'adresse du projet doit commencer par https://');
          if (f.key.length < 20) return formMsg('Colle la clé « anon public » du projet.');
          cfg = { type: 'supabase', url: url, key: f.key, code: code };
        }
        if (code.length < 20) return formMsg('Le code doit faire au moins 20 caractères : clique sur « Générer ».');
        if (draft && draft.fsHost) cfg.fsHost = draft.fsHost;
        formMsg('');
        try { await backendFor(cfg).get(cfg, sha256hex(code), -1); }
        catch (e) {
          const hint = type === 'firebase'
            ? 'Vérifie l\'ID du projet, la clé API, que Firestore est créé et que les règles ont été publiées.'
            : 'Vérifie l\'adresse, la clé et que le script SQL a bien été exécuté.';
          return formMsg('Connexion impossible : ' + e.message + '. ' + hint);
        }
        lsSet(CFG_KEY, cfg); lsDel(ST_KEY); draft = null; paused = false;
        renderModal(); syncNow('manual');
      };

      // ---------- démarrage ----------
      paintStatus();
      if (isConfigured()) setStatus('idle');
      setInterval(() => { if (!document.hidden) syncNow('poll'); }, POLL_MS);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow('visible'); });
      window.addEventListener('online', () => syncNow('online'));
      setTimeout(() => syncNow('start'), 1200);

      // Lien de configuration (#sync=PT1.…) : ouvre la fenêtre avec les champs préremplis.
      if (location.hash.indexOf('#sync=') === 0) {
        try { draft = decodeCfg(location.hash); history.replaceState(null, '', location.pathname + location.search); setTimeout(window.openSyncModal, 400); } catch (e) {}
      }
    })();

    // Fichier de cache : ouverture plus rapide et appli utilisable sans internet (seulement en http/https).
    try { if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {}

    window.onload = function() { switchSport('football'); };

/* ===== Bouton thème clair / sombre (même mémoire que Statify : suivi-nba-theme) ===== */
(function () {
  function recolor() {
    try {
      if (window.Chart) Chart.defaults.color = chartTick();
      [...Object.values(categoryChartInstances || {}), globalBankrollChartInstance].filter(Boolean).forEach(c => {
        const s = c.options && c.options.scales;
        if (s) ['x', 'y'].forEach(k => { if (s[k]) { s[k].grid = s[k].grid || {}; s[k].ticks = s[k].ticks || {}; s[k].grid.color = chartGrid(); s[k].ticks.color = chartTick(); } });
        c.update('none');
      });
    } catch (e) {}
  }
  const btn = document.getElementById('btnTheme');
  if (btn) btn.onclick = () => {
    const n = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = n;
    try { localStorage.setItem('suivi-nba-theme', n); } catch (e) {}
    recolor();
  };
  recolor();
})();
