# ⛵ Find-it

Agrégateur d'annonces de **voiliers d'occasion**, conçu pour poser la question
que Leboncoin et Facebook Marketplace ne savent pas poser : *plus de 10 mètres,
moins de 20 000 €*.

Une collecte automatique tous les matins à 8 h, un site consultable par simple
lien, et un moteur d'extraction qui devine la longueur du bateau là où aucune
plateforme ne l'expose comme critère.

**Gratuit de bout en bout** — aucun compte à créer, aucune base de données,
aucune clé d'API, aucun abonnement.

---

## Le problème que ça résout

Sur Leboncoin comme sur Facebook, la **longueur du bateau n'est pas un champ de
recherche**. Elle est noyée dans le titre (« Voilier 10m50 »), dans la
description (« LHT 10,50 m, largeur 3,40 m, tirant d'eau 1,75 m »), exprimée en
pieds (« 34 pieds »), ou pas exprimée du tout — juste un modèle (« Sun Odyssey
34 ») qu'il faut connaître pour situer.

Résultat : on filtre sur le prix, on obtient des centaines d'annonces, et on
lit tout à la main, tous les jours.

Find-it fait cette lecture à votre place, en quatre passes du plus fiable au
moins fiable :

| Passe | Méthode | Exemple | Fiabilité | Coût |
|---|---|---|---|---|
| 1 | Mesure étiquetée | « longueur : 10,50 m » | 0,90–0,95 | gratuit |
| 2 | Mesure nue | « 10m50 », « 11 mètres » | 0,65–0,80 | gratuit |
| 3 | Table d'environ 150 modèles | « Gib'Sea 105 » → 10,50 m | 0,80 | gratuit |
| 4 | Lecture par IA *(désactivée par défaut)* | le reliquat | 0,30–0,90 | payant |

Les trois premières passes suffisent et ne coûtent rien. La quatrième est un
supplément facultatif : sans clé d'API, ce qui reste indéterminé atterrit dans
l'onglet « À vérifier » au lieu d'être deviné.

Le point délicat est le **faux positif** : une annonce contient souvent cinq
mesures en mètres et une seule est la longueur. Le moteur rejette explicitement
les nombres précédés de « largeur », « tirant d'eau », « surface »,
« grand-voile »… et privilégie le titre sur la description. Ces cas sont
couverts par les tests.

Ce qui reste indéterminé n'est **pas jeté**. Rater un bon bateau coûte plus
cher que d'en vérifier trois à la main.

---

## Architecture — pourquoi il n'y a pas de base de données

```
┌──────────────────┐  tous les jours à 8 h   ┌──────────────────────────┐
│  GitHub Actions  │────────────────────────▶│  scraper/  (Playwright)  │
└──────────────────┘                         └────────────┬─────────────┘
                                                          │ écrit + commit
                                                          ▼
                                        web/public/data/listings.json
                                                          │
┌──────────────────┐    lit le fichier                    │
│  GitHub Pages    │◀─────────────────────────────────────┘
│  site statique   │
└──────────────────┘
```

Le besoin réel est modeste : quelques centaines d'annonces, **une écriture par
jour, une lecture par visite**. Un fichier JSON versionné par Git couvre
exactement ça — sans compte à créer, sans quota, sans clé à faire fuiter. Git
fournit en prime l'historique complet : chaque collecte est un commit, donc
l'évolution du marché se relit commit par commit.

| Dossier | Rôle |
|---|---|
| `scraper/` | Collecte, extraction, scoring, écriture du fichier |
| `web/` | Site statique (Next.js exporté) |
| `web/public/data/listings.json` | **Les données** — versionnées, lisibles, diffables |
| `.github/workflows/daily.yml` | Collecte quotidienne + publication |

**Critères et favoris vivent dans votre navigateur** (localStorage). C'est la
conséquence assumée du « zéro serveur » — et c'est même préférable ici : la
personne à qui vous partagez le lien a ses propres critères et ses propres
favoris, sans vous gêner.

---

## Ce que ça fait, concrètement

- **Collecte** chaque matin sur [yachtall.com](https://www.yachtall.com/fr/voiliers)
  et [boat24.com](https://www.boat24.com/fr/voiliers/) — voir « Les sources »
  plus bas pour ce qui a été mesuré, et pourquoi Leboncoin n'y figure pas.
- **Accumule au lieu d'effacer.** L'historique permet de repérer les nouveautés
  du jour, de détecter les **baisses de prix** (un vendeur qui baisse est un
  vendeur motivé) et de voir quelles annonces ont disparu.
- **Note chaque annonce sur 100** : rapport taille/prix (le prix au mètre est
  l'indicateur central), baisse de prix, qualité de l'annonce, pénalités pour
  les épaves.
- **Filtre selon vos critères**, modifiables depuis le site et appliqués
  instantanément — le filtrage se fait dans le navigateur, pas à la collecte.

### Les six vues

| Vue | Contenu |
|---|---|
| Nouveautés du jour | Apparues dans les dernières 24 h |
| Coups de cœur | Tous vos critères réunis, longueur certaine |
| Toutes | L'ensemble de ce qui correspond |
| Baisses de prix | Le vendeur a revu son prix à la baisse |
| À vérifier | Longueur non déterminée automatiquement |
| Favoris | Ce que vous avez mis de côté |

---

## Mise en service

### 1. Fusionner dans `main`

**Indispensable, et c'est la seule action manuelle vraiment obligatoire.**
GitHub n'exécute les tâches planifiées que depuis la branche par défaut : tant
que ce code vit sur une branche, la collecte de 8 h ne se déclenchera pas.

### 2. Activer GitHub Pages — une fois, à la main

**Settings → Pages → Source « Deploy from a branch » → branche `gh-pages`,
dossier `/ (root)`.**

C'est la seule chose qu'un robot ne peut pas faire à votre place : le jeton
d'un workflow n'a pas le droit d'activer Pages (`Resource not accessible by
integration`). Une fois cette case cochée, plus rien à faire — le workflow
reconstruit et republie la branche `gh-pages` à chaque collecte, et vérifie
lui-même que l'adresse répond.

L'adresse est :

```
https://pyroro-cmd.github.io/Find-it/
```

C'est ce lien que vous partagez. Aucun compte n'est nécessaire pour le
consulter.

Pour ne pas attendre le lendemain matin : **Actions → Collecte et publication →
Run workflow**.

### Facultatif : l'extraction par IA

Ajoutez un secret `ANTHROPIC_API_KEY` (**Settings → Secrets and variables →
Actions**) pour que les annonces sans longueur exploitable soient lues par
Claude. C'est le seul poste payant du projet — quelques centimes par jour — et
tout fonctionne sans.

---

## Le partage, et ce que ça implique

Le dépôt est public, donc le site l'est aussi : **quiconque a l'adresse voit
les annonces**. C'est le choix retenu pour pouvoir partager le lien simplement.

Concrètement, ce qui est visible : des annonces de bateaux déjà publiques sur
les sites d'origine. Ce qui ne l'est pas : vos favoris et vos critères, qui ne
quittent jamais votre navigateur.

Si vous voulez restreindre l'accès plus tard, il faudra soit passer le dépôt en
privé (GitHub Pages devient alors payant), soit ajouter une page de
déverrouillage chiffrant l'accès aux données.

---

## Les sources — ce qui a été mesuré

Les sites n'étant pas joignables depuis l'environnement de développement, un
banc d'essai (`scraper/src/probe.ts`, exécuté par le workflow `probe.yml`) est
allé les interroger **depuis GitHub Actions** avant d'écrire une seule ligne de
parseur. Les constats ci-dessous sont donc des relevés, pas des suppositions.

| Site | Résultat du sondage | Statut |
|---|---|---|
| **yachtall.com** | 200, et **tout est écrit en clair sur des étiquettes françaises** | **source principale** |
| **boat24.com** | 200 sur la rubrique, mais 403 sur toute URL portant des paramètres — donc aucun filtrage possible | **source d'appoint** |
| **theyachtmarket.com** | test JavaScript Cloudflare sur les résultats | **désactivé** |
| **leboncoin.fr** | 403 en `fetch` **et** en Chromium piloté (DataDome) | **désactivé** |
| **annoncesbateau, bateaux24, youboat** | 403, pare-feu applicatif, dès la première requête | écartés |
| **Facebook Marketplace** | même barrage, plus le risque de perdre le compte | **désactivé** |

### Ce que yachtall donne, et pourquoi ça change tout

Chaque carte de résultat contient ceci, en toutes lettres :

```
Voilier / yacht à voile: Sunrise, bateau d'occasion, bateau en acier
Longueur x largeur: 18,88 m x 4,88 m, construit: 1998, cabines: 2
Lieu: Monténégro, Bar / Tivat
Prix: € 490 000, TVA incluse
```

La longueur est **étiquetée**. Le tri « plus de 10 mètres » devient donc exact
au lieu de probabiliste — c'est exactement ce que Leboncoin ne permet pas.

**On ne lit que la première page, et c'est un choix.** Le `robots.txt` du site
interdit ses URL paginées — `Disallow: /en/boats/selling/*?  # paging or search
form sent` — et la pagination passe justement par des paramètres d'URL. On s'en
tient donc aux quarante-cinq annonces les plus récentes, que le site sert
volontiers.

C'est moins limitant qu'il n'y paraît : ces quarante-cinq-là sont les
**nouvelles du jour**, exactement ce qu'une veille quotidienne doit voir. Le
fichier de données, lui, accumule — le catalogue s'étoffe collecte après
collecte, sans jamais repasser sur les mêmes pages.

### Pourquoi Leboncoin n'y est pas

Le blocage n'est pas un défaut de parseur : DataDome, l'anti-bot du site,
**refuse les plages d'adresses de centres de données** — celles d'où tournent
les runners GitHub. La page ne s'ouvre jamais, quelle que soit la finesse du
code.

Deux façons de le contourner, aucune gratuite et sans risque :

1. un **proxy résidentiel** (quelques euros par mois) — sortirait du cahier des
   charges « zéro frais » ;
2. lancer la collecte **depuis votre propre machine**, sur votre connexion :
   `FINDIT_ENABLE_LEBONCOIN=1 npm run scrape` dans `scraper/`, puis commiter le
   fichier de données produit. C'est gratuit, et ça marche depuis une IP
   résidentielle.

Conséquence à connaître : les annonces affichées sont **européennes**, pas
strictement françaises — d'où le filtre par pays sur le site. Ces deux sites
publient surtout des annonces de courtiers, mieux documentées que celles de
Leboncoin, mais un peu plus chères.

### Ce qui protège l'historique

**Si aucune annonce n'est collectée, le fichier existant n'est pas écrasé**, et
une source injoignable ne fait pas passer tout son catalogue en « disparu ».
Une panne ne peut donc pas effacer des semaines d'historique.

Pour inspecter ce que renvoient réellement les sites : lancez le workflow à la
main en cochant « Archiver le HTML », puis récupérez l'artefact
`pages-collectees`.

---

## Facebook Marketplace — désactivé par défaut, volontairement

Marketplace n'a pas d'API publique et exige une session connectée. Automatiser
une navigation avec un compte **viole les conditions d'utilisation de Meta et
expose ce compte à une suspension**. Si vous l'activez :

- n'utilisez **jamais** votre compte principal — créez un compte secondaire
  dédié et acceptez qu'il puisse être perdu ;
- ne mettez aucun identifiant dans ce dépôt (il est public) : la session passe
  par le secret GitHub `FB_STORAGE_STATE_JSON`.

---

## Développement local

```bash
# Collecteur
cd scraper
npm install
npx playwright install chromium
npm test              # 50 tests, aucun réseau requis
npm run typecheck
npm run scrape        # collecte réelle, écrit le fichier de données

# Site
cd web
npm install
npm run dev           # http://localhost:3000
```

Les tests couvrent le cœur du produit — extraction de longueur, pièges des
mesures parasites, détection des épaves, scoring, lecture des cartes des deux
sites (sur des textes **réellement capturés** par le sondage, pas inventés), et
la fusion de l'historique (dates de première apparition préservées, baisses de
prix, annonces disparues, non-écrasement quand une source tombe). Ils tournent
avant chaque collecte.

---

## Réglages du collecteur

Surchargeables par variable d'environnement, sans toucher au code :

| Variable | Défaut | Effet |
|---|---|---|
| `YA_MAX_PRICE` | `30000` | Plafond appliqué à la collecte |
| `YA_MIN_LENGTH` | `8` | Plancher de longueur, en mètres |
| `FINDIT_DISABLE_YACHTALL` | — | `1` coupe la source |
| `B24_MAX_PAGES` | `12` | Pages parcourues sur boat24 |
| `B24_MAX_PRICE` | `30000` | Plafond appliqué à la collecte |
| `B24_MIN_LENGTH` | `8` | Plancher de longueur, en mètres |
| `TYM_MAX_PAGES` | `8` | Pages parcourues sur theyachtmarket |
| `TYM_MAX_PRICE` | `30000` | Plafond envoyé au formulaire de recherche |
| `TYM_MIN_LENGTH` | `8` | Plancher envoyé au formulaire de recherche |
| `FINDIT_DISABLE_BOAT24` | — | `1` coupe la source |
| `FINDIT_DISABLE_TYM` | — | `1` coupe la source |
| `FINDIT_ENABLE_LEBONCOIN` | — | `1` réactive Leboncoin (utile en local seulement) |
| `FINDIT_ENABLE_FACEBOOK` | — | `1` active Facebook |
| `FINDIT_DEBUG_DUMP` | — | `1` archive le HTML des pages |

Le plafond envoyé aux sites est volontairement **plus haut que votre budget** :
une annonce à 24 000 € se négocie parfois sous 20 000 €, et le filtrage fin se
fait ensuite dans le navigateur.

---

## Coût

| Poste | Coût |
|---|---|
| GitHub Actions | **0 €** (~5 min/jour, largement sous le quota gratuit) |
| GitHub Pages | **0 €** (dépôt public) |
| Stockage des données | **0 €** (fichier dans le dépôt) |
| API Claude | **0 €** tant que le secret n'est pas renseigné — facultatif |

---

## Limites connues

- **Le scraping casse.** Quand une source change, elle s'arrête ; les autres
  continuent. Le bandeau en haut du site indique l'état de la dernière collecte.
- **La longueur reste incertaine pour une part des annonces**, et davantage
  sans l'IA. C'est irréductible : certaines annonces ne donnent aucun élément.
  D'où l'onglet « À vérifier » plutôt qu'un rejet silencieux.
- **Favoris et critères ne se synchronisent pas entre appareils** — ils vivent
  dans le navigateur. Vos favoris sur téléphone et sur ordinateur sont
  distincts.
- **Pas de notification par e-mail.** C'est l'ajout le plus simple à faire
  ensuite (le workflow peut envoyer un courriel quand un coup de cœur apparaît).
