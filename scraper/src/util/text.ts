/** Minuscules, accents retirés, espaces normalisés — base de tous les matchs. */
export function normalize(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacritiques combinants
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convertit "12 500 €", "12.500", "12,5k" en nombre d'euros. */
export function parsePriceEur(input: string | null | undefined): number | null {
  if (!input) return null;
  const cleaned = normalize(input); // normalize() ramène déjà les espaces insécables à ' '

  const kMatch = cleaned.match(/(\d+(?:[.,]\d+)?)\s*k\s*(?:€|eur)/);
  if (kMatch) {
    const n = Number(kMatch[1].replace(',', '.'));
    if (Number.isFinite(n)) return Math.round(n * 1000);
  }

  // Retire les séparateurs de milliers (espace, point, apostrophe) et garde les chiffres.
  const digits = cleaned.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Extrait un code postal français (métropole + Corse + DOM). */
export function parsePostalCode(input: string | null | undefined): string | null {
  const m = normalize(input).match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

/** Déduit le code département depuis un code postal (gère 2A/2B). */
export function departmentFromPostalCode(postalCode: string | null): string | null {
  if (!postalCode || postalCode.length !== 5) return null;
  const prefix2 = postalCode.slice(0, 2);
  if (prefix2 === '20') {
    // Corse : 200xx/201xx = Corse-du-Sud (2A), 202xx/206xx = Haute-Corse (2B)
    const third = postalCode[2];
    return third === '0' || third === '1' ? '2A' : '2B';
  }
  if (['97', '98'].includes(prefix2)) return postalCode.slice(0, 3);
  return prefix2;
}

/** Façade maritime, pour filtrer par zone de navigation. */
const MEDITERRANEE = new Set([
  '06', '13', '2A', '2B', '11', '30', '34', '66', '83', '84', '04', '05',
]);
const ATLANTIQUE = new Set([
  '17', '33', '40', '44', '64', '85', '29', '56', '22', '35',
]);
const MANCHE = new Set(['14', '50', '76', '62', '59', '80', '27']);

export function facadeFromDepartment(dep: string | null): string | null {
  if (!dep) return null;
  if (MEDITERRANEE.has(dep)) return 'mediterranee';
  if (ATLANTIQUE.has(dep)) return 'atlantique';
  if (MANCHE.has(dep)) return 'manche';
  return 'interieur';
}

/** Année de construction plausible pour un bateau d'occasion. */
export function parseYear(text: string): number | null {
  const normalized = normalize(text);
  const currentYear = new Date().getFullYear();

  const labelled = normalized.match(
    /(?:annee|année|construit|construction|mise a l['’ ]eau|millesime)\D{0,15}((?:19|20)\d{2})/,
  );
  if (labelled) {
    const y = Number(labelled[1]);
    if (y >= 1940 && y <= currentYear) return y;
  }

  // Sinon, la plus ancienne année plausible mentionnée (souvent l'année du bateau,
  // les années récentes désignant plutôt des travaux ou des remplacements).
  const all = [...normalized.matchAll(/\b(19[4-9]\d|20[0-2]\d)\b/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= 1940 && y <= currentYear);
  if (all.length === 0) return null;
  return Math.min(...all);
}
