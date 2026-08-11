/**
 * Score de qualité d'affaire, sur 100.
 *
 * Volontairement INDÉPENDANT des critères de recherche : les critères disent
 * « est-ce que ça m'intéresse ? » (calculé en SQL, donc modifiable à chaud),
 * le score dit « est-ce une bonne affaire ? ». Une annonce peut correspondre
 * aux critères et scorer bas, ou l'inverse.
 *
 * L'indicateur central est le prix au mètre : à budget donné, c'est ce qui
 * sépare un 8 m bien équipé à 19 000 € d'un 11 m à 18 000 €.
 */

export type ScoreInput = {
  priceEur: number | null;
  lengthM: number | null;
  lengthConfidence: number | null;
  yearBuilt: number | null;
  isProject: boolean;
  boatKind: string | null;
  hullType: string | null;
  berthIncluded: boolean | null;
  engineType: string | null;
  imagesCount: number;
  descriptionLength: number;
  isNew: boolean;
  previousPriceEur: number | null;
};

export type ScoreResult = {
  score: number;
  breakdown: Record<string, number | string>;
};

/** Référence de marché pour un voilier d'occasion ancien : ~2 000 €/m. */
const PRICE_PER_METER_BENCHMARK = 2000;

export function computeScore(input: ScoreInput): ScoreResult {
  const breakdown: Record<string, number | string> = {};
  let score = 0;

  // --- Rapport taille / prix (0–40) : le coeur du score --------------------
  if (input.priceEur != null && input.lengthM != null && input.lengthM > 0) {
    const pricePerMeter = input.priceEur / input.lengthM;
    // 2× moins cher que la référence → 40 pts ; à la référence → 20 pts ;
    // 2× plus cher → 0 pt.
    const ratio = PRICE_PER_METER_BENCHMARK / pricePerMeter;
    const points = clamp(Math.round(20 * ratio), 0, 40);
    score += points;
    breakdown.rapport_taille_prix = points;
    breakdown.prix_au_metre = Math.round(pricePerMeter);
  } else {
    breakdown.rapport_taille_prix = 0;
    breakdown.note_prix = input.priceEur == null ? 'prix non communiqué' : 'longueur inconnue';
  }

  // --- Longueur absolue (0–20) --------------------------------------------
  if (input.lengthM != null) {
    // 9 m → 0 pt, 12 m et plus → 20 pts.
    const points = clamp(Math.round(((input.lengthM - 9) / 3) * 20), 0, 20);
    score += points;
    breakdown.longueur = points;
  }

  // --- Baisse de prix (0–15) : un vendeur qui baisse est un vendeur motivé --
  if (input.previousPriceEur != null && input.priceEur != null && input.priceEur < input.previousPriceEur) {
    const dropPct = (input.previousPriceEur - input.priceEur) / input.previousPriceEur;
    const points = clamp(Math.round(dropPct * 100), 0, 15);
    score += points;
    breakdown.baisse_de_prix = points;
    breakdown.baisse_pct = Math.round(dropPct * 100);
  }

  // --- Fiabilité de la donnée (0–10) --------------------------------------
  const confidencePoints = Math.round((input.lengthConfidence ?? 0) * 10);
  score += confidencePoints;
  breakdown.fiabilite_longueur = confidencePoints;

  // --- Qualité de l'annonce (0–10) ----------------------------------------
  let qualityPoints = 0;
  if (input.imagesCount >= 5) qualityPoints += 4;
  else if (input.imagesCount >= 2) qualityPoints += 2;
  if (input.descriptionLength >= 600) qualityPoints += 3;
  else if (input.descriptionLength >= 200) qualityPoints += 1;
  if (input.yearBuilt != null) qualityPoints += 3;
  score += qualityPoints;
  breakdown.qualite_annonce = qualityPoints;

  // --- Bonus ---------------------------------------------------------------
  let bonus = 0;
  if (input.isNew) bonus += 5;
  if (input.berthIncluded === true) bonus += 5; // une place de port vaut cher
  if (input.engineType === 'inboard') bonus += 3;
  score += bonus;
  if (bonus) breakdown.bonus = bonus;

  // --- Pénalités -----------------------------------------------------------
  let penalty = 0;
  if (input.isProject) penalty += 30;
  if (input.engineType === 'none') penalty += 10;
  if (input.boatKind === 'moteur') penalty += 40; // hors sujet : on cherche un voilier
  if (input.priceEur == null) penalty += 5;
  score -= penalty;
  if (penalty) breakdown.penalites = -penalty;

  const final = clamp(Math.round(score), 0, 100);
  breakdown.total = final;
  return { score: final, breakdown };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
