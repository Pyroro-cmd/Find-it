import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeListings, type Dataset } from '../src/store.js';
import type { EnrichedListing } from '../src/types.js';

/**
 * La fusion porte tout l'intérêt de l'historique : sans elle, chaque collecte
 * écraserait l'antériorité et le site ne saurait plus distinguer une nouveauté
 * d'une annonce vue depuis trois semaines.
 */

function emptyDataset(): Dataset {
  return { version: 1, generatedAt: '', run: null, listings: [] };
}

function listing(overrides: Partial<EnrichedListing> = {}): EnrichedListing {
  return {
    source: 'leboncoin',
    sourceId: '123',
    url: 'https://example.test/123',
    title: 'Voilier 10,50 m',
    description: 'Bon état général',
    priceEur: 19000,
    locationLabel: 'La Rochelle (17)',
    postalCode: '17000',
    images: ['https://img.test/1.jpg'],
    publishedAt: null,
    sellerType: 'particulier',
    raw: {},
    department: '17',
    facade: 'atlantique',
    country: 'France',
    lengthM: 10.5,
    lengthSource: 'explicit_m',
    lengthConfidence: 0.9,
    hullType: 'monocoque',
    boatKind: 'voilier',
    yearBuilt: 1985,
    material: 'polyester',
    engineType: 'inboard',
    draftM: null,
    berthIncluded: null,
    afloat: null,
    isProject: false,
    projectReason: null,
    score: 60,
    scoreBreakdown: {},
    ...overrides,
  };
}

test('première collecte : tout est nouveau', () => {
  const dataset = emptyDataset();
  const outcome = mergeListings(dataset, [listing()], ['leboncoin']);

  assert.equal(outcome.inserted, 1);
  assert.equal(outcome.updated, 0);
  assert.equal(dataset.listings.length, 1);
  assert.equal(dataset.listings[0].priceHistory.length, 1);
  assert.equal(dataset.listings[0].status, 'active');
});

test("la date de première apparition n'est jamais écrasée", () => {
  const dataset = emptyDataset();
  const jour1 = new Date('2026-01-01T08:00:00Z');
  mergeListings(dataset, [listing()], ['leboncoin'], jour1);

  const jour2 = new Date('2026-01-05T08:00:00Z');
  mergeListings(dataset, [listing()], ['leboncoin'], jour2);

  assert.equal(dataset.listings[0].firstSeenAt, jour1.toISOString());
  assert.equal(dataset.listings[0].lastSeenAt, jour2.toISOString());
});

test('un changement de prix crée un point d’historique', () => {
  const dataset = emptyDataset();
  mergeListings(dataset, [listing({ priceEur: 19000 })], ['leboncoin']);
  const outcome = mergeListings(dataset, [listing({ priceEur: 17500 })], ['leboncoin']);

  assert.equal(outcome.priceDrops, 1);
  assert.equal(dataset.listings[0].priceHistory.length, 2);
  assert.deepEqual(
    dataset.listings[0].priceHistory.map((p) => p.price),
    [19000, 17500],
  );
});

test('un prix inchangé n’ajoute pas de point', () => {
  const dataset = emptyDataset();
  mergeListings(dataset, [listing()], ['leboncoin']);
  mergeListings(dataset, [listing()], ['leboncoin']);
  mergeListings(dataset, [listing()], ['leboncoin']);

  assert.equal(dataset.listings[0].priceHistory.length, 1);
});

test('une annonce non revue passe en « disparue »', () => {
  const dataset = emptyDataset();
  mergeListings(dataset, [listing({ sourceId: 'a' }), listing({ sourceId: 'b' })], ['leboncoin']);

  const outcome = mergeListings(dataset, [listing({ sourceId: 'a' })], ['leboncoin']);

  assert.equal(outcome.gone, 1);
  const disparue = dataset.listings.find((l) => l.sourceId === 'b');
  assert.equal(disparue?.status, 'gone');
  assert.ok(disparue?.goneAt);
  // Elle est conservée : « ce bateau est parti » est une information utile.
  assert.equal(dataset.listings.length, 2);
});

test("une source injoignable ne fait pas disparaître son catalogue", () => {
  const dataset = emptyDataset();
  mergeListings(dataset, [listing({ source: 'leboncoin', sourceId: 'a' })], ['leboncoin']);

  // Collecte suivante : Leboncoin est bloqué, seul un autre site répond.
  const outcome = mergeListings(
    dataset,
    [listing({ source: 'youboat', sourceId: 'x' })],
    ['youboat'],
  );

  assert.equal(outcome.gone, 0, 'aucune annonce Leboncoin ne doit être déclarée disparue');
  assert.equal(dataset.listings.find((l) => l.sourceId === 'a')?.status, 'active');
});

test('les annonces disparues depuis longtemps sont purgées', () => {
  const dataset = emptyDataset();
  const vieux = new Date('2026-01-01T08:00:00Z');
  mergeListings(dataset, [listing({ sourceId: 'a' }), listing({ sourceId: 'b' })], ['leboncoin'], vieux);

  // b disparaît le lendemain…
  mergeListings(dataset, [listing({ sourceId: 'a' })], ['leboncoin'], new Date('2026-01-02T08:00:00Z'));
  assert.equal(dataset.listings.length, 2);

  // …et six mois plus tard elle n'apprend plus rien.
  mergeListings(dataset, [listing({ sourceId: 'a' })], ['leboncoin'], new Date('2026-07-01T08:00:00Z'));
  assert.equal(dataset.listings.length, 1);
  assert.equal(dataset.listings[0].sourceId, 'a');
});

test('la description est tronquée pour contenir la taille du fichier', () => {
  const dataset = emptyDataset();
  mergeListings(dataset, [listing({ description: 'x'.repeat(5000) })], ['leboncoin']);
  assert.ok((dataset.listings[0].description?.length ?? 0) <= 601);
});
