import * as cheerio from 'cheerio';
import { chromium, type Browser } from 'playwright';

/**
 * Sonde approfondie.
 *
 * La première sonde a identifié les sites joignables ; celle-ci extrait de
 * leurs pages de résultats ce qu'il faut pour écrire les parseurs : blocs de
 * données structurées, forme des URL de détail, et HTML d'une carte d'annonce
 * réelle. Elle évite ainsi une troisième itération à l'aveugle.
 *
 *   npm run probe:deep
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

type Target = { name: string; url: string; via: 'fetch' | 'chromium' };

const TARGETS: Target[] = [
  { name: 'boat24', url: 'https://www.boat24.com/fr/voiliers/', via: 'chromium' },
  { name: 'scanboat', url: 'https://www.scanboat.com/fr/boat-market/boats', via: 'fetch' },
  { name: 'theyachtmarket', url: 'https://www.theyachtmarket.com/fr/bateaux-a-vendre/', via: 'chromium' },
  { name: 'yachtall', url: 'https://www.yachtall.com/fr/', via: 'chromium' },
  { name: 'rightboat', url: 'https://www.rightboat.com/boats-for-sale', via: 'fetch' },
];

async function main(): Promise<void> {
  console.log('\n=== Sonde approfondie ===\n');

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });

    for (const target of TARGETS) {
      console.log(`\n${'═'.repeat(70)}\n${target.name.toUpperCase()} — ${target.url}\n${'═'.repeat(70)}`);
      try {
        const html =
          target.via === 'chromium' ? await getViaChromium(browser, target.url) : await getViaFetch(target.url);
        analyse(html, target);
      } catch (error) {
        console.log(`  ÉCHEC : ${error instanceof Error ? error.message.slice(0, 150) : error}`);
      }
    }
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function getViaFetch(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function getViaChromium(browser: Browser, url: string): Promise<string> {
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 1200 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()}`);
    // Le contenu des sites d'annonces arrive souvent après le chargement initial,
    // et le défilement déclenche le chargement différé des cartes.
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(2000);
    return await page.content();
  } finally {
    await context.close().catch(() => undefined);
  }
}

const PRICE = /\d[\d\s .,]{2,}\s*(?:€|EUR|CHF|£)/;

function analyse(html: string, target: Target): void {
  const $ = cheerio.load(html);
  console.log(`  taille : ${(html.length / 1024).toFixed(0)} Ko`);

  // --- 1. Données structurées -------------------------------------------
  const blocks: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    blocks.push($(el).contents().text().trim());
  });
  console.log(`\n  ── JSON-LD : ${blocks.length} bloc(s)`);
  for (const [i, raw] of blocks.entries()) {
    try {
      const parsed = JSON.parse(raw);
      const flat = JSON.stringify(parsed);
      console.log(`  [${i}] ${flat.slice(0, 900)}${flat.length > 900 ? '…' : ''}`);
    } catch {
      console.log(`  [${i}] (illisible) ${raw.slice(0, 150)}`);
    }
  }

  // --- 2. Forme des URL de détail ---------------------------------------
  const paths = new Map<string, number>();
  const samples = new Map<string, string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    let url: URL;
    try {
      url = new URL(href, target.url);
    } catch {
      return;
    }
    // On généralise le chemin : les segments numériques ou longs deviennent
    // des jokers, ce qui fait ressortir le gabarit des pages de détail.
    const pattern = url.pathname
      .split('/')
      .map((seg) => (/^\d+$/.test(seg) ? '{id}' : seg.length > 25 ? '{slug}' : seg))
      .join('/');
    paths.set(pattern, (paths.get(pattern) ?? 0) + 1);
    if (!samples.has(pattern)) samples.set(pattern, url.toString());
  });

  console.log('\n  ── Gabarits d’URL les plus fréquents');
  for (const [pattern, count] of [...paths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${String(count).padStart(4)}× ${pattern}`);
    console.log(`        ex. ${samples.get(pattern)}`);
  }

  // --- 3. Cartes d'annonce ------------------------------------------------
  // Une carte contient un lien ET un prix. On cherche les plus petits
  // éléments satisfaisant les deux, puis la classe qu'ils partagent.
  const cardClasses = new Map<string, number>();
  $('*').each((_, el) => {
    const node = $(el);
    const cls = (node.attr('class') ?? '').trim();
    if (!cls) return;
    if (node.find('a[href]').length === 0) return;
    const text = node.text();
    if (!PRICE.test(text)) return;
    if (text.length > 800) return; // trop gros : c'est un conteneur, pas une carte
    for (const c of cls.split(/\s+/)) {
      if (c) cardClasses.set(c, (cardClasses.get(c) ?? 0) + 1);
    }
  });

  const ranked = [...cardClasses.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  console.log('\n  ── Classes candidates pour une carte (lien + prix)');
  if (ranked.length === 0) console.log('  (aucune — prix probablement chargé en JavaScript)');
  for (const [cls, n] of ranked) console.log(`  ${String(n).padStart(4)}× .${cls}`);

  // HTML d'une carte réelle : la matière première pour écrire les sélecteurs.
  const best = ranked[0]?.[0];
  if (best) {
    console.log(`\n  ── Exemple de carte (.${best})`);
    $(`[class~="${best}"]`)
      .slice(0, 2)
      .each((i, el) => {
        const outer = $.html(el).replace(/\s+/g, ' ').slice(0, 1400);
        console.log(`  --- carte ${i} ---\n  ${outer}`);
      });
  }
}

main().catch((error) => {
  console.error('Sonde approfondie en échec :', error);
  process.exitCode = 1;
});
