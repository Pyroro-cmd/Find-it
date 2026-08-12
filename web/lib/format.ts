export function formatPrice(value: number | null): string {
  if (value == null) return 'Prix non communiqué';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatLength(value: number | null): string {
  if (value == null) return 'Longueur inconnue';
  return `${value.toFixed(2).replace('.', ',').replace(/,00$/, '')} m`;
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  if (days < 31) return `il y a ${Math.floor(days / 7)} sem.`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

const SOURCE_LABELS: Record<string, string> = {
  leboncoin: 'Leboncoin',
  facebook: 'Facebook',
  youboat: 'Youboat',
  'bateaux-occasion': 'Bateaux-Occasion',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

const CONFIDENCE_LABELS: Array<[number, string]> = [
  [0.85, 'certaine'],
  [0.6, 'probable'],
  [0.3, 'estimée'],
  [0, 'incertaine'],
];

export function confidenceLabel(value: number | null): string {
  if (value == null) return 'inconnue';
  return CONFIDENCE_LABELS.find(([threshold]) => value >= threshold)?.[1] ?? 'incertaine';
}

const LENGTH_SOURCE_LABELS: Record<string, string> = {
  explicit_m: 'annoncée en mètres',
  feet: 'annoncée en pieds',
  model_db: 'déduite du modèle',
  model_heuristic: 'estimée d’après le modèle',
  llm: 'lue dans le texte par l’IA',
};

export function lengthSourceLabel(source: string | null): string {
  if (!source) return '';
  return LENGTH_SOURCE_LABELS[source] ?? source;
}

const FACADE_LABELS: Record<string, string> = {
  mediterranee: 'Méditerranée',
  atlantique: 'Atlantique',
  manche: 'Manche / Mer du Nord',
  interieur: 'Intérieur',
};

export function facadeLabel(facade: string | null): string {
  if (!facade) return '';
  return FACADE_LABELS[facade] ?? facade;
}
