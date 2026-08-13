import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBoat24Link, parseCardText, parseListingPage } from '../src/sources/boat24.js';

/**
 * Les textes de cartes utilisés ici ne sont pas inventés : ils ont été capturés
 * tels quels par le sondage exécuté sur GitHub Actions (`npm run probe:deep`).
 * C'est la seule façon d'avoir des tests qui protègent vraiment — un fixture
 * imaginé ne teste que ma propre idée du site.
 */

const CARTE_JEANNEAU =
  "1/50retoursuivantFavoriNEWYacht à voileJeanneau Sun Odyssey 4914,73 x 4,49 mDimensions" +
  " 1 x 75 cv / 55 kWPuissance du moteur2005Année de fabricationFrance » Martigues149 000 €" +
  "Bateau d'occasionAnnée de fabrication 2005Afficher l'offre";

test('carte boat24 réelle : longueur, année, lieu et prix', () => {
  const fields = parseCardText(CARTE_JEANNEAU);

  assert.equal(fields.lengthM, 14.73);
  assert.equal(fields.beamM, 4.49);
  assert.equal(fields.yearBuilt, 2005);
  assert.equal(fields.priceEur, 149000);
  assert.equal(fields.location, 'France » Martigues');
  assert.equal(fields.country, 'France');
  assert.equal(fields.boatType, 'Yacht à voile');
  assert.equal(fields.hullType, 'monocoque');
});

test('la largeur n’est jamais prise pour la longueur', () => {
  // Le piège classique : « 4,49 » apparaît aussi dans le texte, et c'est un
  // bateau de 4,49 m de large, pas de 4,49 m de long.
  const fields = parseCardText(CARTE_JEANNEAU);
  assert.notEqual(fields.lengthM, 4.49);
});

test('un multicoque est reconnu', () => {
  const fields = parseCardText(
    'CatamaranLagoon 38011,55 x 6,53 mDimensions2001Année de fabricationGrèce » Athènes' +
      '189 000 €Bateau d’occasion',
  );
  assert.equal(fields.hullType, 'catamaran');
  assert.equal(fields.lengthM, 11.55);
  assert.equal(fields.country, 'Grèce');
});

test('une carte sans caractéristique ne renvoie pas de valeur inventée', () => {
  const fields = parseCardText('Yacht à voile Prix sur demande');
  assert.equal(fields.lengthM, null);
  assert.equal(fields.yearBuilt, null);
  assert.equal(fields.priceEur, null);
});

test('une longueur aberrante est rejetée', () => {
  // « 99,99 x 99,99 m » : plus vraisemblablement un gabarit de page qu'un voilier.
  const fields = parseCardText('Yacht à voile99,99 x 99,99 mDimensions');
  assert.equal(fields.lengthM, null);
});

/** Reproduit l'obfuscation du site : ROT13 puis base64. */
function encodeLikeBoat24(url: string): string {
  const rot13 = url.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
  return Buffer.from(rot13, 'utf-8').toString('base64');
}

test('le lien obfusqué est décodé', () => {
  const url = 'https://www.boat24.com/fr/voiliers/jeanneau-sun-odyssey-49/detail/123456/';
  assert.equal(decodeBoat24Link(encodeLikeBoat24(url)), url);
});

test('un lien illisible ne produit pas une URL fantaisiste', () => {
  assert.equal(decodeBoat24Link('pas-du-base64-!!'), null);
  assert.equal(decodeBoat24Link(Buffer.from('bonjour').toString('base64')), null);
});

test('la page de résultats produit des annonces exploitables', () => {
  const url = 'https://www.boat24.com/fr/voiliers/kelt-10-50/detail/424242/';
  const html = `
    <html><body>
      <div class="blurb card" title="Kelt 10.50" data-link="${encodeLikeBoat24(url)}">
        Yacht à voileKelt 10.5010,50 x 3,40 mDimensions1982Année de fabrication
        France » Lorient18 500 €Bateau d'occasion
        <img src="https://img.boat24.com/1.jpg">
      </div>
    </body></html>`;

  const [listing, ...rest] = parseListingPage(html);
  assert.equal(rest.length, 0);
  assert.equal(listing.url, url);
  assert.equal(listing.sourceId, '424242');
  assert.equal(listing.title, 'Kelt 10.50');
  assert.equal(listing.priceEur, 18500);
  assert.equal(listing.known?.lengthM, 10.5);
  assert.equal(listing.known?.yearBuilt, 1982);
  assert.equal(listing.known?.country, 'France');
  assert.equal(listing.known?.boatKind, 'voilier');
  assert.deepEqual(listing.images, ['https://img.boat24.com/1.jpg']);
});

test('les yachts hors budget sont écartés dès la collecte', () => {
  const url = 'https://www.boat24.com/fr/voiliers/hanse-505/detail/999/';
  const html = `<div class="blurb" title="Hanse 505" data-link="${encodeLikeBoat24(url)}">
      Yacht à voileHanse 50515,20 x 4,80 mDimensions2013Année de fabrication
      France » Cannes349 000 €</div>`;
  assert.equal(parseListingPage(html).length, 0);
});

test('les annexes et petits dériveurs sont écartés dès la collecte', () => {
  const url = 'https://www.boat24.com/fr/voiliers/laser/detail/888/';
  const html = `<div class="blurb" title="Laser" data-link="${encodeLikeBoat24(url)}">
      Yacht à voileLaser4,20 x 1,40 mDimensions1998Année de fabrication
      France » Brest1 500 €</div>`;
  assert.equal(parseListingPage(html).length, 0);
});

/**
 * Cas relevés dans la première collecte élargie : le texte de la carte colle le
 * titre aux dimensions, et la longueur lue devenait fantaisiste.
 */
test('un chiffre du modèle collé aux dimensions ne gonfle pas la longueur', () => {
  const carte =
    '1/5retoursuivantFavoriQuillardBeneteau FIRST 226,95 x 2,50 mDimensions ' +
    "1 x 10 cv / 7 kWPuissance du moteur1979Année de fabricationFrance5 000 €Bateau d'occasion";

  // Sans le titre, « FIRST 22 » + « 6,95 » se lit « 226,95 ».
  const fields = parseCardText(carte, 'Beneteau FIRST 22');
  assert.equal(fields.lengthM, 6.95);
  assert.equal(fields.beamM, 2.5);
});

test('la largeur sert de témoin quand le titre ne suffit pas', () => {
  // « Dufour Arpège » + « Mk1 » + « 9,30 » : après retrait du titre il reste
  // « Mk19,30 ». Un 19,30 m large de 3,00 m est impossible ; 9,30 m l'est.
  const carte =
    "1/2retoursuivantFavoriVoilier de régateDufour ArpègeMk19,30 x 3,00 mDimensions " +
    '1975Année de fabricationEspagne7 000 €';

  const fields = parseCardText(carte, 'Dufour Arpège');
  assert.equal(fields.lengthM, 9.3);
  assert.equal(fields.beamM, 3);
});

test('une longueur légitimement collée à un chiffre reste lue', () => {
  // « Alpa 11.50 » suivi de « 11,56 x 3,20 m » : le rapport est plausible,
  // aucune correction ne doit s'appliquer.
  const carte =
    '1/8retoursuivantFavoriQuillardAlpa 11.5011,56 x 3,20 mDimensions ' +
    '1974Année de fabricationFrance17 500 €';

  assert.equal(parseCardText(carte, 'Alpa 11.50').lengthM, 11.56);
});

test('un chiffre parasite est retiré tant que la largeur le confirme', () => {
  // « 88,00 x 2,00 » : à 44 fois sa largeur ce serait une allumette, mais en
  // retirant le 8 de tête on obtient 8,00 m pour 2,00 m — un rapport ordinaire.
  assert.equal(parseCardText('Yacht à voile 88,00 x 2,00 mDimensions').lengthM, 8);
});

test('une longueur invraisemblable et irrécupérable est abandonnée', () => {
  // Ici aucun retrait n'est possible — « 9,00 » n'a qu'un chiffre de tête, et
  // le rapport reste absurde. Mieux vaut une longueur inconnue, qui part dans
  // « À vérifier », qu'une longueur fausse affichée avec aplomb.
  assert.equal(parseCardText('Yacht à voile 9,00 x 1,00 mDimensions').lengthM, null);
});
