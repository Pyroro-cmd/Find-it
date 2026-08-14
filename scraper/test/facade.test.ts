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

test('« Grande Bretagne » n’est pas la Bretagne', () => {
  // Relevé tel quel dans la collecte : un port écossais était rangé sur la
  // côte ouest française parce que « Bretagne » y figure comme mot entier.
  assert.equal(facadeDepuisLieu('Grande Bretagne, Largs 2015'), null);
  assert.equal(facadeDepuisLieu('Grande-Bretagne, Plymouth'), null);
  // La vraie Bretagne, elle, répond toujours.
  assert.equal(facadeDepuisLieu('France » Bretagne » Morbihan'), 'atlantique');
});

test('un code postal français tranche mieux qu’un nom de port', () => {
  // « France, 56190 Arzal » : Arzal n'est dans aucune liste, le code postal si.
  assert.equal(facadeDepuisLieu('France, 56190 Arzal 1983'), 'atlantique');
  assert.equal(facadeDepuisLieu('France, 50100 Cherbourg'), 'manche');
  assert.equal(facadeDepuisLieu('France, 83000 Toulon'), 'mediterranee');
});

test('un code à cinq chiffres étranger n’est pas lu comme un département', () => {
  // L'Allemagne écrit aussi ses codes sur cinq chiffres : « 18055 » deviendrait
  // le Cher, et un port de la Baltique un lieu français.
  assert.equal(facadeDepuisLieu('Allemagne, 18055 Rostock'), null);
  assert.equal(facadeDepuisLieu('Espagne, 07800 Ibiza'), null);
});

test('un département sans littoral laisse la recherche par nom continuer', () => {
  assert.equal(facadeDepuisLieu('France, 21000 Dijon'), null);
  assert.equal(facadeDepuisLieu('France, 69000 Lyon — bateau à La Rochelle'), 'atlantique');
});
