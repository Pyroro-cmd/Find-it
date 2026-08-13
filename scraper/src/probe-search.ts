import type { Page } from 'playwright';
import { launchBrowser, newContext } from './util/browser.js';
import { parsePage as parseBoat24 } from './sources/boat24.js';
import { parsePage as parseYachtall } from './sources/yachtall.js';

/**
 * Sonde des points d'entrée par marque.
 *
 * Le site ne montre que deux ou trois bateaux, et la cause est le volume
 * collecté : une seule page par site, soit environ 45 annonces chez yachtall
 * et 120 chez boat24, dont l'écrasante majorité dépasse le budget.
 *
 * La pagination est fermée — elle passe par des paramètres d'URL, que les deux
 * sites refusent aux robots. Mais leurs **pages par marque sont des chemins** :
 * les liens de détail relevés ont la forme
 *
 *   boat24.com/fr/voiliers/jeanneau/jeanneau-sun-odyssey-49/detail/734999/
 *
 * ce qui laisse penser que /fr/voiliers/jeanneau/ existe et est servi comme
 * n'importe quelle page. Si c'est le cas, une trentaine de marques donnent
 * quelques milliers d'annonces parcourues chaque jour, sans contourner quoi que
 * ce soit ni solliciter davantage le site qu'un visiteur qui navigue.
 *
 * Le critère est double : la page répond, et elle contient des annonces
 * **différentes** de la page générale.
 *
 *   npm run probe:search
 */

const MARQUES = ['jeanneau', 'beneteau', 'dufour', 'bavaria', 'gibsea', 'kelt', 'hanse'];

async function main(): Promise<void> {
  const browser = await launchBrowser();
  try {
    const context = await newContext(browser);
    const page = await context.newPage();

    console.log(`\n${'═'.repeat(78)}\nBOAT24 — pages par marque\n${'═'.repeat(78)}`);
    for (const marque of MARQUES) {
      await essayer(page, `https://www.boat24.com/fr/voiliers/${marque}/`, 'boat24');
    }

    console.log(`\n${'═'.repeat(78)}\nYACHTALL — pages par marque\n${'═'.repeat(78)}`);
    for (const marque of MARQUES) {
      await essayer(page, `https://www.yachtall.com/fr/voiliers/${marque}`, 'yachtall');
    }

    // Autres découpages plausibles, toujours en chemin.
    console.log(`\n${'═'.repeat(78)}\nAUTRES DÉCOUPAGES\n${'═'.repeat(78)}`);
    for (const url of [
      'https://www.boat24.com/fr/voiliers/occasion/',
      'https://www.boat24.com/fr/voiliers/france/',
      'https://www.yachtall.com/fr/voiliers-occasion',
      'https://www.yachtall.com/fr/bateaux/voiliers',
    ]) {
      await essayer(page, url, url.includes('boat24') ? 'boat24' : 'yachtall');
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function essayer(page: Page, url: string, site: 'boat24' | 'yachtall'): Promise<void> {
  try {
    const reponse = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2500);
    const statut = reponse?.status() ?? 0;

    if (statut >= 400) {
      console.log(`  ${court(url).padEnd(46)} HTTP ${statut}`);
      return;
    }

    const html = await page.content();
    const { listings, cardsSeen } = site === 'boat24' ? parseBoat24(html) : parseYachtall(html);
    const prix = listings
      .map((l) => l.priceEur)
      .filter((p): p is number => p != null)
      .sort((a, b) => a - b);

    console.log(
      `  ${court(url).padEnd(46)} HTTP ${statut} — ${cardsSeen} cartes, ` +
        `${listings.length} dans le budget${prix.length ? ` (dès ${prix[0]} €)` : ''}`,
    );
  } catch (error) {
    console.log(`  ${court(url).padEnd(46)} échec : ${(error as Error).message.slice(0, 60)}`);
  }
}

function court(url: string): string {
  return url.replace(/^https:\/\/www\./, '');
}

main().catch((error) => {
  console.error('Sonde en échec :', error);
  process.exitCode = 1;
});
