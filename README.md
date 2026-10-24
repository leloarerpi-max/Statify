# Statify : notifications même appli fermée

Ce petit dossier fait surveiller tes équipes par GitHub (gratuit) et t'envoie une notification sur ton téléphone. Quand un match de tes équipes est en cours (ou démarre dans moins de 30 min), le robot reste allumé et regarde les scores **toutes les 15 secondes**. Le reste du temps, il fait un passage rapide toutes les ~5 min :
- ⏰ coup d'envoi imminent (≈ 20 min avant)
- ⚽🏀 but / changement de score pendant le match
- 🏁 score final

- 🔥 **Multiplex** : quand au moins 3 matchs d'un même championnat démarrent à moins de 30 min d'écart, tu reçois « Multiplex Ligue 1 dans 20 min », puis **chaque but de tous les matchs** avec l'évolution au classement (« 🚨 But à Lens … · Lens passe 4e → 3e »)

## Installation (une seule fois, ~10 minutes)

1. **Sur ton téléphone** : installe l'application gratuite **ntfy** (App Store / Google Play). Ouvre-la, appuie sur « + », et abonne-toi à un nom secret de ton choix, un nom **long et aléatoire** (20 caractères minimum, ex. `k7Qm2xVd9PzL4aWt8RnB` — n'utilise pas un exemple trouvé en ligne : toute personne qui connaît le nom peut lire tes alertes). Le robot refuse de démarrer si le secret est vide ou trop court.
2. **Sur github.com** : crée un nouveau dépôt **public** (ex. `statify-notif`) : c'est ce qui rend les minutes d'exécution illimitées et gratuites. Ton nom secret ne sera PAS visible, on le met dans un « secret » (étape 4). Envoie-y tout le contenu de ce dossier (`notify.mjs`, `config.json`, `README.md` **et** le dossier caché `.github/workflows/statify-notif.yml` — avec « Add file → Upload files », glisse le dossier `.github`).
3. Ouvre `config.json` sur GitHub (icône crayon) :
   - dans `nba` mets les codes de tes équipes (LAL, GSW, BOS…) ;
   - dans `foot.teams` mets tes clubs (nom tel qu'il apparaît dans l'appli), dans `foot.leagues` les championnats (`fra.1`, `eng.1`, `esp.1`, `ita.1`, `ger.1`, `uefa.champions`…).
4. Dépôt → Settings → Secrets and variables → Actions → **New repository secret** : nom `NTFY_TOPIC`, valeur = ton nom secret de l'étape 1.
5. Dépôt → Settings → Actions → General → *Workflow permissions* : choisis **Read and write permissions** (le robot doit pouvoir se relancer et mémoriser ses alertes).
6. Onglet **Actions** du dépôt → active les workflows → « Statify notifications » → **Run workflow** pour tester.
7. C'est tout : tu reçois les alertes sans ouvrir Statify.

Dans `config.json`, la ligne `multiplex` choisit les championnats surveillés pour ça (mets `"enabled": false` pour couper).

## Réglage de la vitesse
Dans `config.json`, la ligne `"live": { "everySeconds": 15, "runMinutes": 9 }` :
- `everySeconds` = délai entre deux vérifications pendant un match (minimum 5). 15 est un bon compromis ; en dessous, ESPN risque de te limiter.
- `runMinutes` = durée d'un passage continu avant qu'il se relance tout seul (inutile d'y toucher).

## À savoir (honnêtement)
- Pendant un match : alerte **≈ 15 à 45 secondes** après le but (ESPN met lui-même quelques secondes à mettre à jour). En dehors des matchs, GitHub réveille le robot « environ » toutes les 5 min (parfois plus tard), ce qui suffit pour les coups d'envoi.
- Si ESPN te limite (trop de demandes), le robot s'arrête proprement et réessaie au passage suivant.
- Un match de tes équipes en cours = un passage continu : ça consomme des minutes GitHub, mais elles sont illimitées sur un dépôt public.
- Les données viennent d'ESPN (source non officielle) : si ESPN change, il faudra adapter.
- Gratuit, sans carte bancaire. Seule ta liste d'équipes favorites est visible dans le dépôt public (pas ton nom secret ni tes données). Si tu préfères un dépôt privé, GitHub ne donne que 2000 min/mois : le mode 15 secondes les consommerait vite, garde donc le dépôt public.
- GitHub peut mettre en pause un dépôt sans activité pendant 60 jours : le robot ajoute donc un petit fichier `.keepalive` chaque lundi matin pour éviter ça ; sinon réactive le workflow dans Actions.
- Le robot reconnaît tes clubs par leur identifiant ESPN (envoyé par Statify), plus fiable que le nom. Ouvre Statify une fois après la mise à jour pour qu'il republie tes étoiles.
- Pour arrêter : désactive le workflow dans l'onglet Actions.
