import type { Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { RawListing, Source, SourceResult } from '../types.js';
import { dumpPage, launchBrowser } from '../util/browser.js';
import { parcourirPages } from '../util/parcours.js';
import { marquesARetenir } from './marques.js';

/**
 * yachtall.com — source principale.
 *
 * Retenue après quatre sondes exécutées depuis GitHub Actions. Les autres
 * candidats se sont disqualifiés d'eux-mêmes : Leboncoin, annoncesbateau,
 * bateaux24 et youboat répondent 403 à la première requête, theyachtmarket
 * oppose un test Cloudflare, et boat24 refuse toute URL portant des
 * paramètres — donc tout filtrage.
 *
 * yachtall, lui, répond 200 et — c'est ce qui le distingue — **écrit tout en
 * clair et en français dans la carte de résultat** :
 *
 *   Sunrise Holländischer Deckshausyacht
 *   Voilier / yacht à voile: Sunrise, bateau d'occasion, bateau en acier
 *   Longueur x largeur: 18,88 m x 4,88 m, construit: 1998, cabines: 2
 *   Lieu: Monténégro, Bar / Tivat
 *   Prix: € 490 000, TVA incluse
 *
 * Longueur, année, lieu et prix sont donc lus sur des étiquettes, pas devinés.
 * C'est exactement ce qui manque à Leboncoin et qui fait tout l'intérêt du
 * projet : le critère « plus de 10 mètres » devient exact.
 *
 * **On ne pagine pas, on élargit.** Le `robots.txt` interdit les URL paginées :
 *
 *   Disallow: /en/boats/selling/*?   # paging or search form sent
 *
 * La pagination passe par des paramètres d'URL, précisément ceux que le site
 * demande aux robots d'éviter. En revanche les **pages par marque sont des
 * chemins ordinaires**, que le site sert volontiers et qui visent bien mieux :
 * `/fr/voiliers/jeanneau` a rendu quinze annonces dont trois dans le budget,
 * là où la page générale, saturée de yachts hors de prix, n'en donnait qu'une.
 *
 * Une contrainte mesurée gouverne le parcours : seule la **première requête
 * d'une session** aboutit, les suivantes reçoivent un 403, et espacer de douze
 * secondes n'y change rien. Chaque page est donc chargée dans un contexte
 * neuf — voir `util/parcours.ts`.
 */

const SOURCE = 'yachtall';
const BASE = 'https://www.yachtall.com';
const LISTING_URL = `${BASE}/fr/voiliers`;

/**
 * Pages de marque parcourues en plus de la page générale.
 *
 * Chacune coûte une session neuve et quelques secondes ; vingt suffisent à
 * couvrir le segment sans transformer la collecte en aspirateur.
 */
const MAX_MARQUES = Number(process.env.YA_MAX_MARQUES ?? 12);

/** Tours de défilement : la page charge ses vignettes en différé. */
const MAX_DEFILEMENTS = Number(process.env.YA_MAX_DEFILEMENTS ?? 20);
/** Marge volontaire au-dessus du budget : une annonce se négocie. */
const MAX_PRICE = Number(process.env.YA_MAX_PRICE ?? 30000);
const MIN_LENGTH_M = Number(process.env.YA_MIN_LENGTH ?? 8);

export class YachtallSource implements Source {
  readonly name = SOURCE;

  isEnabled(): boolean {
    return process.env.FINDIT_DISABLE_YACHTALL !== '1';
  }

  async collect(): Promise<SourceResult> {
    const errors: string[] = [];
    const parId = new Map<string, RawListing>();
    let reachable = false;
    let cartesTotal = 0;
    let refus = 0;

    // La page générale d'abord — ce sont les annonces les plus récentes —
    // puis les marques du segment recherché.
    const urls = [LISTING_URL, ...marquesARetenir(MAX_MARQUES).map((m) => `${LISTING_URL}/${m}`)];

    let browser: Browser | undefined;
    try {
      browser = await launchBrowser();

      const visites = await parcourirPages(browser, urls, async (page, url) => {
        await page.waitForTimeout(2000);
        await accepterCookies(page);
        await defilerJusquAuBout(page);
        if (url === LISTING_URL) await dumpPage(page, 'yachtall');
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
          if (!parId.has(listing.sourceId)) parId.set(listing.sourceId, listing);
        }
      }

      console.log(
        `    yachtall : ${visites.length - refus}/${visites.length} pages lues, ` +
          `${cartesTotal} cartes, ${parId.size} annonces retenues`,
      );

      if (!reachable) errors.push('aucune page accessible');
      else if (refus > 0) console.log(`    yachtall : ${refus} page(s) refusée(s), sans gravité`);

      return { source: SOURCE, listings: [...parId.values()], errors, reachable };
    } catch (error) {
      errors.push(`échec général : ${message(error)}`);
      return { source: SOURCE, listings: [...parId.values()], errors, reachable };
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
}

/**
 * Fait défiler jusqu'à ce que la page cesse de s'allonger.
 *
 * Les vignettes se chargent en différé, et le site peut ajouter des annonces
 * en bas de page. On s'arrête quand le nombre d'annonces n'augmente plus sur
 * trois tours, ce qui distingue « fin de liste » de « chargement un peu lent ».
 */
async function defilerJusquAuBout(page: Page): Promise<number> {
  let precedent = 0;
  let stagnations = 0;

  for (let tour = 0; tour < MAX_DEFILEMENTS; tour++) {
    const compte = await page.locator('[class~="boatlist-subbox"]').count().catch(() => 0);

    if (compte === precedent) {
      stagnations += 1;
      if (stagnations >= 3) return compte;
    } else {
      stagnations = 0;
      precedent = compte;
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
  }

  return precedent;
}

async function accepterCookies(page: Page): Promise<void> {
  for (const selector of [
    'button:has-text("Tout accepter")',
    'button:has-text("Accepter")',
    '#ccm--decline-cookies',
    '.ccm--save-settings',
  ]) {
    const bouton = page.locator(selector).first();
    if ((await bouton.count().catch(() => 0)) > 0) {
      await bouton.click({ timeout: 4000 }).catch(() => undefined);
      await page.waitForTimeout(1000);
      return;
    }
  }
}

export type PageParse = {
  listings: RawListing[];
  /** Cartes trouvées avant filtrage — distingue « sélecteur périmé » de « rien dans le budget ». */
  cardsSeen: number;
};

export function parsePage(html: string): PageParse {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  const vus = new Set<string>();
  let cardsSeen = 0;

  $('[class~="boatlist-subbox"]').each((_, el) => {
    cardsSeen += 1;
    const listing = parseCard($, el);
    if (listing && !vus.has(listing.sourceId)) {
      vus.add(listing.sourceId);
      listings.push(listing);
    }
  });

  return { listings, cardsSeen };
}

function parseCard($: cheerio.CheerioAPI, el: Element): RawListing | null {
  const $card = $(el);

  const $lien = $card.find('a[class~="js-hrefBoat"]').filter((_, a) => Boolean($(a).attr('href'))).first();
  const href = $lien.attr('href');
  if (!href) return null;

  // Le titre le plus complet est celui du h3 ; celui de la tuile est tronqué
  // par des points de suspension.
  const title =
    $card.find('h3 a[class~="js-hrefBoat"]').first().text().trim() || $lien.text().trim();
  if (!title) return null;

  const sourceId = href.match(/-s(\d+)/)?.[1] ?? href;
  const url = href.startsWith('http') ? href : `${BASE}${href}`;

  const fields = parseCardText($card.text());

  if (fields.boatKind === 'moteur') return null;
  if (fields.priceEur != null && fields.priceEur > MAX_PRICE) return null;
  if (fields.lengthM != null && fields.lengthM < MIN_LENGTH_M) return null;

  const images = $card
    .find('img')
    .map((_, img) => $(img).attr('src') ?? $(img).attr('data-src') ?? '')
    .get()
    .filter((src) => src.startsWith('http') && !src.includes('loading-wheel'));

  return {
    source: SOURCE,
    sourceId,
    url,
    title,
    description: fields.resume,
    priceEur: fields.priceEur,
    locationLabel: fields.location,
    postalCode: null,
    images: [...new Set(images)].slice(0, 6),
    publishedAt: null,
    sellerType: fields.seller ? 'pro' : null,
    known: {
      lengthM: fields.lengthM,
      yearBuilt: fields.yearBuilt,
      boatKind: fields.boatKind,
      hullType: fields.hullType,
      country: fields.country,
    },
    raw: { seller: fields.seller },
  };
}

export type YachtallFields = {
  lengthM: number | null;
  beamM: number | null;
  yearBuilt: number | null;
  priceEur: number | null;
  location: string | null;
  country: string | null;
  seller: string | null;
  boatKind: 'voilier' | 'moteur' | null;
  hullType: 'monocoque' | 'catamaran' | 'trimaran' | null;
  resume: string;
};

/**
 * Lit les caractéristiques d'une carte.
 *
 * On s'appuie sur les étiquettes françaises — « Longueur x largeur: »,
 * « construit: », « Lieu: », « Prix: » — plutôt que sur des classes CSS : un
 * site refond son habillage bien plus souvent que ses libellés.
 */
export function parseCardText(brut: string): YachtallFields {
  const texte = brut.replace(/\s+/g, ' ').trim();

  // « Longueur x largeur: 18,88 m x 4,88 m » — et, sur petit écran, la forme
  // condensée « 18,88 x 4,88 m ».
  const dims =
    texte.match(/Longueur x largeur:\s*([\d]{1,2},\d{1,2})\s*m\s*x\s*([\d]{1,2},\d{1,2})\s*m/i) ??
    texte.match(/\b([\d]{1,2},\d{1,2})\s*x\s*([\d]{1,2},\d{1,2})\s*m\b/);
  const lengthM = dims ? nombre(dims[1]) : null;
  const beamM = dims ? nombre(dims[2]) : null;

  // « construit: 1998 », mais aussi « construit: avant 1985 » et « env. 1990 ».
  const annee = texte.match(/construit:\s*(?:avant\s+|env\.?\s*|ca\.?\s*|~\s*)?(\d{4})/i);
  const yearBuilt = annee && Number(annee[1]) >= 1900 ? Number(annee[1]) : null;

  // « Lieu: Monténégro, Bar / Tivat » — le pays vient en premier.
  //
  // La capture doit s'arrêter à la mention suivante, y compris quand le site
  // place l'année après le lieu : sans cette borne, le premier run réel a
  // produit un pays « Pays-Bas avant 1985 ».
  const lieu = texte.match(/Lieu:\s*(.+?)\s*(?:Société:|Prix:|Moteur:|construit:|avant\s+\d{4}|$)/i);
  const location = lieu ? nettoyer(lieu[1]) : null;
  const country = location ? nettoyer(location.split(',')[0] ?? '') || null : null;

  const societe = texte.match(/Société:\s*(.+?)\s*(?:Prix:|Lieu:|$)/i);
  const seller = societe ? societe[1].trim() : null;

  // « Prix: € 490 000, TVA incluse ». Un prix dans une autre devise n'est pas
  // converti : mieux vaut ne rien afficher qu'un montant faux.
  const prix = texte.match(/Prix:\s*€\s*([\d][\d\s.]*)/i);
  const priceEur = prix ? entier(prix[1]) : null;

  const bas = texte.toLowerCase();
  const boatKind = /voilier|yacht à voile|à voile/.test(bas)
    ? 'voilier'
    : /bateau à moteur|yacht à moteur/.test(bas)
      ? 'moteur'
      : null;

  const hullType = bas.includes('trimaran')
    ? 'trimaran'
    : bas.includes('catamaran') || bas.includes('multicoque')
      ? 'catamaran'
      : 'monocoque';

  return {
    lengthM: longueurPlausible(lengthM),
    beamM,
    yearBuilt,
    priceEur,
    location,
    country,
    seller,
    boatKind,
    hullType,
    resume: texte.slice(0, 500),
  };
}

/** Retire la ponctuation de bord et les mentions d'année accrochées au lieu. */
function nettoyer(valeur: string): string {
  return valeur
    .replace(/\s*(?:avant|env\.?|ca\.?)\s*\d{4}.*$/i, '')
    .replace(/[,;/\s]+$/, '')
    .trim();
}

function nombre(valeur: string): number {
  return Number(valeur.replace(',', '.'));
}

function entier(valeur: string): number | null {
  const n = Number(valeur.replace(/[\s.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function longueurPlausible(valeur: number | null): number | null {
  if (valeur == null || !Number.isFinite(valeur)) return null;
  return valeur >= 3 && valeur <= 40 ? valeur : null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
