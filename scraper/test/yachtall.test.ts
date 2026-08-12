import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCardText, parsePage } from '../src/sources/yachtall.js';

/**
 * Le texte ci-dessous est celui d'une carte réelle, relevé par la sonde
 * exécutée sur GitHub Actions. Un fixture inventé ne testerait que ma propre
 * idée du site.
 */
const CARTE_SUNRISE =
  'Sunrise Holländischer Deckshausyacht ' +
  "Voilier / yacht à voile: Sunrise, bateau d'occasion, bateau en acier " +
  'Longueur x largeur: 18,88 m x 4,88 m, construit: 1998, cabines: 2 ' +
  'Moteur: Perkins Sabre M225Ti, 222 cv (163 kW), diesel ' +
  'Lieu: Monténégro, Bar / Tivat ' +
  'Société: Quiotek Consulting ' +
  'Prix: € 490 000, TVA incluse';

test('carte yachtall réelle : longueur, année, lieu, vendeur et prix', () => {
  const fields = parseCardText(CARTE_SUNRISE);

  assert.equal(fields.lengthM, 18.88);
  assert.equal(fields.beamM, 4.88);
  assert.equal(fields.yearBuilt, 1998);
  assert.equal(fields.priceEur, 490000);
  assert.equal(fields.location, 'Monténégro, Bar / Tivat');
  assert.equal(fields.country, 'Monténégro');
  assert.equal(fields.seller, 'Quiotek Consulting');
  assert.equal(fields.boatKind, 'voilier');
  assert.equal(fields.hullType, 'monocoque');
});

test('la largeur n’est jamais prise pour la longueur', () => {
  // Le piège central du projet : une annonce contient plusieurs mesures en
  // mètres et une seule est la longueur.
  assert.notEqual(parseCardText(CARTE_SUNRISE).lengthM, 4.88);
});

test('la forme condensée des petits écrans est lue aussi', () => {
  // Sur mobile le site n'affiche que « 10,50 x 3,40 m », sans étiquette.
  const fields = parseCardText(
    "Kelt 10.50 Voilier / yacht à voile, bateau d'occasion 10,50 x 3,40 m construit: 1982 " +
      'Lieu: France, Lorient Prix: € 18 500',
  );
  assert.equal(fields.lengthM, 10.5);
  assert.equal(fields.priceEur, 18500);
  assert.equal(fields.country, 'France');
});

test('un multicoque est reconnu', () => {
  const fields = parseCardText(
    "Lagoon 380 Catamaran / yacht à voile, bateau d'occasion " +
      'Longueur x largeur: 11,55 m x 6,53 m, construit: 2001 Lieu: Grèce, Athènes Prix: € 189 000',
  );
  assert.equal(fields.hullType, 'catamaran');
  assert.equal(fields.lengthM, 11.55);
});

test('une carte sans caractéristique ne renvoie pas de valeur inventée', () => {
  const fields = parseCardText('Voilier / yacht à voile Prix sur demande');
  assert.equal(fields.lengthM, null);
  assert.equal(fields.yearBuilt, null);
  assert.equal(fields.priceEur, null);
  assert.equal(fields.location, null);
});

test('un prix libellé dans une autre devise est ignoré plutôt que converti', () => {
  const fields = parseCardText('Voilier / yacht à voile Lieu: Royaume-Uni Prix: £ 25 000');
  assert.equal(fields.priceEur, null);
});

/** Reproduit la structure relevée sur le site. */
function carte(options: {
  id: string;
  slug: string;
  titre: string;
  type: string;
  dims: string;
  annee: string;
  lieu: string;
  prix: string;
}): string {
  return `
    <div class="boatlist-subbox">
      <div class="boatlist-tile-title boatlist-is-small">
        <a href="/fr/bateau/${options.slug}-s${options.id}" class="js-hrefBoat">${options.titre.slice(0, 20)}...</a>
      </div>
      <div class="boatlist-pic">
        <a href="/fr/bateau/${options.slug}-s${options.id}" class="js-hrefBoat">
          <img src="https://image.yachtall.com/image/sboat/0/${options.id}/photo.jpg">
          <img src="https://static.yachtall.com/sharedimg/layout/loading-wheel-l.gif">
        </a>
      </div>
      <div class="boatlist-content">
        <h3 class="boatlist-is-large">
          <a href="/fr/bateau/${options.slug}-s${options.id}" class="js-hrefBoat">${options.titre}</a>
        </h3>
        <span class="boatlist-is-large">${options.type}, bateau d'occasion<br></span>
        <span class="boatlist-is-large">Longueur x largeur: ${options.dims}, construit: ${options.annee}</span>
        <span class="boatlist-is-large">Lieu: ${options.lieu}</span>
        <span class="boatlist-is-large">Prix: ${options.prix}</span>
      </div>
    </div>`;
}

test('la page produit des annonces exploitables', () => {
  const html = `<html><body>${carte({
    id: '265055',
    slug: 'kelt-1050',
    titre: 'Kelt 10.50',
    type: 'Voilier / yacht à voile',
    dims: '10,50 m x 3,40 m',
    annee: '1982',
    lieu: 'France, Lorient',
    prix: '€ 18 500',
  })}</body></html>`;

  const { listings, cardsSeen } = parsePage(html);
  assert.equal(cardsSeen, 1);
  assert.equal(listings.length, 1);

  const [listing] = listings;
  assert.equal(listing.sourceId, '265055');
  assert.equal(listing.url, 'https://www.yachtall.com/fr/bateau/kelt-1050-s265055');
  assert.equal(listing.title, 'Kelt 10.50', 'le titre complet du h3, pas la version tronquée');
  assert.equal(listing.priceEur, 18500);
  assert.equal(listing.known?.lengthM, 10.5);
  assert.equal(listing.known?.yearBuilt, 1982);
  assert.equal(listing.known?.country, 'France');
  assert.equal(listing.known?.boatKind, 'voilier');
  assert.deepEqual(
    listing.images,
    ['https://image.yachtall.com/image/sboat/0/265055/photo.jpg'],
    "l'image d'attente ne doit pas être prise pour une photo",
  );
});

test('les bateaux hors budget, trop petits ou à moteur sont écartés', () => {
  const cher = carte({
    id: '1',
    slug: 'hanse-505',
    titre: 'Hanse 505',
    type: 'Voilier / yacht à voile',
    dims: '15,20 m x 4,80 m',
    annee: '2013',
    lieu: 'France, Cannes',
    prix: '€ 349 000',
  });
  const petit = carte({
    id: '2',
    slug: 'laser',
    titre: 'Laser',
    type: 'Voilier / yacht à voile',
    dims: '4,20 m x 1,40 m',
    annee: '1998',
    lieu: 'France, Brest',
    prix: '€ 1 500',
  });
  const moteur = carte({
    id: '3',
    slug: 'nimbus-320',
    titre: 'Nimbus 320',
    type: 'Bateau à moteur',
    dims: '9,75 m x 3,20 m',
    annee: '2005',
    lieu: 'France, Marseille',
    prix: '€ 19 000',
  });

  assert.equal(parsePage(cher).listings.length, 0);
  assert.equal(parsePage(petit).listings.length, 0);
  assert.equal(parsePage(moteur).listings.length, 0);
  // Les cartes ont bien été vues : c'est le filtre qui les écarte, pas un
  // sélecteur périmé.
  assert.equal(parsePage(cher).cardsSeen, 1);
});

test('une même annonce répétée dans la page n’apparaît qu’une fois', () => {
  const une = carte({
    id: '42',
    slug: 'gibsea-105',
    titre: "Gib'Sea 105",
    type: 'Voilier / yacht à voile',
    dims: '10,50 m x 3,50 m',
    annee: '1985',
    lieu: 'France, La Rochelle',
    prix: '€ 19 900',
  });
  assert.equal(parsePage(une + une).listings.length, 1);
});
