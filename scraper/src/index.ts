import { enrichAll, isPlausibleBoatListing } from './pipeline.js';
import { FacebookSource } from './sources/facebook.js';
import { LeboncoinSource } from './sources/leboncoin.js';
import { SpecializedSitesSource } from './sources/specialized.js';
import {
  keyOf,
  loadDataset,
  mergeListings,
  saveDataset,
  type RunReport,
  type StoredListing,
} from './store.js';
import type { RawListing, Source, SourceResult } from './types.js';

/**
 * Point d'entrée de la collecte quotidienne.
 *
 * Principe de robustesse : une source qui tombe ne fait pas tomber les autres,
 * et le run se termine en « partiel » plutôt qu'en échec. Sur du scraping, la
 * panne partielle est le régime normal, pas l'exception.
 *
 * Autre garde-fou important : si AUCUNE annonce n'est collectée, le fichier
 * existant n'est pas réécrit. Un site momentanément inaccessible ne doit pas
 * effacer des semaines d'historique.
 */

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const trigger = process.env.FINDIT_TRIGGER ?? 'manual';

  console.log(`\n=== Find-it — collecte du ${startedAt} (${trigger}) ===\n`);

  const dataset = await loadDataset();
  console.log(`Historique chargé : ${dataset.listings.length} annonces connues\n`);

  const sources: Source[] = [
    new LeboncoinSource(),
    new SpecializedSitesSource(),
    new FacebookSource(),
  ];

  const results: SourceResult[] = [];
  const sourceReport: Record<string, unknown> = {};

  for (const source of sources) {
    if (!source.isEnabled()) {
      console.log(`— ${source.name} : désactivée`);
      sourceReport[source.name] = { skipped: true };
      continue;
    }

    console.log(`— ${source.name} : collecte…`);
    const t0 = Date.now();
    try {
      const result = await source.collect();
      results.push(result);
      const seconds = Math.round((Date.now() - t0) / 1000);
      console.log(
        `  ${result.listings.length} annonces en ${seconds}s` +
          (result.errors.length ? ` — ${result.errors.length} avertissement(s)` : ''),
      );
      for (const error of result.errors) console.log(`    ! ${error}`);
      sourceReport[source.name] = {
        count: result.listings.length,
        errors: result.errors,
        reachable: result.reachable,
        seconds,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  échec : ${msg}`);
      sourceReport[source.name] = { count: 0, errors: [msg], reachable: false };
    }
  }

  // --- Dédoublonnage et filtrage ------------------------------------------
  const rawListings = dedupe(results.flatMap((r) => r.listings));
  const relevant = rawListings.filter(isPlausibleBoatListing);
  console.log(
    `\nAnnonces collectées : ${rawListings.length}` +
      ` (dont ${rawListings.length - relevant.length} écartées comme hors sujet)`,
  );

  if (relevant.length === 0) {
    console.warn(
      "\nAucune annonce exploitable. Le fichier existant n'est PAS modifié — " +
        'une panne de source ne doit pas effacer l\'historique.',
    );
    // Le run est tout de même journalisé, pour que le site affiche l'incident.
    if (dataset.listings.length > 0) {
      await saveDataset(dataset, {
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'failed',
        trigger,
        stats: { collected: 0 },
        sources: sourceReport,
      });
    }
    process.exitCode = 1;
    return;
  }

  // --- Enrichissement -------------------------------------------------------
  const existing = new Map<string, StoredListing>(
    dataset.listings.map((l) => [keyOf(l.source, l.sourceId), l]),
  );

  console.log('\nEnrichissement…');
  const { listings, stats } = await enrichAll(relevant, existing);
  console.log(
    `  longueur trouvée pour ${stats.withLength}/${stats.total} ` +
      `(regex ${stats.fromRegex}, modèle ${stats.fromModelTable}, IA ${stats.fromLlm}) — ` +
      `${stats.unresolved} à vérifier`,
  );

  // --- Fusion avec l'historique ---------------------------------------------
  const reachableSources = [
    ...new Set(results.filter((r) => r.reachable).flatMap((r) => r.listings.map((l) => l.source))),
  ];
  const outcome = mergeListings(dataset, listings, reachableSources);

  console.log(
    `\nHistorique à jour : ${outcome.inserted} nouvelles, ${outcome.updated} revues, ` +
      `${outcome.priceDrops} baisse(s) de prix, ${outcome.gone} disparue(s)` +
      (outcome.pruned ? `, ${outcome.pruned} purgée(s)` : ''),
  );

  const hadErrors = Object.values(sourceReport).some(
    (r) => ((r as { errors?: unknown[] }).errors?.length ?? 0) > 0,
  );

  const run: RunReport = {
    startedAt,
    finishedAt: new Date().toISOString(),
    status: hadErrors ? 'partial' : 'success',
    trigger,
    stats: { ...stats, ...outcome, collected: rawListings.length, total: dataset.listings.length },
    sources: sourceReport,
  };

  await saveDataset(dataset, run);
  console.log('\n=== Terminé ===\n');
}

/** Une même annonce peut apparaître sur plusieurs pages de résultats. */
function dedupe(listings: RawListing[]): RawListing[] {
  const seen = new Map<string, RawListing>();
  for (const listing of listings) {
    const key = keyOf(listing.source, listing.sourceId);
    const previous = seen.get(key);
    // On garde la version la plus riche (celle qui a une description).
    if (!previous || (!previous.description && listing.description)) seen.set(key, listing);
  }
  return [...seen.values()];
}

main().catch((error) => {
  console.error('\nÉchec de la collecte :', error);
  process.exitCode = 1;
});
