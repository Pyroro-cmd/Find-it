import type { EnrichedListing, RawListing } from './types.js';
import { extractAttributes, detectSellerType } from './enrich/attributes.js';
import { extractLength } from './enrich/length.js';
import { enrichWithLlm, isLlmEnabled, type LlmExtraction, type LlmInput } from './enrich/llm.js';
import { computeScore } from './enrich/score.js';
import { departmentFromPostalCode, facadeFromDepartment, normalize } from './util/text.js';
import { facadeDepuisLieu } from './util/facade.js';
import type { StoredListing } from './store.js';

/**
 * Transforme des annonces brutes en annonces exploitables.
 *
 * L'ordre compte : on épuise d'abord les méthodes gratuites et déterministes
 * (regex, table de modèles), et on ne sollicite le LLM que sur le reliquat.
 * Sur un corpus typique, cela laisse 20 à 30 % des annonces au LLM plutôt que
 * 100 % — la différence est un facteur 4 sur le coût quotidien.
 */

/** En dessous de ce seuil, on demande un second avis au LLM. */
const LLM_CONFIDENCE_THRESHOLD = 0.6;

export type PipelineStats = {
  total: number;
  withLength: number;
  fromSourceField: number;
  fromRegex: number;
  fromModelTable: number;
  fromLlm: number;
  unresolved: number;
  llmCalled: number;
};

export async function enrichAll(
  raw: RawListing[],
  existing: Map<string, StoredListing>,
): Promise<{ listings: EnrichedListing[]; stats: PipelineStats }> {
  const stats: PipelineStats = {
    total: raw.length,
    withLength: 0,
    fromSourceField: 0,
    fromRegex: 0,
    fromModelTable: 0,
    fromLlm: 0,
    unresolved: 0,
    llmCalled: 0,
  };

  // --- Passe 1 : déterministe --------------------------------------------
  // Une source qui affiche la longueur dans un champ dédié fait autorité :
  // repasser par les regex ne pourrait que dégrader une donnée exacte.
  const partial = raw.map((listing) => {
    const attributes = extractAttributes(listing.title, listing.description);

    const declared = listing.known?.lengthM;
    if (declared != null && declared > 0) {
      stats.fromSourceField += 1;
      return {
        listing,
        attributes,
        length: {
          lengthM: declared,
          confidence: 0.95,
          source: 'source_field' as const,
          evidence: 'champ fourni par la source',
          hullType: listing.known?.hullType,
        },
      };
    }

    const length = extractLength(listing.title, listing.description);
    if (length) {
      if (length.source === 'explicit_m' || length.source === 'feet') stats.fromRegex += 1;
      else stats.fromModelTable += 1;
    }

    return { listing, length, attributes };
  });

  // --- Passe 2 : LLM sur le reliquat --------------------------------------
  const needsLlm = partial.filter(
    (p) => !p.length || (p.length.confidence ?? 0) < LLM_CONFIDENCE_THRESHOLD,
  );

  let llmResults = new Map<string, LlmExtraction>();
  if (needsLlm.length > 0 && isLlmEnabled()) {
    stats.llmCalled = needsLlm.length;
    const inputs: LlmInput[] = needsLlm.map((p) => ({
      id: `${p.listing.source}:${p.listing.sourceId}`,
      title: p.listing.title,
      description: p.listing.description,
    }));
    llmResults = await enrichWithLlm(inputs);
  } else if (needsLlm.length > 0) {
    console.log(
      `[pipeline] ${needsLlm.length} annonces sans longueur fiable — ANTHROPIC_API_KEY absente, extraction LLM ignorée`,
    );
  }

  // --- Assemblage ----------------------------------------------------------
  const listings: EnrichedListing[] = partial.map(({ listing, length, attributes }) => {
    const key = `${listing.source}:${listing.sourceId}`;
    const llm = llmResults.get(key);

    let lengthM: number | null = length?.lengthM ?? null;
    let lengthSource: string | null = length?.source ?? null;
    let lengthConfidence: number | null = length?.confidence ?? null;

    // Le LLM ne prend la main que s'il est plus sûr que la passe déterministe.
    if (llm?.length_m != null && llm.confidence > (lengthConfidence ?? 0)) {
      lengthM = llm.length_m;
      lengthSource = 'llm';
      lengthConfidence = Math.min(llm.confidence, 0.9); // jamais totalement certain
      stats.fromLlm += 1;
    }

    if (lengthM != null) stats.withLength += 1;
    else stats.unresolved += 1;

    const known = listing.known ?? {};
    const hullType = known.hullType ?? attributes.hullType ?? length?.hullType ?? llm?.hull_type ?? null;
    const boatKind = known.boatKind ?? attributes.boatKind ?? llm?.boat_kind ?? null;
    const yearBuilt = known.yearBuilt ?? attributes.yearBuilt ?? llm?.year_built ?? null;
    const isProject = attributes.isProject || Boolean(llm?.is_project);

    const department = departmentFromPostalCode(listing.postalCode);
    const prior = existing.get(key);

    const { score, breakdown } = computeScore({
      priceEur: listing.priceEur,
      lengthM,
      lengthConfidence,
      yearBuilt,
      isProject,
      boatKind,
      hullType,
      berthIncluded: attributes.berthIncluded,
      engineType: attributes.engineType,
      imagesCount: listing.images.length,
      descriptionLength: listing.description?.length ?? 0,
      isNew: !prior,
      previousPriceEur: prior?.priceEur ?? null,
    });

    return {
      ...listing,
      sellerType:
        listing.sellerType ??
        detectSellerType(`${listing.title} ${listing.description ?? ''}`),
      department,
      // Le code postal d'abord quand il existe — c'est le plus sûr —, sinon le
      // nom du lieu, seule indication fournie par les sites européens.
      facade: facadeFromDepartment(department) ?? facadeDepuisLieu(listing.locationLabel),
      country: known.country ?? null,
      lengthM,
      lengthSource,
      lengthConfidence,
      hullType,
      boatKind,
      yearBuilt,
      material: attributes.material,
      engineType: attributes.engineType,
      draftM: attributes.draftM,
      berthIncluded: attributes.berthIncluded,
      afloat: attributes.afloat,
      isProject,
      projectReason: attributes.projectReason ?? (llm?.is_project ? (llm.reasoning ?? null) : null),
      score,
      scoreBreakdown: breakdown,
      raw: {
        ...listing.raw,
        length_evidence: length?.evidence ?? null,
        llm_reasoning: llm?.reasoning ?? null,
      },
    };
  });

  return { listings, stats };
}

/**
 * Écarte le hors-sujet évident avant même l'enrichissement : accastillage,
 * remorques, places de port vendues seules… Sur une recherche « voilier »,
 * c'est une part non négligeable des résultats.
 */
const OFF_TOPIC =
  /\b(remorque|ber\b|place de port seule|anneau seul|moteur seul|voile d['’ ]?occasion|accastillage|gilet|combinaison|winch seul|guindeau|annexe seule|jouet|maquette|tableau|affiche|livre|magazine|piece detachee|helice|gps seul|cartouche)\b/;

export function isPlausibleBoatListing(listing: RawListing): boolean {
  const text = normalize(`${listing.title} ${listing.description ?? ''}`);
  if (OFF_TOPIC.test(normalize(listing.title))) return false;
  // Un « voilier » à moins de 500 € est presque toujours un accessoire ou une maquette.
  if (listing.priceEur != null && listing.priceEur < 500) return false;
  return text.length > 0;
}
