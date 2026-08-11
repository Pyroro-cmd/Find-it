import { updateCriteria } from '@/app/actions';
import { Header } from '@/components/Header';
import { fetchCriteria, fetchLastRun } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [criteria, run] = await Promise.all([fetchCriteria(), fetchLastRun()]);

  return (
    <>
      <Header run={run} />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Critères de recherche</h1>
        <p className="mt-2 text-sm text-text-muted">
          Ces critères filtrent les annonces déjà collectées : les modifier prend effet
          immédiatement, sans attendre la collecte du lendemain. Rien n'est supprimé — une annonce
          écartée aujourd'hui réapparaît si vous assouplissez un seuil.
        </p>

        <form action={updateCriteria} className="mt-8 space-y-8">
          <Section
            title="Taille et budget"
            note="Le seuil « idéal » ne filtre pas : il sert à repérer les annonces qui cochent toutes les cases, mises en avant dans l'onglet Coups de cœur."
          >
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                name="min_length_m"
                label="Longueur minimale (m)"
                defaultValue={criteria.min_length_m}
                step={0.1}
                hint="En dessous, l'annonce est écartée"
              />
              <NumberField
                name="ideal_min_length_m"
                label="Longueur idéale (m)"
                defaultValue={criteria.ideal_min_length_m}
                step={0.1}
              />
              <NumberField
                name="max_price_eur"
                label="Budget maximal (€)"
                defaultValue={criteria.max_price_eur}
                step={500}
                hint="Au-dessus, l'annonce est écartée"
              />
              <NumberField
                name="ideal_max_price_eur"
                label="Budget idéal (€)"
                defaultValue={criteria.ideal_max_price_eur}
                step={500}
              />
            </div>
          </Section>

          <Section title="Type de bateau">
            <CheckboxGroup
              name="allowed_hull_types"
              options={[
                ['monocoque', 'Monocoque'],
                ['catamaran', 'Catamaran'],
                ['trimaran', 'Trimaran'],
              ]}
              selected={criteria.allowed_hull_types}
            />
            <div className="mt-4 grid grid-cols-2 gap-4">
              <NumberField
                name="min_year_built"
                label="Année minimale"
                defaultValue={criteria.min_year_built ?? ''}
                step={1}
                hint="Laisser vide pour ne pas filtrer"
              />
              <NumberField
                name="max_year_built"
                label="Année maximale"
                defaultValue={criteria.max_year_built ?? ''}
                step={1}
              />
            </div>
          </Section>

          <Section
            title="Zone géographique"
            note="Aucune case cochée = toute la France."
          >
            <CheckboxGroup
              name="allowed_facades"
              options={[
                ['mediterranee', 'Méditerranée'],
                ['atlantique', 'Atlantique'],
                ['manche', 'Manche / Mer du Nord'],
                ['interieur', 'Intérieur (lacs, fleuves)'],
              ]}
              selected={criteria.allowed_facades ?? []}
            />
          </Section>

          <Section title="Exclusions">
            <div className="space-y-3">
              <Toggle
                name="exclude_projects"
                label="Écarter les épaves et bateaux pour pièces"
                hint="Les bateaux simplement « à rafraîchir » sont conservés : à ce budget, c'est la norme."
                defaultChecked={criteria.exclude_projects}
              />
              <Toggle
                name="exclude_pro_sellers"
                label="Écarter les vendeurs professionnels"
                hint="Les pros sont souvent plus chers, mais les annonces sont mieux documentées."
                defaultChecked={criteria.exclude_pro_sellers}
              />
              <Toggle
                name="include_unknown_length"
                label="Garder les annonces dont la longueur reste inconnue"
                hint="Recommandé : elles arrivent dans l'onglet « À vérifier » plutôt que d'être perdues."
                defaultChecked={criteria.include_unknown_length}
              />
            </div>
          </Section>

          <div className="flex items-center gap-4 border-t border-border pt-6">
            <button
              type="submit"
              className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
            >
              Enregistrer
            </button>
            <span className="text-xs text-text-muted">
              Dernière modification : {formatDateTime(criteria.updated_at)}
            </span>
          </div>
        </form>
      </main>
    </>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="font-medium">{title}</h2>
      {note ? <p className="mb-4 mt-1 text-xs text-text-muted">{note}</p> : <div className="mb-4" />}
      {children}
    </section>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  step,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: number | string;
  step: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        name={name}
        step={step}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
      />
      {hint ? <span className="mt-1 block text-xs text-text-muted">{hint}</span> : null}
    </label>
  );
}

function CheckboxGroup({
  name,
  options,
  selected,
}: {
  name: string;
  options: Array<[string, string]>;
  selected: string[];
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map(([value, label]) => (
        <label
          key={value}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-accent"
        >
          <input
            type="checkbox"
            name={name}
            value={value}
            defaultChecked={selected.includes(value)}
            className="accent-[var(--accent)]"
          />
          {label}
        </label>
      ))}
    </div>
  );
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 accent-[var(--accent)]"
      />
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-text-muted">{hint}</span>
      </span>
    </label>
  );
}
