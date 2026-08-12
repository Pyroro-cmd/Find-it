import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Contexte navigateur partagé par les sources qui en ont besoin.
 *
 * Un vrai navigateur est nécessaire pour Leboncoin (protection anti-bot
 * DataDome) : un simple `fetch` reçoit une page de challenge, pas les annonces.
 */

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const ARTIFACT_DIR = process.env.FINDIT_ARTIFACT_DIR ?? 'artifacts';

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });
}

export async function newContext(browser: Browser, storageStatePath?: string): Promise<BrowserContext> {
  const hasState = storageStatePath ? await fileExists(storageStatePath) : false;

  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    extraHTTPHeaders: {
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    },
    ...(hasState ? { storageState: storageStatePath } : {}),
  });

  // `navigator.webdriver` est le signal d'automatisation le plus trivialement
  // détecté ; Playwright le laisse à true par défaut.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return context;
}

/** Pause aléatoire — un rythme de requêtes parfaitement régulier est un signal. */
export async function humanDelay(minMs = 800, maxMs = 2500): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Archive le HTML d'une page pour calibrer les sélecteurs.
 * Le premier run réel dit ce que la page contient vraiment — indispensable
 * quand on écrit les parseurs sans pouvoir atteindre le site.
 */
export async function dumpPage(page: Page, label: string): Promise<void> {
  if (process.env.FINDIT_DEBUG_DUMP !== '1') return;
  try {
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(ARTIFACT_DIR, `${label}-${stamp}`);
    await fs.writeFile(`${base}.html`, await page.content(), 'utf-8');
    await page.screenshot({ path: `${base}.png`, fullPage: false });
    console.log(`[debug] page archivée : ${base}.html`);
  } catch (error) {
    console.warn('[debug] archivage impossible :', error);
  }
}

/**
 * Décrit la forme d'un objet JSON : chemin de chaque tableau d'objets un peu
 * fourni, et clés de son premier élément.
 *
 * C'est l'outil de calibration central. Les parseurs ont été écrits sans
 * pouvoir atteindre les sites ; ce résumé, imprimé dans les logs du run,
 * indique où se trouvent réellement les annonces et sous quelle forme —
 * sans avoir à télécharger et fouiller une archive HTML.
 */
export function describeJsonShape(root: unknown, maxEntries = 25): string[] {
  const lines: string[] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown, path: string, depth: number): void => {
    if (lines.length >= maxEntries || depth > 10) return;
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      const objects = node.filter((n) => n !== null && typeof n === 'object' && !Array.isArray(n));
      if (objects.length >= 3) {
        const keys = Object.keys(objects[0] as Record<string, unknown>).slice(0, 18);
        lines.push(`${path}[] — ${node.length} éléments — clés : ${keys.join(', ')}`);
      }
      for (const [i, item] of node.slice(0, 3).entries()) walk(item, `${path}[${i}]`, depth + 1);
      return;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      walk(value, path ? `${path}.${key}` : key, depth + 1);
    }
  };

  walk(root, '', 0);
  return lines;
}

/**
 * Décrit une page directement dans les logs du run.
 *
 * L'archive HTML ne sert à rien si on ne peut pas la télécharger — c'est le cas
 * ici, l'environnement de développement n'atteint pas le stockage des artefacts
 * GitHub. Ce résumé, lui, arrive dans le journal du run : titre, adresse finale
 * (une redirection vers une page de blocage se voit immédiatement), classes
 * répétées (celles des cartes d'annonces) et début du texte.
 */
export async function diagnosePage(page: Page, label: string): Promise<void> {
  try {
    const title = await page.title().catch(() => '?');
    const text = (await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')) as string;
    const clean = text.replace(/\s+/g, ' ').trim();

    console.log(`    [diag ${label}] url finale : ${page.url()}`);
    console.log(`    [diag ${label}] titre : ${title}`);
    console.log(`    [diag ${label}] texte (300 c.) : ${clean.slice(0, 300)}`);

    const classes = await describeRepeatedClasses(page, 20);
    console.log(`    [diag ${label}] classes répétées : ${classes.join(', ') || 'aucune'}`);

    // Un échantillon de structure vaut mieux qu'une liste de classes : il dit
    // où sont réellement les données.
    const sample = await page
      .evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('article, li, div'))
          .filter((el) => {
            const t = (el as HTMLElement).innerText ?? '';
            return /€|EUR/.test(t) && t.length > 60 && t.length < 600;
          })
          .slice(0, 2);
        return candidates.map((el) => el.outerHTML.slice(0, 700));
      })
      .catch(() => [] as string[]);

    for (const [i, html] of sample.entries()) {
      console.log(`    [diag ${label}] bloc avec prix #${i + 1} : ${html.replace(/\s+/g, ' ')}`);
    }
  } catch (error) {
    console.warn(`    [diag ${label}] impossible :`, error);
  }
}

/**
 * Décrit les formulaires d'une page : action, méthode, champs et premières
 * options des listes déroulantes.
 *
 * Sans les noms de paramètres, impossible de demander « voiliers de plus de
 * 10 m à moins de 20 000 € » — il faudrait parcourir des milliers d'annonces
 * pour les écarter après coup. Ce relevé, imprimé dans le journal du run, donne
 * ces noms en une exécution.
 */
export async function describeForms(page: Page, label: string): Promise<void> {
  const forms = await page
    .evaluate(() =>
      Array.from(document.querySelectorAll('form')).map((form) => ({
        action: form.getAttribute('action') ?? '',
        method: form.getAttribute('method') ?? 'get',
        champs: Array.from(form.querySelectorAll('input, select')).map((el) => {
          const name = el.getAttribute('name') ?? el.getAttribute('id') ?? '?';
          const type = el.getAttribute('type') ?? el.tagName.toLowerCase();
          // La valeur des champs cachés porte souvent la catégorie ou le jeton
          // sans lesquels la recherche ne peut pas être rejouée en GET.
          if (type === 'hidden') return `${name}(hidden = ${el.getAttribute('value') ?? ''})`;
          const options =
            el.tagName === 'SELECT'
              ? Array.from(el.querySelectorAll('option'))
                  .slice(0, 6)
                  .map((o) => o.getAttribute('value') ?? '')
                  .join('|')
              : '';
          return options ? `${name}(${type}: ${options})` : `${name}(${type})`;
        }),
      })),
    )
    .catch(() => [] as Array<{ action: string; method: string; champs: string[] }>);

  for (const [i, form] of forms.entries()) {
    if (form.champs.length === 0) continue;
    console.log(
      `    [form ${label} #${i}] ${form.method.toUpperCase()} ${form.action} — ${form.champs
        .slice(0, 40)
        .join(', ')}`,
    );
  }
}

/**
 * Classes CSS les plus fréquentes sur les éléments répétés d'une page.
 * Sert à calibrer les sélecteurs des sites dont le HTML n'a pas pu être
 * inspecté en amont : un site d'annonces répète la classe de ses cartes.
 */
export async function describeRepeatedClasses(page: Page, top = 15): Promise<string[]> {
  return page
    .evaluate((limit) => {
      const counts = new Map<string, number>();
      for (const el of Array.from(document.querySelectorAll('[class]'))) {
        for (const cls of el.className.toString().split(/\s+/)) {
          if (!cls || cls.length > 40) continue;
          counts.set(cls, (counts.get(cls) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .filter(([, n]) => n >= 4 && n <= 200)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([cls, n]) => `${cls} (${n}×)`);
    }, top)
    .catch(() => []);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parcourt un objet JSON à la recherche de tous les objets satisfaisant un
 * prédicat. Bien plus robuste qu'un chemin figé du type
 * `props.pageProps.searchData.ads` : quand le site réorganise son état interne,
 * la forme des objets d'annonce, elle, bouge beaucoup moins que leur position.
 */
export function deepCollect<T = Record<string, unknown>>(
  root: unknown,
  predicate: (node: Record<string, unknown>) => boolean,
  maxDepth = 12,
): T[] {
  const found: T[] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number): void => {
    if (depth > maxDepth || node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    if (predicate(record)) {
      found.push(record as T);
      return; // inutile de descendre dans une annonce déjà capturée
    }

    for (const value of Object.values(record)) walk(value, depth + 1);
  };

  walk(root, 0);
  return found;
}
