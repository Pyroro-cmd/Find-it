'use client';

import {
  confidenceLabel,
  facadeLabel,
  formatLength,
  formatPrice,
  formatRelativeDate,
  lengthSourceLabel,
  sourceLabel,
} from '@/lib/format';
import type { DecoratedListing } from '@/lib/types';

export function ListingCard({
  listing,
  onToggleFavorite,
  onHide,
}: {
  listing: DecoratedListing;
  onToggleFavorite: (id: string) => void;
  onHide: (id: string) => void;
}) {
  const image = listing.images[0];

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:border-accent">
      <a href={listing.url} target="_blank" rel="noreferrer noopener" className="relative block">
        <div className="aspect-[4/3] w-full overflow-hidden bg-surface-muted">
          {image ? (
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
          {listing.isNewToday ? <Badge tone="accent">Nouveau</Badge> : null}
          {listing.isIdeal ? <Badge tone="good">Coup de cœur</Badge> : null}
          {listing.priceDropPct ? <Badge tone="good">−{listing.priceDropPct} %</Badge> : null}
          {listing.needsReview ? <Badge tone="warn">Longueur à vérifier</Badge> : null}
          {listing.isProject ? <Badge tone="warn">Projet</Badge> : null}
          {listing.status === 'gone' ? <Badge tone="warn">Annonce retirée</Badge> : null}
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
          <span className="text-lg font-semibold">{formatPrice(listing.priceEur)}</span>
          <span className="text-sm text-text-muted">{formatLength(listing.lengthM)}</span>
        </div>

        {listing.pricePerMeter ? (
          <p className="mt-0.5 text-xs text-text-muted">
            {listing.pricePerMeter.toLocaleString('fr-FR')} € par mètre
          </p>
        ) : null}

        <div className="mt-3 space-y-1 text-xs text-text-muted">
          {listing.lengthM != null ? (
            <div>
              Longueur {lengthSourceLabel(listing.lengthSource)} — fiabilité{' '}
              {confidenceLabel(listing.lengthConfidence)}
            </div>
          ) : (
            <div>Longueur non déterminée automatiquement</div>
          )}
          <div>
            {[
              listing.locationLabel,
              facadeLabel(listing.facade),
              listing.yearBuilt ? String(listing.yearBuilt) : null,
              listing.hullType,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-text-muted">
          <span>
            {sourceLabel(listing.source)} · vue {formatRelativeDate(listing.firstSeenAt)}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onToggleFavorite(listing.id)}
              title={listing.isFavorite ? 'Retirer des favoris' : 'Mettre en favori'}
              className="rounded px-1.5 py-1 text-base hover:bg-surface-muted"
            >
              {listing.isFavorite ? '★' : '☆'}
            </button>
            <button
              type="button"
              onClick={() => onHide(listing.id)}
              title="Masquer cette annonce"
              className="rounded px-1.5 py-1 hover:bg-surface-muted"
            >
              ✕
            </button>
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

  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 65 ? 'bg-good text-white' : score >= 40 ? 'bg-accent text-white' : 'bg-surface-muted text-text-muted';
  return (
    <span
      title="Score d'opportunité : rapport taille/prix, baisse de prix, qualité de l'annonce"
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {score}
    </span>
  );
}
