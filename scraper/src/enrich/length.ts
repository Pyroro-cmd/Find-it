import { normalize } from '../util/text.js';
import { lengthFromModel } from './models.js';

export type LengthResult = {
  lengthM: number;
  confidence: number;
  source: 'explicit_m' | 'feet' | 'model_db' | 'model_heuristic';
  evidence: string;
  hullType?: 'monocoque' | 'catamaran' | 'trimaran';
};

/** Un voilier habitable plausible. Hors de cette plage, on rejette la mesure. */
const MIN_PLAUSIBLE_M = 4;
const MAX_PLAUSIBLE_M = 30;

/**
 * Mots qui, juste avant un nombre en mètres, indiquent que ce nombre N'EST PAS
 * la longueur : largeur, tirant d'eau, surface de voile, hauteur sous barrots…
 * C'est la principale source de faux positifs — une annonce contient souvent
 * cinq mesures en mètres et une seule est la bonne.
 */
const NOT_LENGTH_CONTEXT =
  /(largeur|bau|maitre bau|tirant d['’ ]?eau|tirant d['’ ]?air|te\b|ta\b|hauteur|franc[- ]bord|profondeur|surface|voile|grand[- ]voile|genois|gennaker|spi|quille|mat\b|mature|cabine|couchette|place de port|ponton|anneau|quai)\s*(?:[:=]|\s|de\s|d['’])*$/;

/** Idem, mais juste après : "12 m² de voilure", "3 m de largeur". */
const NOT_LENGTH_SUFFIX =
  /^\s*(?:2|²|carre|carres)?\s*(?:de\s+)?(largeur|voile|voilure|tirant|hauteur|profondeur|quille|mat|franc[- ]bord)/;

function plausible(v: number): boolean {
  return Number.isFinite(v) && v >= MIN_PLAUSIBLE_M && v <= MAX_PLAUSIBLE_M;
}

/** Rejette une mesure dont le contexte immédiat parle d'autre chose. */
function contextAllowsLength(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 40), start);
  const after = text.slice(end, end + 25);
  if (NOT_LENGTH_CONTEXT.test(before)) return false;
  if (NOT_LENGTH_SUFFIX.test(after)) return false;
  return true;
}

/**
 * Extrait la longueur d'un voilier depuis un titre + une description.
 *
 * Stratégie en cascade, de la plus fiable à la moins fiable :
 *   1. mesure explicitement étiquetée  ("longueur : 10,50 m")     → 0.95
 *   2. mesure métrique nue             ("10,50 m", "10m50")       → 0.75
 *   3. mesure en pieds                 ("34 pieds", "34 ft")      → 0.80
 *   4. table des modèles connus        ("Sun Odyssey 34")         → 0.80
 *   5. heuristique marque + nombre     ("Bavaria 36")             → 0.45
 *
 * Renvoie null quand rien de crédible n'est trouvé : l'annonce part alors dans
 * le bac « à vérifier » plutôt que d'être silencieusement écartée.
 */
export function extractLength(title: string, description?: string | null): LengthResult | null {
  const titleNorm = normalize(title);
  const fullNorm = normalize(`${title} . ${description ?? ''}`);

  // Le titre est bien plus fiable que la description (qui mentionne le tirant
  // d'eau, la surface de voile, la place de port…). On le passe en premier.
  for (const [text, bonus] of [
    [titleNorm, 0.05],
    [fullNorm, 0],
  ] as const) {
    const explicit = findLabelledLength(text);
    if (explicit) return { ...explicit, confidence: Math.min(0.98, explicit.confidence + bonus) };
  }

  for (const [text, bonus] of [
    [titleNorm, 0.05],
    [fullNorm, 0],
  ] as const) {
    const metric = findMetricLength(text);
    if (metric) return { ...metric, confidence: Math.min(0.95, metric.confidence + bonus) };

    const feet = findFeetLength(text);
    if (feet) return { ...feet, confidence: Math.min(0.95, feet.confidence + bonus) };
  }

  const model = lengthFromModel(titleNorm) ?? lengthFromModel(fullNorm);
  if (model && plausible(model.lengthM)) {
    return {
      lengthM: model.lengthM,
      confidence: model.confidence,
      source: model.source,
      evidence: `modèle « ${model.matched} »`,
      hullType: model.hullType,
    };
  }

  return null;
}

/** "longueur 10,50 m", "LHT : 10.5", "hors tout 10 m" */
function findLabelledLength(text: string): LengthResult | null {
  const re =
    /\b(longueur(?:\s+(?:hors[- ]tout|de\s+coque|totale))?|lht|l\.h\.t|hors[- ]tout|lg\.?|long\.?)\s*(?:hors[- ]tout)?\s*[:=]?\s*(\d{1,2})(?:[.,](\d{1,2}))?\s*(?:m\b|metres?\b|m[eè]tres?\b)?/g;

  for (const m of text.matchAll(re)) {
    const value = buildDecimal(m[2], m[3]);
    if (!plausible(value)) continue;
    return {
      lengthM: value,
      confidence: 0.9,
      source: 'explicit_m',
      evidence: m[0].trim(),
    };
  }
  return null;
}

/** "10,50 m", "10.5m", "10 m 50", "10m50" */
function findMetricLength(text: string): LengthResult | null {
  // Forme "10m50" / "10 m 50" — le décimal est APRÈS l'unité.
  const splitRe = /\b(\d{1,2})\s*m\s*(\d{1,2})\b(?!\s*(?:2|²))/g;
  for (const m of text.matchAll(splitRe)) {
    if (!contextAllowsLength(text, m.index ?? 0, (m.index ?? 0) + m[0].length)) continue;
    const value = buildDecimal(m[1], m[2]);
    if (!plausible(value)) continue;
    return { lengthM: value, confidence: 0.7, source: 'explicit_m', evidence: m[0].trim() };
  }

  // Forme "10,50 m" / "10.5 metres"
  const re = /\b(\d{1,2})(?:[.,](\d{1,2}))?\s*(?:m\b|metres?\b|m[eè]tres?\b)(?!\s*(?:2|²|carre))/g;
  for (const m of text.matchAll(re)) {
    if (!contextAllowsLength(text, m.index ?? 0, (m.index ?? 0) + m[0].length)) continue;
    const value = buildDecimal(m[1], m[2]);
    if (!plausible(value)) continue;
    // Un entier nu comme "10 m" est un peu moins sûr qu'une valeur décimale.
    const confidence = m[2] ? 0.75 : 0.65;
    return { lengthM: value, confidence, source: 'explicit_m', evidence: m[0].trim() };
  }

  return null;
}

/** "34 pieds", "34 ft", "34'" */
function findFeetLength(text: string): LengthResult | null {
  const re = /\b(\d{2})\s*(?:pieds?\b|ft\b|['’](?!\w))/g;
  for (const m of text.matchAll(re)) {
    if (!contextAllowsLength(text, m.index ?? 0, (m.index ?? 0) + m[0].length)) continue;
    const feet = Number(m[1]);
    if (feet < 15 || feet > 90) continue;
    const value = Math.round(feet * 0.3048 * 100) / 100;
    if (!plausible(value)) continue;
    return { lengthM: value, confidence: 0.8, source: 'feet', evidence: m[0].trim() };
  }
  return null;
}

/**
 * Assemble une valeur décimale à partir des parties entière et fractionnaire.
 * "10" + "5"  → 10.5   (un seul chiffre = dixièmes)
 * "10" + "50" → 10.50
 */
function buildDecimal(whole: string, frac?: string): number {
  if (!frac) return Number(whole);
  const decimals = frac.length === 1 ? Number(frac) / 10 : Number(frac) / 100;
  return Math.round((Number(whole) + decimals) * 100) / 100;
}
