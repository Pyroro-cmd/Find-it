import { normalize } from './text.js';

/**
 * Déduit la façade maritime d'un lieu écrit en toutes lettres.
 *
 * Le code postal, qui servait à cela, n'existe pas sur les sites collectés :
 * ils écrivent « France » Bretagne » Morbihan » ou « France, Lorient ». Il faut
 * donc reconnaître des noms — régions, départements, et surtout **ports**,
 * puisque c'est presque toujours le port qui est indiqué.
 *
 * La liste est volontairement courte et concrète : les lieux où l'on trouve
 * réellement des voiliers d'occasion à ce budget. Un nom absent de la liste ne
 * donne pas de façade plutôt qu'une façade au hasard — une annonce sans façade
 * reste visible, elle ne remonte simplement pas en priorité.
 */

export type Facade = 'atlantique' | 'manche' | 'mediterranee' | 'interieur';

/** Atlantique : de la pointe bretonne à la frontière espagnole. */
const ATLANTIQUE = [
  // Régions et départements
  'bretagne',
  'morbihan',
  'finistere',
  "cotes d'armor",
  'cotes darmor',
  'ille et vilaine',
  'loire atlantique',
  'vendee',
  'charente maritime',
  'gironde',
  'landes',
  'pays basque',
  'pyrenees atlantiques',
  'aquitaine',
  'nouvelle aquitaine',
  'pays de la loire',
  // Ports et villes
  'lorient',
  'brest',
  'vannes',
  'concarneau',
  'quiberon',
  'la trinite',
  'arzon',
  'crouesty',
  'auray',
  'benodet',
  'douarnenez',
  'camaret',
  'audierne',
  'la foret fouesnant',
  'port la foret',
  'pornic',
  'pornichet',
  'saint nazaire',
  'nantes',
  'les sables',
  'saint gilles croix de vie',
  'noirmoutier',
  'ile d yeu',
  'la rochelle',
  'rochefort',
  'ile de re',
  'oleron',
  'royan',
  'arcachon',
  'bordeaux',
  'capbreton',
  'hendaye',
  'saint jean de luz',
  'anglet',
  'bayonne',
];

/** Manche et mer du Nord : la façade nord, souvent citée avec l'Atlantique. */
const MANCHE = [
  'normandie',
  'manche',
  'calvados',
  'seine maritime',
  'somme',
  'pas de calais',
  'nord',
  'hauts de france',
  'saint malo',
  'dinard',
  'saint cast',
  'paimpol',
  'perros guirec',
  'granville',
  'cherbourg',
  'saint vaast',
  'ouistreham',
  'caen',
  'deauville',
  'honfleur',
  'le havre',
  'fecamp',
  'dieppe',
  'boulogne',
  'calais',
  'dunkerque',
];

const MEDITERRANEE = [
  'mediterranee',
  'provence',
  'cote d azur',
  'occitanie',
  'corse',
  'var',
  'bouches du rhone',
  'herault',
  'aude',
  'pyrenees orientales',
  'alpes maritimes',
  'marseille',
  'toulon',
  'hyeres',
  'saint tropez',
  'cannes',
  'antibes',
  'nice',
  'la ciotat',
  'martigues',
  'port saint louis',
  'sete',
  'agde',
  'gruissan',
  'port vendres',
  'canet',
  'ajaccio',
  'bastia',
  'bonifacio',
  'porto vecchio',
  'propriano',
  'six fours',
  'bandol',
  'sanary',
  'frejus',
  'mandelieu',
];

/**
 * Façade d'un lieu, ou `null` si le texte ne permet pas de trancher.
 *
 * On cherche du plus spécifique au plus large : un port nomme la façade sans
 * ambiguïté, une région aussi, mais « France » seul ne dit rien.
 */
export function facadeDepuisLieu(lieu: string | null): Facade | null {
  if (!lieu) return null;
  const texte = aplatir(lieu);

  if (contient(texte, MEDITERRANEE)) return 'mediterranee';
  if (contient(texte, ATLANTIQUE)) return 'atlantique';
  if (contient(texte, MANCHE)) return 'manche';
  return null;
}

/**
 * Ramène un lieu à des mots séparés par des espaces.
 *
 * Les sites ponctuent différemment le même endroit — « Saint-Malo », « Saint
 * Malo », « France » Bretagne » — et une liste de noms ne peut pas prévoir
 * toutes les variantes. On aplatit donc tout ce qui n'est pas une lettre ou un
 * chiffre, des deux côtés de la comparaison.
 */
function aplatir(valeur: string): string {
  return normalize(valeur)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Vrai si l'un des noms apparaît comme mot entier dans le texte aplati. */
function contient(texte: string, noms: string[]): boolean {
  return noms.some((brut) => {
    const nom = aplatir(brut);
    const index = texte.indexOf(nom);
    if (index === -1) return false;
    // « nord » ne doit pas se déclencher sur « Bordeaux » ni « nordique ».
    const avant = index === 0 ? ' ' : texte[index - 1];
    const apres = texte[index + nom.length] ?? ' ';
    return !/[a-z0-9]/.test(avant) && !/[a-z0-9]/.test(apres);
  });
}

/** La côte ouest au sens du projet : Atlantique et Manche. */
export function estCoteOuest(facade: string | null): boolean {
  return facade === 'atlantique' || facade === 'manche';
}
