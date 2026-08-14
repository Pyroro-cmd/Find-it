'use client';

import { sourceLabel } from '@/lib/format';

export type ViewFilters = {
  search: string;
  facade: string;
  country: string;
  source: string;
  maxPrice: string;
  minLength: string;
};

export const EMPTY_FILTERS: ViewFilters = {
  search: '',
  facade: '',
  country: '',
  source: '',
  maxPrice: '',
  minLength: '',
};

/**
 * Filtres d'affichage, distincts des critères de recherche : ils affinent la
 * vue courante sans modifier ce qui est retenu comme « correspondant ».
 */
export function Filters({
  values,
  sources,
  countries,
  onChange,
}: {
  values: ViewFilters;
  sources: string[];
  /** Construite à partir des annonces présentes : pas de pays vide dans la liste. */
  countries: string[];
  onChange: (values: ViewFilters) => void;
}) {
  const set = (patch: Partial<ViewFilters>) => onChange({ ...values, ...patch });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
      <Field label="Recherche">
        <input
          type="search"
          value={values.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Sun Odyssey, ketch…"
          className="w-44 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </Field>

      <Field label="Façade">
        <select
          value={values.facade}
          onChange={(e) => set({ facade: e.target.value })}
          className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">Toutes</option>
          <option value="ouest">Côte ouest (Atlantique + Manche)</option>
          <option value="atlantique">Atlantique</option>
          <option value="manche">Manche / Nord</option>
          <option value="mediterranee">Méditerranée</option>
        </select>
      </Field>

      <Field label="Pays">
        <select
          value={values.country}
          onChange={(e) => set({ country: e.target.value })}
          className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">Tous</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Source">
        <select
          value={values.source}
          onChange={(e) => set({ source: e.target.value })}
          className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">Toutes</option>
          {sourcesAffichees(sources).map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Prix max">
        <input
          type="number"
          min={0}
          step={500}
          value={values.maxPrice}
          onChange={(e) => set({ maxPrice: e.target.value })}
          placeholder="€"
          className="w-28 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </Field>

      <Field label="Longueur min">
        <input
          type="number"
          min={0}
          step={0.5}
          value={values.minLength}
          onChange={(e) => set({ minLength: e.target.value })}
          placeholder="m"
          className="w-24 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </Field>

      <button
        type="button"
        onClick={() => onChange(EMPTY_FILTERS)}
        className="px-2 py-1.5 text-sm text-text-muted hover:text-text"
      >
        Réinitialiser
      </button>
    </div>
  );
}

/**
 * Sources proposées : celles présentes dans les annonces, plus Leboncoin et
 * Facebook même quand elles n'ont encore rien rapporté.
 *
 * Les voir absentes laissait croire à une panne, alors qu'elles attendent
 * simplement une collecte lancée depuis votre machine — les serveurs de GitHub
 * n'y ont pas accès. La mention le dit plutôt que de laisser deviner.
 */
export function sourcesAffichees(presentes: string[]): Array<{ value: string; label: string }> {
  const locales = ['leboncoin', 'facebook'];
  const toutes = [...new Set([...locales, ...presentes])];

  return toutes.map((source) => ({
    value: source,
    label:
      locales.includes(source) && !presentes.includes(source)
        ? `${sourceLabel(source)} — collecte locale`
        : sourceLabel(source),
  }));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      {children}
    </label>
  );
}
