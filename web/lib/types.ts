/** Une ligne de la vue `listings_scored`. */
export type ScoredListing = {
  id: string;
  source: string;
  source_id: string;
  url: string;
  title: string;
  description: string | null;
  images: string[];
  price_eur: number | null;
  location_label: string | null;
  postal_code: string | null;
  department: string | null;
  facade: string | null;
  length_m: number | null;
  length_source: string | null;
  length_confidence: number | null;
  hull_type: string | null;
  boat_kind: string | null;
  year_built: number | null;
  material: string | null;
  engine_type: string | null;
  draft_m: number | null;
  berth_included: boolean | null;
  afloat: boolean | null;
  is_project: boolean;
  project_reason: string | null;
  seller_type: string | null;
  score: number;
  score_breakdown: Record<string, number | string>;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  published_at: string | null;
  is_favorite: boolean;
  is_hidden: boolean;
  user_note: string | null;

  // Colonnes calculées par la vue
  lowest_price_eur: number | null;
  highest_price_eur: number | null;
  price_per_meter: number | null;
  is_new_today: boolean;
  matches_criteria: boolean;
  is_ideal: boolean;
  needs_review: boolean;
};

export type SearchCriteria = {
  min_length_m: number;
  ideal_min_length_m: number;
  max_price_eur: number;
  ideal_max_price_eur: number;
  max_year_built: number | null;
  min_year_built: number | null;
  allowed_hull_types: string[];
  allowed_departments: string[] | null;
  allowed_facades: string[] | null;
  exclude_projects: boolean;
  exclude_pro_sellers: boolean;
  include_unknown_length: boolean;
  updated_at: string;
};

export type ScrapeRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  stats: Record<string, number>;
  source_results: Record<string, { count?: number; errors?: string[]; skipped?: boolean }>;
  error: string | null;
};

export type Tab = 'nouveautes' | 'toutes' | 'ideales' | 'a-verifier' | 'favoris' | 'baisses';
