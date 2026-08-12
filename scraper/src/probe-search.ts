import type { Page } from 'playwright';
import { launchBrowser, newContext } from './util/browser.js';
import { parsePage } from './sources/yachtall.js';

/**
 * Sonde de pagination de yachtall.
 *
 * La source fonctionne, mais ne rend qu'une page de 45 annonces : le
 * collecteur a tenté `/fr/voiliers/2`, sans succès. Or les URL à paramètres
 * déclenchent la vérification anti-bot du site — il faut donc trouver la forme
 * de chemin qu'il accepte, si elle existe.
 *
 * Le critère est sans ambiguïté : la page répond, elle contient des cartes, et
 * ce ne sont **pas les mêmes annonces** que la première page. Une page qui
 * renvoie les mêmes bateaux est un faux positif — c'est ce qui rend le test
 * utile plutôt que rassurant.
 *
 *   npm run probe:search
 */

const BASE = 'https://www.yachtall.com';
const PREMIERE = `${BASE}/fr/voiliers`;

const CANDIDATES = [
  `${BASE}/fr/voiliers/2`,
  `${BASE}/fr/voiliers/page/2`,
  `${BASE}/fr/voiliers/page-2`,
  `${BASE}/fr/voiliers/seite-2`,
  `${BASE}/fr/voiliers-2`,
  `${BASE}/fr/voiliers/p2`,
  `${BASE}/fr/bateaux/voiliers/2`,
];

async function main(): Promise<void> {
  const browser = await launchBrowser();
  try {
    const context = await newContext(browser);
    const page = await context.newPage();

    console.log(`\n${'═'.repeat(78)}\nPAGE 1 — référence\n${'═'.repeat(78)}`);
    const premiers = await releve(page, PREMIERE);
    console.log(`  ${premiers.cartes} cartes — premiers identifiants : ${[...premiers.ids].slice(0, 5).join(', ')}`);

    console.log(`\n${'═'.repeat(78)}\nCANDIDATS — page 2\n${'═'.repeat(78)}`);
    for (const url of CANDIDATES) {
      const r = await releve(page, url);
      const nouveaux = [...r.ids].filter((id) => !premiers.ids.has(id));
      const verdict =
        r.statut >= 400
          ? 'refusé'
          : r.cartes === 0
            ? 'aucune carte'
            : nouveaux.length === 0
              ? 'mêmes annonces qu’en page 1'
              : `✔ ${nouveaux.length} annonces inédites`;
      console.log(`  ${url.replace(BASE, '').padEnd(28)} HTTP ${r.statut} — ${r.cartes} cartes — ${verdict}`);
    }

    // Le plan de site donne parfois la forme des URL sans avoir à deviner.
    console.log(`\n${'═'.repeat(78)}\nPLAN DE SITE\n${'═'.repeat(78)}`);
    for (const url of [`${BASE}/sitemap.xml`, `${BASE}/robots.txt`]) {
      try {
        const reponse = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const contenu = (await page.content()).replace(/\s+/g, ' ');
        console.log(`  ${url} → HTTP ${reponse?.status() ?? '?'} : ${contenu.slice(0, 700)}`);
      } catch (error) {
        console.log(`  ${url} → échec : ${(error as Error).message.slice(0, 90)}`);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function releve(page: Page, url: string): Promise<{ statut: number; cartes: number; ids: Set<string> }> {
  try {
    const reponse = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2500);
    const { listings, cardsSeen } = parsePage(await page.content());
    // `listings` est filtré par prix ; pour comparer deux pages il faut tous
    // les identifiants, d'où cette lecture directe des liens.
    const ids = new Set(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[class~="js-hrefBoat"]'))
          .map((a) => (a.getAttribute('href') ?? '').match(/-s(\d+)/)?.[1] ?? '')
          .filter(Boolean),
      ),
    );
    void listings;
    return { statut: reponse?.status() ?? 0, cartes: cardsSeen, ids };
  } catch (error) {
    console.log(`    (${url} : ${(error as Error).message.slice(0, 80)})`);
    return { statut: 0, cartes: 0, ids: new Set() };
  }
}

main().catch((error) => {
  console.error('Sonde en échec :', error);
  process.exitCode = 1;
});
