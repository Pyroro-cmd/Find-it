import type { Criteria, DecoratedListing, Listing, Tab } from './types';

/**
 * Critères et préférences vivent dans le navigateur (localStorage).
 *
 * Conséquence assumée du choix « aucun serveur, aucun compte » : chaque
 * visiteur a ses propres critères et ses propres favoris. Pour un usage
 * personnel c'est même préférable — votre cousin peut chercher un 8 mètres
 * pendant que vous cherchez un 11 mètres, sur le même site, sans se gêner.
 */

export const DEFAULT_CRITERIA: Criteria = {
  // Le seuil d'écartement est volontairement plus bas que l'objectif de 10 m.
  // Un bateau de 9,35 m annoncé à 7 500 € mérite d'être vu et écarté par vous,
  // pas d'être caché par quinze centimètres : c'est « Coups de cœur », plus bas,
  // qui applique le vrai critère.
  minLengthM: 9,
  idealMinLengthM: 10,
  maxPriceEur: 22000,
  idealMaxPriceEur: 20000,
  minYearBuilt: null,
  maxYearBuilt: null,
  allowedHullTypes: ['monocoque', 'catamaran', 'trimaran'],
  allowedCountries: null,
  excludeProjects: true,
  excludeProSellers: false,
  includeUnknownLength: true,
};

const CRITERIA_KEY = 'findit.criteria.v1';
const FAVORITES_KEY = 'findit.favorites.v1';
const HIDDEN_KEY = 'findit.hidden.v1';

export function loadCriteria(): Criteria {
  if (typeof window === 'undefined') return DEFAULT_CRITERIA;
  try {
    const raw = window.localStorage.getItem(CRITERIA_KEY);
    if (!raw) return DEFAULT_CRITERIA;
    // Fusion avec les valeurs par défaut : un critère ajouté dans une version
    // ultérieure ne casse pas les réglages déjà enregistrés.
    return { ...DEFAULT_CRITERIA, ...(JSON.parse(raw) as Partial<Criteria>) };
  } catch {
    return DEFAULT_CRITERIA;
  }
}

export function saveCriteria(criteria: Criteria): void {
  window.localStorage.setItem(CRITERIA_KEY, JSON.stringify(criteria));
}

export function loadIdSet(kind: 'favorites' | 'hidden'): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(kind === 'favorites' ? FAVORITES_KEY : HIDDEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveIdSet(kind: 'favorites' | 'hidden', ids: Set<string>): void {
  window.localStorage.setItem(
    kind === 'favorites' ? FAVORITES_KEY : HIDDEN_KEY,
    JSON.stringify([...ids]),
  );
}

/** Applique les critères et calcule tout ce que l'affichage doit connaître. */
export function decorate(
  listing: Listing,
  criteria: Criteria,
  favorites: Set<string>,
  now = Date.now(),
): DecoratedListing {
  const priceOk = listing.priceEur == null || listing.priceEur <= criteria.maxPriceEur;

  const lengthOk =
    listing.lengthM != null
      ? listing.lengthM >= criteria.minLengthM
      : criteria.includeUnknownLength;

  const hullOk = listing.hullType == null || criteria.allowedHullTypes.includes(listing.hullType);

  // Une annonce dont le pays est inconnu n'est jamais écartée : mieux vaut une
  // annonce à situer qu'une annonce perdue.
  const countryOk =
    criteria.allowedCountries == null ||
    criteria.allowedCountries.length === 0 ||
    listing.country == null ||
    criteria.allowedCountries.includes(listing.country);

  const projectOk = !criteria.excludeProjects || !listing.isProject;
  const sellerOk = !criteria.excludeProSellers || listing.sellerType !== 'pro';

  const yearOk =
    listing.yearBuilt == null ||
    ((criteria.minYearBuilt == null || listing.yearBuilt >= criteria.minYearBuilt) &&
      (criteria.maxYearBuilt == null || listing.yearBuilt <= criteria.maxYearBuilt));

  const matchesCriteria =
    listing.status === 'active' &&
    priceOk &&
    lengthOk &&
    hullOk &&
    countryOk &&
    projectOk &&
    sellerOk &&
    yearOk;

  const isIdeal =
    matchesCriteria &&
    listing.lengthM != null &&
    listing.lengthM >= criteria.idealMinLengthM &&
    listing.priceEur != null &&
    listing.priceEur <= criteria.idealMaxPriceEur &&
    (listing.lengthConfidence ?? 0) >= 0.7 &&
    !listing.isProject;

  const highest = listing.priceHistory.reduce<number | null>(
    (max, point) => (max == null || point.price > max ? point.price : max),
    null,
  );

  const priceDropPct =
    listing.priceEur != null && highest != null && listing.priceEur < highest
      ? Math.round(((highest - listing.priceEur) / highest) * 100)
      : null;

  return {
    ...listing,
    matchesCriteria,
    isIdeal,
    needsReview: listing.lengthM == null || (listing.lengthConfidence ?? 0) < 0.5,
    isNewToday: now - Date.parse(listing.firstSeenAt) < 24 * 3600 * 1000,
    pricePerMeter:
      listing.priceEur != null && listing.lengthM ? Math.round(listing.priceEur / listing.lengthM) : null,
    priceDropPct,
    isFavorite: favorites.has(listing.id),
  };
}

export function selectForTab(listings: DecoratedListing[], tab: Tab): DecoratedListing[] {
  switch (tab) {
    case 'nouveautes':
      return listings.filter((l) => l.matchesCriteria && l.isNewToday);
    case 'ideales':
      return listings.filter((l) => l.isIdeal);
    case 'baisses':
      return listings.filter((l) => l.matchesCriteria && l.priceDropPct != null);
    case 'a-verifier':
      return listings.filter((l) => l.matchesCriteria && l.needsReview);
    case 'favoris':
      // Les favoris restent visibles même s'ils ne cochent plus les critères :
      // les avoir mis de côté est un choix explicite qui prime.
      return listings.filter((l) => l.isFavorite);
    case 'toutes':
    default:
      return listings.filter((l) => l.matchesCriteria);
  }
}
