import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

/**
 * Sonde de reconnaissance.
 *
 * L'environnement de développement n'a pas accès aux sites cibles ; GitHub
 * Actions, si. Ce script sert donc de « navigateur distant » : il teste une
 * liste de sites candidats et imprime dans les logs ce que chacun renvoie
 * réellement — code HTTP, titre, présence de données structurées, classes
 * répétées, liens ressemblant à des annonces.
 *
 * Objectif : arrêter de deviner les URL et les sélecteurs, et construire les
 * parseurs sur des faits.
 *
 *   npm run probe
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Sites d'annonces de bateaux à tester, avec quelques chemins plausibles. */
const CANDIDATES = [
  'https://www.annoncesdubateau.com/',
  'https://www.annoncesdubateau.com/annonces/voilier',
  'https://www.youboat.fr/',
  'https://www.youboat.fr/annonces-bateaux/voilier',
  'https://www.band-of-boats.com/',
  'https://www.band-of-boats.com/fr/annonces/voilier',
  'https://www.boat24.com/fr/',
  'https://www.boat24.com/fr/voiliers/',
  'https://www.topbateaux.com/',
  'https://www.cosasdebarcos.com/fr/',
  'https://www.scanboat.com/fr/',
  'https://www.rightboat.com/',
  'https://www.theyachtmarket.com/fr/',
  'https://www.boatshop24.com/',
  'https://www.yachtall.com/fr/',
  'https://www.bateaux.com/',
  'https://www.nauticalclassifieds.com/',
  'https://www.leboncoin.fr/recherche?category=50&text=voilier',
];

type Report = {
  url: string;
  method: 'fetch' | 'chromium';
  status: number | string;
  title: string;
  bytes: number;
  jsonLd: number;
  jsonLdTypes: string[];
  listingLinks: number;
  sampleLinks: string[];
  priceHits: number;
  repeatedClasses: string[];
  note?: string;
};

async function main(): Promise<void> {
  console.log('\n=== Sonde de reconnaissance ===\n');

  const reports: Report[] = [];

  for (const url of CANDIDATES) {
    const report = await probeWithFetch(url);
    reports.push(report);
    print(report);

    // Un site vide en HTML brut rend peut-être ses annonces en JavaScript :
    // on retente avec un vrai navigateur avant de le juger inutilisable.
    const looksEmpty =
      report.status === 200 && report.listingLinks < 5 && report.jsonLd === 0;
    if (looksEmpty || report.status === 403) {
      const viaBrowser = await probeWithChromium(url);
      reports.push(viaBrowser);
      print(viaBrowser);
    }

    await sleep(700);
  }

  console.log('\n=== Synthèse : sites exploitables ===\n');
  const usable = reports
    .filter((r) => r.status === 200 && (r.jsonLd > 0 || r.listingLinks >= 8))
    .sort((a, b) => b.listingLinks - a.listingLinks);

  if (usable.length === 0) {
    console.log('Aucun site exploitable trouvé. Élargir la liste des candidats.');
  }
  for (const r of usable) {
    console.log(
      `${r.url}\n  via ${r.method} · ${r.listingLinks} liens d'annonce · ` +
        `JSON-LD ${r.jsonLd} (${r.jsonLdTypes.join('/') || '—'}) · prix détectés ${r.priceHits}`,
    );
    console.log(`  exemples : ${r.sampleLinks.slice(0, 3).join(' | ') || '—'}`);
    console.log(`  classes  : ${r.repeatedClasses.slice(0, 8).join(', ') || '—'}\n`);
  }
}

async function probeWithFetch(url: string): Promise<Report> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    const html = await response.text();
    return { ...analyse(html, url), url, method: 'fetch', status: response.status };
  } catch (error) {
    return {
      url,
      method: 'fetch',
      status: 'ERREUR',
      title: '',
      bytes: 0,
      jsonLd: 0,
      jsonLdTypes: [],
      listingLinks: 0,
      sampleLinks: [],
      priceHits: 0,
      repeatedClasses: [],
      note: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeWithChromium(url: string): Promise<Report> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForTimeout(2500);
    const html = await page.content();
    return {
      ...analyse(html, url),
      url,
      method: 'chromium',
      status: response?.status() ?? 'sans réponse',
    };
  } catch (error) {
    return {
      url,
      method: 'chromium',
      status: 'ERREUR',
      title: '',
      bytes: 0,
      jsonLd: 0,
      jsonLdTypes: [],
      listingLinks: 0,
      sampleLinks: [],
      priceHits: 0,
      repeatedClasses: [],
      note: error instanceof Error ? error.message.slice(0, 120) : String(error),
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

const LISTING_LINK =
  /(annonce|bateau|voilier|boat|yacht|listing|occasion|inserat|barco)/i;

function analyse(html: string, baseUrl: string): Omit<Report, 'url' | 'method' | 'status'> {
  const $ = cheerio.load(html);

  const jsonLdTypes = new Set<string>();
  let jsonLd = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    jsonLd += 1;
    try {
      collectTypes(JSON.parse($(el).contents().text()), jsonLdTypes);
    } catch {
      // JSON-LD invalide : fréquent, sans conséquence ici
    }
  });

  const links = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (!LISTING_LINK.test(href)) return;
    try {
      links.add(new URL(href, baseUrl).toString());
    } catch {
      // href relatif exotique
    }
  });

  const counts = new Map<string, number>();
  $('[class]').each((_, el) => {
    for (const cls of ($(el).attr('class') ?? '').split(/\s+/)) {
      if (!cls || cls.length > 40) continue;
      counts.set(cls, (counts.get(cls) ?? 0) + 1);
    }
  });

  return {
    title: $('title').first().text().trim().slice(0, 70),
    bytes: html.length,
    jsonLd,
    jsonLdTypes: [...jsonLdTypes].slice(0, 8),
    listingLinks: links.size,
    sampleLinks: [...links].slice(0, 5),
    priceHits: (html.match(/\d[\d\s.,]{2,}\s*(?:€|EUR)/g) ?? []).length,
    repeatedClasses: [...counts.entries()]
      .filter(([, n]) => n >= 4 && n <= 200)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([cls, n]) => `${cls}(${n})`),
  };
}

function collectTypes(node: unknown, out: Set<string>, depth = 0): void {
  if (depth > 8 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out, depth + 1);
    return;
  }
  const record = node as Record<string, unknown>;
  const type = record['@type'];
  if (typeof type === 'string') out.add(type);
  else if (Array.isArray(type)) for (const t of type) if (typeof t === 'string') out.add(t);
  for (const value of Object.values(record)) collectTypes(value, out, depth + 1);
}

function print(r: Report): void {
  const head = `[${String(r.status).padEnd(7)}] ${r.method.padEnd(8)} ${r.url}`;
  console.log(head);
  if (r.note) console.log(`           ! ${r.note}`);
  if (r.status === 200) {
    console.log(
      `           « ${r.title} » · ${(r.bytes / 1024).toFixed(0)} Ko · ` +
        `${r.listingLinks} liens · JSON-LD ${r.jsonLd} [${r.jsonLdTypes.join(',')}] · ${r.priceHits} prix`,
    );
    if (r.sampleLinks.length) console.log(`           → ${r.sampleLinks[0]}`);
    if (r.repeatedClasses.length) {
      console.log(`           classes : ${r.repeatedClasses.slice(0, 8).join(' ')}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('Sonde en échec :', error);
  process.exitCode = 1;
});
