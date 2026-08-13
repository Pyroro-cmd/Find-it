import type { Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { RawListing, Source, SourceResult } from '../types.js';
import { dumpPage, launchBrowser } from '../util/browser.js';
import { parcourirPages } from '../util/parcours.js';
import { marquesARetenir } from './marques.js';

/**
 * boat24.com — première source du projet.
 *
 * Retenue après sondage : c'est le seul grand site d'annonces joignable depuis
 * une machine automatisée qui annonce plus de 4 000 voiliers, en français, avec
 * les caractéristiques dans un format exploitable.
 *
 * Chaque carte porte son contenu en clair dans son texte :
 *
 *   Yacht à voile · Jeanneau Sun Odyssey 49 · 14,73 x 4,49 m · Dimensions
 *   1 x 75 cv / 55 kW · 2005 Année de fabrication · France » Martigues · 149 000 €
 *
 * Longueur, année, pays et prix sont donc DONNÉS, pas devinés — ce qui rend le
 * filtre « plus de 10 mètres » exact plutôt que probabiliste.
 *
 * Seule subtilité : les liens sont obfusqués. L'attribut `data-link` contient
 * du base64 dont le contenu est chiffré en ROT13. C'est réversible et vérifié.
 */

const SOURCE = 'boat24';
const BASE = 'https://www.boat24.com';
const LISTING_URL = `${BASE}/fr/voiliers/`;

/**
 * Pages de marque parcourues en plus de la rubrique générale.
 *
 * La pagination par paramètre est refusée (`?page=2` répond 403), mais les
 * pages par marque sont des chemins ordinaires et visent bien mieux :
 * `/fr/voiliers/jeanneau/` a rendu vingt-quatre annonces dont six dans le
 * budget, dès 16 000 €, quand la rubrique générale n'en donnait qu'une.
 */
const MAX_MARQUES = Number(process.env.B24_MAX_MARQUES ?? 12);
/** Marge volontaire au-dessus du budget : une annonce se négocie. */
const MAX_PRICE = Number(process.env.B24_MAX_PRICE ?? 30000);
const MIN_LENGTH_M = Number(process.env.B24_MIN_LENGTH ?? 8);

export class Boat24Source implements Source {
  readonly name = SOURCE;

  isEnabled(): boolean {
    return process.env.FINDIT_DISABLE_BOAT24 !== '1';
  }

  async collect(): Promise<SourceResult> {
    const errors: string[] = [];
    const byId = new Map<string, RawListing>();
    let reachable = false;
    let cartesTotal = 0;
    let refus = 0;

    const urls = [LISTING_URL, ...marquesARetenir(MAX_MARQUES).map((m) => `${LISTING_URL}${m}/`)];

    let browser: Browser | undefined;
    try {
      browser = await launchBrowser();

      const visites = await parcourirPages(browser, urls, async (page, url) => {
        await page.waitForTimeout(2500);
        // Les cartes se chargent en différé au défilement.
        for (let i = 0; i < 3; i++) {
          await page.mouse.wheel(0, 4000);
          await page.waitForTimeout(700);
        }
        if (url === LISTING_URL) await dumpPage(page, 'boat24');
        return parsePage(await page.content());
      });

      for (const visite of visites) {
        if (visite.statut >= 400 || !visite.resultat) {
          refus += 1;
          continue;
        }
        reachable = true;
        cartesTotal += visite.resultat.cardsSeen;
        for (const listing of visite.resultat.listings) {
          if (!byId.has(listing.sourceId)) byId.set(listing.sourceId, listing);
        }
      }

      console.log(
        `    boat24 : ${visites.length - refus}/${visites.length} pages lues, ` +
          `${cartesTotal} cartes, ${byId.size} annonces retenues`,
      );

      if (!reachable) errors.push('aucune page accessible');
      else if (refus > 0) console.log(`    boat24 : ${refus} page(s) refusée(s), sans gravité`);

      return { source: SOURCE, listings: [...byId.values()], errors, reachable };
    } catch (error) {
      errors.push(`échec général : ${message(error)}`);
      return { source: SOURCE, listings: [...byId.values()], errors, reachable };
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
}

/** Décode un `data-link` : base64, puis ROT13. */
export function decodeBoat24Link(encoded: string): string | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const url = rot13(decoded);
    return url.startsWith('http') ? url : null;
  } catch {
    return null;
  }
}

function rot13(input: string): string {
  return input.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export type PageParse = {
  listings: RawListing[];
  /** Cartes trouvées avant filtrage — distingue « sélecteur périmé » de « rien dans le budget ». */
  cardsSeen: number;
};

export function parseListingPage(html: string): RawListing[] {
  return parsePage(html).listings;
}

export function parsePage(html: string): PageParse {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  let cardsSeen = 0;

  // Une carte est un `blurb` qui porte le lien : le site réutilise la classe
  // `blurb` pour des blocs décoratifs, mais eux n'ont pas de `data-link`.
  $('[class~="blurb"][data-link]').each((_, el) => {
    cardsSeen += 1;
    const listing = parseCard($, el);
    if (listing) listings.push(listing);
  });

  return { listings, cardsSeen };
}

function parseCard($: cheerio.CheerioAPI, el: Element): RawListing | null {
  const $card = $(el);

  const title = ($card.attr('title') ?? '').trim();
  if (!title) return null;

  const encoded = $card.attr('data-link');
  const url = encoded ? decodeBoat24Link(encoded) : ($card.find('a[href]').first().attr('href') ?? null);
  if (!url) return null;

  const sourceId = url.match(/\/detail\/(\d+)/)?.[1] ?? url;

  const text = $card.text().replace(/\s+/g, ' ').trim();
  const fields = parseCardText(text);

  // Filtrage à la source : inutile de transporter des yachts à 900 000 €
  // jusqu'au fichier de données.
  if (fields.priceEur != null && fields.priceEur > MAX_PRICE) return null;
  if (fields.lengthM != null && fields.lengthM < MIN_LENGTH_M) return null;

  const images = $card
    .find('img')
    .map((_, img) => $(img).attr('src') ?? '')
    .get()
    .filter((src) => src.startsWith('http'));

  return {
    source: SOURCE,
    sourceId,
    url,
    title,
    description: fields.boatType ? `${fields.boatType}. ${text.slice(0, 400)}` : text.slice(0, 400),
    priceEur: fields.priceEur,
    locationLabel: fields.location,
    postalCode: null,
    images: [...new Set(images)].slice(0, 6),
    publishedAt: null,
    sellerType: null,
    known: {
      lengthM: fields.lengthM,
      yearBuilt: fields.yearBuilt,
      boatKind: 'voilier', // toutes ces pages sont la rubrique « voiliers »
      hullType: fields.hullType,
      country: fields.country,
    },
    raw: { boatType: fields.boatType, cardText: text.slice(0, 500) },
  };
}

export type Boat24Fields = {
  lengthM: number | null;
  beamM: number | null;
  yearBuilt: number | null;
  priceEur: number | null;
  location: string | null;
  country: string | null;
  boatType: string | null;
  hullType: 'monocoque' | 'catamaran' | 'trimaran' | null;
};

/**
 * Lit les caractéristiques dans le texte de la carte.
 *
 * On s'appuie sur les libellés français plutôt que sur des classes CSS :
 * un site refond son habillage bien plus souvent que le mot
 * « Année de fabrication ».
 */
export function parseCardText(text: string): Boat24Fields {
  // « 14,73 x 4,49 m » — longueur puis largeur.
  //
  // Le « m » est souvent collé au libellé suivant (« 4,49 mDimensions ») : un
  // `\b` classique échouerait puisque « m » et « D » sont tous deux des
  // caractères de mot. On exige donc seulement que le « m » ne soit pas le
  // début d'un mot en minuscules (« metres », « mm ») ni suivi d'un chiffre.
  const dims = text.match(/(\d{1,2},\d{1,2})\s*x\s*(\d{1,2},\d{1,2})\s*m(?![a-z0-9²])/);
  const lengthM = dims ? Number(dims[1].replace(',', '.')) : null;
  const beamM = dims ? Number(dims[2].replace(',', '.')) : null;

  // « 2005Année de fabrication »
  const year = text.match(/(\d{4})\s*Année de fabrication/);
  const yearBuilt = year ? Number(year[1]) : null;

  // « France » Martigues149 000 € » — le lieu précède immédiatement le prix.
  const tail = text.match(/Année de fabrication\s*(.+?)([\d][\d\s]{2,})\s*€/);
  const location = tail ? tail[1].replace(/\s+/g, ' ').trim() : null;
  const priceEur = tail ? Number(tail[2].replace(/\s/g, '')) : parseLoosePrice(text);

  const country = location ? (location.split('»')[0]?.trim() ?? null) : null;

  const typeMatch = text.match(
    /(Yacht à voile|Daysailer[^0-9]{0,40}|Voilier de régate|Catamaran[^0-9]{0,20}|Trimaran[^0-9]{0,20}|Multicoque[^0-9]{0,20})/,
  );
  const boatType = typeMatch ? typeMatch[1].trim().replace(/[,\s]+$/, '') : null;

  const lower = text.toLowerCase();
  const hullType = lower.includes('trimaran')
    ? 'trimaran'
    : lower.includes('catamaran') || lower.includes('multicoque')
      ? 'catamaran'
      : 'monocoque';

  return {
    lengthM: plausibleLength(lengthM),
    beamM,
    yearBuilt: yearBuilt && yearBuilt >= 1900 ? yearBuilt : null,
    priceEur: priceEur && priceEur > 0 ? priceEur : null,
    location,
    country,
    boatType,
    hullType,
  };
}

function parseLoosePrice(text: string): number | null {
  const m = text.match(/([\d][\d\s]{2,})\s*€/);
  if (!m) return null;
  const value = Number(m[1].replace(/\s/g, ''));
  return Number.isFinite(value) ? value : null;
}

function plausibleLength(value: number | null): number | null {
  if (value == null) return null;
  return value >= 3 && value <= 40 ? value : null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
