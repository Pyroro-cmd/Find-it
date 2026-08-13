/**
 * Marques parcourues en plus de la page générale.
 *
 * Le choix n'est pas alphabétique : ce sont les constructeurs dont les modèles
 * de neuf à douze mètres se négocient couramment sous les 20 000 €, c'est-à-dire
 * ceux qui peuplent réellement le segment recherché. Un Hallberg-Rassy ou un
 * Swan de la même taille se vend trois fois ce prix ; les parcourir coûterait
 * une requête pour rien.
 *
 * L'ordre compte : en cas d'interruption, les marques les plus fructueuses ont
 * déjà été vues.
 */
export const MARQUES_VOILIERS = [
  // Grande série française — le cœur du segment
  'jeanneau',
  'beneteau',
  'dufour',
  'gibsea',
  'kelt',
  'jouet',
  'feeling',
  'ecume-de-mer',
  'aloa',
  'super-maramu',
  // Grande série européenne, souvent abordable en occasion ancienne
  'bavaria',
  'dehler',
  'elan',
  'westerly',
  'moody',
  'etap',
  'hurley',
  'contessa',
  'albin',
  'marieholm',
];

/** Nombre de marques réellement parcourues, réglable sans toucher au code. */
export function marquesARetenir(max: number): string[] {
  return MARQUES_VOILIERS.slice(0, Math.max(0, max));
}
