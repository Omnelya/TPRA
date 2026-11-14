# Tournoi de handball

Application web pour gérer un tournoi de handball : matchs de poule, planning par terrain, scores, classements, phases finales et désignation des arbitres.

- **Public** : classements, matchs et phases finales visibles sans identifiant, mis à jour toutes les 15 secondes.
- **Table de marque** (compte) : saisie des scores et des forfaits.
- **Organisateur** (compte) : réglages, équipes, poules, terrains, arbitres, phases finales, accès.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique de l'application |
| `style.css` | Mise en forme |
| `logic.js` | Calculs : matchs, planning, classement, phases finales, alertes |
| `app.js` | Affichage, connexion et enregistrement dans Supabase |
| `test.js` | Tests des calculs (`node test.js`) |

Les données sont dans le projet Supabase « Suiviarbitres », dans les tables `th_tournois`, `th_equipes`, `th_arbitres`, `th_saisies` et `th_acces`. La clé présente dans `app.js` est la clé publique : les droits d'écriture sont contrôlés par la base, selon le rôle de la personne connectée.

## Versions

- **v2.0** — 14/11/2026 — première version web (reprend la logique du classeur Excel v1.1).
- **v2.1** — 14/11/2026 — nouvelle interface (matchs rangés par heure, une couleur par terrain, menu en bas), ajout et suppression d'équipes sans limite de nombre, phases finales réglées avec des mots (« Vainqueur Poule A ») à la place des codes.
- **v2.2** — 14/11/2026 — comptes créés par l'organisateur avec un identifiant (la personne choisit son mot de passe à la première connexion, sans e-mail), arbitres invisibles sans connexion, poules de 3 (le perdant du 1er match rejoue), classement final avec une place par équipe, ordre de passage des phases finales.
- **v2.3** — 14/11/2026 — icône de l'application ; les comptes créés dans le tournoi n'ont aucun droit sur le suivi des arbitres.
