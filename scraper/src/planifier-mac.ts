import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Programme la collecte locale tous les matins sur votre Mac.
 *
 * Pourquoi c'est nécessaire : Leboncoin et Facebook refusent les serveurs. Le
 * 403 de Leboncoin tombe avant même toute connexion — la protection filtre
 * l'origine de la requête, pas son contenu —, et Marketplace exige une session.
 * Aucun identifiant n'y changerait quoi que ce soit ; seule une collecte lancée
 * depuis une connexion résidentielle aboutit.
 *
 * Restait la corvée : y penser tous les jours. Ce script installe une tâche
 * `launchd` — le planificateur de macOS — qui lance la collecte à 8 h, ou au
 * réveil de la machine si elle dormait à cette heure-là. Vos identifiants ne
 * quittent jamais votre ordinateur.
 *
 *   npm run planifier          installe la tâche
 *   npm run planifier -- --off la retire
 */

const RACINE_SCRAPER = fileURLToPath(new URL('../', import.meta.url));
const ETIQUETTE = 'com.findit.collecte';
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${ETIQUETTE}.plist`);
const HEURE = Number(process.env.FINDIT_HEURE ?? 8);

async function main(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.error(`
Ce script s'adresse à macOS. Sous Linux, l'équivalent tient en une ligne de
crontab :

    0 ${HEURE} * * *  cd ${RACINE_SCRAPER} && npm run collecte:locale
`);
    process.exitCode = 1;
    return;
  }

  if (process.argv.includes('--off')) {
    await retirer();
    return;
  }

  await installer();
}

async function installer(): Promise<void> {
  const npm = await cheminNpm();
  if (!npm) {
    console.error("npm est introuvable. Installez Node.js, puis relancez cette commande.");
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(path.dirname(PLIST), { recursive: true });
  await fs.writeFile(PLIST, gabarit(npm), 'utf-8');

  // `launchctl` refuse de recharger une tâche déjà présente : on la retire
  // d'abord, sans traiter l'absence comme une erreur.
  await lancer('launchctl', ['unload', PLIST], true);
  const code = await lancer('launchctl', ['load', PLIST]);

  if (code !== 0) {
    console.error(`
L'installation a échoué. Le fichier est écrit dans :

    ${PLIST}

Vous pouvez réessayer avec :  launchctl load ${PLIST}
`);
    process.exitCode = 1;
    return;
  }

  console.log(`
Collecte locale programmée.

  Quand         tous les jours à ${String(HEURE).padStart(2, '0')} h — Leboncoin et Facebook compris
  Si le Mac dort  la collecte part au réveil, pas le lendemain
  Journal       ${path.join(RACINE_SCRAPER, 'collecte.log')}
  Retirer       npm run planifier -- --off

Rien d'autre à faire : la collecte publie elle-même, et le site se met à jour
derrière. Vos identifiants ne quittent jamais cet ordinateur.
`);
}

async function retirer(): Promise<void> {
  await lancer('launchctl', ['unload', PLIST], true);
  await fs.rm(PLIST, { force: true });
  console.log('\nCollecte programmée retirée. Le site continue de se mettre à jour à 8 h avec les sources européennes.\n');
}

/**
 * `launchd` n'hérite pas du PATH d'un terminal : il faut lui donner le chemin
 * complet de npm, sans quoi la tâche échoue silencieusement tous les matins.
 */
async function cheminNpm(): Promise<string | null> {
  return new Promise((resolve) => {
    const enfant = spawn('which', ['npm']);
    let sortie = '';
    enfant.stdout.on('data', (bloc) => (sortie += String(bloc)));
    enfant.on('close', (code) => resolve(code === 0 && sortie.trim() ? sortie.trim() : null));
    enfant.on('error', () => resolve(null));
  });
}

function gabarit(npm: string): string {
  const journal = path.join(RACINE_SCRAPER, 'collecte.log');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${ETIQUETTE}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${npm}</string>
    <string>run</string>
    <string>collecte:locale</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${RACINE_SCRAPER.replace(/\/$/, '')}</string>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>${HEURE}</integer>
    <key>Minute</key><integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${journal}</string>
  <key>StandardErrorPath</key>
  <string>${journal}</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
`;
}

function lancer(commande: string, args: string[], silencieux = false): Promise<number> {
  return new Promise((resolve) => {
    const enfant = spawn(commande, args, { stdio: silencieux ? 'ignore' : 'inherit' });
    enfant.on('close', (code) => resolve(code ?? 1));
    enfant.on('error', () => resolve(1));
  });
}

main().catch((error) => {
  console.error('\nÉchec :', error);
  process.exitCode = 1;
});
