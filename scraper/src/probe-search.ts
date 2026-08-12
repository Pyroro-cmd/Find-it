import type { Page } from 'playwright';
import { describeForms, launchBrowser, newContext } from './util/browser.js';
import { parsePage } from './sources/boat24.js';

/**
 * Sonde du moteur de recherche de boat24.
 *
 * Le premier run réel a montré que le site répond bien mais que la page
 * d'entrée de la rubrique ne contient que des yachts à six chiffres : sans
 * filtre envoyé au site, il faudrait parcourir des milliers d'annonces pour en
 * retenir quelques-unes.
 *
 * Le relevé précédent a donné le formulaire :
 *
 *   POST /fr/bateauxdoccasion/ — cat(hidden), whr(hidden), prs_min, prs_max, cou
 *
 * et un fait gênant : toute URL portant une chaîne de requête répond 403.
 * D'où cette sonde, qui n'essaie plus de deviner des URL mais **soumet le
 * formulaire dans un vrai navigateur** et regarde où le site l'emmène. Ce que
 * le site produit lui-même passe forcément ses propres contrôles.
 *
 *   npm run probe:search
 */

const BASE = 'https://www.boat24.com/fr/voiliers/';

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

    console.log(`\n${'═'.repeat(70)}\nBOAT24 — soumission du formulaire\n${'═'.repeat(70)}`);
    await soumettreRecherche(page);

    console.log(`\n${'═'.repeat(70)}\nBOAT24 — pagination et tri depuis la page de résultats\n${'═'.repeat(70)}`);
    await relevesDeLiens(page);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Remplit « prix maximum » et soumet, puis décrit ce que le site renvoie. */
async function soumettreRecherche(page: Page): Promise<void> {
  const prixMax = page.locator('input[name="prs_max"]').first();
  if ((await prixMax.count()) === 0) {
    console.log('  champ prs_max introuvable — le formulaire a changé');
    return;
  }

  await prixMax.fill('20000').catch(() => undefined);

  const bouton = page.locator('form:has(input[name="prs_max"]) [type="submit"]').first();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined),
    bouton.click({ timeout: 10_000 }).catch(() => undefined),
  ]);
  await page.waitForTimeout(3500);

  console.log(`  url après soumission : ${page.url()}`);
  console.log(`  titre : ${await page.title().catch(() => '?')}`);

  const { listings, cardsSeen } = parsePage(await page.content());
  const prix = listings
    .map((l) => l.priceEur)
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b);
  console.log(`  ${cardsSeen} cartes vues, ${listings.length} retenues`);
  console.log(`  prix retenus : ${prix.slice(0, 12).join(', ') || '—'}`);
  for (const listing of listings.slice(0, 3)) {
    console.log(`    · ${listing.title} — ${listing.priceEur} € — ${listing.known?.lengthM} m — ${listing.url}`);
  }
}

/**
 * Relève les liens de pagination et de tri de la page courante : ce sont des
 * URL fabriquées par le site, donc acceptées par ses propres contrôles.
 */
async function relevesDeLiens(page: Page): Promise<void> {
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href], [data-link]'))
      .map((el) => el.getAttribute('href') ?? '')
      .filter((h) => h.includes('?') || /page|sort|tri/i.test(h)),
  );
  for (const href of [...new Set(hrefs)].slice(0, 25)) console.log(`    ${href}`);

  // Le site peut aussi conserver la recherche en session : on vérifie si la
  // page suivante, demandée sans paramètre, reste filtrée.
  const suivant = page.locator('a[rel="next"], a:has-text("Suivant"), .pagination a').first();
  if ((await suivant.count()) > 0) {
    const href = await suivant.getAttribute('href');
    console.log(`  lien « suivant » : ${href}`);
  }
}

/** La bannière de cookies masque le formulaire tant qu'elle n'est pas fermée. */
async function accepterCookies(page: Page): Promise<void> {
  for (const selector of [
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    'button:has-text("Accepter")',
  ]) {
    const button = page.locator(selector).first();
    if ((await button.count()) > 0) {
      await button.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
      return;
    }
  }
}

main().catch((error) => {
  console.error('Sonde en échec :', error);
  process.exitCode = 1;
});
