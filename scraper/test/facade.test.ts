import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estCoteOuest, facadeDepuisLieu } from '../src/util/facade.js';

/**
 * Les lieux testés ici sont ceux réellement rencontrés dans les annonces
 * collectées, avec leur ponctuation d'origine : boat24 écrit
 * « France » Bretagne » Morbihan », yachtall « France, Lorient ».
 */

test('un port breton place l’annonce sur l’Atlantique', () => {
  assert.equal(facadeDepuisLieu('France » Bretagne » Morbihan'), 'atlantique');
  assert.equal(facadeDepuisLieu('France, Lorient'), 'atlantique');
  assert.equal(facadeDepuisLieu('France » Arzon'), 'atlantique');
  assert.equal(facadeDepuisLieu('France, La Rochelle'), 'atlantique');
});

test('la Manche est distinguée de la Méditerranée', () => {
  assert.equal(facadeDepuisLieu('France » Normandie » Cherbourg'), 'manche');
  assert.equal(facadeDepuisLieu('France, Saint-Malo'), 'manche');
});

test('le Sud reste au Sud', () => {
  // Relevés tels quels dans la collecte.
  assert.equal(facadeDepuisLieu('France » Martigues'), 'mediterranee');
  assert.equal(facadeDepuisLieu("France » Côte d'Azur » Six fours les olages"), 'mediterranee');
  assert.equal(
    facadeDepuisLieu('France » Provence-Alpes-Côte d’Azur » Saint-Chamas'),
    'mediterranee',
  );
});

test('un lieu trop vague ne se voit pas attribuer de façade au hasard', () => {
  // Mieux vaut aucune façade qu'une façade inventée : l'annonce reste visible,
  // elle ne remonte simplement pas en priorité.
  assert.equal(facadeDepuisLieu('France'), null);
  assert.equal(facadeDepuisLieu('Allemagne'), null);
  assert.equal(facadeDepuisLieu(null), null);
});

test('un nom de façade caché dans un autre mot ne déclenche rien', () => {
  // « nord » est dans « Bordeaux »… non, mais il l'est dans « nordique », et
  // « Nice » dans « Venice ». La correspondance porte sur des mots entiers.
  assert.notEqual(facadeDepuisLieu('Norvège, Trondheim nordique'), 'manche');
  assert.equal(facadeDepuisLieu('Italie, Venice'), null);
});

test('la côte ouest regroupe Atlantique et Manche', () => {
  assert.ok(estCoteOuest('atlantique'));
  assert.ok(estCoteOuest('manche'));
  assert.ok(!estCoteOuest('mediterranee'));
  assert.ok(!estCoteOuest(null));
});
