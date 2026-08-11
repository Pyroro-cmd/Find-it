import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EnrichedListing } from './types.js';

/**
 * Accès Supabase, côté scraper uniquement, avec la service_role key.
 * Cette clé contourne le RLS : elle ne doit jamais quitter le runner CI.
 */

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (secrets GitHub du dépôt).',
    );
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export type ExistingListing = {
  id: string;
  source: string;
  source_id: string;
  price_eur: number | null;
  first_seen_at: string;
};

/** Charge les annonces déjà connues pour les sources collectées ce run. */
export async function loadExisting(sources: string[]): Promise<Map<string, ExistingListing>> {
  const byKey = new Map<string, ExistingListing>();
  if (sources.length === 0) return byKey;

  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db()
      .from('listings')
      .select('id, source, source_id, price_eur, first_seen_at')
      .in('source', sources)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`lecture des annonces existantes : ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as ExistingListing[]) {
      byKey.set(`${row.source}:${row.source_id}`, row);
    }
    if (data.length < pageSize) break;
  }

  return byKey;
}

export type UpsertOutcome = {
  inserted: number;
  updated: number;
  priceDrops: number;
};

export async function upsertListings(
  listings: EnrichedListing[],
  existing: Map<string, ExistingListing>,
): Promise<UpsertOutcome> {
  const outcome: UpsertOutcome = { inserted: 0, updated: 0, priceDrops: 0 };
  if (listings.length === 0) return outcome;

  const now = new Date().toISOString();
  const priceHistoryRows: Array<{ listing_id: string; price_eur: number }> = [];

  const rows = listings.map((listing) => {
    const key = `${listing.source}:${listing.sourceId}`;
    const prior = existing.get(key);
    if (prior) {
      outcome.updated += 1;
      if (listing.priceEur != null && prior.price_eur != null && listing.priceEur < prior.price_eur) {
        outcome.priceDrops += 1;
      }
    } else {
      outcome.inserted += 1;
    }

    return {
      source: listing.source,
      source_id: listing.sourceId,
      url: listing.url,
      title: listing.title,
      description: listing.description,
      images: listing.images,
      price_eur: listing.priceEur,
      location_label: listing.locationLabel,
      postal_code: listing.postalCode,
      department: listing.department,
      facade: listing.facade,
      length_m: listing.lengthM,
      length_source: listing.lengthSource,
      length_confidence: listing.lengthConfidence,
      hull_type: listing.hullType,
      boat_kind: listing.boatKind,
      year_built: listing.yearBuilt,
      material: listing.material,
      engine_type: listing.engineType,
      draft_m: listing.draftM,
      berth_included: listing.berthIncluded,
      afloat: listing.afloat,
      is_project: listing.isProject,
      project_reason: listing.projectReason,
      seller_type: listing.sellerType,
      score: listing.score,
      score_breakdown: listing.scoreBreakdown,
      status: 'active',
      last_seen_at: now,
      published_at: listing.publishedAt,
      gone_at: null,
      raw: listing.raw,
      // first_seen_at n'est PAS renvoyé pour les annonces connues : l'écraser
      // ferait réapparaître de vieilles annonces comme « nouveautés du jour ».
      ...(existing.has(`${listing.source}:${listing.sourceId}`) ? {} : { first_seen_at: now }),
    };
  });

  // Par lots : au-delà de ~500 lignes, la requête devient lourde et un échec
  // fait perdre toute la collecte.
  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { data, error } = await db()
      .from('listings')
      .upsert(batch, { onConflict: 'source,source_id' })
      .select('id, source, source_id, price_eur');

    if (error) throw new Error(`écriture des annonces : ${error.message}`);

    for (const row of (data ?? []) as Array<{ id: string; source: string; source_id: string; price_eur: number | null }>) {
      if (row.price_eur != null) {
        const prior = existing.get(`${row.source}:${row.source_id}`);
        // On n'écrit dans l'historique qu'au premier passage ou lors d'un
        // changement de prix — sinon on ajouterait une ligne par jour et par
        // annonce sans rien apprendre.
        if (!prior || prior.price_eur !== row.price_eur) {
          priceHistoryRows.push({ listing_id: row.id, price_eur: row.price_eur });
        }
      }
    }
  }

  if (priceHistoryRows.length > 0) {
    const { error } = await db().from('listing_price_history').insert(priceHistoryRows);
    if (error) console.warn(`[db] historique de prix non enregistré : ${error.message}`);
  }

  return outcome;
}

/**
 * Marque « disparues » les annonces d'une source qui n'ont pas été revues.
 * Une annonce qui disparaît est un signal utile (vendue ? retirée ?), donc on
 * la conserve plutôt que de la supprimer.
 */
export async function markGone(source: string, seenIds: string[], runStart: string): Promise<number> {
  // Sécurité : si une source a échoué et n'a rien remonté, ne pas déclarer
  // disparue la totalité de son catalogue.
  if (seenIds.length === 0) return 0;

  const { data, error } = await db()
    .from('listings')
    .update({ status: 'gone', gone_at: new Date().toISOString() })
    .eq('source', source)
    .eq('status', 'active')
    .lt('last_seen_at', runStart)
    .select('id');

  if (error) {
    console.warn(`[db] marquage des annonces disparues (${source}) : ${error.message}`);
    return 0;
  }
  return data?.length ?? 0;
}

export async function startRun(trigger: string): Promise<string | null> {
  const { data, error } = await db()
    .from('scrape_runs')
    .insert({ trigger, status: 'running' })
    .select('id')
    .single();

  if (error) {
    console.warn(`[db] impossible de journaliser le run : ${error.message}`);
    return null;
  }
  return (data as { id: string }).id;
}

export async function finishRun(
  runId: string | null,
  status: 'success' | 'partial' | 'failed',
  stats: Record<string, unknown>,
  sourceResults: Record<string, unknown>,
  error?: string,
): Promise<void> {
  if (!runId) return;
  const { error: dbError } = await db()
    .from('scrape_runs')
    .update({
      status,
      stats,
      source_results: sourceResults,
      error: error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (dbError) console.warn(`[db] clôture du run : ${dbError.message}`);
}
