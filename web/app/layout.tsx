import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Find-it — voiliers',
  description: 'Les annonces de voiliers qui correspondent vraiment à mes critères.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-bg text-text">{children}</body>
    </html>
  );
}
