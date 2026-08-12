import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ouvre un navigateur pour vous connecter à Facebook, puis enregistre la
 * session sur votre disque.
 *
 * ┌─ À lire avant de lancer ────────────────────────────────────────────────┐
 * │ Utilisez un COMPTE SECONDAIRE dédié, jamais votre compte principal.     │
 * │ Automatiser une navigation Marketplace contrevient aux conditions       │
 * │ d'utilisation de Meta et expose le compte à une suspension. Le risque   │
 * │ est réel ; le compte que vous utiliserez ici peut être perdu.           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Le fichier produit contient des jetons de session, l'équivalent d'un mot de
 * passe. Il est écrit dans `scraper/fb-session.json`, que `.gitignore` exclut
 * déjà — il ne doit jamais être commité ni collé dans une conversation.
 *
 *   npm run facebook:connexion
 */

const RACINE_SCRAPER = fileURLToPath(new URL('../', import.meta.url));
const FICHIER_SESSION = process.env.FB_STORAGE_STATE ?? path.join(RACINE_SCRAPER, 'fb-session.json');

async function main(): Promise<void> {
  console.log(`
┌────────────────────────────────────────────────────────────────────────┐
│  Connexion Facebook — compte dédié uniquement                          │
├────────────────────────────────────────────────────────────────────────┤
│  Une fenêtre de navigateur va s'ouvrir.                                │
│                                                                         │
│  1. Connectez-vous avec votre COMPTE SECONDAIRE.                       │
│  2. Ouvrez Marketplace et vérifiez que les annonces s'affichent.       │
│  3. Revenez ici et appuyez sur Entrée.                                 │
│                                                                         │
│  N'utilisez pas votre compte principal : ce compte peut être suspendu. │
└────────────────────────────────────────────────────────────────────────┘
`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();
  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });

  await attendreEntree();

  await context.storageState({ path: FICHIER_SESSION });
  await browser.close().catch(() => undefined);

  // La session vaut un mot de passe : on restreint l'accès au fichier.
  await fs.chmod(FICHIER_SESSION, 0o600).catch(() => undefined);

  console.log(`
Session enregistrée dans ${FICHIER_SESSION}

Ce fichier contient des jetons de connexion : ne le commitez pas, ne le
partagez pas. Il est déjà exclu par .gitignore.

Vous pouvez maintenant lancer :  npm run collecte:locale
`);
}

function attendreEntree(): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write('Appuyez sur Entrée une fois connecté… ');
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

main().catch((error) => {
  console.error('\nÉchec :', error);
  process.exitCode = 1;
});
