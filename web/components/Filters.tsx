import type { Tab } from '@/lib/types';

/**
 * Filtres d'affichage, distincts des critères de recherche : ils affinent la
 * vue sans toucher à ce que le collecteur retient. Un simple formulaire GET —
 * l'état vit dans l'URL, donc une vue se partage et se met en favori.
 */
export function Filters({
  tab,
  values,
}: {
  tab: Tab;
  values: { facade?: string; source?: string; maxPrice?: string; minLength?: string; search?: string };
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
      <input type="hidden" name="vue" value={tab} />

      <Field label="Recherche">
        <input
          type="search"
          name="recherche"
          defaultValue={values.search ?? ''}
          placeholder="Sun Odyssey, ketch…"
          className="w-44 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </Field>

      <Field label="Façade">
        <select
          name="facade"
          defaultValue={values.facade ?? ''}
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
          name="source"
          defaultValue={values.source ?? ''}
          className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">Toutes</option>
          <option value="leboncoin">Leboncoin</option>
          <option value="youboat">Youboat</option>
          <option value="bateaux-occasion">Bateaux-Occasion</option>
          <option value="facebook">Facebook</option>
        </select>
      </Field>

      <Field label="Prix max">
        <input
          type="number"
          name="prixmax"
          min={0}
          step={500}
          defaultValue={values.maxPrice ?? ''}
          placeholder="€"
          className="w-28 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </Field>

      <Field label="Longueur min">
        <input
          type="number"
          name="longmin"
          min={0}
          step={0.5}
          defaultValue={values.minLength ?? ''}
          placeholder="m"
          className="w-24 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </Field>

      <button
        type="submit"
        className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
      >
        Filtrer
      </button>

      <a href={`/?vue=${tab}`} className="px-2 py-1.5 text-sm text-text-muted hover:text-text">
        Réinitialiser
      </a>
    </form>
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
