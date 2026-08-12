import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_FILE } from './store.js';

/**
 * Collecte depuis VOTRE machine, avec Leboncoin et Facebook.
 *
 * Pourquoi ce mode existe : Leboncoin refuse les adresses IP de centres de
 * données. Mesuré, plusieurs fois, depuis les serveurs de GitHub — page de
 * recherche comme navigateur piloté, toujours 403. Ce n'est pas un défaut du
 * collecteur et aucun code ne le corrigera : la protection filtre l'origine de
 * la requête, pas son contenu. Facebook Marketplace, lui, exige en plus une
 * session connectée.
 *
 * Depuis votre connexion, les deux redeviennent accessibles. Ce script fait
 * donc tourner la même collecte que le robot quotidien, sources françaises
 * comprises, puis publie le résultat — le site se met à jour comme d'habitude.
 *
 *   npm run collecte:locale
 *
 * Facebook n'est inclus que si une session existe (`npm run facebook:connexion`).
 */

const RACINE_SCRAPER = fileURLToPath(new URL('../', import.meta.url));
const RACINE_DEPOT = fileURLToPath(new URL('../../', import.meta.url));
const FICHIER_SESSION_FB = process.env.FB_STORAGE_STATE ?? path.join(RACINE_SCRAPER, 'fb-session.json');

async function main(): Promise<void> {
  const sessionFb = await existe(FICHIER_SESSION_FB);

  console.log(`
┌────────────────────────────────────────────────────────────────────────┐
│  Find-it — collecte depuis votre machine                               │
├────────────────────────────────────────────────────────────────────────┤
│  Leboncoin  : activé (impossible depuis un serveur, possible ici)      │
│  Facebook   : ${(sessionFb ? 'activé — session trouvée' : 'ignoré — aucune session enregistrée').padEnd(56)}│
│  yachtall, boat24 : activés comme d'habitude                           │
└────────────────────────────────────────────────────────────────────────┘
`);

  if (!sessionFb) {
    console.log(
      'Pour inclure Facebook : npm run facebook:connexion (compte secondaire dédié).\n',
    );
  }

  const code = await lancer('npm', ['run', 'scrape'], {
    ...process.env,
    FINDIT_TRIGGER: 'locale',
    FINDIT_ENABLE_LEBONCOIN: '1',
    // theyachtmarket est bloqué depuis un serveur mais passe généralement
    // depuis une connexion résidentielle : autant en profiter.
    FINDIT_ENABLE_TYM: '1',
    ...(sessionFb ? { FINDIT_ENABLE_FACEBOOK: '1', FB_STORAGE_STATE: FICHIER_SESSION_FB } : {}),
  });

  if (code !== 0) {
    console.error('\nLa collecte a échoué — le fichier de données n’a pas été modifié.');
    process.exitCode = code;
    return;
  }

  await publier();
}

/**
 * Enregistre et envoie les annonces.
 *
 * Sans cette étape la collecte locale ne servirait qu'à vous : c'est le commit
 * qui met le site à jour pour tout le monde.
 */
async function publier(): Promise<void> {
  const relatif = path.relative(RACINE_DEPOT, DATA_FILE);

  const modifie = await lancerSilencieux('git', ['diff', '--quiet', '--', relatif]);
  const nouveau = await lancerSilencieux('git', ['ls-files', '--error-unmatch', relatif]);
  if (modifie === 0 && nouveau === 0) {
    console.log('\nAucun changement dans les annonces — rien à publier.');
    return;
  }

  const nombre = await compterActives();
  const date = new Date().toLocaleDateString('fr-FR');

  await lancer('git', ['add', relatif], process.env, RACINE_DEPOT);
  await lancer(
    'git',
    ['commit', '-m', `Collecte locale du ${date} — ${nombre} annonces actives`],
    process.env,
    RACINE_DEPOT,
  );

  const pousse = await lancer('git', ['push'], process.env, RACINE_DEPOT);
  if (pousse !== 0) {
    console.error(`
Le commit est fait mais l'envoi a échoué. Réessayez avec :

    git pull --rebase && git push
`);
    process.exitCode = 1;
    return;
  }

  console.log(`
${nombre} annonces publiées. Le site se reconstruit tout seul et sera à jour
d'ici deux à trois minutes :

    https://pyroro-cmd.github.io/Find-it/
`);
}

async function compterActives(): Promise<number> {
  try {
    const brut = await fs.readFile(DATA_FILE, 'utf-8');
    const donnees = JSON.parse(brut) as { listings?: Array<{ status?: string }> };
    return (donnees.listings ?? []).filter((l) => l.status === 'active').length;
  } catch {
    return 0;
  }
}

function lancer(
  commande: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = RACINE_SCRAPER,
): Promise<number> {
  return new Promise((resolve) => {
    const enfant = spawn(commande, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
    enfant.on('close', (code) => resolve(code ?? 1));
    enfant.on('error', () => resolve(1));
  });
}

function lancerSilencieux(commande: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const enfant = spawn(commande, args, {
      cwd: RACINE_DEPOT,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    enfant.on('close', (code) => resolve(code ?? 1));
    enfant.on('error', () => resolve(1));
  });
}

async function existe(fichier: string): Promise<boolean> {
  try {
    await fs.access(fichier);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error('\nÉchec :', error);
  process.exitCode = 1;
});
