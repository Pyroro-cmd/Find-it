import * as cheerio from 'cheerio';
import type { RawListing, Source, SourceResult } from '../types.js';
import { parsePostalCode, parsePriceEur } from '../util/text.js';

/**
 * Sites spécialisés bateau (Youboat, Bateaux-Occasion…).
 *
 * Ils apportent tout de suite du volume pertinent, sans anti-bot, pendant que
 * Leboncoin se fiabilise. Comme leur HTML n'a pas pu être inspecté en amont,
 * l'extraction est écrite en cascade, du plus stable au plus fragile :
 *
 *   1. JSON-LD schema.org (`Product` / `Offer` / `ItemList`) — la plupart des
 *      sites d'annonces en émettent pour le référencement, et c'est un format
 *      normalisé qui bouge beaucoup moins que le HTML ;
 *   2. balises Open Graph / microdata ;
 *   3. sélecteurs CSS candidats, essayés dans l'ordre.
 *
 * Si aucune voie ne donne de résultat, la source signale l'échec sans faire
 * tomber la collecte des autres.
 */

type SiteConfig = {
  name: string;
  baseUrl: string;
  /** Pages de résultats à parcourir. `{page}` est remplacé par le numéro. */
  searchUrls: string[];
  maxPages: number;
  /** Sélecteurs candidats, essayés dans l'ordre jusqu'à ce que l'un rende des noeuds. */
  selectors: {
    card: string[];
    link: string[];
    title: string[];
    price: string[];
    location: string[];
    image: string[];
  };
};

const SITES: SiteConfig[] = [
  {
    name: 'youboat',
    baseUrl: 'https://www.youboat.fr',
    searchUrls: ['https://www.youboat.fr/annonces-bateaux-occasion/voilier?page={page}'],
    maxPages: 3,
    selectors: {
      card: ['article.annonce', '.listing-item', '.annonce-item', '[class*="AdCard"]', 'article'],
      link: ['a[href*="/annonce"]', 'a[href*="/bateau"]', 'a'],
      title: ['h2', 'h3', '[class*="title"]', '.titre'],
      price: ['[class*="price"]', '[class*="prix"]', '.tarif'],
      location: ['[class*="location"]', '[class*="lieu"]', '[class*="ville"]'],
      image: ['img'],
    },
  },
  {
    name: 'bateaux-occasion',
    baseUrl: 'https://www.bateaux-occasion.com',
    searchUrls: ['https://www.bateaux-occasion.com/voilier?page={page}'],
    maxPages: 3,
    selectors: {
      card: ['.annonce', '.listing', 'article', '[class*="result"]'],
      link: ['a[href*="/annonce"]', 'a[href*="/voilier"]', 'a'],
      title: ['h2', 'h3', '[class*="title"]', '[class*="titre"]'],
      price: ['[class*="price"]', '[class*="prix"]'],
      location: ['[class*="location"]', '[class*="lieu"]', '[class*="ville"]'],
      image: ['img'],
    },
  },
];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class SpecializedSitesSource implements Source {
  readonly name = 'specialized';

  isEnabled(): boolean {
    return process.env.FINDIT_DISABLE_SPECIALIZED !== '1';
  }

  async collect(): Promise<SourceResult> {
    const listings: RawListing[] = [];
    const errors: string[] = [];
    let reachable = false;

    for (const site of SITES) {
      for (const template of site.searchUrls) {
        for (let pageNum = 1; pageNum <= site.maxPages; pageNum++) {
          const url = template.replace('{page}', String(pageNum));
          try {
            const html = await fetchHtml(url);
            reachable = true;

            const found = parseSearchPage(html, site);
            if (found.length === 0) {
              if (pageNum === 1) {
                errors.push(
                  `${site.name} : aucune annonce extraite de ${url} — sélecteurs à recalibrer`,
                );
              }
              break;
            }
            listings.push(...found);
            await sleep(1200 + Math.random() * 1500); // on reste poli
          } catch (error) {
            errors.push(`${site.name} p${pageNum} : ${message(error)}`);
            break;
          }
        }
      }
    }

    return { source: this.name, listings: dedupe(listings), errors, reachable };
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseSearchPage(html: string, site: SiteConfig): RawListing[] {
  const $ = cheerio.load(html);

  const fromJsonLd = parseJsonLd($, site);
  if (fromJsonLd.length > 0) return fromJsonLd;

  const fromSelectors = parseWithSelectors($, site);
  if (fromSelectors.length === 0) logPageDiagnostics($, site, html);
  return fromSelectors;
}

/**
 * Décrit la page quand aucune voie n'a rien donné.
 *
 * Le HTML de ces sites n'a pas pu être inspecté pendant le développement ;
 * ce résumé, imprimé dans les logs, indique quelles classes sont répétées
 * (donc probablement celles des cartes d'annonce) sans avoir à télécharger
 * l'archive HTML.
 */
function logPageDiagnostics($: cheerio.CheerioAPI, site: SiteConfig, html: string): void {
  const counts = new Map<string, number>();
  $('[class]').each((_, el) => {
    for (const cls of ($(el).attr('class') ?? '').split(/\s+/)) {
      if (!cls || cls.length > 40) continue;
      counts.set(cls, (counts.get(cls) ?? 0) + 1);
    }
  });

  const repeated = [...counts.entries()]
    .filter(([, n]) => n >= 4 && n <= 200)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([cls, n]) => `${cls} (${n}×)`);

  const jsonLd = $('script[type="application/ld+json"]').length;
  const links = $('a[href]').length;

  console.log(`    ┌─ diagnostic ${site.name}`);
  console.log(`    │ taille HTML   : ${(html.length / 1024).toFixed(0)} Ko`);
  console.log(`    │ titre         : ${$('title').first().text().trim().slice(0, 80)}`);
  console.log(`    │ scripts JSON-LD : ${jsonLd} · liens : ${links}`);
  console.log(`    │ classes répétées : ${repeated.join(', ') || '(aucune)'}`);
  console.log('    └─');
}

/** Voie n°1 : données structurées schema.org. */
function parseJsonLd($: cheerio.CheerioAPI, site: SiteConfig): RawListing[] {
  const listings: RawListing[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    for (const product of collectProducts(parsed)) {
      const listing = productToListing(product, site);
      if (listing) listings.push(listing);
    }
  });

  return listings;
}

type JsonLdProduct = {
  '@type'?: string | string[];
  name?: string;
  description?: string;
  url?: string;
  sku?: string;
  productID?: string;
  image?: string | string[] | { url?: string };
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    availableAtOrFrom?: { address?: { postalCode?: string; addressLocality?: string } };
  };
};

function collectProducts(node: unknown, depth = 0): JsonLdProduct[] {
  if (depth > 8 || node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => collectProducts(n, depth + 1));

  const record = node as Record<string, unknown>;
  const types = ([] as string[]).concat((record['@type'] as string | string[]) ?? []);
  const isProduct = types.some((t) => /^(Product|Vehicle|Boat|Offer|IndividualProduct)$/i.test(t));

  if (isProduct && typeof record.name === 'string') return [record as JsonLdProduct];

  return Object.values(record).flatMap((v) => collectProducts(v, depth + 1));
}

function productToListing(product: JsonLdProduct, site: SiteConfig): RawListing | null {
  const title = product.name?.trim();
  const url = absolute(product.url ?? '', site.baseUrl);
  if (!title || !url) return null;

  const images = Array.isArray(product.image)
    ? product.image
    : typeof product.image === 'string'
      ? [product.image]
      : product.image?.url
        ? [product.image.url]
        : [];

  const address = product.offers?.availableAtOrFrom?.address;
  const locality = address?.addressLocality ?? null;
  const postalCode = address?.postalCode ?? null;

  return {
    source: site.name,
    sourceId: product.sku ?? product.productID ?? idFromUrl(url),
    url,
    title,
    description: product.description?.trim() ?? null,
    priceEur: parsePriceEur(String(product.offers?.price ?? '')),
    locationLabel: locality,
    postalCode: postalCode ?? parsePostalCode(locality),
    images: images.map((i) => absolute(i, site.baseUrl)).filter(Boolean),
    publishedAt: null,
    sellerType: 'pro', // les sites spécialisés sont majoritairement professionnels
    raw: { via: 'json-ld' },
  };
}

/** Voie n°2 : sélecteurs CSS candidats. */
function parseWithSelectors($: cheerio.CheerioAPI, site: SiteConfig): RawListing[] {
  const cards = firstMatching($, site.selectors.card);
  if (!cards || cards.length === 0) return [];

  const listings: RawListing[] = [];

  cards.each((_, el) => {
    const card = $(el);
    const href = pickAttr(card, site.selectors.link, 'href');
    const title = pickText(card, site.selectors.title);
    if (!href || !title) return;

    const url = absolute(href, site.baseUrl);
    if (!url) return;

    const locationLabel = pickText(card, site.selectors.location);

    listings.push({
      source: site.name,
      sourceId: idFromUrl(url),
      url,
      title,
      description: null,
      priceEur: parsePriceEur(pickText(card, site.selectors.price)),
      locationLabel,
      postalCode: parsePostalCode(locationLabel),
      images: [pickAttr(card, site.selectors.image, 'src') ?? pickAttr(card, site.selectors.image, 'data-src')]
        .filter((v): v is string => Boolean(v))
        .map((v) => absolute(v, site.baseUrl))
        .filter(Boolean),
      publishedAt: null,
      sellerType: 'pro',
      raw: { via: 'css' },
    });
  });

  return listings;
}

function firstMatching($: cheerio.CheerioAPI, selectors: string[]): cheerio.Cheerio<never> | null {
  for (const selector of selectors) {
    const found = $(selector);
    // Un seul noeud signale plutôt un conteneur qu'une liste d'annonces.
    if (found.length > 1) return found as unknown as cheerio.Cheerio<never>;
  }
  return null;
}

function pickText(scope: cheerio.Cheerio<never>, selectors: string[]): string {
  for (const selector of selectors) {
    const text = scope.find(selector).first().text().trim();
    if (text) return text;
  }
  return '';
}

function pickAttr(scope: cheerio.Cheerio<never>, selectors: string[], attr: string): string | null {
  for (const selector of selectors) {
    const value = scope.find(selector).first().attr(attr);
    if (value) return value;
  }
  return null;
}

function absolute(url: string, base: string): string {
  if (!url) return '';
  try {
    return new URL(url, base).toString();
  } catch {
    return '';
  }
}

function idFromUrl(url: string): string {
  const numeric = url.match(/(\d{4,})/);
  if (numeric) return numeric[1];
  return url.split('/').filter(Boolean).slice(-1)[0] ?? url;
}

function dedupe(listings: RawListing[]): RawListing[] {
  const seen = new Map<string, RawListing>();
  for (const listing of listings) {
    const key = `${listing.source}:${listing.sourceId}`;
    if (!seen.has(key)) seen.set(key, listing);
  }
  return [...seen.values()];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
