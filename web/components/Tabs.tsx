import type { Counts } from '@/lib/queries';
import type { Tab } from '@/lib/types';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'nouveautes', label: "Nouveautés du jour", hint: 'Apparues depuis 24 h' },
  { id: 'ideales', label: 'Coups de cœur', hint: 'Tous vos critères, longueur certaine' },
  { id: 'toutes', label: 'Toutes', hint: 'Tout ce qui correspond à vos critères' },
  { id: 'baisses', label: 'Baisses de prix', hint: 'Le vendeur a revu son prix' },
  { id: 'a-verifier', label: 'À vérifier', hint: 'Longueur incertaine' },
  { id: 'favoris', label: 'Favoris', hint: 'Vos annonces mises de côté' },
];

export function Tabs({
  active,
  counts,
  query,
}: {
  active: Tab;
  counts: Counts;
  query: Record<string, string | undefined>;
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Vues">
      {TABS.map((tab) => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
          if (value && key !== 'vue') params.set(key, value);
        }
        params.set('vue', tab.id);

        const isActive = tab.id === active;
        return (
          <a
            key={tab.id}
            href={`/?${params.toString()}`}
            title={tab.hint}
            aria-current={isActive ? 'page' : undefined}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              isActive
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-surface hover:border-accent'
            }`}
          >
            {tab.label}
            <span className={`ml-2 text-xs ${isActive ? 'opacity-80' : 'text-text-muted'}`}>
              {counts[tab.id]}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
