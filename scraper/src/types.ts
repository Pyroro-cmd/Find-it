/**
 * Champs qu'une source connaît de façon certaine, sans avoir à les deviner.
 *
 * Leboncoin oblige à extraire la longueur du texte libre ; les sites
 * spécialisés, eux, l'affichent dans un champ dédié (« 14,73 x 4,49 m »).
 * Quand c'est le cas, il serait absurde de repasser par les regex : ces
 * valeurs court-circuitent l'extraction et sont marquées comme fiables.
 */
export type KnownFields = {
  lengthM?: number | null;
  yearBuilt?: number | null;
  boatKind?: 'voilier' | 'moteur' | 'autre' | null;
  hullType?: 'monocoque' | 'catamaran' | 'trimaran' | null;
  country?: string | null;
};

/** Ce qu'une source sait produire, avant tout enrichissement. */
export type RawListing = {
  source: string;
  sourceId: string;
  url: string;
  title: string;
  description: string | null;
  priceEur: number | null;
  locationLabel: string | null;
  postalCode: string | null;
  images: string[];
  publishedAt: string | null;
  sellerType: 'pro' | 'particulier' | null;
  known?: KnownFields;
  /** Charge utile d'origine, conservée pour pouvoir ré-enrichir sans re-scraper. */
  raw: Record<string, unknown>;
};

/** Une annonce prête à être écrite en base. */
export type EnrichedListing = RawListing & {
  department: string | null;
  facade: string | null;
  country: string | null;
  lengthM: number | null;
  /** 'source_field' | 'explicit_m' | 'feet' | 'model_db' | 'model_heuristic' | 'llm' */
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
  score: number;
  scoreBreakdown: Record<string, number | string>;
};

export type SourceResult = {
  source: string;
  listings: RawListing[];
  errors: string[];
  /** Vrai si la source a été atteinte, même partiellement. */
  reachable: boolean;
};

export interface Source {
  readonly name: string;
  /** Une source désactivée est ignorée sans faire échouer la collecte. */
  isEnabled(): boolean;
  collect(): Promise<SourceResult>;
}
