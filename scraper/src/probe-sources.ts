import * as cheerio from 'cheerio';
import { launchBrowser, newContext } from './util/browser.js';

/**
 * Sonde de sources alternatives.
 *
 * Constat après trois runs réels : les trois sites visés se défendent, et
 * chacun à un endroit différent.
 *
 *   leboncoin       403 (DataDome, plages d'adresses de centres de données)
 *   theyachtmarket  403 puis test JavaScript Cloudflare sur les résultats
 *   boat24          la page de rubrique passe, mais toute URL avec paramètres
 *                   répond 403 et le formulaire POST renvoie une page d'erreur
 *
 * Or boat24 sans filtre ne sert à rien : sa première page n'est qu'une vitrine
 * de yachts à six chiffres. Insister à coups de contournements donnerait un
 * collecteur fragile qui retomberait en panne au premier durcissement.
 *
 * Mieux vaut chercher un site coopératif. Cette sonde en évalue une liste sur
 * un seul critère, mesurable : **une URL de recherche filtrée répond-elle, et
 * contient-elle des annonces exploitables ?**
 *
 *   npm run probe:sources
 */

type Candidate = {
  site: string;
  url: string;
  /** Ce que l'URL est censée demander, pour interpréter le résultat. */
  attendu: string;
};

const CANDIDATES: Candidate[] = [
  // Apollo Duck : site ancien, HTML simple, sections nationales.
  { site: 'apolloduck', url: 'https://sailboats.apolloduck.fr/', attendu: 'voiliers France' },
  {
    site: 'apolloduck',
    url: 'https://sailboats.apolloduck.fr/boats?price_max=20000',
    attendu: 'voiliers sous 20 000 €',
  },
  // Yachtall : site allemand multilingue, HTML statique, filtres en URL.
  { site: 'yachtall', url: 'https://www.yachtall.com/fr/voiliers', attendu: 'voiliers' },
  {
    site: 'yachtall',
    url: 'https://www.yachtall.com/fr/voiliers?prix_max=20000&longueur_min=10',
    attendu: 'voiliers filtrés',
  },
  { site: 'yachtall', url: 'https://www.yachtall.com/en/sailboats', attendu: 'voiliers (anglais)' },
  // Sites français d'annonces.
  { site: 'annoncesbateau', url: 'https://www.annoncesbateau.com/voilier', attendu: 'voiliers' },
  {
    site: 'annoncesbateau',
    url: 'https://www.annoncesbateau.com/annonces/voilier',
    attendu: 'voiliers (autre chemin)',
  },
  { site: 'youboat', url: 'https://www.youboat.fr/voilier-occasion', attendu: 'voiliers' },
  { site: 'youboat', url: 'https://www.youboat.fr/', attendu: 'accueil' },
  { site: 'topbateaux', url: 'https://www.topbateaux.com/voilier', attendu: 'voiliers' },
  { site: 'bateaux24', url: 'https://www.bateaux24.com/fr/voiliers/', attendu: 'voiliers' },
  { site: 'scanboat', url: 'https://www.scanboat.com/fr/voilier', attendu: 'voiliers' },
  // Contrôle : la page qui fonctionne déjà, pour comparer.
  { site: 'boat24 (témoin)', url: 'https://www.boat24.com/fr/voiliers/', attendu: 'voiliers' },
];

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function main(): Promise<void> {
  console.log(`\n${'═'.repeat(78)}\nSONDE — quelles sources acceptent une recherche filtrée\n${'═'.repeat(78)}`);

  const aRetenter: Candidate[] = [];

  for (const candidate of CANDIDATES) {
    const verdict = await sonderParFetch(candidate);
    if (verdict === 'a-retenter') aRetenter.push(candidate);
    await pause(1200);
  }

  if (aRetenter.length === 0) return;

  console.log(`\n${'═'.repeat(78)}\nSECONDE PASSE — les mêmes URL dans un vrai navigateur\n${'═'.repeat(78)}`);
  const browser = await launchBrowser();
  try {
    const context = await newContext(browser);
    const page = await context.newPage();
    for (const candidate of aRetenter) {
      try {
        const response = await page.goto(candidate.url, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        await page.waitForTimeout(2500);
        const html = await page.content();
        console.log(`\n▸ ${candidate.site} — ${candidate.url}`);
        console.log(`  HTTP ${response?.status() ?? '?'} — titre : ${await page.title().catch(() => '?')}`);
        decrire(html);
      } catch (error) {
        console.log(`\n▸ ${candidate.site} — ${candidate.url}`);
        console.log(`  échec navigateur : ${(error as Error).message.slice(0, 120)}`);
      }
      await pause(1500);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function sonderParFetch(candidate: Candidate): Promise<'ok' | 'a-retenter'> {
  console.log(`\n▸ ${candidate.site} — ${candidate.attendu}\n  ${candidate.url}`);
  try {
    const response = await fetch(candidate.url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'fr-FR,fr;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    });

    const html = await response.text();
    console.log(`  HTTP ${response.status} — ${(html.length / 1024).toFixed(0)} Ko`);

    if (!response.ok || html.length < 5000) return 'a-retenter';
    return decrire(html) ? 'ok' : 'a-retenter';
  } catch (error) {
    console.log(`  échec : ${(error as Error).message.slice(0, 120)}`);
    return 'a-retenter';
  }
}

/** Résume le contenu ; renvoie true si la page ressemble à une liste d'annonces. */
function decrire(html: string): boolean {
  const $ = cheerio.load(html);
  const texte = $('body').text().replace(/\s+/g, ' ').trim();

  const prix = texte.match(/\d[\d\s.,]{2,}\s*(?:€|EUR)/g) ?? [];
  const metres = texte.match(/\d{1,2}[.,]\d{1,2}\s*m\b/g) ?? [];
  console.log(`  ${prix.length} prix, ${metres.length} longueurs — titre : ${$('title').text().trim().slice(0, 80)}`);

  if (prix.length === 0) {
    console.log(`  texte : ${texte.slice(0, 200)}`);
    return false;
  }

  // Classes portées par des éléments répétés : ce sont les cartes d'annonces.
  const counts = new Map<string, number>();
  $('[class]').each((_, el) => {
    for (const cls of ($(el).attr('class') ?? '').split(/\s+/)) {
      if (cls && cls.length <= 40) counts.set(cls, (counts.get(cls) ?? 0) + 1);
    }
  });
  const repetees = [...counts.entries()]
    .filter(([, n]) => n >= 5 && n <= 150)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([cls, n]) => `${cls}(${n})`);
  console.log(`  classes répétées : ${repetees.join(', ') || 'aucune'}`);
  console.log(`  premiers prix : ${prix.slice(0, 8).join(' | ')}`);
  console.log(`  premières longueurs : ${metres.slice(0, 8).join(' | ')}`);

  return prix.length >= 5;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('Sonde en échec :', error);
  process.exitCode = 1;
});
