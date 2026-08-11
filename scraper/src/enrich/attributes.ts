import { normalize, parseYear } from '../util/text.js';

export type Attributes = {
  boatKind: 'voilier' | 'moteur' | 'autre' | null;
  hullType: 'monocoque' | 'catamaran' | 'trimaran' | null;
  material: 'polyester' | 'acier' | 'aluminium' | 'bois' | 'ferrociment' | null;
  engineType: 'inboard' | 'outboard' | 'none' | null;
  yearBuilt: number | null;
  draftM: number | null;
  berthIncluded: boolean | null;
  afloat: boolean | null;
  isProject: boolean;
  projectReason: string | null;
};

/**
 * Épaves et projets lourds. Distingué des simples travaux d'entretien :
 * à moins de 20 000 € pour plus de 10 m, « à rafraîchir » est la norme et ne
 * doit pas exclure l'annonce ; « coque nue » ou « pour pièces », si.
 */
const HARD_PROJECT = [
  /\bepave\b/,
  /\bpour pieces\b/,
  /\bpieces detachees\b/,
  /\bcoque (?:nue|seule|vide)\b/,
  /\bsans (?:moteur|gréement|greement|mat)\b/,
  /\ba demolir\b/,
  /\bdestine a la (?:demolition|deconstruction)\b/,
  /\bcoule\b/,
  /\bnaufrage\b/,
  /\bnon navigable\b/,
  /\bimportants travaux\b/,
  /\bgros travaux\b/,
  /\bprojet de restauration\b/,
  /\bentierement a refaire\b/,
  /\btout a refaire\b/,
  /\bbateau a restaurer\b/,
];

const CATAMARAN = /\b(catamaran|cata\b|multicoque)/;
const TRIMARAN = /\b(trimaran|tri\b)/;

const MOTOR_BOAT =
  /\b(vedette|bateau a moteur|hors[- ]bord\s+\d{2,3}\s*cv|semi[- ]rigide|pneumatique|jet ?ski|coque open|day cruiser|timonier)\b/;
const SAILBOAT =
  /\b(voilier|sloop|ketch|goelette|yawl|cotre|dériveur|deriveur|quillard|gréement|greement|grand[- ]voile|genois|foc|spi|safran|quille)\b/;

export function extractAttributes(title: string, description?: string | null): Attributes {
  const text = normalize(`${title} . ${description ?? ''}`);

  return {
    boatKind: detectBoatKind(text),
    hullType: detectHullType(text),
    material: detectMaterial(text),
    engineType: detectEngine(text),
    yearBuilt: parseYear(text),
    draftM: detectDraft(text),
    berthIncluded: detectBerth(text),
    afloat: detectAfloat(text),
    ...detectProject(text),
  };
}

function detectBoatKind(text: string): Attributes['boatKind'] {
  const isSail = SAILBOAT.test(text);
  const isMotor = MOTOR_BOAT.test(text);
  if (isSail && !isMotor) return 'voilier';
  if (isMotor && !isSail) return 'moteur';
  if (isSail) return 'voilier'; // les deux : un voilier a souvent un moteur d'appoint
  return null;
}

function detectHullType(text: string): Attributes['hullType'] {
  if (TRIMARAN.test(text)) return 'trimaran';
  if (CATAMARAN.test(text)) return 'catamaran';
  if (SAILBOAT.test(text)) return 'monocoque';
  return null;
}

function detectMaterial(text: string): Attributes['material'] {
  if (/\bferro[- ]?ciment\b/.test(text)) return 'ferrociment';
  if (/\b(aluminium|alu\b)/.test(text)) return 'aluminium';
  if (/\bacier\b/.test(text)) return 'acier';
  if (/\b(bois|contreplaque|cp marine|chene|acajou)\b/.test(text)) return 'bois';
  if (/\b(polyester|fibre de verre|grp|composite|sandwich|stratifie)\b/.test(text)) return 'polyester';
  return null;
}

function detectEngine(text: string): Attributes['engineType'] {
  if (/\bsans moteur\b|\bmoteur (?:hs|mort|a refaire|non fonctionnel)\b/.test(text)) return 'none';
  if (/\b(in[- ]?board|moteur interieur|volvo penta|yanmar|nanni|perkins|bukh|vetus)\b/.test(text)) {
    return 'inboard';
  }
  if (/\b(hors[- ]?bord|out[- ]?board|moteur amovible)\b/.test(text)) return 'outboard';
  return null;
}

function detectDraft(text: string): number | null {
  const m = text.match(/tirant d['’ ]?eau\s*[:=]?\s*(\d)(?:[.,](\d{1,2}))?\s*m?/);
  if (!m) return null;
  const frac = m[2] ? (m[2].length === 1 ? Number(m[2]) / 10 : Number(m[2]) / 100) : 0;
  const value = Math.round((Number(m[1]) + frac) * 100) / 100;
  return value >= 0.3 && value <= 4 ? value : null;
}

function detectBerth(text: string): boolean | null {
  if (/\b(place de port|anneau|amarrage|ponton)\b.{0,40}\b(incluse?|comprise?|cedee?|transferable|disponible)\b/.test(text)) {
    return true;
  }
  if (/\b(sans place de port|place non (?:incluse|cedee|transmissible))\b/.test(text)) return false;
  return null;
}

function detectAfloat(text: string): boolean | null {
  if (/\b(a flot|au ponton|dans l['’ ]?eau|amarre au port)\b/.test(text)) return true;
  if (/\b(a terre|sur ber|au sec|sur remorque|hivernage a terre|terre[- ]plein)\b/.test(text)) return false;
  return null;
}

function detectProject(text: string): { isProject: boolean; projectReason: string | null } {
  for (const re of HARD_PROJECT) {
    const m = text.match(re);
    if (m) return { isProject: true, projectReason: m[0] };
  }
  return { isProject: false, projectReason: null };
}

/** Professionnel ou particulier — heuristique, à confirmer par la source si elle l'expose. */
export function detectSellerType(text: string): 'pro' | 'particulier' | null {
  const t = normalize(text);
  if (/\b(professionnel|siret|tva|societe|sarl|sas\b|courtier|broker|chantier naval|concessionnaire|mandat de vente)\b/.test(t)) {
    return 'pro';
  }
  if (/\bparticulier\b/.test(t)) return 'particulier';
  return null;
}
