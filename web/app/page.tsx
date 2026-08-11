import { Filters } from '@/components/Filters';
import { Header } from '@/components/Header';
import { ListingCard } from '@/components/ListingCard';
import { Tabs } from '@/components/Tabs';
import { fetchCounts, fetchCriteria, fetchLastRun, fetchListings } from '@/lib/queries';
import { formatLength, formatPrice } from '@/lib/format';
import type { Tab } from '@/lib/types';

// Les données changent une fois par jour, mais les actions (favori, masquer)
// doivent se voir immédiatement : on rend à la demande, sans cache de page.
export const dynamic = 'force-dynamic';

const VALID_TABS: Tab[] = ['nouveautes', 'toutes', 'ideales', 'a-verifier', 'favoris', 'baisses'];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab: Tab = VALID_TABS.includes(params.vue as Tab) ? (params.vue as Tab) : 'nouveautes';

  const filters = {
    tab,
    facade: params.facade || undefined,
    source: params.source || undefined,
    maxPrice: params.prixmax ? Number(params.prixmax) : undefined,
    minLength: params.longmin ? Number(params.longmin) : undefined,
    search: params.recherche || undefined,
  };

  const [listings, counts, criteria, run] = await Promise.all([
    fetchListings(filters),
    fetchCounts(),
    fetchCriteria(),
    fetchLastRun(),
  ]);

  return (
    <>
      <Header run={run} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs active={tab} counts={counts} query={params} />
          <p className="text-sm text-text-muted">
            Critères : plus de {formatLength(criteria.min_length_m)}, moins de{' '}
            {formatPrice(criteria.max_price_eur)}
          </p>
        </div>

        <div className="mb-6">
          <Filters
            tab={tab}
            values={{
              facade: params.facade,
              source: params.source,
              maxPrice: params.prixmax,
              minLength: params.longmin,
              search: params.recherche,
            }}
          />
        </div>

        {tab === 'a-verifier' && listings.length > 0 ? (
          <p className="mb-4 rounded-lg border border-border bg-warn-soft px-4 py-3 text-sm text-warn">
            Ces annonces n'indiquent pas leur longueur de façon exploitable, et le modèle n'a pas
            permis de la déduire avec certitude. Elles ne sont pas écartées pour autant : mieux vaut
            en vérifier quelques-unes à la main que rater le bon bateau.
          </p>
        ) : null}

        {listings.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const messages: Record<Tab, string> = {
    nouveautes:
      "Aucune nouvelle annonce depuis 24 h. C'est normal certains jours : le marché du voilier d'occasion est lent. Regardez « Toutes » pour l'ensemble des annonces retenues.",
    toutes:
      "Aucune annonce ne correspond à vos critères pour l'instant. Essayez de les assouplir dans « Critères » — un demi-mètre ou mille euros changent souvent beaucoup.",
    ideales: 'Aucun coup de cœur pour le moment — il en passe quelques-uns par mois.',
    'a-verifier': 'Rien à vérifier : toutes les annonces retenues ont une longueur exploitable.',
    favoris: "Vous n'avez encore mis aucune annonce de côté. L'étoile sur une carte l'ajoute ici.",
    baisses: 'Aucune baisse de prix constatée sur les annonces suivies.',
  };

  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <div className="mb-3 text-3xl opacity-40">⛵</div>
      <p className="mx-auto max-w-md text-sm text-text-muted">{messages[tab]}</p>
    </div>
  );
}
