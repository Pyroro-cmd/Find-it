import * as cheerio from 'cheerio';
import { chromium, type Browser } from 'playwright';

/**
 * Sonde ciblée — dernière étape avant l'écriture des parseurs.
 *
 * Les sondes précédentes ont identifié les deux sources exploitables
 * (boat24 et theyachtmarket) et la structure de leurs cartes. Il reste à
 * connaître leurs formulaires de recherche : sans les noms de paramètres,
 * impossible de demander « voiliers de plus de 10 m à moins de 20 000 € »
 * et il faudrait parcourir des milliers d'annonces pour les filtrer après
 * coup.
 *
 *   npm run probe:deep
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

type Target = { name: string; url: string; via: 'fetch' | 'chromium'; cardClass: string };

const TARGETS: Target[] = [
  { name: 'boat24', url: 'https://www.boat24.com/fr/voiliers/', via: 'chromium', cardClass: 'blurb' },
  {
    name: 'theyachtmarket',
    url: 'https://www.theyachtmarket.com/fr/bateaux-a-vendre/',
    via: 'chromium',
    cardClass: 'info-col',
  },
];

async function main(): Promise<void> {
  console.log('\n=== Sonde ciblée : formulaires et contenu des cartes ===\n');

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });

    for (const target of TARGETS) {
      console.log(`\n${'═'.repeat(70)}\n${target.name.toUpperCase()}\n${'═'.repeat(70)}`);
      try {
        const html =
          target.via === 'chromium' ? await getViaChromium(browser, target.url) : await getViaFetch(target.url);
        analyse(html, target);
      } catch (error) {
        console.log(`  ÉCHEC : ${error instanceof Error ? error.message.slice(0, 150) : error}`);
      }
    }

    // Vérifie la réversibilité de l'obfuscation des liens boat24 : les cartes
    // portent un data-link en base64 dont le contenu est chiffré en ROT13.
    console.log(`\n${'═'.repeat(70)}\nBOAT24 — décodage des liens\n${'═'.repeat(70)}`);
    const sample =
      'dWdnY2Y6Ly9qamoub2JuZzI0LnBiei9zZS9pYnZ5dnJlZi93cm5hYXJuaC93cm5hYXJuaC1maGEtYnFsZmZybC00OS9xcmdudnkvNzM0OTk5Lw==';
    console.log(`  base64 → ${Buffer.from(sample, 'base64').toString('utf-8')}`);
    console.log(`  + rot13 → ${rot13(Buffer.from(sample, 'base64').toString('utf-8'))}`);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function rot13(input: string): string {
  return input.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
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
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(2000);
    return await page.content();
  } finally {
    await context.close().catch(() => undefined);
  }
}

function analyse(html: string, target: Target): void {
  const $ = cheerio.load(html);

  // --- Formulaires de recherche -------------------------------------------
  console.log('\n  ── Formulaires');
  $('form').each((i, form) => {
    const $form = $(form);
    const action = $form.attr('action') ?? '(sans action)';
    const method = $form.attr('method') ?? 'get';
    const fields: string[] = [];

    $form.find('input,select').each((_, el) => {
      const $el = $(el);
      const name = $el.attr('name');
      if (!name) return;
      const type = $el.attr('type') ?? el.tagName;
      if (el.tagName === 'select') {
        const options = $el
          .find('option')
          .slice(0, 6)
          .map((_, o) => $(o).attr('value'))
          .get()
          .filter(Boolean)
          .join('|');
        fields.push(`${name}[select: ${options}]`);
      } else {
        fields.push(`${name}[${type}]`);
      }
    });

    if (fields.length > 0) {
      console.log(`  form#${i} ${method.toUpperCase()} ${action}`);
      console.log(`    ${fields.slice(0, 30).join(' ')}`);
    }
  });

  // --- Liens de pagination -------------------------------------------------
  const pagination = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (/[?&](page|p|seite|start|offset)=/i.test(href)) pagination.add(href.slice(0, 120));
  });
  console.log(`\n  ── Pagination : ${[...pagination].slice(0, 6).join('  ') || '(aucun lien paginé)'}`);

  // --- Contenu réel d'une carte -------------------------------------------
  console.log(`\n  ── Texte des cartes (.${target.cardClass})`);
  $(`[class~="${target.cardClass}"]`)
    .slice(0, 4)
    .each((i, el) => {
      const $card = $(el);
      const text = $card.text().replace(/\s+/g, ' ').trim().slice(0, 320);
      const title = $card.attr('title') ?? '';
      const dataLink = $card.attr('data-link') ?? '';
      console.log(`  [${i}] title="${title}"`);
      console.log(`      texte : ${text}`);
      if (dataLink) {
        console.log(`      lien  : ${rot13(Buffer.from(dataLink, 'base64').toString('utf-8'))}`);
      }
      const href = $card.find('a[href]').first().attr('href');
      if (href) console.log(`      href  : ${href}`);
      const img = $card.find('img').first().attr('src');
      if (img) console.log(`      image : ${img}`);
    });
}

main().catch((error) => {
  console.error('Sonde ciblée en échec :', error);
  process.exitCode = 1;
});
