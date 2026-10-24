# Statify : alertes sur ton téléphone (appli fermée)

Un petit « robot » gratuit tourne chez Cloudflare. Il connaît tes équipes à étoile dorée (Statify les lui envoie tout seul) et t'envoie une notification pour :
- ⏰ le coup d'envoi (≈ 20 min avant)
- ⚽🏀 chaque but / changement de score
- 🏁 le score final
- 🔥 le multiplex (3 matchs ou plus d'un même championnat qui démarrent ensemble) : chaque but de tous les matchs, avec l'évolution au classement

Pendant un match, il vérifie les scores toutes les ~20 secondes. Le reste du temps il dort : rien à faire de ta part, ni avant un match, ni après.

## Installation (une seule fois, ~10 minutes)

**1. Sur ton téléphone** : installe l'appli gratuite **ntfy**, appuie sur « + » et abonne-toi à un nom secret **long et aléatoire** (20 caractères ou plus, ex. `k7Qm2xVd9PzL4aWt8RnB`). Toute personne qui connaît ce nom peut lire tes alertes.

**2. Crée le robot** sur dash.cloudflare.com (compte gratuit, sans carte bancaire) :
1. Menu **Workers & Pages** → **Create** → **Create Worker** → nomme-le `statify-robot` → **Deploy**.
2. Touche **Edit code**, efface tout, colle le contenu du fichier `worker.js`, puis **Deploy**.

**3. Mémoire du robot** : menu **Storage & Databases** → **KV** → **Create** (nom : `statify`). Puis dans ton Worker : **Settings** → **Bindings** → **Add** → **KV namespace** → nom de variable **`STATE`** → choisis `statify` → enregistre.

**4. Les deux secrets** : Worker → **Settings** → **Variables and Secrets** → **Add** (type *Secret*) :
- `NTFY_TOPIC` = ton nom secret ntfy de l'étape 1
- `SYNC_KEY` = un mot de passe de ton choix (long), que tu colleras aussi dans Statify

**5. Le réveil chaque minute** : Worker → **Settings** → **Triggers** → **Add Cron Trigger** → `* * * * *`.

**6. Dans Statify** : bouton ☁️ Cloud → section « Alertes quand l'appli est fermée » :
- colle l'adresse de ton Worker (ex. `https://statify-robot.ton-compte.workers.dev`) et la clé `SYNC_KEY`
- touche **Activer les alertes**, puis **Envoyer une alerte test** : tu dois recevoir une notification.

C'est tout. Ensuite tu étoiles (☆ dorée) tes équipes dans Statify, et le robot suit (ouvre Statify une fois après avoir changé tes étoiles).

## À savoir
- **Délai** : alerte ≈ 20 à 50 s après le but (ESPN met lui-même un peu de temps à se mettre à jour).
- **Réglages** : en haut de `worker.js`, `SETTINGS` (délai entre vérifications, alertes, multiplex). Après modification : coller à nouveau le code et **Deploy**.
- **Limite gratuite de Cloudflare** : 10 ms de calcul par réveil. Si, dans Worker → **Observability / Logs**, tu vois des erreurs « exceeded CPU », mets `everySeconds: 60` dans `SETTINGS` (le robot fera alors une seule vérification par minute pendant un match). L'offre payante de Cloudflare (5 $/mois) lève cette limite.
- Les données viennent d'ESPN (source non officielle) : si ESPN change, il faudra adapter `worker.js`.
- Pour arrêter : supprime le Cron Trigger du Worker.
- L'ancien système GitHub n'est plus nécessaire : tu peux supprimer ton dépôt `statify-notif` et le Gist public « Statify - alertes ».
