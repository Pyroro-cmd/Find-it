import type { Page } from 'playwright';
import { launchBrowser, newContext } from './util/browser.js';

/**
 * Sonde de pagination et de structure des cartes.
 *
 * Trois runs réels ont dessiné une règle nette : sur ces sites, **une URL de
 * chemin passe, une URL à paramètres est bloquée**. boat24 répond 200 sur
 * `/fr/voiliers/` et 403 sur `/fr/voiliers/?page=2` ; yachtall répond 200 sur
 * `/fr/voiliers` et sert un test anti-bot sur `/fr/voiliers?prix_max=…`.
 *
 * Le filtrage par le site est donc hors d'atteinte. Reste la voie honnête :
 * parcourir les pages de la rubrique et trier soi-même. Encore faut-il savoir
 * comment le site numérote ses pages — c'est ce que cette sonde relève, avec
 * la structure d'une carte pour écrire le parseur en une fois.
 *
 *   npm run probe:search
 */

type Cible = {
  nom: string;
  url: string;
  /** Classe portée par une carte d'annonce, relevée aux sondes précédentes. */
  carte: string;
};

const CIBLES: Cible[] = [
  { nom: 'yachtall', url: 'https://www.yachtall.com/fr/voiliers', carte: 'js-hrefBoat' },
  { nom: 'boat24', url: 'https://www.boat24.com/fr/voiliers/', carte: 'blurb' },
];

async function main(): Promise<void> {
  const browser = await launchBrowser();
  try {
    const context = await newContext(browser);
    const page = await context.newPage();

    for (const cible of CIBLES) {
      console.log(`\n${'═'.repeat(78)}\n${cible.nom.toUpperCase()} — ${cible.url}\n${'═'.repeat(78)}`);
      try {
        const response = await page.goto(cible.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(3500);
        await accepterCookies(page);
        await defiler(page);

        console.log(`  HTTP ${response?.status() ?? '?'} — ${await page.title().catch(() => '?')}`);
        console.log(`  cartes « ${cible.carte} » : ${await page.locator(`[class~="${cible.carte}"]`).count()}`);

        await relevePagination(page);
        await releveControlesPagination(page);
        await releveCarte(page, cible.carte);
      } catch (error) {
        console.log(`  échec : ${(error as Error).message.slice(0, 160)}`);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Tout ce qui ressemble à un lien de page suivante. */
async function relevePagination(page: Page): Promise<void> {
  const liens = await page.evaluate(() => {
    const sortie: string[] = [];
    for (const el of Array.from(document.querySelectorAll('a[href], [data-href], [onclick]'))) {
      const href = el.getAttribute('href') ?? el.getAttribute('data-href') ?? '';
      const onclick = el.getAttribute('onclick') ?? '';
      const texte = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
      if (/page|suivant|next|weiter|\/\d+\/?$/i.test(href) || /page/i.test(onclick)) {
        sortie.push(`${texte || '(sans texte)'} → ${href || onclick.slice(0, 90)}`);
      }
    }
    return sortie;
  });

  console.log('  liens de pagination :');
  for (const lien of [...new Set(liens)].slice(0, 25)) console.log(`    ${lien}`);
  if (liens.length === 0) console.log('    aucun — la pagination est probablement en JavaScript');
}

/**
 * Les commandes de pagination quand elles ne sont pas de simples liens.
 *
 * Si la page suivante s'obtient par un clic et non par une URL, le collecteur
 * peut très bien cliquer — mais il lui faut le sélecteur exact.
 */
async function releveControlesPagination(page: Page): Promise<void> {
  const releve = await page.evaluate(() => {
    const sortie: string[] = [];

    for (const el of Array.from(document.querySelectorAll('[class*="pag" i], [id*="pag" i]'))) {
      sortie.push(`conteneur : ${el.outerHTML.replace(/\s+/g, ' ').slice(0, 600)}`);
      if (sortie.length > 4) break;
    }

    for (const el of Array.from(document.querySelectorAll('button, [role="button"], input[type="button"]'))) {
      const texte = (el.textContent ?? (el as HTMLInputElement).value ?? '').replace(/\s+/g, ' ').trim();
      if (!texte || texte.length > 30) continue;
      if (/suivant|next|plus|more|charger|weiter|»|›|\d+/i.test(texte)) {
        sortie.push(`bouton « ${texte} » : ${el.outerHTML.replace(/\s+/g, ' ').slice(0, 220)}`);
      }
    }

    return sortie;
  });

  console.log('  commandes de pagination :');
  for (const ligne of [...new Set(releve)].slice(0, 12)) console.log(`    ${ligne}`);
  if (releve.length === 0) console.log('    aucune');

  // Le bas de page contient presque toujours la pagination.
  const bas = await page.evaluate(() => document.body.innerHTML.slice(-2500).replace(/\s+/g, ' '));
  console.log(`  bas du document : ${bas}`);
}

/** Structure complète d'une carte : de quoi écrire le parseur sans deviner. */
async function releveCarte(page: Page, classe: string): Promise<void> {
  // On remonte jusqu'à l'ancêtre qui contient un prix : c'est la carte
  // complète, pas seulement le lien du titre.
  const html = await page
    .evaluate((cls) => {
      const cartes = Array.from(document.querySelectorAll(`[class~="${cls}"]`));
      let noeud: HTMLElement | null = (cartes[0] as HTMLElement) ?? null;
      for (let i = 0; i < 5 && noeud; i++) {
        if (/€/.test(noeud.innerText ?? '')) break;
        noeud = noeud.parentElement;
      }
      return noeud?.outerHTML ?? '';
    }, classe)
    .catch(() => '');

  const texte = await page
    .evaluate((cls) => {
      const cartes = Array.from(document.querySelectorAll(`[class~="${cls}"]`));
      let noeud: HTMLElement | null = (cartes[0] as HTMLElement) ?? null;
      for (let i = 0; i < 5 && noeud; i++) {
        if (/€/.test(noeud.innerText ?? '')) break;
        noeud = noeud.parentElement;
      }
      return noeud?.innerText ?? '';
    }, classe)
    .catch(() => '');

  console.log(`  texte de la carte : ${texte.replace(/\s+/g, ' ').trim().slice(0, 400)}`);
  console.log(`  html de la carte  : ${html.replace(/\s+/g, ' ').slice(0, 2200)}`);
}

async function defiler(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(700);
  }
}

async function accepterCookies(page: Page): Promise<void> {
  for (const selector of [
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    'button:has-text("Accepter")',
    'button:has-text("Tout accepter")',
    '.ccm--decline-cookies, .ccm-root button',
  ]) {
    const button = page.locator(selector).first();
    if ((await button.count().catch(() => 0)) > 0) {
      await button.click({ timeout: 4000 }).catch(() => undefined);
      await page.waitForTimeout(1000);
      return;
    }
  }
}

main().catch((error) => {
  console.error('Sonde en échec :', error);
  process.exitCode = 1;
});
