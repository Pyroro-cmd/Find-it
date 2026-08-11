import type { Browser } from 'playwright';
import type { RawListing, Source, SourceResult } from '../types.js';
import { deepCollect, dumpPage, humanDelay, launchBrowser, newContext } from '../util/browser.js';
import { parsePostalCode } from '../util/text.js';

/**
 * Facebook Marketplace — DÉSACTIVÉ PAR DÉFAUT.
 *
 * ┌─ À lire avant d'activer ────────────────────────────────────────────────┐
 * │ Marketplace n'expose pas d'API publique et exige une session connectée  │
 * │ pour afficher la plupart des annonces. Automatiser une navigation avec  │
 * │ un compte viole les conditions d'utilisation de Meta et expose ce       │
 * │ compte à une suspension. N'utilisez JAMAIS votre compte principal :     │
 * │ créez un compte secondaire dédié, et acceptez qu'il puisse être perdu.  │
 * │                                                                         │
 * │ Aucun identifiant ne doit figurer dans ce dépôt. La session se fournit  │
 * │ via FB_STORAGE_STATE_JSON (secret GitHub), au format storageState de    │
 * │ Playwright — voir le README, section « Facebook (phase 2) ».            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Activation : FINDIT_ENABLE_FACEBOOK=1 + une session valide.
 */

const SOURCE = 'facebook';
const BASE = 'https://www.facebook.com';

const CITY = process.env.FB_CITY ?? 'paris';
const RADIUS_KM = Number(process.env.FB_RADIUS_KM ?? 500);
const MAX_PRICE = Number(process.env.FB_MAX_PRICE ?? 25000);
const QUERIES = (process.env.FB_QUERIES ?? 'voilier,bateau voilier,sailboat').split(',');
const SCROLL_ROUNDS = Number(process.env.FB_SCROLL_ROUNDS ?? 6);

type FbListing = {
  id?: string;
  listing_title?: string;
  marketplace_listing_title?: string;
  listing_price?: { amount?: string; formatted_amount?: string };
  primary_listing_photo?: { image?: { uri?: string } };
  listing_photos?: Array<{ image?: { uri?: string } }>;
  location?: { reverse_geocode?: { city?: string; state?: string; city_page?: { display_name?: string } } };
  custom_title?: string;
  creation_time?: number;
};

function looksLikeListing(node: Record<string, unknown>): boolean {
  const hasTitle =
    typeof node.marketplace_listing_title === 'string' || typeof node.listing_title === 'string';
  return hasTitle && typeof node.id === 'string';
}

export class FacebookSource implements Source {
  readonly name = SOURCE;

  isEnabled(): boolean {
    if (process.env.FINDIT_ENABLE_FACEBOOK !== '1') return false;
    if (!process.env.FB_STORAGE_STATE_JSON && !process.env.FB_STORAGE_STATE) {
      console.warn('[facebook] activé mais aucune session fournie — source ignorée');
      return false;
    }
    return true;
  }

  async collect(): Promise<SourceResult> {
    const errors: string[] = [];
    const byId = new Map<string, RawListing>();
    let reachable = false;

    let browser: Browser | undefined;
    try {
      const statePath = await materializeStorageState();
      browser = await launchBrowser();
      const context = await newContext(browser, statePath);
      const page = await context.newPage();

      const intercepted: FbListing[] = [];
      page.on('response', async (response) => {
        if (!/facebook\.com\/api\/graphql/i.test(response.url())) return;
        try {
          const text = await response.text();
          // GraphQL renvoie parfois plusieurs objets JSON concaténés.
          for (const chunk of text.split('\n')) {
            if (!chunk.trim().startsWith('{')) continue;
            try {
              intercepted.push(...deepCollect<FbListing>(JSON.parse(chunk), looksLikeListing));
            } catch {
              // fragment incomplet : ignoré
            }
          }
        } catch {
          // corps déjà consommé : sans conséquence
        }
      });

      for (const query of QUERIES) {
        const url = buildSearchUrl(query.trim());
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          await page.waitForTimeout(2500);

          if (page.url().includes('/login')) {
            await dumpPage(page, 'facebook-login');
            errors.push('session expirée — régénérez FB_STORAGE_STATE_JSON');
            break;
          }

          reachable = true;

          // Marketplace charge en défilement infini : sans scroll, on ne voit
          // qu'une poignée d'annonces.
          for (let i = 0; i < SCROLL_ROUNDS; i++) {
            await page.mouse.wheel(0, 2000);
            await humanDelay(1200, 2600);
          }

          await dumpPage(page, `facebook-${query.trim().replace(/\s+/g, '-')}`);
        } catch (error) {
          errors.push(`${query} : ${message(error)}`);
        }
      }

      for (const item of intercepted) {
        const listing = toRawListing(item);
        if (listing && !byId.has(listing.sourceId)) byId.set(listing.sourceId, listing);
      }

      if (reachable && byId.size === 0) {
        errors.push(
          'aucune annonce extraite — la structure GraphQL a probablement changé (voir les artefacts de debug)',
        );
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

function buildSearchUrl(query: string): string {
  const params = new URLSearchParams({
    query,
    maxPrice: String(MAX_PRICE),
    radius: String(RADIUS_KM),
    sortBy: 'creation_time_descend',
  });
  return `${BASE}/marketplace/${CITY}/search?${params.toString()}`;
}

/**
 * La session arrive en variable d'environnement (secret GitHub) et n'est
 * écrite sur disque que le temps du run, jamais commitée.
 */
async function materializeStorageState(): Promise<string | undefined> {
  if (process.env.FB_STORAGE_STATE) return process.env.FB_STORAGE_STATE;
  const json = process.env.FB_STORAGE_STATE_JSON;
  if (!json) return undefined;

  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const file = path.join(os.tmpdir(), `findit-fb-state-${process.pid}.json`);
  await fs.writeFile(file, json, { mode: 0o600 });
  return file;
}

function toRawListing(item: FbListing): RawListing | null {
  const sourceId = item.id;
  const title = (item.marketplace_listing_title ?? item.listing_title ?? item.custom_title)?.trim();
  if (!sourceId || !title) return null;

  const amount = item.listing_price?.amount;
  const priceEur = amount ? Number(amount) : null;

  const city =
    item.location?.reverse_geocode?.city_page?.display_name ??
    item.location?.reverse_geocode?.city ??
    null;

  const images = [
    item.primary_listing_photo?.image?.uri,
    ...(item.listing_photos ?? []).map((p) => p.image?.uri),
  ].filter((u): u is string => typeof u === 'string');

  return {
    source: SOURCE,
    sourceId,
    url: `${BASE}/marketplace/item/${sourceId}/`,
    title,
    // Marketplace n'expose pas la description dans les résultats de recherche ;
    // il faudrait ouvrir chaque annonce, ce qui multiplie le risque de blocage.
    description: null,
    priceEur: Number.isFinite(priceEur) && (priceEur ?? 0) > 0 ? priceEur : null,
    locationLabel: city,
    postalCode: parsePostalCode(city),
    images,
    publishedAt: item.creation_time ? new Date(item.creation_time * 1000).toISOString() : null,
    sellerType: null,
    raw: { via: 'graphql' },
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
