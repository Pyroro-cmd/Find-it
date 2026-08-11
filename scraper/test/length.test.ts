import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLength } from '../src/enrich/length.js';
import { extractAttributes } from '../src/enrich/attributes.js';
import { computeScore } from '../src/enrich/score.js';
import { departmentFromPostalCode, facadeFromDepartment, parsePriceEur, parseYear } from '../src/util/text.js';

/**
 * Ces cas sont écrits d'après la manière dont les annonces de voiliers sont
 * réellement rédigées en français : mesures étiquetées ou nues, pieds, noms de
 * modèles seuls, et surtout le piège central — une annonce contient plusieurs
 * mesures en mètres et une seule est la longueur.
 */

test('longueur explicitement étiquetée', () => {
  const cases: Array<[string, number]> = [
    ['Voilier à vendre, longueur 10,50 m', 10.5],
    ['Beau voilier — LHT : 11.20 m', 11.2],
    ['Voilier hors-tout 9,80m bon état', 9.8],
    ['Sloop, long. 12 m, quille longue', 12],
  ];
  for (const [title, expected] of cases) {
    const result = extractLength(title);
    assert.ok(result, `aucune longueur extraite de « ${title} »`);
    assert.equal(result.lengthM, expected, `« ${title} »`);
    assert.ok(result.confidence >= 0.85, `confiance trop basse pour « ${title} »`);
  }
});

test('formats métriques nus, y compris « 10m50 »', () => {
  assert.equal(extractLength('Voilier 10,50 m à saisir')?.lengthM, 10.5);
  assert.equal(extractLength('Voilier 10m50 très bien entretenu')?.lengthM, 10.5);
  assert.equal(extractLength('Voilier 10 m 50, moteur récent')?.lengthM, 10.5);
  assert.equal(extractLength('Voilier de 11 mètres, gréement neuf')?.lengthM, 11);
});

test('longueurs en pieds', () => {
  const feet = extractLength('Voilier 34 pieds, prêt à naviguer');
  assert.ok(feet);
  assert.equal(feet.source, 'feet');
  assert.ok(Math.abs(feet.lengthM - 10.36) < 0.05, `attendu ~10.36, obtenu ${feet.lengthM}`);

  assert.ok(Math.abs((extractLength("Voilier 32' bon état")?.lengthM ?? 0) - 9.75) < 0.05);
});

test("n'attrape pas la largeur, le tirant d'eau ou la surface de voile", () => {
  // Le seul nombre en mètres présent est un tirant d'eau : rien à extraire.
  const draftOnly = extractLength('Voilier à vendre', "Tirant d'eau 1,60 m, bon état général");
  assert.equal(draftOnly, null, `faux positif : ${JSON.stringify(draftOnly)}`);

  const beamOnly = extractLength('Joli bateau', 'Largeur 3,20 m. Moteur révisé.');
  assert.equal(beamOnly, null, `faux positif : ${JSON.stringify(beamOnly)}`);

  const sailOnly = extractLength('Voilier', 'Grand-voile 32 m2, génois 28 m²');
  assert.equal(sailOnly, null, `faux positif : ${JSON.stringify(sailOnly)}`);

  // Avec plusieurs mesures, c'est la longueur étiquetée qui doit gagner.
  const mixed = extractLength(
    'Voilier à vendre',
    "Longueur 10,80 m, largeur 3,40 m, tirant d'eau 1,75 m, grand-voile 38 m2",
  );
  assert.equal(mixed?.lengthM, 10.8);
});

test('le titre prime sur la description', () => {
  const result = extractLength(
    'Voilier Sun Odyssey 10,50 m',
    "Largeur 3,4 m, tirant d'eau 1,8 m, place de port 12 m disponible",
  );
  assert.equal(result?.lengthM, 10.5);
});

test('table des modèles quand aucune mesure ne figure', () => {
  const so = extractLength('Jeanneau Sun Odyssey 34 de 1992, très bien entretenu');
  assert.ok(so);
  assert.equal(so.source, 'model_db');
  assert.equal(so.lengthM, 10.3);

  const gibsea = extractLength("Gib'Sea 105, moteur Yanmar");
  assert.equal(gibsea?.lengthM, 10.5);

  const oceanis = extractLength('Bénéteau Océanis 350 à vendre');
  assert.equal(oceanis?.lengthM, 10.4);
});

test('heuristique marque + nombre, avec une confiance basse', () => {
  const bavaria = extractLength('Bavaria 36 année 2001');
  assert.ok(bavaria);
  assert.equal(bavaria.source, 'model_heuristic');
  assert.ok(Math.abs(bavaria.lengthM - 10.97) < 0.05);
  assert.ok(bavaria.confidence < 0.6, 'une heuristique ne doit pas inspirer confiance');
});

test('rejette les longueurs invraisemblables', () => {
  assert.equal(extractLength('Voilier miniature 0,45 m'), null);
  assert.equal(extractLength('Bateau 120 m'), null);
});

test('renvoie null plutôt que de deviner', () => {
  assert.equal(extractLength('Voilier à vendre, cause double emploi'), null);
});

test('détection des projets lourds vs entretien courant', () => {
  assert.equal(extractAttributes('Voilier 11 m, coque nue à restaurer').isProject, true);
  assert.equal(extractAttributes('Voilier vendu pour pièces').isProject, true);
  // Un bateau à rafraîchir reste un bateau : à moins de 20 000 €, c'est la norme.
  assert.equal(
    extractAttributes('Voilier 10,5 m, à rafraîchir, peinture de pont à reprendre').isProject,
    false,
  );
});

test('attributs annexes', () => {
  const attrs = extractAttributes(
    'Catamaran Lagoon 380',
    "Coque polyester, moteur inboard Yanmar, tirant d'eau 1,20 m, place de port incluse, à flot",
  );
  assert.equal(attrs.hullType, 'catamaran');
  assert.equal(attrs.material, 'polyester');
  assert.equal(attrs.engineType, 'inboard');
  assert.equal(attrs.draftM, 1.2);
  assert.equal(attrs.berthIncluded, true);
  assert.equal(attrs.afloat, true);
});

test('année de construction, pas celle des travaux', () => {
  assert.equal(parseYear('Voilier de 1978, moteur remplacé en 2019, voiles 2021'), 1978);
  assert.equal(parseYear('Année 1985, refit complet'), 1985);
});

test('prix', () => {
  assert.equal(parsePriceEur('18 500 €'), 18500);
  assert.equal(parsePriceEur('12.500 €'), 12500);
  assert.equal(parsePriceEur('19500'), 19500);
});

test('département et façade maritime', () => {
  assert.equal(departmentFromPostalCode('17000'), '17');
  assert.equal(departmentFromPostalCode('20000'), '2A');
  assert.equal(departmentFromPostalCode('20200'), '2B');
  assert.equal(facadeFromDepartment('17'), 'atlantique');
  assert.equal(facadeFromDepartment('13'), 'mediterranee');
  assert.equal(facadeFromDepartment('14'), 'manche');
  assert.equal(facadeFromDepartment('69'), 'interieur');
});

test('le score favorise le mètre le moins cher', () => {
  const base = {
    lengthConfidence: 0.9,
    yearBuilt: 1985,
    isProject: false,
    boatKind: 'voilier',
    hullType: 'monocoque',
    berthIncluded: null,
    engineType: 'inboard',
    imagesCount: 6,
    descriptionLength: 800,
    isNew: false,
    previousPriceEur: null,
  } as const;

  const bonneAffaire = computeScore({ ...base, priceEur: 18000, lengthM: 11.5 });
  const moinsBien = computeScore({ ...base, priceEur: 19000, lengthM: 8.5 });
  assert.ok(
    bonneAffaire.score > moinsBien.score,
    `11,5 m à 18k€ (${bonneAffaire.score}) devrait battre 8,5 m à 19k€ (${moinsBien.score})`,
  );

  // Une épave est lourdement pénalisée même si le prix au mètre est bon.
  const epave = computeScore({ ...base, priceEur: 5000, lengthM: 12, isProject: true });
  assert.ok(epave.score < bonneAffaire.score);
});
