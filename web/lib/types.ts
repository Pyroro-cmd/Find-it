/** Miroir de `StoredListing` côté collecteur — le contrat du fichier JSON. */
export type Listing = {
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
  priceHistory: Array<{ price: number; at: string }>;
};

export type RunReport = {
  startedAt: string;
  finishedAt: string;
  status: 'success' | 'partial' | 'failed';
  trigger: string;
  stats: Record<string, number>;
  sources: Record<string, { count?: number; errors?: string[]; skipped?: boolean }>;
};

export type Dataset = {
  version: number;
  generatedAt: string;
  run: RunReport | null;
  listings: Listing[];
};

export type Criteria = {
  minLengthM: number;
  idealMinLengthM: number;
  maxPriceEur: number;
  idealMaxPriceEur: number;
  minYearBuilt: number | null;
  maxYearBuilt: number | null;
  allowedHullTypes: string[];
  /**
   * Pays retenus. `null` (ou liste vide) = tous.
   *
   * Remplace l'ancien filtre par façade maritime : les sites effectivement
   * joignables (boat24, theyachtmarket) annoncent un pays, pas un code postal
   * français, donc « Atlantique / Méditerranée » n'était plus calculable.
   */
  allowedCountries: string[] | null;
  excludeProjects: boolean;
  excludeProSellers: boolean;
  includeUnknownLength: boolean;
  /**
   * Remonte Leboncoin et Facebook en tête, à score égal ou presque.
   *
   * Ce sont des annonces de particuliers, en France, dont le prix se négocie —
   * autrement dit celles qu'on veut voir en premier. Les sites de courtiers
   * européens restent utiles mais viennent après.
   */
  prioriserFrance: boolean;
};

export type Tab = 'nouveautes' | 'ideales' | 'toutes' | 'baisses' | 'a-verifier' | 'favoris';

/** Annonce augmentée des informations dérivées des critères courants. */
export type DecoratedListing = Listing & {
  matchesCriteria: boolean;
  /** Rang d'affichage : plus il est élevé, plus l'annonce remonte. */
  priorite: number;
  isIdeal: boolean;
  needsReview: boolean;
  isNewToday: boolean;
  pricePerMeter: number | null;
  priceDropPct: number | null;
  isFavorite: boolean;
};
