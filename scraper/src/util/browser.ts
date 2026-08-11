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

export const ARTIFACT_DIR = process.env.FINDIT_ARTIFACT_DIR ?? '.artifacts';

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
