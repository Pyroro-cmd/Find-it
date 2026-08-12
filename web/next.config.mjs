// GitHub Pages sert le site sous /<nom-du-depot>/ : sans basePath, toutes les
// ressources pointeraient vers la racine du domaine et la page serait blanche.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export statique : le site devient un dossier de fichiers, sans serveur —
  // donc hébergeable gratuitement sur GitHub Pages.
  output: 'export',
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // L'optimisation d'images de Next exige un serveur ; les vignettes viennent
  // de toute façon des CDN des sources.
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
