'use client';

import { useEffect, useMemo, useState } from 'react';
import { EMPTY_FILTERS, Filters, type ViewFilters } from '@/components/Filters';
import { Header } from '@/components/Header';
import { ListingCard } from '@/components/ListingCard';
import { Tabs } from '@/components/Tabs';
import {
  comparerPourAffichage,
  DEFAULT_CRITERIA,
  decorate,
  loadCriteria,
  loadIdSet,
  saveIdSet,
  selectForTab,
} from '@/lib/criteria';
import { formatLength, formatPrice } from '@/lib/format';
import { useDataset } from '@/lib/useDataset';
import type { Criteria, Tab } from '@/lib/types';

const ALL_TABS: Tab[] = ['nouveautes', 'ideales', 'toutes', 'baisses', 'a-verifier', 'favoris'];

export default function DashboardPage() {
  const state = useDataset();

  const [tab, setTab] = useState<Tab>('nouveautes');
  const [filters, setFilters] = useState<ViewFilters>(EMPTY_FILTERS);
  const [criteria, setCriteria] = useState<Criteria>(DEFAULT_CRITERIA);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // localStorage n'existe pas au rendu serveur : on ne le lit qu'une fois monté,
  // sinon le HTML généré et le premier rendu client divergeraient.
  useEffect(() => {
    setCriteria(loadCriteria());
    setFavorites(loadIdSet('favorites'));
    setHidden(loadIdSet('hidden'));
  }, []);

  const listings = state.status === 'ready' ? state.dataset.listings : [];

  const decorated = useMemo(
    () =>
      listings
        .filter((l) => !hidden.has(l.id))
        .map((l) => decorate(l, criteria, favorites))
        .sort(comparerPourAffichage),
    [listings, criteria, favorites, hidden],
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(ALL_TABS.map((t) => [t, selectForTab(decorated, t).length])) as Record<Tab, number>,
    [decorated],
  );

  const sources = useMemo(() => [...new Set(listings.map((l) => l.source))].sort(), [listings]);

  const countries = useMemo(
    () =>
      [...new Set(listings.map((l) => l.country).filter((c): c is string => Boolean(c)))].sort(
        (a, b) => a.localeCompare(b, 'fr'),
      ),
    [listings],
  );

  const visible = useMemo(() => {
    let result = selectForTab(decorated, tab);

    if (filters.search.trim()) {
      const needle = filters.search.trim().toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(needle) ||
          (l.description ?? '').toLowerCase().includes(needle),
      );
    }
    if (filters.facade === 'ouest') {
      result = result.filter((l) => l.facade === 'atlantique' || l.facade === 'manche');
    } else if (filters.facade) {
      result = result.filter((l) => l.facade === filters.facade);
    }
    if (filters.country) result = result.filter((l) => l.country === filters.country);
    if (filters.source) result = result.filter((l) => l.source === filters.source);
    if (filters.maxPrice) {
      const max = Number(filters.maxPrice);
      result = result.filter((l) => l.priceEur != null && l.priceEur <= max);
    }
    if (filters.minLength) {
      const min = Number(filters.minLength);
      result = result.filter((l) => l.lengthM != null && l.lengthM >= min);
    }

    return result;
  }, [decorated, tab, filters]);

  const toggleFavorite = (id: string) => {
    setFavorites((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIdSet('favorites', next);
      return next;
    });
  };

  const hide = (id: string) => {
    setHidden((previous) => {
      const next = new Set(previous).add(id);
      saveIdSet('hidden', next);
      return next;
    });
  };

  return (
    <>
      <Header run={state.status === 'ready' ? state.dataset.run : null} current="accueil" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {state.status === 'loading' ? <Notice>Chargement des annonces…</Notice> : null}

        {state.status === 'error' ? (
          <Notice tone="warn">
            Impossible de charger les annonces ({state.message}). Le fichier de données n'est
            peut-être pas encore publié — relancez la collecte depuis l'onglet Actions du dépôt.
          </Notice>
        ) : null}

        {state.status === 'empty' ? (
          <Notice>
            Aucune donnée pour l'instant. La première collecte n'a pas encore tourné : elle est
            programmée chaque matin à 8 h, et peut être déclenchée à la main depuis l'onglet
            Actions du dépôt GitHub.
          </Notice>
        ) : null}

        {state.status === 'ready' ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Tabs active={tab} counts={counts} onChange={setTab} />
              <p className="text-sm text-text-muted">
                Vos critères : plus de {formatLength(criteria.minLengthM)}, moins de{' '}
                {formatPrice(criteria.maxPriceEur)}
              </p>
            </div>

            <div className="mb-6">
              <Filters
                values={filters}
                sources={sources}
                countries={countries}
                onChange={setFilters}
              />
            </div>

            {tab === 'a-verifier' && visible.length > 0 ? (
              <Notice tone="warn">
                Ces annonces n'indiquent pas leur longueur de façon exploitable, et le modèle n'a
                pas permis de la déduire avec certitude. Elles ne sont pas écartées pour autant :
                mieux vaut en vérifier quelques-unes à la main que rater le bon bateau.
              </Notice>
            ) : null}

            {visible.length === 0 ? (
              <EmptyState tab={tab} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    onToggleFavorite={toggleFavorite}
                    onHide={hide}
                  />
                ))}
              </div>
            )}

            {hidden.size > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setHidden(new Set());
                  saveIdSet('hidden', new Set());
                }}
                className="mt-6 text-sm text-text-muted underline hover:text-text"
              >
                Réafficher les {hidden.size} annonce(s) masquée(s)
              </button>
            ) : null}
          </>
        ) : null}
      </main>
    </>
  );
}

function Notice({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warn' }) {
  const classes =
    tone === 'warn'
      ? 'border-border bg-warn-soft text-warn'
      : 'border-border bg-surface text-text-muted';
  return <p className={`mb-4 rounded-lg border px-4 py-3 text-sm ${classes}`}>{children}</p>;
}

function EmptyState({ tab }: { tab: Tab }) {
  const messages: Record<Tab, string> = {
    nouveautes:
      "Aucune nouvelle annonce depuis 24 h. C'est normal certains jours : le marché du voilier d'occasion est lent. Regardez « Toutes » pour l'ensemble des annonces retenues.",
    toutes:
      'Aucune annonce ne correspond à vos critères. Essayez de les assouplir dans « Mes critères » — un demi-mètre ou mille euros changent souvent beaucoup.',
    ideales: 'Aucun coup de cœur pour le moment — il en passe quelques-uns par mois.',
    'a-verifier': 'Rien à vérifier : toutes les annonces retenues ont une longueur exploitable.',
    favoris: "Vous n'avez encore mis aucune annonce de côté. L'étoile sur une carte l'ajoute ici.",
    baisses: 'Aucune baisse de prix constatée. Il en faut plusieurs collectes pour en repérer.',
  };

  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <div className="mb-3 text-3xl opacity-40">⛵</div>
      <p className="mx-auto max-w-md text-sm text-text-muted">{messages[tab]}</p>
    </div>
  );
}
