import { hideListing, toggleFavorite } from '@/app/actions';
import {
  confidenceLabel,
  facadeLabel,
  formatLength,
  formatPrice,
  formatRelativeDate,
  lengthSourceLabel,
  sourceLabel,
} from '@/lib/format';
import type { ScoredListing } from '@/lib/types';

export function ListingCard({ listing }: { listing: ScoredListing }) {
  const image = listing.images[0];
  const priceDrop =
    listing.price_eur != null &&
    listing.highest_price_eur != null &&
    listing.price_eur < listing.highest_price_eur
      ? Math.round(
          ((listing.highest_price_eur - listing.price_eur) / listing.highest_price_eur) * 100,
        )
      : null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:border-accent">
      <a href={listing.url} target="_blank" rel="noreferrer noopener" className="relative block">
        <div className="aspect-[4/3] w-full overflow-hidden bg-surface-muted">
          {image ? (
            // Images distantes de sources variées : la balise native évite un
            // proxy d'images et les erreurs de domaine non autorisé.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl opacity-30">⛵</div>
          )}
        </div>

        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {listing.is_new_today ? <Badge tone="accent">Nouveau</Badge> : null}
          {listing.is_ideal ? <Badge tone="good">Coup de cœur</Badge> : null}
          {priceDrop ? <Badge tone="good">−{priceDrop} %</Badge> : null}
          {listing.needs_review ? <Badge tone="warn">Longueur à vérifier</Badge> : null}
          {listing.is_project ? <Badge tone="warn">Projet</Badge> : null}
        </div>

        <div className="absolute right-2 top-2">
          <ScorePill score={listing.score} />
        </div>
      </a>

      <div className="flex flex-1 flex-col p-4">
        <a href={listing.url} target="_blank" rel="noreferrer noopener">
          <h3 className="line-clamp-2 font-medium leading-snug hover:text-accent">{listing.title}</h3>
        </a>

        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-lg font-semibold">{formatPrice(listing.price_eur)}</span>
          <span className="text-sm text-text-muted">{formatLength(listing.length_m)}</span>
        </div>

        {listing.price_per_meter ? (
          <p className="mt-0.5 text-xs text-text-muted">
            {listing.price_per_meter.toLocaleString('fr-FR')} € par mètre
          </p>
        ) : null}

        <dl className="mt-3 space-y-1 text-xs text-text-muted">
          {listing.length_m != null ? (
            <div>
              Longueur {lengthSourceLabel(listing.length_source)} — fiabilité{' '}
              {confidenceLabel(listing.length_confidence)}
            </div>
          ) : (
            <div>Longueur non déterminée automatiquement</div>
          )}
          <div>
            {[
              listing.location_label,
              facadeLabel(listing.facade),
              listing.year_built ? String(listing.year_built) : null,
              listing.hull_type,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </dl>

        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-text-muted">
          <span>
            {sourceLabel(listing.source)} · vue {formatRelativeDate(listing.first_seen_at)}
          </span>

          <div className="flex items-center gap-1">
            <form
              action={async () => {
                'use server';
                await toggleFavorite(listing.id, listing.is_favorite);
              }}
            >
              <button
                type="submit"
                title={listing.is_favorite ? 'Retirer des favoris' : 'Mettre en favori'}
                className="rounded px-1.5 py-1 hover:bg-surface-muted"
              >
                {listing.is_favorite ? '★' : '☆'}
              </button>
            </form>

            <form
              action={async () => {
                'use server';
                await hideListing(listing.id);
              }}
            >
              <button
                type="submit"
                title="Masquer cette annonce"
                className="rounded px-1.5 py-1 hover:bg-surface-muted"
              >
                ✕
              </button>
            </form>
          </div>
        </div>
      </div>
    </article>
  );
}

function Badge({ tone, children }: { tone: 'accent' | 'good' | 'warn'; children: React.ReactNode }) {
  const tones = {
    accent: 'bg-accent-soft text-accent',
    good: 'bg-good-soft text-good',
    warn: 'bg-warn-soft text-warn',
  } as const;

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  const tone = score >= 65 ? 'bg-good text-white' : score >= 40 ? 'bg-accent text-white' : 'bg-surface-muted text-text-muted';
  return (
    <span
      title="Score d'opportunité : rapport taille/prix, baisse de prix, qualité de l'annonce"
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {score}
    </span>
  );
}
