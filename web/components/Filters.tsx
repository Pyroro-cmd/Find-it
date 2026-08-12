'use client';

import { sourceLabel } from '@/lib/format';

export type ViewFilters = {
  search: string;
  facade: string;
  source: string;
  maxPrice: string;
  minLength: string;
};

export const EMPTY_FILTERS: ViewFilters = {
  search: '',
  facade: '',
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
  onChange,
}: {
  values: ViewFilters;
  sources: string[];
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
          <option value="mediterranee">Méditerranée</option>
          <option value="atlantique">Atlantique</option>
          <option value="manche">Manche / Nord</option>
          <option value="interieur">Intérieur</option>
        </select>
      </Field>

      <Field label="Source">
        <select
          value={values.source}
          onChange={(e) => set({ source: e.target.value })}
          className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">Toutes</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {sourceLabel(source)}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      {children}
    </label>
  );
}
