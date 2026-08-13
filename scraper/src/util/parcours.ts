import type { Browser, Page } from 'playwright';
import { humanDelay, newContext } from './browser.js';

/**
 * Parcourt plusieurs pages d'un même site, **une session neuve par page**.
 *
 * Ce n'est pas une précaution de principe, c'est ce que la mesure impose. Trois
 * sondes successives, depuis GitHub Actions, ont donné le même schéma sur
 * boat24 comme sur yachtall :
 *
 *   /fr/voiliers/jeanneau/   HTTP 200 — 24 cartes, 6 dans le budget
 *   /fr/voiliers/beneteau/   HTTP 403      (douze secondes plus tard)
 *   /fr/voiliers/dufour/     HTTP 403
 *
 * Espacer les requêtes de deux secondes puis de douze n'a rien changé : ce
 * n'est donc pas une question de cadence, mais de session — la première page
 * passe, les suivantes sont refusées. En repartant d'un contexte vierge à
 * chaque fois, chaque requête redevient « la première ».
 *
 * Une pause reste appliquée entre deux pages : le but est de collecter ce que
 * le site publie, pas de le solliciter plus qu'un visiteur ne le ferait.
 */

export type PageVisitee<T> = {
  url: string;
  statut: number;
  resultat: T | null;
};

export async function parcourirPages<T>(
  browser: Browser,
  urls: string[],
  lire: (page: Page, url: string) => Promise<T>,
  options: { pauseMinMs?: number; pauseMaxMs?: number } = {},
): Promise<PageVisitee<T>[]> {
  const { pauseMinMs = 4000, pauseMaxMs = 9000 } = options;
  const visites: PageVisitee<T>[] = [];

  for (const [index, url] of urls.entries()) {
    if (index > 0) await humanDelay(pauseMinMs, pauseMaxMs);

    const context = await newContext(browser);
    try {
      const page = await context.newPage();
      const reponse = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      const statut = reponse?.status() ?? 0;

      if (statut >= 400) {
        visites.push({ url, statut, resultat: null });
        continue;
      }

      visites.push({ url, statut, resultat: await lire(page, url) });
    } catch {
      visites.push({ url, statut: 0, resultat: null });
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  return visites;
}
