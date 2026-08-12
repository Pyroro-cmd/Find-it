import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEuroPrice, parseOverview, parseResultsPage } from '../src/sources/theyachtmarket.js';

/**
 * theyachtmarket annonce l'essentiel dans une ligne d'aperçu :
 *
 *   2002 | 51'7" | Diesel | Voile
 *
 * Année, longueur et type de bateau y sont explicites. La chaîne ci-dessous est
 * celle relevée sur le site lors du sondage.
 */

test('aperçu réel : année, longueur en pieds/pouces, type', () => {
  const overview = parseOverview(`2002 | 51'7" | Diesel | Voile`);

  assert.equal(overview.yearBuilt, 2002);
  assert.equal(overview.boatKind, 'voilier');
  // 51 pieds 7 pouces = 15,72 m
  assert.equal(overview.lengthM, 15.72);
});

test('un bateau à moteur est identifié comme tel', () => {
  const overview = parseOverview(`1998 | 32'0" | Diesel | Moteur`);
  assert.equal(overview.boatKind, 'moteur');
  assert.equal(overview.lengthM, 9.75);
});

test('un aperçu incomplet ne produit pas de valeur inventée', () => {
  const overview = parseOverview('Diesel | Voile');
  assert.equal(overview.yearBuilt, null);
  assert.equal(overview.lengthM, null);
  assert.equal(overview.boatKind, 'voilier');
});

test('seul le montant en euros est retenu', () => {
  // Le bloc affiche d'abord une conversion en dollars, puis le prix réel.
  assert.equal(parseEuroPrice('$438 991 USD Prix répertoriés €19 500 EUR'), 19500);
  assert.equal(parseEuroPrice('€18.500 EUR'), 18500);
});

test('un prix libellé dans une autre devise est ignoré plutôt que converti', () => {
  // Convertir imposerait de maintenir un taux de change ; mieux vaut ne rien
  // afficher que d'afficher un prix faux.
  assert.equal(parseEuroPrice('$438 991 USD Prix répertoriés £325 000 GBP'), null);
  assert.equal(parseEuroPrice('Prix sur demande'), null);
});

function carte(options: { nom: string; id: string; overview: string; prix: string; lieu: string }): string {
  return `
    <div class="info-col">
      <a class="boat-name" href="/fr/bateaux-a-vendre/voilier/${options.nom}/id${options.id}/">${options.nom}</a>
      <div class="overview">${options.overview}</div>
      <div class="pricing">${options.prix}</div>
      <div class="location">${options.lieu}</div>
    </div>`;
}

test('la page de résultats produit des annonces exploitables', () => {
  const html = `<html><body>${carte({
    nom: 'Beneteau Oceanis 350',
    id: '345678',
    overview: `1987 | 34'5" | Diesel | Voile`,
    prix: '$21 000 USD Prix répertoriés €19 500 EUR',
    lieu: 'La Rochelle, France',
  })}</body></html>`;

  const [listing, ...rest] = parseResultsPage(html);
  assert.equal(rest.length, 0);
  assert.equal(listing.sourceId, '345678');
  assert.equal(listing.title, 'Beneteau Oceanis 350');
  assert.ok(listing.url.startsWith('https://www.theyachtmarket.com/'));
  assert.equal(listing.priceEur, 19500);
  assert.equal(listing.known?.yearBuilt, 1987);
  assert.equal(listing.known?.boatKind, 'voilier');
  assert.equal(listing.known?.country, 'France');
});

test('les bateaux à moteur ne franchissent pas la collecte', () => {
  const html = carte({
    nom: 'Nimbus 320',
    id: '111',
    overview: `2005 | 32'0" | Diesel | Moteur`,
    prix: '€19 000 EUR',
    lieu: 'Marseille, France',
  });
  assert.equal(parseResultsPage(html).length, 0);
});

test('les bateaux hors budget ou trop petits ne franchissent pas la collecte', () => {
  const cher = carte({
    nom: 'Hallberg Rassy 42',
    id: '222',
    overview: `1996 | 42'0" | Diesel | Voile`,
    prix: '€180 000 EUR',
    lieu: 'Palma, Espagne',
  });
  const petit = carte({
    nom: 'Cornish Crabber',
    id: '333',
    overview: `1990 | 19'0" | Diesel | Voile`,
    prix: '€12 000 EUR',
    lieu: 'Falmouth, Royaume-Uni',
  });

  assert.equal(parseResultsPage(cher).length, 0);
  assert.equal(parseResultsPage(petit).length, 0);
});
