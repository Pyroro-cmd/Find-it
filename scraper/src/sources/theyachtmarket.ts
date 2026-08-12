import type { Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { RawListing, Source, SourceResult } from '../types.js';
import { diagnosePage, dumpPage, humanDelay, launchBrowser, newContext } from '../util/browser.js';

/**
 * theyachtmarket.com (version française) — seconde source.
 *
 * Intérêt particulier : chaque carte porte un résumé du type
 *
 *   2002 | 51'7" | Diesel | Voile
 *
 * soit l'année, la longueur ET le type de bateau, explicitement. Le tri entre
 * voiliers et bateaux à moteur devient exact, et la longueur n'a pas à être
 * devinée — elle est simplement convertie depuis les pieds.
 *
 * Le site tourne sous ASP.NET WebForms : la recherche est un POST avec jeton
 * de validation. Plutôt que de reconstruire ce POST à la main, on remplit le
 * formulaire dans un vrai navigateur, puis on pagine en GET — les critères
 * étant conservés côté session.
 */

const SOURCE = 'theyachtmarket';
const BASE = 'https://www.theyachtmarket.com';
const SEARCH_FORM_URL = `${BASE}/fr/bateaux-a-vendre/`;
const RESULTS_URL = `${BASE}/fr/bateaux-a-vendre/recherche/`;

const MAX_PAGES = Number(process.env.TYM_MAX_PAGES ?? 8);
const MAX_PRICE = Number(process.env.TYM_MAX_PRICE ?? 30000);
const MIN_LENGTH_M = Number(process.env.TYM_MIN_LENGTH ?? 8);

export class TheYachtMarketSource implements Source {
  readonly name = SOURCE;

  /**
   * Désactivée : la page de résultats est protégée par un test JavaScript
   * Cloudflare qui ne se résout pas depuis un centre de données — mesuré sur
   * plusieurs runs, y compris avec vingt secondes d'attente. La source coûtait
   * vingt-six secondes par collecte pour zéro annonce.
   *
   * Le code reste en place : depuis une connexion résidentielle, le test passe
   * généralement. `FINDIT_ENABLE_TYM=1` la réactive.
   */
  isEnabled(): boolean {
    return process.env.FINDIT_ENABLE_TYM === '1';
  }

  async collect(): Promise<SourceResult> {
    const errors: string[] = [];
    const byId = new Map<string, RawListing>();
    let reachable = false;

    let browser: Browser | undefined;
    try {
      browser = await launchBrowser();
      const context = await newContext(browser);
      const page = await context.newPage();

      const filtered = await applySearchFilters(page, errors);
      reachable = true;
      console.log(
        `    theyachtmarket : filtres ${filtered ? 'appliqués' : 'non appliqués (tri côté collecteur)'}`,
      );

      for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
        const url = pageNum === 1 ? RESULTS_URL : `${RESULTS_URL}?page=${pageNum}`;
        try {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          if (response && response.status() >= 400) {
            // Cloudflare répond 403 puis exécute un test JavaScript qui, une
            // fois passé, recharge la vraie page. Attendre coûte quinze
            // secondes et peut suffire ; abandonner tout de suite, non.
            const passe = await attendreChallenge(page);
            if (!passe) {
              errors.push(`page ${pageNum} : HTTP ${response.status()} (protection Cloudflare)`);
              if (pageNum === 1) await diagnosePage(page, 'tym-refus');
              break;
            }
          }
          await page.waitForTimeout(1800);

          if (pageNum === 1) await dumpPage(page, 'tym-page1');

          const found = parseResultsPage(await page.content());
          if (found.length === 0 && pageNum === 1) await diagnosePage(page, 'tym');
          const before = byId.size;
          for (const listing of found) {
            if (!byId.has(listing.sourceId)) byId.set(listing.sourceId, listing);
          }
          const added = byId.size - before;
          console.log(`    theyachtmarket page ${pageNum} : ${found.length} cartes, ${added} nouvelles`);

          if (added === 0) break;
          await humanDelay(1200, 2400);
        } catch (error) {
          errors.push(`page ${pageNum} : ${message(error)}`);
          break;
        }
      }

      return { source: SOURCE, listings: [...byId.values()], errors, reachable };
    } catch (error) {
      errors.push(`échec général : ${message(error)}`);
      return { source: SOURCE, listings: [...byId.values()], errors, reachable };
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
}

/**
 * Renseigne le formulaire de recherche. En cas d'échec on continue sans
 * filtres : le tri se fera côté collecteur, moins efficacement mais sans
 * perdre la source.
 */
async function applySearchFilters(page: Page, errors: string[]): Promise<boolean> {
  try {
    await page.goto(SEARCH_FORM_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1500);

    // Les noms ASP.NET sont préfixés par toute la hiérarchie des conteneurs ;
    // on cible donc par suffixe, stable d'une refonte à l'autre.
    await fillIfPresent(page, 'input[name$="txtPriceTo"]', String(MAX_PRICE));
    await selectIfPresent(page, 'select[name$="ddlCurrency"]', 'eur');
    await fillIfPresent(page, 'input[name$="txtLengthFrom"]', String(MIN_LENGTH_M));
    await selectIfPresent(page, 'select[name$="ddlLengthUnit"]', 'metres');
    await selectIfPresent(page, 'select[name$="ddlNewOrUsed"]', 'used');

    const submitted = await submitSearch(page);
    if (!submitted) {
      errors.push('formulaire de recherche non soumis — collecte sans filtre');
      await diagnosePage(page, 'tym-formulaire');
      return false;
    }

    await page.waitForTimeout(2500);
    return page.url().includes('recherche');
  } catch (error) {
    errors.push(`filtres : ${message(error)}`);
    return false;
  }
}

async function fillIfPresent(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector).first();
  if ((await field.count()) > 0) await field.fill(value).catch(() => undefined);
}

async function selectIfPresent(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector).first();
  if ((await field.count()) > 0) await field.selectOption(value).catch(() => undefined);
}

async function submitSearch(page: Page): Promise<boolean> {
  const candidates = [
    'input[type="submit"][value*="echerch" i]',
    'button[type="submit"]:has-text("echerch")',
    'a:has-text("Rechercher")',
    'input[type="submit"]',
  ];
  for (const selector of candidates) {
    const button = page.locator(selector).first();
    if ((await button.count()) === 0) continue;
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25_000 }).catch(() => undefined),
        button.click({ timeout: 8000 }),
      ]);
      return true;
    } catch {
      // bouton masqué ou intercepté : on essaie le candidat suivant
    }
  }
  return false;
}

/**
 * Attend qu'un test anti-bot Cloudflare se résolve de lui-même.
 *
 * La page de test s'intitule « Just a moment… » et ne contient aucune annonce.
 * Si elle laisse la place au contenu réel, on continue ; sinon on rend la main
 * plutôt que de mouliner.
 */
async function attendreChallenge(page: Page, timeoutMs = 20_000): Promise<boolean> {
  const echeance = Date.now() + timeoutMs;
  while (Date.now() < echeance) {
    await page.waitForTimeout(2500);
    const titre = await page.title().catch(() => '');
    if (/just a moment|un instant|checking your browser/i.test(titre)) continue;
    if ((await page.locator('[class~="info-col"]').count().catch(() => 0)) > 0) return true;
  }
  return false;
}

export function parseResultsPage(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('[class~="info-col"]').each((_, el) => {
    const listing = parseCard($, el);
    if (listing) listings.push(listing);
  });

  return listings;
}

function parseCard($: cheerio.CheerioAPI, el: Element): RawListing | null {
  const $card = $(el);

  const $name = $card.find('a[class~="boat-name"]').first();
  const title = $name.text().trim();
  const href = $name.attr('href');
  if (!title || !href) return null;

  const url = href.startsWith('http') ? href : `${BASE}${href}`;
  const sourceId = url.match(/id(\d+)/)?.[1] ?? url;

  const overview = parseOverview($card.find('[class~="overview"]').first().text());
  const priceEur = parseEuroPrice($card.find('[class~="pricing"]').first().text());
  const location = $card.find('[class~="location"]').first().text().trim() || null;

  // On ne garde que les voiliers : le site mélange voile et moteur, et
  // l'aperçu le dit explicitement.
  if (overview.boatKind === 'moteur') return null;
  if (priceEur != null && priceEur > MAX_PRICE) return null;
  if (overview.lengthM != null && overview.lengthM < MIN_LENGTH_M) return null;

  return {
    source: SOURCE,
    sourceId,
    url,
    title,
    description: [location, $card.find('[class~="overview"]').first().text().trim()]
      .filter(Boolean)
      .join(' — '),
    priceEur,
    locationLabel: location,
    postalCode: null,
    images: [],
    publishedAt: null,
    sellerType: 'pro', // le site référence des courtiers
    known: {
      lengthM: overview.lengthM,
      yearBuilt: overview.yearBuilt,
      boatKind: overview.boatKind,
      country: location ? (location.split(',').pop()?.trim() ?? location) : null,
    },
    raw: { overview: $card.find('[class~="overview"]').first().text().trim() },
  };
}

export type Overview = {
  yearBuilt: number | null;
  lengthM: number | null;
  boatKind: 'voilier' | 'moteur' | null;
};

/** Lit un aperçu du type « 2002 | 51'7" | Diesel | Voile ». */
export function parseOverview(text: string): Overview {
  const clean = text.replace(/\s+/g, ' ').trim();

  const year = clean.match(/\b(19\d{2}|20\d{2})\b/);
  const yearBuilt = year ? Number(year[1]) : null;

  // Longueur en pieds et pouces : 51'7"
  let lengthM: number | null = null;
  const feetInches = clean.match(/(\d{1,3})'\s*(\d{1,2})?"?/);
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = feetInches[2] ? Number(feetInches[2]) : 0;
    const metres = (feet + inches / 12) * 0.3048;
    if (metres >= 3 && metres <= 60) lengthM = Math.round(metres * 100) / 100;
  }

  const lower = clean.toLowerCase();
  const boatKind = lower.includes('voile') ? 'voilier' : lower.includes('moteur') ? 'moteur' : null;

  return { yearBuilt, lengthM, boatKind };
}

/**
 * Extrait le prix en euros.
 *
 * Le bloc affiche une conversion en dollars puis le prix réel :
 * « $438 991 USD Prix répertoriés £325 000 GBP ». Seul le montant en euros
 * nous intéresse — convertir depuis une autre devise introduirait un taux de
 * change à maintenir, pour un gain nul sur un marché européen.
 */
export function parseEuroPrice(text: string): number | null {
  const clean = text.replace(/ /g, ' ').replace(/\s+/g, ' ');
  const match = clean.match(/€\s*([\d][\d\s.,]*)\s*EUR/i) ?? clean.match(/([\d][\d\s.,]*)\s*EUR\b/i);
  if (!match) return null;
  const value = Number(match[1].replace(/[\s.,]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
