/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Les vignettes sont servies par les CDN des sources ; on les affiche
    // telles quelles plutôt que de les recopier chez nous.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
