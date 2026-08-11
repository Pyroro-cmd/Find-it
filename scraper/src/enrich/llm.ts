import Anthropic from '@anthropic-ai/sdk';

/**
 * Filet de sécurité pour les annonces dont la longueur reste inconnue après
 * les regex et la table des modèles. Un humain lit « Sun Odyssey, 5 couchettes,
 * grand-voile à enrouleur, 11 tonnes » et sait situer le bateau ; les regex non.
 *
 * Ce module est volontairement faillible-sûr : toute erreur (clé absente,
 * quota, panne réseau) laisse simplement les annonces non enrichies plutôt que
 * de faire échouer la collecte.
 */

const MODEL = 'claude-opus-5';
const BATCH_SIZE = 12;

export type LlmInput = {
  id: string;
  title: string;
  description: string | null;
};

export type LlmExtraction = {
  id: string;
  length_m: number | null;
  confidence: number;
  hull_type: 'monocoque' | 'catamaran' | 'trimaran' | null;
  boat_kind: 'voilier' | 'moteur' | 'autre' | null;
  year_built: number | null;
  is_project: boolean;
  reasoning: string;
};

const SYSTEM_PROMPT = `Tu analyses des annonces de bateaux d'occasion en français pour en extraire des caractéristiques structurées.

Pour chaque annonce, détermine :
- length_m : la longueur de coque hors-tout en mètres. Attention aux pièges : une annonce cite souvent plusieurs mesures (largeur, tirant d'eau, surface de voile, hauteur sous barrots) — ne retiens que la longueur du bateau. Si le modèle est identifiable (« Sun Odyssey 34 », « Gib'Sea 105 ») et que tu connais sa longueur, utilise-la. Si tu n'as aucun élément fiable, renvoie null plutôt que de deviner.
- confidence : entre 0 et 1, ta confiance dans length_m. Une mesure écrite noir sur blanc mérite 0.9+ ; une déduction à partir du seul nom de modèle, 0.6 à 0.8 ; une estimation d'après le nombre de couchettes ou le tonnage, 0.3 au plus.
- hull_type : monocoque, catamaran ou trimaran, si c'est déterminable.
- boat_kind : voilier, moteur ou autre. Un voilier avec moteur d'appoint reste un voilier.
- year_built : année de construction du bateau (pas celle d'un moteur remplacé ou de travaux).
- is_project : true uniquement pour une épave, une coque nue, un bateau vendu pour pièces ou nécessitant une reconstruction complète. Un bateau simplement à rafraîchir ou nécessitant de l'entretien courant n'est PAS un projet.
- reasoning : une phrase courte citant l'élément du texte sur lequel tu t'appuies.

Renvoie un objet dont la clé "results" contient une entrée par annonce, avec l'id fourni.`;

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          length_m: { type: ['number', 'null'] },
          confidence: { type: 'number' },
          hull_type: { type: ['string', 'null'], enum: ['monocoque', 'catamaran', 'trimaran', null] },
          boat_kind: { type: ['string', 'null'], enum: ['voilier', 'moteur', 'autre', null] },
          year_built: { type: ['integer', 'null'] },
          is_project: { type: 'boolean' },
          reasoning: { type: 'string' },
        },
        required: [
          'id',
          'length_m',
          'confidence',
          'hull_type',
          'boat_kind',
          'year_built',
          'is_project',
          'reasoning',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const;

export function isLlmEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function enrichWithLlm(items: LlmInput[]): Promise<Map<string, LlmExtraction>> {
  const out = new Map<string, LlmExtraction>();
  if (items.length === 0 || !isLlmEnabled()) return out;

  const client = new Anthropic();

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const results = await extractBatch(client, batch);
      for (const r of results) out.set(r.id, r);
    } catch (error) {
      // Une extraction ratée n'est pas une collecte ratée : l'annonce reste
      // simplement dans le bac « à vérifier ».
      console.warn(
        `[llm] lot ${i / BATCH_SIZE + 1} échoué (${batch.length} annonces) :`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return out;
}

async function extractBatch(client: Anthropic, batch: LlmInput[]): Promise<LlmExtraction[]> {
  const payload = batch.map((item) => ({
    id: item.id,
    titre: item.title,
    // La description est tronquée : au-delà, c'est de l'équipement listé, sans
    // valeur pour l'extraction, et ça coûte des tokens sur chaque annonce.
    description: (item.description ?? '').slice(0, 1500),
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('extraction refusée par le modèle');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('réponse sans bloc texte');
  }

  const parsed = JSON.parse(textBlock.text) as { results?: LlmExtraction[] };
  if (!Array.isArray(parsed.results)) throw new Error('réponse sans tableau "results"');

  const known = new Set(batch.map((b) => b.id));
  return parsed.results.filter((r) => known.has(r.id));
}
