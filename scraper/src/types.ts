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
  /** Charge utile d'origine, conservée pour pouvoir ré-enrichir sans re-scraper. */
  raw: Record<string, unknown>;
};

/** Une annonce prête à être écrite en base. */
export type EnrichedListing = RawListing & {
  department: string | null;
  facade: string | null;
  lengthM: number | null;
  /** 'explicit_m' | 'feet' | 'model_db' | 'model_heuristic' | 'llm' */
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
