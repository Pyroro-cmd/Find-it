import { describeForms, launchBrowser, newContext } from './util/browser.js';
import { parsePage } from './sources/boat24.js';

/**
 * Sonde des moteurs de recherche des deux sources.
 *
 * Le premier run réel a montré que boat24 répond bien, mais que sa première
 * page ne contient que des yachts à six chiffres : sans filtre envoyé au site,
 * il faudrait parcourir des milliers d'annonces pour en retenir quelques-unes.
 * Reste à connaître les paramètres d'URL qui portent « prix maximum » et
 * « longueur minimale ».
 *
 * Deux façons de les obtenir, exécutées ici l'une après l'autre :
 *  1. remplir le formulaire dans un vrai navigateur et lire l'URL produite —
 *     c'est la réponse du site lui-même, pas une supposition ;
 *  2. essayer une liste de noms plausibles et compter ce que chacun retient.
 *
 * Le tout n'imprime que dans le journal du run : c'est le seul canal
 * consultable depuis l'environnement de développement.
 *
 *   npm run probe:search
 */

const BASE = 'https://www.boat24.com/fr/voiliers/';

/** Noms de paramètres plausibles, à confronter au site. */
const CANDIDATES = [
  '?prc_max=20000',
  '?prix_max=20000',
  '?price_max=20000',
  '?prc=0-20000',
  '?priceTo=20000',
  '?maxprice=20000',
  '?sort=prc_asc',
  '?sort=price_asc',
  '?tri=prix',
  '?order=price',
];

async function main(): Promise<void> {
  const browser = await launchBrowser();
  try {
    const context = await newContext(browser);
    const page = await context.newPage();

    console.log(`\n${'═'.repeat(70)}\nBOAT24 — formulaire de recherche\n${'═'.repeat(70)}`);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3000);
    await accepterCookies(page);
    await describeForms(page, 'boat24');

    // Les liens de tri et de filtre du site portent souvent les paramètres
    // recherchés dans leur href : c'est la source la plus directe.
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*="?"]'))
        .map((a) => a.getAttribute('href') ?? '')
        .filter((h) => /=/.test(h))
        .slice(0, 60),
    );
    console.log('\n  Liens porteurs de paramètres :');
    for (const href of [...new Set(hrefs)].slice(0, 30)) console.log(`    ${href}`);

    console.log(`\n${'═'.repeat(70)}\nBOAT24 — essai des paramètres candidats\n${'═'.repeat(70)}`);
    for (const suffix of CANDIDATES) {
      try {
        const response = await page.goto(`${BASE}${suffix}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        await page.waitForTimeout(2500);
        const { listings, cardsSeen } = parsePage(await page.content());
        const prix = listings
          .map((l) => l.priceEur)
          .filter((p): p is number => p != null)
          .sort((a, b) => a - b)
          .slice(0, 5);
        console.log(
          `  ${suffix.padEnd(22)} HTTP ${response?.status() ?? '?'} — ${cardsSeen} cartes, ` +
            `${listings.length} sous 30 000 € — premiers prix : ${prix.join(', ') || '—'}`,
        );
      } catch (error) {
        console.log(`  ${suffix.padEnd(22)} échec : ${(error as Error).message.slice(0, 80)}`);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** La bannière de cookies masque le formulaire tant qu'elle n'est pas fermée. */
async function accepterCookies(page: import('playwright').Page): Promise<void> {
  for (const selector of [
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    'button:has-text("Accepter")',
  ]) {
    const button = page.locator(selector).first();
    if ((await button.count()) > 0) {
      await button.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(1000);
      return;
    }
  }
}

main().catch((error) => {
  console.error('Sonde en échec :', error);
  process.exitCode = 1;
});
