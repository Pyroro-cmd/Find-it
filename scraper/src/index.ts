import { finishRun, loadExisting, markGone, startRun, upsertListings } from './db.js';
import { enrichAll, isPlausibleBoatListing } from './pipeline.js';
import { FacebookSource } from './sources/facebook.js';
import { LeboncoinSource } from './sources/leboncoin.js';
import { SpecializedSitesSource } from './sources/specialized.js';
import type { RawListing, Source, SourceResult } from './types.js';

/**
 * Point d'entrée de la collecte quotidienne.
 *
 * Principe de robustesse : une source qui tombe ne fait pas tomber les autres,
 * et le run se termine en « partial » plutôt qu'en échec. Sur du scraping,
 * la panne partielle est le régime normal, pas l'exception.
 */

async function main(): Promise<void> {
  const runStart = new Date().toISOString();
  const trigger = process.env.FINDIT_TRIGGER ?? 'manual';

  console.log(`\n=== Find-it — collecte du ${runStart} (${trigger}) ===\n`);

  const runId = await startRun(trigger);

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
    const startedAt = Date.now();
    try {
      const result = await source.collect();
      results.push(result);
      const seconds = Math.round((Date.now() - startedAt) / 1000);
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
    `\nAnnonces collectées : ${rawListings.length} (dont ${rawListings.length - relevant.length} écartées comme hors sujet)`,
  );

  if (relevant.length === 0) {
    console.warn('Aucune annonce exploitable — rien à écrire.');
    await finishRun(runId, 'failed', { collected: 0 }, sourceReport, 'aucune annonce collectée');
    process.exitCode = 1;
    return;
  }

  // --- Enrichissement -------------------------------------------------------
  const collectedSources = [...new Set(relevant.map((l) => l.source))];
  const existing = await loadExisting(collectedSources);

  console.log('\nEnrichissement…');
  const { listings, stats } = await enrichAll(relevant, existing);
  console.log(
    `  longueur trouvée pour ${stats.withLength}/${stats.total} ` +
      `(regex ${stats.fromRegex}, modèle ${stats.fromModelTable}, LLM ${stats.fromLlm}) — ` +
      `${stats.unresolved} à vérifier`,
  );

  // --- Écriture --------------------------------------------------------------
  const outcome = await upsertListings(listings, existing);
  console.log(
    `\nBase à jour : ${outcome.inserted} nouvelles, ${outcome.updated} mises à jour, ` +
      `${outcome.priceDrops} baisse(s) de prix`,
  );

  // --- Annonces disparues ----------------------------------------------------
  let goneTotal = 0;
  for (const result of results) {
    if (!result.reachable || result.listings.length === 0) continue;
    for (const src of new Set(result.listings.map((l) => l.source))) {
      const ids = result.listings.filter((l) => l.source === src).map((l) => l.sourceId);
      goneTotal += await markGone(src, ids, runStart);
    }
  }
  if (goneTotal > 0) console.log(`${goneTotal} annonce(s) marquée(s) comme disparues`);

  const hadErrors = Object.values(sourceReport).some(
    (r) => Array.isArray((r as { errors?: unknown[] }).errors) && ((r as { errors: unknown[] }).errors.length > 0),
  );

  await finishRun(
    runId,
    hadErrors ? 'partial' : 'success',
    { ...stats, ...outcome, gone: goneTotal, collected: rawListings.length },
    sourceReport,
  );

  console.log('\n=== Terminé ===\n');
}

/** Une même annonce peut apparaître sur plusieurs pages de résultats. */
function dedupe(listings: RawListing[]): RawListing[] {
  const seen = new Map<string, RawListing>();
  for (const listing of listings) {
    const key = `${listing.source}:${listing.sourceId}`;
    const existing = seen.get(key);
    // On garde la version la plus riche (celle qui a une description).
    if (!existing || (!existing.description && listing.description)) seen.set(key, listing);
  }
  return [...seen.values()];
}

main().catch(async (error) => {
  console.error('\nÉchec de la collecte :', error);
  process.exitCode = 1;
});
