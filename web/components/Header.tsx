'use client';

import { formatDateTime } from '@/lib/format';
import type { RunReport } from '@/lib/types';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function Header({ run, current }: { run: RunReport | null; current: 'accueil' | 'reglages' }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-baseline gap-3">
          <a href={`${BASE}/`} className="text-xl font-semibold tracking-tight">
            ⛵ Find-it
          </a>
          <span className="hidden text-sm text-text-muted sm:inline">Voiliers, filtrés pour vous</span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <RunStatus run={run} />
          <a
            href={current === 'reglages' ? `${BASE}/` : `${BASE}/reglages/`}
            className="rounded-lg border border-border px-3 py-1.5 hover:border-accent"
          >
            {current === 'reglages' ? 'Retour aux annonces' : 'Mes critères'}
          </a>
        </div>
      </div>
    </header>
  );
}

function RunStatus({ run }: { run: RunReport | null }) {
  if (!run) return <span className="hidden text-text-muted sm:inline">Aucune collecte encore effectuée</span>;

  const tone =
    run.status === 'success' ? 'text-good' : run.status === 'partial' ? 'text-warn' : 'text-warn';
  const label =
    run.status === 'success' ? 'à jour' : run.status === 'partial' ? 'partielle' : 'en échec';

  const failing = Object.entries(run.sources ?? {})
    .filter(([, r]) => (r?.errors?.length ?? 0) > 0)
    .map(([name]) => name);

  return (
    <span
      className={`${tone} hidden sm:inline`}
      title={
        failing.length > 0
          ? `Sources en difficulté : ${failing.join(', ')}`
          : 'Toutes les sources ont répondu'
      }
    >
      Collecte {label} · {formatDateTime(run.finishedAt)}
    </span>
  );
}
