import type { Browser, Page } from 'playwright';
import type { RawListing, Source, SourceResult } from '../types.js';
import {
  deepCollect,
  describeJsonShape,
  describeRepeatedClasses,
  dumpPage,
  humanDelay,
  launchBrowser,
  newContext,
} from '../util/browser.js';
import { parsePostalCode, parsePriceEur } from '../util/text.js';

/**
 * Leboncoin — de loin la première source de voiliers d'occasion en France.
 *
 * Le site est protégé par DataDome : un `fetch` reçoit une page de challenge,
 * pas les annonces. On pilote donc un vrai navigateur.
 *
 * Deux voies d'extraction, en parallèle, parce qu'aucune n'est stable seule :
 *   1. les réponses JSON de l'API interne, interceptées au vol ;
 *   2. l'état Next.js embarqué dans la page (`__NEXT_DATA__`).
 * On fusionne les deux et on déduplique sur l'identifiant d'annonce.
 *
 * Dans les deux cas on cherche les objets par leur FORME (présence de
 * `list_id` + `subject`) plutôt qu'à un chemin figé : la structure de l'état
 * change à chaque refonte, la forme des annonces beaucoup moins.
 */

const SOURCE = 'leboncoin';
const BASE = 'https://www.leboncoin.fr';

/** Catégorie « Nautisme ». Surchargeable : Leboncoin renumérote parfois. */
const CATEGORY = process.env.LBC_CATEGORY ?? '50';
const MAX_PAGES = Number(process.env.LBC_MAX_PAGES ?? 5);
const MAX_PRICE = Number(process.env.LBC_MAX_PRICE ?? 25000);

/**
 * Plusieurs requêtes plutôt qu'une : les vendeurs n'emploient pas le même
 * vocabulaire, et la recherche Leboncoin ne fait pas de synonymie.
 */
const QUERIES = (process.env.LBC_QUERIES ?? 'voilier,sailboat,ketch,sloop').split(',');

type LbcAd = {
  list_id?: number | string;
  subject?: string;
  body?: string;
  url?: string;
  price?: number[] | number;
  images?: { urls?: string[]; urls_large?: string[]; thumb_url?: string };
  location?: { city?: string; zipcode?: string; department_name?: string; lat?: number; lng?: number };
  first_publication_date?: string;
  index_date?: string;
  owner?: { type?: string; name?: string };
  attributes?: Array<{ key?: string; value?: string; value_label?: string; key_label?: string }>;
};

function looksLikeAd(node: Record<string, unknown>): boolean {
  return 'list_id' in node && 'subject' in node && typeof node.subject === 'string';
}

export class LeboncoinSource implements Source {
  readonly name = SOURCE;

  isEnabled(): boolean {
    return process.env.FINDIT_DISABLE_LEBONCOIN !== '1';
  }

  async collect(): Promise<SourceResult> {
    const errors: string[] = [];
    const byId = new Map<string, RawListing>();
    let reachable = false;

    let browser: Browser | undefined;
    try {
      browser = await launchBrowser();
      const context = await newContext(browser, process.env.LBC_STORAGE_STATE);
      const page = await context.newPage();

      // Interception : l'API interne renvoie le JSON complet des annonces,
      // souvent plus riche que l'état embarqué dans le HTML.
      const intercepted: LbcAd[] = [];
      page.on('response', async (response) => {
        const url = response.url();
        if (!/leboncoin\.fr\/.*(finder|search|api)/i.test(url)) return;
        if (!response.headers()['content-type']?.includes('json')) return;
        try {
          const json = await response.json();
          intercepted.push(...deepCollect<LbcAd>(json, looksLikeAd));
        } catch {
          // corps non-JSON ou déjà consommé : sans conséquence
        }
      });

      for (const query of QUERIES) {
        for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
          const url = buildSearchUrl(query.trim(), pageNum);
          try {
            const response = await page.goto(url, {
              waitUntil: 'domcontentloaded',
              timeout: 45_000,
            });

            if (response && response.status() >= 400) {
              errors.push(`${query} p${pageNum} : HTTP ${response.status()}`);
              if (response.status() === 403) {
                await dumpPage(page, 'leboncoin-blocked');
                errors.push(
                  'accès refusé (probable challenge anti-bot) — la collecte Leboncoin est interrompue',
                );
                return finish();
              }
              continue;
            }

            reachable = true;
            await page.waitForTimeout(1500);

            if (await looksBlocked(page)) {
              await dumpPage(page, 'leboncoin-challenge');
              errors.push('page de vérification anti-bot rencontrée — collecte interrompue');
              return finish();
            }

            const fromPage = await extractFromNextData(page);
            for (const ad of fromPage) addAd(ad);

            if (pageNum === 1 && query === QUERIES[0].trim()) {
              await dumpPage(page, 'leboncoin-page1');
              await logPageDiagnostics(page, fromPage.length);
            }

            // Aucun résultat sur cette page : inutile de demander la suivante.
            if (fromPage.length === 0) break;

            await humanDelay();
          } catch (error) {
            errors.push(`${query} p${pageNum} : ${message(error)}`);
          }
        }
      }

      return finish();

      function addAd(ad: LbcAd): void {
        const listing = toRawListing(ad);
        if (listing && !byId.has(listing.sourceId)) byId.set(listing.sourceId, listing);
      }

      /** Fusionne ce qui a été intercepté au vol avant de rendre le résultat. */
      function finish(): SourceResult {
        for (const ad of intercepted) addAd(ad);
        return { source: SOURCE, listings: [...byId.values()], errors, reachable };
      }
    } catch (error) {
      errors.push(`échec général : ${message(error)}`);
      return { source: SOURCE, listings: [...byId.values()], errors, reachable };
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
}

function buildSearchUrl(query: string, pageNum: number): string {
  const params = new URLSearchParams({
    category: CATEGORY,
    text: query,
    price: `min-${MAX_PRICE}`,
    sort: 'time',
    order: 'desc',
  });
  if (pageNum > 1) params.set('page', String(pageNum));
  return `${BASE}/recherche?${params.toString()}`;
}

/** Détecte une page de challenge plutôt qu'une page de résultats. */
async function looksBlocked(page: Page): Promise<boolean> {
  const title = (await page.title()).toLowerCase();
  if (/(just a moment|verification|acces refuse|access denied|blocked)/i.test(title)) return true;
  const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 400).toLowerCase();
  return /(vérifi|verifi).{0,30}(navigateur|humain)|datadome|captcha/i.test(bodyText);
}

/**
 * Imprime dans les logs ce que la page contient réellement.
 *
 * Les parseurs ont été écrits sans accès au site ; ce diagnostic remplace
 * l'inspection manuelle : il dit où sont les annonces et sous quelle forme,
 * directement dans la sortie du run.
 */
async function logPageDiagnostics(page: Page, extracted: number): Promise<void> {
  console.log('    ┌─ diagnostic Leboncoin');
  console.log(`    │ url    : ${page.url()}`);
  console.log(`    │ titre  : ${await page.title().catch(() => '?')}`);
  console.log(`    │ extrait: ${extracted} annonces via __NEXT_DATA__`);

  const payload = await page
    .evaluate(() => document.querySelector('#__NEXT_DATA__')?.textContent ?? null)
    .catch(() => null);

  if (!payload) {
    console.log('    │ __NEXT_DATA__ : ABSENT');
    const classes = await describeRepeatedClasses(page);
    console.log(`    │ classes répétées : ${classes.join(', ') || '(aucune)'}`);
    // Sans état Next.js, il reste peut-être des données dans un autre script.
    const scripts = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll('script'))
          .map((s) => (s.textContent ?? '').slice(0, 60))
          .filter((t) => /list_id|"ads"|adverts|listing/i.test(t))
          .slice(0, 5),
      )
      .catch(() => []);
    console.log(`    │ scripts suspects : ${scripts.length}`);
  } else {
    console.log(`    │ __NEXT_DATA__ : ${(payload.length / 1024).toFixed(0)} Ko`);
    try {
      for (const line of describeJsonShape(JSON.parse(payload))) {
        console.log(`    │   ${line}`);
      }
    } catch {
      console.log('    │   (JSON illisible)');
    }
  }
  console.log('    └─');
}

async function extractFromNextData(page: Page): Promise<LbcAd[]> {
  const payload = await page
    .evaluate(() => {
      const el = document.querySelector('#__NEXT_DATA__');
      return el?.textContent ?? null;
    })
    .catch(() => null);

  if (!payload) return [];
  try {
    return deepCollect<LbcAd>(JSON.parse(payload), looksLikeAd);
  } catch {
    return [];
  }
}

function toRawListing(ad: LbcAd): RawListing | null {
  const sourceId = ad.list_id != null ? String(ad.list_id) : null;
  const title = typeof ad.subject === 'string' ? ad.subject.trim() : null;
  if (!sourceId || !title) return null;

  const priceEur = Array.isArray(ad.price)
    ? (ad.price[0] ?? null)
    : typeof ad.price === 'number'
      ? ad.price
      : parsePriceEur(String(ad.price ?? ''));

  const images = ad.images?.urls_large ?? ad.images?.urls ?? [];
  const zip = ad.location?.zipcode ?? null;
  const city = ad.location?.city ?? null;

  // Les attributs Leboncoin contiennent parfois directement la longueur.
  const attributes = Object.fromEntries(
    (ad.attributes ?? [])
      .filter((a) => a.key)
      .map((a) => [a.key as string, a.value_label ?? a.value ?? '']),
  );

  return {
    source: SOURCE,
    sourceId,
    url: ad.url ? (ad.url.startsWith('http') ? ad.url : `${BASE}${ad.url}`) : `${BASE}/ad/${sourceId}.htm`,
    title,
    description: typeof ad.body === 'string' ? ad.body : null,
    priceEur: typeof priceEur === 'number' && priceEur > 0 ? priceEur : null,
    locationLabel: city && zip ? `${city} (${zip.slice(0, 2)})` : (city ?? null),
    postalCode: zip ?? parsePostalCode(city),
    images: Array.isArray(images) ? images.filter((u): u is string => typeof u === 'string') : [],
    publishedAt: ad.first_publication_date ? toIso(ad.first_publication_date) : null,
    sellerType: ad.owner?.type === 'pro' ? 'pro' : ad.owner?.type === 'private' ? 'particulier' : null,
    raw: { attributes, owner: ad.owner ?? null, location: ad.location ?? null },
  };
}

/** Leboncoin renvoie "2026-03-14 09:12:05" — sans fuseau. On suppose Paris. */
function toIso(value: string): string | null {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}+01:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
