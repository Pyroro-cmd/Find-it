import fs from 'node:fs/promises';
import path from 'node:path';
import type { EnrichedListing } from './types.js';

/**
 * Stockage des annonces dans un fichier JSON versionné par Git.
 *
 * Pourquoi pas une base de données : le plan gratuit de Supabase est limité à
 * deux projets actifs, tous deux déjà occupés. Or le besoin réel ici est
 * modeste — quelques centaines d'annonces, une écriture par jour, une lecture
 * par visite. Un fichier JSON couvre exactement ça, sans compte à créer, sans
 * quota, sans clé à faire fuiter. Git fournit en prime l'historique complet :
 * chaque collecte est un commit, donc l'évolution du marché est consultable.
 *
 * Le fichier vit dans `web/public/data/` pour être servi tel quel par le site
 * statique : le collecteur écrit, le site lit, rien entre les deux.
 */

export const DATA_FILE = process.env.FINDIT_DATA_FILE ?? 'web/public/data/listings.json';

/** Au-delà, une annonce disparue n'apprend plus rien et alourdit le fichier. */
const KEEP_GONE_DAYS = 60;

/** Les descriptions complètes pèsent lourd et ne sont pas affichées en entier. */
const DESCRIPTION_MAX_CHARS = 600;

/** Peu d'annonces ont plus de 6 photos utiles ; les suivantes gonflent le fichier. */
const MAX_IMAGES = 6;

export type PricePoint = {
  price: number;
  at: string;
};

export type StoredListing = {
  id: string;
  source: string;
  sourceId: string;
  url: string;
  title: string;
  description: string | null;
  images: string[];
  priceEur: number | null;
  locationLabel: string | null;
  department: string | null;
  facade: string | null;
  country: string | null;
  lengthM: number | null;
  lengthSource: string | null;
  lengthConfidence: number | null;
  hullType: string | null;
  boatKind: string | null;
  yearBuilt: number | null;
  material: string | null;
  engineType: string | null;
  draftM: number | null;
  berthIncluded: boolean | null;
  afloat: boolean | null;
  isProject: boolean;
  projectReason: string | null;
  sellerType: string | null;
  score: number;
  scoreBreakdown: Record<string, number | string>;
  status: 'active' | 'gone';
  firstSeenAt: string;
  lastSeenAt: string;
  goneAt: string | null;
  publishedAt: string | null;
  priceHistory: PricePoint[];
};

export type RunReport = {
  startedAt: string;
  finishedAt: string;
  status: 'success' | 'partial' | 'failed';
  trigger: string;
  stats: Record<string, number>;
  sources: Record<string, unknown>;
};

export type Dataset = {
  version: 1;
  generatedAt: string;
  run: RunReport | null;
  listings: StoredListing[];
};

const EMPTY: Dataset = { version: 1, generatedAt: '', run: null, listings: [] };

export async function loadDataset(): Promise<Dataset> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Dataset>;
    if (!Array.isArray(parsed.listings)) return { ...EMPTY };
    return {
      version: 1,
      generatedAt: parsed.generatedAt ?? '',
      run: parsed.run ?? null,
      listings: parsed.listings as StoredListing[],
    };
  } catch (error) {
    // Premier lancement : le fichier n'existe pas encore.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY };
    throw new Error(`Lecture de ${DATA_FILE} impossible : ${(error as Error).message}`);
  }
}

export function keyOf(source: string, sourceId: string): string {
  return `${source}:${sourceId}`;
}

export type MergeOutcome = {
  inserted: number;
  updated: number;
  priceDrops: number;
  gone: number;
  pruned: number;
};

/**
 * Fusionne la collecte du jour avec l'existant.
 *
 * Trois règles qui portent tout l'intérêt de l'historique :
 *  - `firstSeenAt` n'est jamais écrasé, sinon toutes les annonces
 *    réapparaîtraient chaque matin comme « nouveautés » ;
 *  - un changement de prix ajoute un point d'historique, ce qui permet de
 *    repérer les vendeurs qui baissent ;
 *  - une annonce non revue passe en « disparue » plutôt que d'être supprimée
 *    (l'information « ce bateau est parti » a de la valeur).
 */
export function mergeListings(
  dataset: Dataset,
  fresh: EnrichedListing[],
  reachableSources: string[],
  now = new Date(),
): MergeOutcome {
  const nowIso = now.toISOString();
  const outcome: MergeOutcome = { inserted: 0, updated: 0, priceDrops: 0, gone: 0, pruned: 0 };

  const byId = new Map(dataset.listings.map((l) => [l.id, l]));
  const seenIds = new Set<string>();

  for (const listing of fresh) {
    const id = keyOf(listing.source, listing.sourceId);
    seenIds.add(id);
    const prior = byId.get(id);

    const priceHistory = prior ? [...prior.priceHistory] : [];
    if (listing.priceEur != null) {
      const lastPrice = priceHistory.at(-1)?.price ?? null;
      if (lastPrice !== listing.priceEur) {
        priceHistory.push({ price: listing.priceEur, at: nowIso });
        if (lastPrice != null && listing.priceEur < lastPrice) outcome.priceDrops += 1;
      }
    }

    byId.set(id, {
      id,
      source: listing.source,
      sourceId: listing.sourceId,
      url: listing.url,
      title: listing.title,
      description: truncate(listing.description, DESCRIPTION_MAX_CHARS),
      images: listing.images.slice(0, MAX_IMAGES),
      priceEur: listing.priceEur,
      locationLabel: listing.locationLabel,
      department: listing.department,
      facade: listing.facade,
      country: listing.country,
      lengthM: listing.lengthM,
      lengthSource: listing.lengthSource,
      lengthConfidence: listing.lengthConfidence,
      hullType: listing.hullType,
      boatKind: listing.boatKind,
      yearBuilt: listing.yearBuilt,
      material: listing.material,
      engineType: listing.engineType,
      draftM: listing.draftM,
      berthIncluded: listing.berthIncluded,
      afloat: listing.afloat,
      isProject: listing.isProject,
      projectReason: listing.projectReason,
      sellerType: listing.sellerType,
      score: listing.score,
      scoreBreakdown: listing.scoreBreakdown,
      status: 'active',
      firstSeenAt: prior?.firstSeenAt ?? nowIso,
      lastSeenAt: nowIso,
      goneAt: null,
      publishedAt: listing.publishedAt,
      priceHistory,
    });

    if (prior) outcome.updated += 1;
    else outcome.inserted += 1;
  }

  // Annonces non revues — uniquement pour les sources qui ont répondu. Si une
  // source a échoué, son catalogue ne doit pas être déclaré disparu en bloc.
  const reachable = new Set(reachableSources);
  for (const listing of byId.values()) {
    if (listing.status === 'gone') continue;
    if (seenIds.has(listing.id)) continue;
    if (!reachable.has(listing.source)) continue;
    listing.status = 'gone';
    listing.goneAt = nowIso;
    outcome.gone += 1;
  }

  // Purge des annonces disparues depuis longtemps.
  const cutoff = now.getTime() - KEEP_GONE_DAYS * 86_400_000;
  for (const [id, listing] of byId) {
    if (listing.status === 'gone' && listing.goneAt && Date.parse(listing.goneAt) < cutoff) {
      byId.delete(id);
      outcome.pruned += 1;
    }
  }

  dataset.listings = [...byId.values()].sort((a, b) => b.score - a.score);
  return outcome;
}

export async function saveDataset(dataset: Dataset, run: RunReport): Promise<void> {
  dataset.version = 1;
  dataset.generatedAt = new Date().toISOString();
  dataset.run = run;

  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  // Indenté : le diff Git reste lisible, et c'est ce qui rend l'historique
  // du marché consultable commit par commit.
  await fs.writeFile(DATA_FILE, `${JSON.stringify(dataset, null, 1)}\n`, 'utf-8');

  const bytes = Buffer.byteLength(JSON.stringify(dataset));
  console.log(`Fichier écrit : ${DATA_FILE} (${(bytes / 1024).toFixed(0)} Ko)`);
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}
