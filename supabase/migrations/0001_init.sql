-- Find-it — schéma initial
-- Agrégateur d'annonces de voiliers (Leboncoin, sites spécialisés, Facebook Marketplace)
--
-- Principe : le scraper stocke des FAITS (prix, longueur extraite, année, localisation…).
-- Les CRITÈRES de recherche vivent dans une table éditable depuis le site, et le
-- filtrage « correspond à mes critères » est calculé par une vue SQL. Changer un
-- critère prend effet immédiatement, sans re-scraper.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Annonces
-- ---------------------------------------------------------------------------

create table if not exists listings (
  id                 uuid primary key default gen_random_uuid(),

  -- Identité de l'annonce chez la source
  source             text not null,          -- 'leboncoin' | 'youboat' | 'bateaux-occasion' | 'facebook'
  source_id          text not null,          -- identifiant natif chez la source
  url                text not null,

  -- Contenu brut
  title              text not null,
  description        text,
  images             text[] not null default '{}',

  -- Prix
  price_eur          integer,                -- null = « prix non communiqué »
  price_is_negotiable boolean not null default false,

  -- Localisation
  location_label     text,                   -- tel qu'affiché ("La Rochelle (17)")
  postal_code        text,
  department         text,                   -- code département sur 2-3 car. ("17", "2A")
  facade             text,                   -- 'mediterranee' | 'atlantique' | 'manche' | 'interieur' | null
  lat                double precision,
  lng                double precision,

  -- Caractéristiques extraites (le coeur de la valeur ajoutée)
  length_m           numeric(5,2),
  length_source      text,                   -- 'explicit_m' | 'feet' | 'model_db' | 'model_heuristic' | 'llm' | null
  length_confidence  numeric(3,2),           -- 0.00 → 1.00
  hull_type          text,                   -- 'monocoque' | 'catamaran' | 'trimaran' | null
  boat_kind          text,                   -- 'voilier' | 'moteur' | 'autre' | null
  year_built         integer,
  material           text,                   -- 'polyester' | 'acier' | 'aluminium' | 'bois' | 'ferrociment' | null
  engine_type        text,                   -- 'inboard' | 'outboard' | 'none' | null
  draft_m            numeric(4,2),
  berth_included     boolean,                -- place de port incluse
  afloat             boolean,                -- à flot (true) / à terre (false)
  is_project         boolean not null default false,  -- épave, pour pièces, à restaurer, coque nue
  project_reason     text,
  seller_type        text,                   -- 'particulier' | 'pro' | null

  -- Scoring (qualité de l'affaire, indépendant des critères)
  score              numeric(5,2) not null default 0,
  score_breakdown    jsonb not null default '{}'::jsonb,

  -- Cycle de vie
  status             text not null default 'active',   -- 'active' | 'gone'
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  published_at       timestamptz,
  gone_at            timestamptz,

  -- Suivi utilisateur
  is_favorite        boolean not null default false,
  is_hidden          boolean not null default false,
  user_note          text,

  raw                jsonb not null default '{}'::jsonb,
  updated_at         timestamptz not null default now(),

  constraint listings_source_id_unique unique (source, source_id)
);

create index if not exists listings_status_idx        on listings (status);
create index if not exists listings_first_seen_idx    on listings (first_seen_at desc);
create index if not exists listings_price_idx         on listings (price_eur);
create index if not exists listings_length_idx        on listings (length_m);
create index if not exists listings_score_idx         on listings (score desc);
create index if not exists listings_department_idx    on listings (department);

-- ---------------------------------------------------------------------------
-- Historique de prix — permet de détecter les baisses (excellent signal d'achat)
-- ---------------------------------------------------------------------------

create table if not exists listing_price_history (
  id          bigserial primary key,
  listing_id  uuid not null references listings (id) on delete cascade,
  price_eur   integer not null,
  observed_at timestamptz not null default now()
);

create index if not exists price_history_listing_idx on listing_price_history (listing_id, observed_at desc);

-- ---------------------------------------------------------------------------
-- Journal des exécutions du scraper
-- ---------------------------------------------------------------------------

create table if not exists scrape_runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running',   -- 'running' | 'success' | 'partial' | 'failed'
  trigger       text,                              -- 'schedule' | 'manual'
  stats         jsonb not null default '{}'::jsonb,
  source_results jsonb not null default '{}'::jsonb,
  error         text
);

create index if not exists scrape_runs_started_idx on scrape_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Critères de recherche (singleton, éditable depuis le site)
-- ---------------------------------------------------------------------------

create table if not exists search_criteria (
  id                    boolean primary key default true,
  min_length_m          numeric(5,2) not null default 9.5,
  ideal_min_length_m    numeric(5,2) not null default 10.0,
  max_price_eur         integer      not null default 22000,
  ideal_max_price_eur   integer      not null default 20000,
  max_year_built        integer,
  min_year_built        integer,
  allowed_hull_types    text[]       not null default '{monocoque,catamaran,trimaran}',
  allowed_departments   text[],                       -- null = France entière
  allowed_facades       text[],                       -- null = toutes
  exclude_projects      boolean      not null default true,
  exclude_pro_sellers   boolean      not null default false,
  include_unknown_length boolean     not null default true,  -- bac « à vérifier »
  updated_at            timestamptz  not null default now(),
  constraint search_criteria_singleton check (id)
);

insert into search_criteria (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Vue enrichie : applique les critères courants à chaque annonce
-- ---------------------------------------------------------------------------

create or replace view listings_scored as
select
  l.*,
  c.min_length_m,
  c.max_price_eur,

  -- Baisse de prix depuis la première observation
  (
    select min(h.price_eur) from listing_price_history h where h.listing_id = l.id
  ) as lowest_price_eur,
  (
    select max(h.price_eur) from listing_price_history h where h.listing_id = l.id
  ) as highest_price_eur,

  -- Prix au mètre : le meilleur indicateur de bonne affaire à taille comparable
  case
    when l.price_eur is not null and l.length_m is not null and l.length_m > 0
      then round(l.price_eur / l.length_m)
    else null
  end as price_per_meter,

  l.first_seen_at > (now() - interval '24 hours') as is_new_today,

  -- Correspond aux critères ?
  (
        l.status = 'active'
    and not l.is_hidden
    and (l.price_eur is null or l.price_eur <= c.max_price_eur)
    and (
          (l.length_m is not null and l.length_m >= c.min_length_m)
       or (l.length_m is null and c.include_unknown_length)
    )
    and (l.hull_type is null or l.hull_type = any (c.allowed_hull_types))
    and (c.allowed_departments is null or l.department = any (c.allowed_departments))
    and (c.allowed_facades is null or l.facade = any (c.allowed_facades))
    and (not c.exclude_projects or not l.is_project)
    and (not c.exclude_pro_sellers or l.seller_type is distinct from 'pro')
    and (c.min_year_built is null or l.year_built is null or l.year_built >= c.min_year_built)
    and (c.max_year_built is null or l.year_built is null or l.year_built <= c.max_year_built)
  ) as matches_criteria,

  -- Coche toutes les cases « idéales » (≥ 10 m ET ≤ 20 000 €, longueur certaine)
  (
        l.length_m is not null and l.length_m >= c.ideal_min_length_m
    and l.price_eur is not null and l.price_eur <= c.ideal_max_price_eur
    and coalesce(l.length_confidence, 0) >= 0.7
    and not l.is_project
  ) as is_ideal,

  -- Longueur incertaine → bac « à vérifier »
  (l.length_m is null or coalesce(l.length_confidence, 0) < 0.5) as needs_review

from listings l
cross join search_criteria c
where c.id = true;

-- ---------------------------------------------------------------------------
-- Sécurité : RLS activé sans policy publique.
-- Le site interroge Supabase côté serveur avec la service_role key (jamais
-- exposée au navigateur), et l'ensemble du site est protégé par mot de passe.
-- La clé anon ne peut donc rien lire, même si elle fuite.
-- ---------------------------------------------------------------------------

alter table listings              enable row level security;
alter table listing_price_history enable row level security;
alter table scrape_runs           enable row level security;
alter table search_criteria       enable row level security;

-- Une vue s'exécute par défaut avec les droits de son PROPRIÉTAIRE, ce qui lui
-- ferait contourner le RLS des tables sous-jacentes : la clé anon pourrait
-- alors tout lire via `listings_scored`. `security_invoker` force la vue à
-- s'exécuter avec les droits de l'appelant. (PostgreSQL 15+.)
alter view listings_scored set (security_invoker = on);

-- Ceinture et bretelles : on retire explicitement tout accès aux rôles publics.
-- Seule la service_role, utilisée côté serveur, conserve l'accès.
revoke all on listings_scored        from anon, authenticated;
revoke all on listings               from anon, authenticated;
revoke all on listing_price_history  from anon, authenticated;
revoke all on scrape_runs            from anon, authenticated;
revoke all on search_criteria        from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Déclencheur : updated_at
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists listings_touch_updated_at on listings;
create trigger listings_touch_updated_at
  before update on listings
  for each row execute function touch_updated_at();

drop trigger if exists criteria_touch_updated_at on search_criteria;
create trigger criteria_touch_updated_at
  before update on search_criteria
  for each row execute function touch_updated_at();
