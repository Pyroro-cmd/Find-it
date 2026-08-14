# Faire tourner la collecte de son côté

Ce document s'adresse à la deuxième personne qui utilise Find-it. Il répond à
une seule question : **que faut-il faire pour que Leboncoin et Facebook
apparaissent sur le site ?**

---

## D'abord : il n'y a peut-être rien à faire

Le site vit ici :

**https://pyroro-cmd.github.io/Find-it/**

Il se met à jour tout seul chaque matin à 8 h, sans que personne n'allume
quoi que ce soit. Les annonces viennent de yachtall et de boat24 — des sites
européens, avec une part française réelle. Les filtres, les favoris et les
critères sont dans votre navigateur : vous pouvez tout régler sans gêner
personne.

**Si cela vous suffit, arrêtez-vous là.** Tout ce qui suit ne sert qu'à ajouter
Leboncoin et Facebook Marketplace.

---

## Pourquoi Leboncoin demande une machine à la maison

Leboncoin et Facebook refusent les serveurs. Ce n'est pas un problème de code
et aucun mot de passe n'y changerait rien : le refus tombe **avant toute
connexion**, sur l'origine de la requête. Mesuré depuis les serveurs de GitHub,
plusieurs fois :

```
leboncoin — recherche voilier   HTTP 403, page vide même après 30 s
facebook  — marketplace public  HTTP 200 puis redirection vers /login
```

Depuis une connexion domestique, les deux répondent normalement. D'où le
principe : **la même collecte, lancée depuis chez vous**, qui publie ensuite
son résultat sur le site commun. Vos identifiants restent sur votre ordinateur
— ils ne partent ni sur GitHub, ni ailleurs.

---

## Ce qu'il faut, une fois

### 1. Le droit d'écrire sur le dépôt

La collecte se termine par une publication. Sans ce droit, elle tournera et
s'arrêtera au dernier moment.

Le propriétaire du dépôt vous invite depuis
**Settings → Collaborators → Add people**, et vous acceptez l'invitation reçue
par courriel. C'est la seule étape qui ne dépend pas de vous.

### 2. Node.js et Git

- **Node.js 22 ou plus** — https://nodejs.org (bouton « LTS »)
- **Git** — déjà présent sur macOS et Linux ; sur Windows, https://git-scm.com

Pour vérifier, dans un terminal :

```bash
node -v    # doit afficher v22 ou plus
git --version
```

### 3. Récupérer le projet

```bash
git clone https://github.com/Pyroro-cmd/Find-it.git
cd Find-it/scraper
npm install
npx playwright install chromium
```

La dernière commande télécharge un navigateur (environ 150 Mo) : c'est lui qui
ouvrira les pages. Comptez quelques minutes la première fois.

---

## Lancer une collecte

```bash
cd Find-it/scraper
npm run collecte:locale
```

Le script active Leboncoin, lance la collecte, fusionne avec l'historique
existant, puis publie. Le site se reconstruit tout seul dans les deux minutes
qui suivent. Comptez cinq à dix minutes en tout.

Rien ne remplace la collecte automatique de 8 h : les deux alimentent le même
fichier et **l'historique se cumule**. Une annonce vue par l'un reste visible
pour l'autre, avec sa date de première apparition et ses éventuelles baisses de
prix.

Si quelqu'un d'autre a publié entre-temps, l'envoi est refusé — le script le dit
et donne la commande qui répare (`git pull --rebase && git push`). Prendre
l'habitude de faire `git pull` avant de lancer évite le cas.

### Ne plus y penser (macOS)

```bash
npm run planifier            # tous les matins à 8 h
npm run planifier -- --off   # retirer
```

Sous Linux, la même commande affiche la ligne de `crontab` à copier. Sous
Windows, il n'y a pas d'équivalent automatique : lancez `npm run
collecte:locale` quand vous y pensez.

L'ordinateur doit être allumé et connecté à l'heure dite — c'est la contrepartie
d'une collecte qui part de chez vous. S'il dormait, elle part au réveil.

---

## Facebook Marketplace — à lire avant

> **N'utilisez jamais votre compte principal.** Automatiser une navigation
> Marketplace contrevient aux conditions d'utilisation de Meta et expose le
> compte à une suspension. Créez un compte secondaire dédié, et acceptez qu'il
> puisse être perdu.

```bash
cd Find-it/scraper
npm run facebook:connexion
```

Un navigateur s'ouvre. Connectez-vous avec le compte dédié, vérifiez que
Marketplace s'affiche, revenez au terminal et appuyez sur Entrée. La session est
enregistrée dans `scraper/fb-session.json`, lisible par vous seul.

Ce fichier contient des jetons de connexion : **c'est l'équivalent d'un mot de
passe**. Il est déjà exclu par `.gitignore`, donc `git` ne le publiera pas —
mais ne le copiez nulle part, ne l'envoyez à personne, et ne le collez dans
aucune conversation. Le dépôt est public.

Pour révoquer : Facebook → Paramètres → Sécurité → Connexions actives →
déconnecter, puis supprimez le fichier.

Les collectes suivantes utiliseront la session automatiquement, sans rien
demander.

---

## Regarder le site sans publier

Pour voir le résultat en local, sans toucher au site commun :

```bash
cd Find-it/web
npm install
npm run dev      # http://localhost:3000
```

---

## Si ça coince

| Ce qui s'affiche | Ce que ça veut dire |
|---|---|
| `Chromium n'est pas installé` | `npx playwright install chromium` n'a pas été fait |
| `Permission denied` / `403` au moment de publier | Le droit d'écriture sur le dépôt manque (étape 1) |
| `l'envoi a échoué` | Quelqu'un a publié entre-temps — `git pull --rebase && git push`, comme le script l'indique |
| `leboncoin : 0 annonce` | Leboncoin a bloqué cette session : réessayez plus tard dans la journée |
| `yachtall : aucune page accessible` | Le site a refusé les requêtes ce jour-là ; ses annonces déjà connues sont conservées, rien n'est perdu |

Une source qui échoue n'entraîne pas les autres : la collecte se termine quand
même, et le bandeau en haut du site indique ce qui a répondu ce matin-là.

---

## Ce qu'il ne faut jamais faire

- **Ne jamais** committer `fb-session.json`, un mot de passe, une clé d'API. Le
  dépôt est public.
- **Ne jamais** utiliser son compte Facebook principal pour la collecte.
- **Ne jamais** envoyer ses identifiants par message, à qui que ce soit — ils ne
  servent à rien à personne d'autre, et la collecte n'en a pas besoin pour
  fonctionner chez vous.
