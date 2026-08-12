'use client';

import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { DEFAULT_CRITERIA, loadCriteria, saveCriteria } from '@/lib/criteria';
import { useDataset } from '@/lib/useDataset';
import type { Criteria } from '@/lib/types';

export default function SettingsPage() {
  const [criteria, setCriteria] = useState<Criteria>(DEFAULT_CRITERIA);
  const [saved, setSaved] = useState(false);
  const state = useDataset();

  useEffect(() => setCriteria(loadCriteria()), []);

  // Proposer une liste figée de pays vieillirait mal ; celle-ci suit ce que la
  // collecte rapporte réellement.
  const countries = useMemo(() => {
    if (state.status !== 'ready') return [];
    const found = state.dataset.listings
      .map((l) => l.country)
      .filter((c): c is string => Boolean(c));
    return [...new Set(found)].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [state]);

  const set = (patch: Partial<Criteria>) => {
    setCriteria((previous) => ({ ...previous, ...patch }));
    setSaved(false);
  };

  const toggleInList = (list: string[] | null, value: string, fallback: string[]): string[] => {
    const current = list ?? fallback;
    return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    saveCriteria(criteria);
    setSaved(true);
  };

  return (
    <>
      <Header run={null} current="reglages" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Mes critères</h1>
        <p className="mt-2 text-sm text-text-muted">
          Ces critères filtrent les annonces déjà collectées : les modifier prend effet
          immédiatement, sans attendre la collecte du lendemain. Rien n'est supprimé — une annonce
          écartée aujourd'hui réapparaît si vous assouplissez un seuil.
        </p>
        <p className="mt-2 text-sm text-text-muted">
          Ils sont enregistrés dans <strong>ce navigateur</strong>. Chaque personne à qui vous
          partagez le lien a donc ses propres critères et ses propres favoris, sans vous gêner.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-8">
          <Section
            title="Taille et budget"
            note="Le seuil « idéal » ne filtre pas : il sert à repérer les annonces qui cochent toutes les cases, mises en avant dans l'onglet Coups de cœur."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                label="Longueur minimale (m)"
                hint="En dessous, l'annonce est écartée"
                value={criteria.minLengthM}
                step={0.1}
                onChange={(v) => set({ minLengthM: v ?? DEFAULT_CRITERIA.minLengthM })}
              />
              <NumberField
                label="Longueur idéale (m)"
                value={criteria.idealMinLengthM}
                step={0.1}
                onChange={(v) => set({ idealMinLengthM: v ?? DEFAULT_CRITERIA.idealMinLengthM })}
              />
              <NumberField
                label="Budget maximal (€)"
                hint="Au-dessus, l'annonce est écartée"
                value={criteria.maxPriceEur}
                step={500}
                onChange={(v) => set({ maxPriceEur: v ?? DEFAULT_CRITERIA.maxPriceEur })}
              />
              <NumberField
                label="Budget idéal (€)"
                value={criteria.idealMaxPriceEur}
                step={500}
                onChange={(v) => set({ idealMaxPriceEur: v ?? DEFAULT_CRITERIA.idealMaxPriceEur })}
              />
            </div>
          </Section>

          <Section title="Type de bateau">
            <CheckboxGroup
              options={[
                ['monocoque', 'Monocoque'],
                ['catamaran', 'Catamaran'],
                ['trimaran', 'Trimaran'],
              ]}
              selected={criteria.allowedHullTypes}
              onToggle={(value) =>
                set({
                  allowedHullTypes: toggleInList(
                    criteria.allowedHullTypes,
                    value,
                    DEFAULT_CRITERIA.allowedHullTypes,
                  ),
                })
              }
            />

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                label="Année minimale"
                hint="Laisser vide pour ne pas filtrer"
                value={criteria.minYearBuilt ?? ''}
                step={1}
                onChange={(v) => set({ minYearBuilt: v })}
              />
              <NumberField
                label="Année maximale"
                value={criteria.maxYearBuilt ?? ''}
                step={1}
                onChange={(v) => set({ maxYearBuilt: v })}
              />
            </div>
          </Section>

          <Section
            title="Pays"
            note="Aucune case cochée = tous les pays. La liste est celle des pays réellement présents dans les annonces collectées."
          >
            {countries.length === 0 ? (
              <p className="text-sm text-text-muted">
                Aucune annonce collectée pour l'instant : la liste des pays apparaîtra après la
                première collecte.
              </p>
            ) : (
              <CheckboxGroup
                options={countries.map((country) => [country, country] as [string, string])}
                selected={criteria.allowedCountries ?? []}
                onToggle={(value) => {
                  const next = toggleInList(criteria.allowedCountries, value, []);
                  set({ allowedCountries: next.length === 0 ? null : next });
                }}
              />
            )}
          </Section>

          <Section title="Exclusions">
            <div className="space-y-3">
              <Toggle
                label="Écarter les épaves et bateaux pour pièces"
                hint="Les bateaux simplement « à rafraîchir » sont conservés : à ce budget, c'est la norme."
                checked={criteria.excludeProjects}
                onChange={(v) => set({ excludeProjects: v })}
              />
              <Toggle
                label="Écarter les vendeurs professionnels"
                hint="Les pros sont souvent plus chers, mais les annonces sont mieux documentées."
                checked={criteria.excludeProSellers}
                onChange={(v) => set({ excludeProSellers: v })}
              />
              <Toggle
                label="Garder les annonces dont la longueur reste inconnue"
                hint="Recommandé : elles arrivent dans l'onglet « À vérifier » plutôt que d'être perdues."
                checked={criteria.includeUnknownLength}
                onChange={(v) => set({ includeUnknownLength: v })}
              />
            </div>
          </Section>

          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
            <button
              type="submit"
              className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => {
                setCriteria(DEFAULT_CRITERIA);
                saveCriteria(DEFAULT_CRITERIA);
                setSaved(true);
              }}
              className="text-sm text-text-muted underline hover:text-text"
            >
              Revenir aux valeurs par défaut
            </button>
            {saved ? <span className="text-sm text-good">Enregistré.</span> : null}
          </div>
        </form>
      </main>
    </>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="font-medium">{title}</h2>
      {note ? <p className="mb-4 mt-1 text-xs text-text-muted">{note}</p> : <div className="mb-4" />}
      {children}
    </section>
  );
}

function NumberField({
  label,
  hint,
  value,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | string;
  step: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
      />
      {hint ? <span className="mt-1 block text-xs text-text-muted">{hint}</span> : null}
    </label>
  );
}

function CheckboxGroup({
  options,
  selected,
  onToggle,
}: {
  options: Array<[string, string]>;
  selected: string[];
  onToggle: (value: string) => void;
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
            checked={selected.includes(value)}
            onChange={() => onToggle(value)}
            className="accent-[var(--accent)]"
          />
          {label}
        </label>
      ))}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-[var(--accent)]"
      />
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-text-muted">{hint}</span>
      </span>
    </label>
  );
}
