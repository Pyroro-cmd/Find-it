/**
 * Table de correspondance modèle → longueur hors-tout (mètres).
 *
 * Sur Leboncoin et Facebook, la longueur n'existe pas comme champ structuré.
 * Beaucoup d'annonces se contentent du modèle ("Sun Odyssey 34", "Gib'Sea 105").
 * Cette table couvre les voiliers d'occasion les plus courants sur le marché
 * français dans la tranche 8–13 m, qui est celle qui nous intéresse.
 *
 * Les longueurs sont des longueurs de coque hors-tout (LHT) approximatives :
 * elles varient de quelques centimètres selon les versions (quille longue /
 * relevable, safran suspendu…). Une précision au décimètre est largement
 * suffisante pour trier par « plus ou moins de 10 mètres ».
 */

export type ModelEntry = {
  /** Motif recherché dans le titre/description, en minuscules sans accents. */
  pattern: RegExp;
  lengthM: number;
  hullType?: 'monocoque' | 'catamaran' | 'trimaran';
};

/**
 * Attention à l'ordre : les motifs sont testés dans l'ordre et le premier qui
 * correspond gagne. Les modèles dont le nom est un préfixe d'un autre doivent
 * donc venir APRÈS le plus spécifique ("first 32s5" avant "first 32").
 */
export const MODEL_TABLE: ModelEntry[] = [
  // --- Jeanneau -----------------------------------------------------------
  { pattern: /\bsun\s*odyssey\s*52\b/, lengthM: 15.7 },
  { pattern: /\bsun\s*odyssey\s*45\b/, lengthM: 13.8 },
  { pattern: /\bsun\s*odyssey\s*42\b/, lengthM: 12.9 },
  { pattern: /\bsun\s*odyssey\s*40\b/, lengthM: 12.3 },
  { pattern: /\bsun\s*odyssey\s*37\b/, lengthM: 11.3 },
  { pattern: /\bsun\s*odyssey\s*36\b/, lengthM: 10.9 },
  { pattern: /\bsun\s*odyssey\s*35\b/, lengthM: 10.5 },
  { pattern: /\bsun\s*odyssey\s*34\b/, lengthM: 10.3 },
  { pattern: /\bsun\s*odyssey\s*32\b/, lengthM: 9.6 },
  { pattern: /\bsun\s*odyssey\s*30\b/, lengthM: 9.1 },
  { pattern: /\bsun\s*légende\s*41\b|\bsun\s*legende\s*41\b/, lengthM: 12.5 },
  { pattern: /\bsun\s*charm\s*39\b/, lengthM: 11.9 },
  { pattern: /\bsun\s*shine\s*38\b/, lengthM: 11.4 },
  { pattern: /\bsun\s*fizz\b/, lengthM: 11.6 },
  { pattern: /\bsun\s*dream\s*28\b/, lengthM: 8.5 },
  { pattern: /\bsun\s*way\s*25\b/, lengthM: 7.6 },
  { pattern: /\bsun\s*rise\s*34\b/, lengthM: 10.3 },
  { pattern: /\bsun\s*light\s*30\b/, lengthM: 9.2 },
  { pattern: /\bsun\s*magic\s*44\b/, lengthM: 13.4 },
  { pattern: /\battalia\s*32\b/, lengthM: 9.6 },
  { pattern: /\bfantasia\s*27\b|\bjeanneau\s*fantasia\b/, lengthM: 8.1 },
  { pattern: /\bespace\s*1000\b/, lengthM: 10.0 },
  { pattern: /\bjeanneau\s*symphonie\b|\bsymphonie\s*9\.?5\b/, lengthM: 9.5 },
  { pattern: /\bmelody\b/, lengthM: 10.4 },
  { pattern: /\barcadia\b/, lengthM: 8.0 },
  { pattern: /\bbrin\s*de\s*folie\b/, lengthM: 9.6 },
  { pattern: /\bevasion\s*37\b|\bévasion\s*37\b/, lengthM: 11.3 },
  { pattern: /\bevasion\s*34\b|\bévasion\s*34\b/, lengthM: 10.4 },
  { pattern: /\bevasion\s*32\b|\bévasion\s*32\b/, lengthM: 9.7 },
  { pattern: /\bevasion\s*28\b|\bévasion\s*28\b/, lengthM: 8.5 },
  { pattern: /\bvoyage\s*11\.?50\b/, lengthM: 11.5 },
  { pattern: /\bvoyage\s*12\.?50\b/, lengthM: 12.5 },
  { pattern: /\baquila\b/, lengthM: 8.6 },

  // --- Bénéteau -----------------------------------------------------------
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?523\b/, lengthM: 16.0 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?473\b/, lengthM: 14.3 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?430\b/, lengthM: 13.1 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?411\b/, lengthM: 12.4 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?400\b/, lengthM: 12.2 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?390\b/, lengthM: 11.9 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?381\b/, lengthM: 11.4 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?370\b/, lengthM: 11.3 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?361\b/, lengthM: 10.9 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?350\b/, lengthM: 10.4 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?351\b/, lengthM: 10.4 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?320\b/, lengthM: 9.6 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?311\b/, lengthM: 9.4 },
  { pattern: /\boc[ée]anis\s*(?:clipper\s*)?281\b/, lengthM: 8.5 },
  { pattern: /\bfirst\s*456\b/, lengthM: 13.8 },
  { pattern: /\bfirst\s*435\b/, lengthM: 13.2 },
  { pattern: /\bfirst\s*405\b/, lengthM: 12.3 },
  { pattern: /\bfirst\s*38\b/, lengthM: 11.6 },
  { pattern: /\bfirst\s*375\b/, lengthM: 11.4 },
  { pattern: /\bfirst\s*35s5\b/, lengthM: 10.6 },
  { pattern: /\bfirst\s*35\b/, lengthM: 10.6 },
  { pattern: /\bfirst\s*325\b/, lengthM: 9.9 },
  { pattern: /\bfirst\s*32s5\b/, lengthM: 9.8 },
  { pattern: /\bfirst\s*32\b/, lengthM: 9.7 },
  { pattern: /\bfirst\s*310\b/, lengthM: 9.5 },
  { pattern: /\bfirst\s*305\b/, lengthM: 9.2 },
  { pattern: /\bfirst\s*30\b/, lengthM: 9.2 },
  { pattern: /\bfirst\s*285\b/, lengthM: 8.6 },
  { pattern: /\bfirst\s*260\b/, lengthM: 7.9 },
  { pattern: /\bidylle\s*11\.?50\b/, lengthM: 11.5 },
  { pattern: /\bidylle\s*13\.?50\b/, lengthM: 13.5 },
  { pattern: /\bidylle\s*15\.?50\b/, lengthM: 15.5 },
  { pattern: /\bevasion\s*36\b/, lengthM: 10.9 },
  { pattern: /\bb[ée]n[ée]teau\s*forban\b/, lengthM: 8.0 },

  // --- Dufour -------------------------------------------------------------
  { pattern: /\bdufour\s*4800\b/, lengthM: 14.6 },
  { pattern: /\bdufour\s*4000\b/, lengthM: 12.2 },
  { pattern: /\bdufour\s*3800\b/, lengthM: 11.5 },
  { pattern: /\bdufour\s*36\s*classic\b/, lengthM: 11.0 },
  { pattern: /\bdufour\s*35\b/, lengthM: 10.6 },
  { pattern: /\bdufour\s*325\b/, lengthM: 9.7 },
  { pattern: /\bdufour\s*32\b/, lengthM: 9.7 },
  { pattern: /\bdufour\s*31\b/, lengthM: 9.4 },
  { pattern: /\bdufour\s*2800\b/, lengthM: 8.5 },
  { pattern: /\bdufour\s*1800\b/, lengthM: 5.5 },
  { pattern: /\bdufour\s*arpege\b|\barp[èe]ge\b/, lengthM: 9.3 },
  { pattern: /\bdufour\s*safari\b/, lengthM: 8.4 },
  { pattern: /\bdufour\s*sortil[èe]ge\b/, lengthM: 11.6 },
  { pattern: /\bdufour\s*gib\s*sea\s*105\b/, lengthM: 10.5 },

  // --- Gib'Sea ------------------------------------------------------------
  { pattern: /\bgib\s*[''`]?\s*sea\s*126\b/, lengthM: 12.6 },
  { pattern: /\bgib\s*[''`]?\s*sea\s*116\b/, lengthM: 11.6 },
  { pattern: /\bgib\s*[''`]?\s*sea\s*114\b/, lengthM: 11.4 },
  { pattern: /\bgib\s*[''`]?\s*sea\s*106\b/, lengthM: 10.6 },
  { pattern: /\bgib\s*[''`]?\s*sea\s*105\b/, lengthM: 10.5 },
  { pattern: /\bgib\s*[''`]?\s*sea\s*96\b/, lengthM: 9.6 },
  { pattern: /\bgib\s*[''`]?\s*sea\s*92\b/, lengthM: 9.2 },
  { pattern: /\bgib\s*[''`]?\s*sea\s*84\b/, lengthM: 8.4 },
  { pattern: /\bgib\s*[''`]?\s*sea\s*80\b/, lengthM: 8.0 },
  { pattern: /\bgib\s*[''`]?\s*sea\s*33\b/, lengthM: 10.0 },
  { pattern: /\bgib\s*[''`]?\s*sea\s*31\b/, lengthM: 9.4 },

  // --- Kelt / Jouët / Kirié ----------------------------------------------
  { pattern: /\bkelt\s*11\.?00\b/, lengthM: 11.0 },
  { pattern: /\bkelt\s*10\.?50\b/, lengthM: 10.5 },
  { pattern: /\bkelt\s*9\.?50\b/, lengthM: 9.5 },
  { pattern: /\bkelt\s*850\b/, lengthM: 8.5 },
  { pattern: /\bkelt\s*760\b/, lengthM: 7.6 },
  { pattern: /\bkelt\s*700\b/, lengthM: 7.0 },
  { pattern: /\bjou[ëe]t\s*1080\b/, lengthM: 10.8 },
  { pattern: /\bjou[ëe]t\s*1020\b/, lengthM: 10.2 },
  { pattern: /\bjou[ëe]t\s*940\b/, lengthM: 9.4 },
  { pattern: /\bjou[ëe]t\s*920\b/, lengthM: 9.2 },
  { pattern: /\bjou[ëe]t\s*760\b/, lengthM: 7.6 },
  { pattern: /\bfeeling\s*1090\b/, lengthM: 10.9 },
  { pattern: /\bfeeling\s*1040\b/, lengthM: 10.4 },
  { pattern: /\bfeeling\s*960\b/, lengthM: 9.6 },
  { pattern: /\bfeeling\s*920\b/, lengthM: 9.2 },
  { pattern: /\bfeeling\s*850\b/, lengthM: 8.5 },
  { pattern: /\bfeeling\s*32\b/, lengthM: 9.7 },
  { pattern: /\bfeeling\s*39\b/, lengthM: 11.9 },

  // --- Classiques françaises ---------------------------------------------
  { pattern: /\b[ée]cume\s*de\s*mer\b/, lengthM: 8.0 },
  { pattern: /\bsangria\b/, lengthM: 7.6 },
  { pattern: /\bmuscadet\b/, lengthM: 6.4 },
  { pattern: /\bcorsaire\b/, lengthM: 5.5 },
  { pattern: /\bmaraudeur\b/, lengthM: 6.9 },
  { pattern: /\barmagnac\b/, lengthM: 9.3 },
  { pattern: /\bgalion\b/, lengthM: 9.1 },
  { pattern: /\bcognac\b/, lengthM: 8.4 },
  { pattern: /\bromanee\b|\broman[ée]e\b/, lengthM: 10.2 },
  { pattern: /\bchallenger\s*(?:8|800)\b/, lengthM: 8.0 },
  { pattern: /\balpa\s*11\.?50\b/, lengthM: 11.5 },
  { pattern: /\balpa\s*9\.?50\b/, lengthM: 9.5 },
  { pattern: /\bcenturion\s*32\b/, lengthM: 9.8 },
  { pattern: /\bcenturion\s*38\b/, lengthM: 11.6 },
  { pattern: /\bcenturion\s*45\b/, lengthM: 13.7 },
  { pattern: /\bwauquiez\s*pretorien\b|\bpr[ée]torien\b/, lengthM: 10.7 },
  { pattern: /\bwauquiez\s*gladiateur\b|\bgladiateur\s*33\b/, lengthM: 10.0 },
  { pattern: /\bwauquiez\s*hood\s*38\b/, lengthM: 11.6 },
  { pattern: /\bamphora\s*(?:33|9\.?9)\b/, lengthM: 9.9 },
  { pattern: /\bnicholson\s*32\b/, lengthM: 9.7 },
  { pattern: /\brev[ée]\s*d[''`]?\s*antilles\b/, lengthM: 9.4 },
  { pattern: /\btrident\s*80\b/, lengthM: 8.0 },
  { pattern: /\bneptune\s*625\b/, lengthM: 6.25 },
  { pattern: /\bneptune\s*99\b/, lengthM: 9.9 },
  { pattern: /\bedel\s*(?:2|540)\b/, lengthM: 5.4 },
  { pattern: /\bedel\s*(?:4|665)\b/, lengthM: 6.65 },
  { pattern: /\bedel\s*(?:5|770)\b/, lengthM: 7.7 },

  // --- Constructeurs européens -------------------------------------------
  { pattern: /\bbavaria\s*(\d{2})\b/, lengthM: 0 }, // traité par heuristique (voir plus bas)
  { pattern: /\bhanse\s*(\d{3})\b/, lengthM: 0 },
  { pattern: /\bdehler\s*(\d{2})\b/, lengthM: 0 },
  { pattern: /\bcontest\s*3[0-9]\b/, lengthM: 10.5 },
  { pattern: /\bvan\s*de\s*stadt\b/, lengthM: 10.0 },
  { pattern: /\betap\s*(?:32|9\.?4)\b/, lengthM: 9.5 },
  { pattern: /\betap\s*(?:28|8\.?5)\b/, lengthM: 8.5 },
  { pattern: /\bnauticat\s*33\b/, lengthM: 10.1 },
  { pattern: /\bnauticat\s*38\b/, lengthM: 11.6 },
  { pattern: /\bwesterly\s*konsort\b/, lengthM: 8.8 },
  { pattern: /\bwesterly\s*fulmar\b/, lengthM: 9.8 },
  { pattern: /\bmoody\s*3[0-9]\b/, lengthM: 10.5 },
  { pattern: /\bsigma\s*33\b/, lengthM: 10.0 },
  { pattern: /\bcolvic\b/, lengthM: 10.5 },
  { pattern: /\bfisher\s*30\b/, lengthM: 9.1 },
  { pattern: /\bvindo\b/, lengthM: 10.0 },
  { pattern: /\bmaxi\s*95\b/, lengthM: 9.5 },
  { pattern: /\bmaxi\s*77\b/, lengthM: 7.7 },
  { pattern: /\bhallberg\s*rassy\s*3[0-9]\b/, lengthM: 10.5 },

  // --- Multicoques --------------------------------------------------------
  { pattern: /\blagoon\s*380\b/, lengthM: 11.6, hullType: 'catamaran' },
  { pattern: /\blagoon\s*400\b/, lengthM: 11.9, hullType: 'catamaran' },
  { pattern: /\blagoon\s*410\b/, lengthM: 12.4, hullType: 'catamaran' },
  { pattern: /\blagoon\s*42\b/, lengthM: 12.8, hullType: 'catamaran' },
  { pattern: /\bfountaine\s*pajot\s*tobago\b/, lengthM: 10.7, hullType: 'catamaran' },
  { pattern: /\bfountaine\s*pajot\s*athena\b/, lengthM: 11.5, hullType: 'catamaran' },
  { pattern: /\bfountaine\s*pajot\s*louisiane\b/, lengthM: 11.6, hullType: 'catamaran' },
  { pattern: /\bprout\s*snowgoose\b/, lengthM: 11.3, hullType: 'catamaran' },
  { pattern: /\bcatana\s*4[0-9]\b/, lengthM: 12.5, hullType: 'catamaran' },
  { pattern: /\bedel\s*cat\s*35\b/, lengthM: 10.6, hullType: 'catamaran' },
  { pattern: /\bwharram\s*tiki\s*3[0-9]\b/, lengthM: 9.5, hullType: 'catamaran' },
  { pattern: /\bcorsair\s*f-?2[0-9]\b/, lengthM: 7.3, hullType: 'trimaran' },
  { pattern: /\btrisbal\s*3[0-9]\b/, lengthM: 11.0, hullType: 'trimaran' },
  { pattern: /\bdragonfly\s*2[0-9]\b/, lengthM: 8.0, hullType: 'trimaran' },
];

/** Marques dont le nombre suivant le nom encode la longueur en pieds. */
const FEET_CODED_BRANDS =
  /\b(bavaria|dehler|hallberg[\s-]?rassy|moody|westerly|sigma|jeanneau|beneteau|b[ée]n[ée]teau|dufour|catalina|hunter|contest|elan|salona|x-?yachts|grand\s*soleil|comar|jod)\s*(\d{2})\b/;

/** Marques dont le nombre suivant le nom encode la longueur en centimètres. */
const CM_CODED_BRANDS =
  /\b(hanse|kelt|jou[ëe]t|feeling|gib\s*[''`]?\s*sea|alpa|maxi|neptune|edel|jeanneau|dufour)\s*(\d{3,4})\b/;

export type ModelMatch = {
  lengthM: number;
  hullType?: 'monocoque' | 'catamaran' | 'trimaran';
  confidence: number;
  source: 'model_db' | 'model_heuristic';
  matched: string;
};

/**
 * Cherche une longueur à partir du nom de modèle.
 * La table explicite est prioritaire ; les heuristiques marque+nombre ne
 * servent que de filet de sécurité, avec une confiance nettement plus basse.
 */
export function lengthFromModel(normalizedText: string): ModelMatch | null {
  for (const entry of MODEL_TABLE) {
    if (entry.lengthM === 0) continue; // entrées déléguées aux heuristiques
    const m = normalizedText.match(entry.pattern);
    if (m) {
      return {
        lengthM: entry.lengthM,
        hullType: entry.hullType,
        confidence: 0.8,
        source: 'model_db',
        matched: m[0],
      };
    }
  }

  // Heuristique « pieds » : Bavaria 36 → 36 ft → 10,97 m
  const feet = normalizedText.match(FEET_CODED_BRANDS);
  if (feet) {
    const n = Number(feet[2]);
    if (n >= 18 && n <= 60) {
      return {
        lengthM: Math.round(n * 0.3048 * 100) / 100,
        confidence: 0.45,
        source: 'model_heuristic',
        matched: feet[0],
      };
    }
  }

  // Heuristique « centimètres » : Hanse 315 → 9,45 m ; Kelt 850 → 8,50 m
  const cm = normalizedText.match(CM_CODED_BRANDS);
  if (cm) {
    const n = Number(cm[2]);
    if (n >= 500 && n <= 1800) {
      return {
        lengthM: Math.round(n) / 100,
        confidence: 0.45,
        source: 'model_heuristic',
        matched: cm[0],
      };
    }
  }

  return null;
}
