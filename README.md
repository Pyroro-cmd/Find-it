# ⛵ Find-it

Agrégateur d'annonces de **voiliers d'occasion**, conçu pour poser les questions
que Leboncoin et Facebook Marketplace ne savent pas poser : *plus de 10 mètres,
moins de 20 000 €*.

Une collecte automatique tous les matins à 8 h, un site privé pour consulter le
résultat, et surtout un moteur d'extraction qui devine la longueur du bateau là
où aucune plateforme ne l'expose comme critère.

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

| Passe | Méthode | Exemple | Fiabilité |
|---|---|---|---|
| 1 | Mesure étiquetée | « longueur : 10,50 m » | 0,90–0,95 |
| 2 | Mesure nue | « 10m50 », « 11 mètres » | 0,65–0,80 |
| 3 | Table de ~150 modèles | « Gib'Sea 105 » → 10,50 m | 0,80 |
| 4 | Lecture par IA (Claude) | le reliquat | 0,30–0,90 |

Le point délicat est le **faux positif** : une annonce contient souvent cinq
mesures en mètres et une seule est la longueur. Le moteur rejette
explicitement les nombres précédés de « largeur », « tirant d'eau »,
« surface », « grand-voile »… et privilégie le titre sur la description. Ces
cas sont couverts par les tests (`scraper/test/length.test.ts`).

Ce qui reste indéterminé n'est **pas jeté** : ces annonces atterrissent dans
l'onglet « À vérifier ». Rater un bon bateau coûte plus cher que d'en vérifier
trois à la main.

---

## Ce que ça fait, concrètement

- **Collecte** tous les jours à 8 h (heure de Paris) sur Leboncoin et deux
  sites spécialisés — Facebook en option, voir plus bas.
- **Accumule au lieu d'effacer.** L'historique permet de repérer les
  nouveautés du jour, de détecter les **baisses de prix** (un vendeur qui
  baisse est un vendeur motivé) et de voir quelles annonces ont disparu.
- **Note chaque annonce sur 100** : rapport taille/prix (le prix au mètre est
  l'indicateur central), baisse de prix, qualité de l'annonce, pénalités pour
  les épaves.
- **Filtre selon vos critères**, modifiables depuis le site et appliqués
  immédiatement — sans attendre la collecte suivante, parce que le filtrage se
  fait en base et non au moment du scraping.

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

## Deux choses à savoir avant de démarrer

**1. Le scraping est fragile par nature.** Leboncoin est protégé par DataDome :
un simple `fetch` reçoit une page de vérification, pas des annonces. Le
collecteur pilote donc un vrai navigateur, et il faut s'attendre à de la
maintenance quand le site change. Le code est écrit pour ça : une source qui
tombe n'empêche pas les autres de fonctionner, et le run se termine en
« partiel » plutôt qu'en échec.

**2. Facebook Marketplace est désactivé par défaut, volontairement.**
Marketplace n'a pas d'API publique et exige une session connectée. Automatiser
une navigation avec un compte **viole les conditions d'utilisation de Meta et
expose ce compte à une suspension**. Si vous l'activez :

- n'utilisez **jamais** votre compte principal — créez un compte secondaire
  dédié et acceptez qu'il puisse être perdu ;
- ne mettez aucun identifiant dans ce dépôt : la session passe par le secret
  GitHub `FB_STORAGE_STATE_JSON`.

---

## Architecture

```
┌──────────────────┐   tous les jours à 8 h    ┌──────────────────┐
│  GitHub Actions  │──────────────────────────▶│    scraper/      │
│  (cron + Chrome) │                           │  Playwright + IA │
└──────────────────┘                           └────────┬─────────┘
                                                        │ écrit
                                                        ▼
┌──────────────────┐        lit (serveur)      ┌──────────────────┐
│   web/ (Vercel)  │◀──────────────────────────│    Supabase      │
│  Next.js privé   │                           │    Postgres      │
└──────────────────┘                           └──────────────────┘
```

| Dossier | Rôle |
|---|---|
| `supabase/migrations/` | Schéma : annonces, historique de prix, critères, journal des collectes |
| `scraper/` | Collecte, extraction, scoring, écriture en base |
| `web/` | Site Next.js, protégé par mot de passe |
| `.github/workflows/` | Déclenchement quotidien |

**Séparation clé :** le scraper enregistre des *faits* (prix, longueur, année).
Les *critères* vivent dans une table et le filtrage est une vue SQL. Changer un
critère est instantané et ne demande aucune recollecte.

---

## Installation

### 1. Base de données (Supabase)

Créez un projet sur [supabase.com](https://supabase.com), puis appliquez la
migration : **SQL Editor** → collez le contenu de
`supabase/migrations/0001_init.sql` → **Run**.

Relevez ensuite dans **Project Settings → API** :
- l'URL du projet → `SUPABASE_URL`
- la clé `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

> La clé `service_role` contourne les règles de sécurité de la base. Elle ne
> doit vivre que dans les secrets GitHub et les variables serveur de Vercel —
> jamais dans le navigateur, jamais dans un fichier commité.

### 2. Collecteur (GitHub Actions)

Dans **Settings → Secrets and variables → Actions**, ajoutez :

| Secret | Obligatoire | Rôle |
|---|---|---|
| `SUPABASE_URL` | oui | Base de données |
| `SUPABASE_SERVICE_ROLE_KEY` | oui | Écriture en base |
| `ANTHROPIC_API_KEY` | recommandé | Extraction IA du reliquat |
| `FB_STORAGE_STATE_JSON` | non | Session Facebook (phase 2) |

Le workflow tourne ensuite tout seul. Pour un essai immédiat :
**Actions → Collecte quotidienne → Run workflow**, en cochant
« Archiver le HTML » au premier lancement (voir *Calibration* plus bas).

### 3. Site (Vercel)

Importez le dépôt sur [vercel.com](https://vercel.com), **en réglant le
répertoire racine sur `web`**. Ajoutez les variables d'environnement :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | idem ci-dessus |
| `SUPABASE_SERVICE_ROLE_KEY` | idem ci-dessus |
| `SITE_PASSWORD` | le mot de passe d'accès au site |

Déployez. Le site est privé : toute page redirige vers `/login` sans cookie
valide. Le cookie ne contient pas le mot de passe mais son empreinte HMAC.

---

## Calibration au premier lancement

Le code des collecteurs a été écrit **sans accès réseau aux sites cibles** :
l'environnement de développement bloquait `leboncoin.fr` et les sites
spécialisés. C'est une limite réelle et il faut en tenir compte.

Les conséquences ont été anticipées dans la conception :

- **Leboncoin** est extrait par la *forme* des données (objets contenant
  `list_id` + `subject`), et non par un chemin figé du type
  `props.pageProps.searchData.ads`. La position bouge à chaque refonte du
  site ; la forme des objets, beaucoup moins. Deux voies tournent en parallèle
  (interception des réponses de l'API interne + état Next.js embarqué), et
  leurs résultats sont fusionnés.
- **Sites spécialisés** : d'abord le JSON-LD schema.org (format normalisé que
  la plupart des sites d'annonces émettent pour le référencement), puis une
  cascade de sélecteurs CSS candidats.

**Marche à suivre :** lancez le workflow à la main avec l'option
« Archiver le HTML ». Récupérez l'artefact `pages-collectees` et comparez ce
que le site renvoie réellement avec ce qu'attendent les parseurs. Les points
d'ajustement probables :

| Symptôme | Où regarder |
|---|---|
| 0 annonce Leboncoin, artefact « blocked » ou « challenge » | Anti-bot déclenché — espacer les requêtes, réduire `LBC_MAX_PAGES` |
| 0 annonce Leboncoin, page normale | `looksLikeAd()` dans `scraper/src/sources/leboncoin.ts` |
| Mauvaise catégorie de résultats | Variable `LBC_CATEGORY` (Nautisme = 50 à ce jour) |
| 0 annonce sur un site spécialisé | `SITES[].selectors` dans `scraper/src/sources/specialized.ts` |

---

## Développement local

```bash
# Collecteur
cd scraper
npm install
npx playwright install chromium
npm test              # tests d'extraction — aucun accès réseau requis
npm run typecheck
npm run scrape        # collecte réelle (nécessite un .env rempli)

# Site
cd web
npm install
npm run dev           # http://localhost:3000
```

Les tests couvrent le cœur du produit — extraction de longueur, pièges des
mesures parasites, détection des épaves, scoring — et tournent sans réseau ni
base de données. Ils s'exécutent aussi avant chaque collecte dans le workflow.

---

## Réglages du collecteur

Toutes surchargeables par variable d'environnement, sans toucher au code :

| Variable | Défaut | Effet |
|---|---|---|
| `LBC_QUERIES` | `voilier,sailboat,ketch,sloop` | Recherches lancées sur Leboncoin |
| `LBC_MAX_PAGES` | `5` | Pages parcourues par recherche |
| `LBC_MAX_PRICE` | `25000` | Plafond envoyé au moteur de recherche |
| `LBC_CATEGORY` | `50` | Catégorie Nautisme |
| `FINDIT_DISABLE_LEBONCOIN` | — | `1` coupe la source |
| `FINDIT_DISABLE_SPECIALIZED` | — | `1` coupe la source |
| `FINDIT_ENABLE_FACEBOOK` | — | `1` active Facebook |
| `FINDIT_DEBUG_DUMP` | — | `1` archive le HTML des pages |

Le plafond de prix envoyé aux sites est volontairement **plus haut que votre
budget** : une annonce à 24 000 € se négocie parfois sous 20 000 €, et le
filtrage fin se fait ensuite en base.

---

## Coût

| Poste | Estimation |
|---|---|
| GitHub Actions | Gratuit (~5 min/jour, largement sous le quota) |
| Supabase | Gratuit (offre de base très au-dessus du besoin) |
| Vercel | Gratuit (offre Hobby) |
| API Claude | Quelques centimes par jour — seul le reliquat non résolu par les regex est envoyé, soit 20 à 30 % des annonces |

---

## Limites connues

- **Le scraping casse.** Quand une source change, elle s'arrête ; les autres
  continuent. Le bandeau en haut du site indique l'état de la dernière
  collecte, et le détail par source est enregistré dans `scrape_runs`.
- **La longueur reste incertaine pour une part des annonces.** C'est
  irréductible : certaines annonces ne donnent réellement aucun élément. D'où
  l'onglet « À vérifier » plutôt qu'un rejet silencieux.
- **Pas de notification par e-mail** pour l'instant — la consultation se fait
  sur le site. C'est l'ajout le plus simple à faire ensuite.
- **Facebook n'est pas activé** par défaut, pour la raison expliquée plus haut.
