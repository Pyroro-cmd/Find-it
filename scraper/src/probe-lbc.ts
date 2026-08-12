import type { Page } from 'playwright';
import { launchBrowser, newContext } from './util/browser.js';

/**
 * Sonde Leboncoin et Facebook Marketplace, depuis un serveur.
 *
 * Les deux sites avaient été écartés sur un premier constat : 403. Avant de
 * conclure qu'il n'y a rien à faire, cette sonde teste ce qui n'avait pas été
 * tenté — notamment **laisser le challenge anti-bot se résoudre**, comme le
 * ferait un navigateur ordinaire quelques secondes après l'ouverture.
 *
 * Le but n'est pas de contourner une protection mais de savoir laquelle des
 * deux situations on affronte :
 *   - un test transitoire, qui se passe tout seul → la collecte automatique
 *     reste possible ;
 *   - un refus lié à l'adresse IP → seule une collecte depuis une connexion
 *     résidentielle peut aboutir, et il faut le dire clairement.
 *
 *   npm run probe:lbc
 */

type Cible = {
  nom: string;
  url: string;
  /** Indice de réussite : un texte qui n'apparaît que si la page est servie. */
  indice: RegExp;
};

const CIBLES: Cible[] = [
  {
    nom: 'leboncoin — accueil',
    url: 'https://www.leboncoin.fr/',
    indice: /leboncoin|annonces/i,
  },
  {
    nom: 'leboncoin — recherche voilier',
    url: 'https://www.leboncoin.fr/recherche?category=50&text=voilier',
    indice: /r[ée]sultat|annonce|voilier/i,
  },
  {
    nom: 'leboncoin — nautisme',
    url: 'https://www.leboncoin.fr/c/nautisme',
    indice: /nautisme|bateau/i,
  },
  {
    nom: 'facebook — marketplace public',
    url: 'https://www.facebook.com/marketplace/paris/search?query=voilier',
    indice: /marketplace|r[ée]sultat/i,
  },
];

async function main(): Promise<void> {
  const browser = await launchBrowser();
  try {
    const context = await newContext(browser);
    const page = await context.newPage();

    for (const cible of CIBLES) {
      console.log(`\n${'═'.repeat(78)}\n${cible.nom}\n${'═'.repeat(78)}`);
      try {
        const reponse = await page.goto(cible.url, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        console.log(`  HTTP ${reponse?.status() ?? '?'} à l'ouverture`);

        // Le point du test : laisser au challenge le temps de se résoudre.
        const resolu = await attendreResolution(page, cible.indice);

        console.log(`  après attente : ${page.url()}`);
        console.log(`  titre : ${await page.title().catch(() => '?')}`);

        const texte = (
          await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .trim();
        console.log(`  texte (220 c.) : ${texte.slice(0, 220)}`);
        console.log(`  verdict : ${resolu ? '✔ page servie' : '✘ toujours bloqué'}`);
      } catch (error) {
        console.log(`  échec : ${(error as Error).message.slice(0, 140)}`);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/**
 * Attend qu'un test anti-bot laisse la place au contenu réel.
 *
 * DataDome et Cloudflare servent une page d'attente qui, sur un vrai
 * navigateur, se remplace d'elle-même au bout de quelques secondes. On leur
 * laisse trente secondes avant de conclure.
 */
async function attendreResolution(page: Page, indice: RegExp): Promise<boolean> {
  const echeance = Date.now() + 30_000;
  while (Date.now() < echeance) {
    await page.waitForTimeout(3000);

    const titre = await page.title().catch(() => '');
    if (/just a moment|un instant|checking your browser|acc[eè]s refus/i.test(titre)) continue;

    const texte = (await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')) as string;
    if (/(pardon|d[ée]sol[ée]).{0,40}(interruption|robot)|captcha|blocked/i.test(texte)) continue;
    if (indice.test(texte)) return true;
  }
  return false;
}

main().catch((error) => {
  console.error('Sonde en échec :', error);
  process.exitCode = 1;
});
