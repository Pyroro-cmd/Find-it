import 'server-only';
import { supabase } from './supabase';
import type { ScoredListing, ScrapeRun, SearchCriteria, Tab } from './types';

export type ListingFilters = {
  tab: Tab;
  facade?: string;
  source?: string;
  maxPrice?: number;
  minLength?: number;
  search?: string;
};

export async function fetchListings(filters: ListingFilters): Promise<ScoredListing[]> {
  let query = supabase()
    .from('listings_scored')
    .select('*')
    .eq('status', 'active')
    .eq('is_hidden', false);

  switch (filters.tab) {
    case 'nouveautes':
      query = query.eq('matches_criteria', true).eq('is_new_today', true);
      break;
    case 'ideales':
      query = query.eq('is_ideal', true);
      break;
    case 'a-verifier':
      query = query.eq('needs_review', true).eq('matches_criteria', true);
      break;
    case 'favoris':
      query = query.eq('is_favorite', true);
      break;
    case 'baisses':
      // Une annonce dont le prix courant est sous le plus haut observé.
      query = query.eq('matches_criteria', true).not('highest_price_eur', 'is', null);
      break;
    case 'toutes':
    default:
      query = query.eq('matches_criteria', true);
      break;
  }

  if (filters.facade) query = query.eq('facade', filters.facade);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.maxPrice) query = query.lte('price_eur', filters.maxPrice);
  if (filters.minLength) query = query.gte('length_m', filters.minLength);
  if (filters.search) query = query.ilike('title', `%${filters.search}%`);

  const { data, error } = await query.order('score', { ascending: false }).limit(300);
  if (error) throw new Error(`Lecture des annonces : ${error.message}`);

  let listings = (data ?? []) as ScoredListing[];

  // Le filtre « baisses de prix » compare deux colonnes : PostgREST ne sait pas
  // l'exprimer, on l'applique donc ici, sur un jeu déjà restreint.
  if (filters.tab === 'baisses') {
    listings = listings.filter(
      (l) => l.price_eur != null && l.highest_price_eur != null && l.price_eur < l.highest_price_eur,
    );
  }

  return listings;
}

export async function fetchCriteria(): Promise<SearchCriteria> {
  const { data, error } = await supabase().from('search_criteria').select('*').eq('id', true).single();
  if (error) throw new Error(`Lecture des critères : ${error.message}`);
  return data as SearchCriteria;
}

export async function fetchLastRun(): Promise<ScrapeRun | null> {
  const { data, error } = await supabase()
    .from('scrape_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1);

  if (error) return null;
  return ((data ?? [])[0] as ScrapeRun) ?? null;
}

export type Counts = Record<Tab, number>;

export async function fetchCounts(): Promise<Counts> {
  const client = supabase();

  const base = () =>
    client
      .from('listings_scored')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('is_hidden', false);

  const [toutes, nouveautes, ideales, aVerifier, favoris] = await Promise.all([
    base().eq('matches_criteria', true),
    base().eq('matches_criteria', true).eq('is_new_today', true),
    base().eq('is_ideal', true),
    base().eq('matches_criteria', true).eq('needs_review', true),
    base().eq('is_favorite', true),
  ]);

  // Les baisses demandent la comparaison de deux colonnes : on compte à part.
  const drops = await fetchListings({ tab: 'baisses' });

  return {
    toutes: toutes.count ?? 0,
    nouveautes: nouveautes.count ?? 0,
    ideales: ideales.count ?? 0,
    'a-verifier': aVerifier.count ?? 0,
    favoris: favoris.count ?? 0,
    baisses: drops.length,
  };
}
