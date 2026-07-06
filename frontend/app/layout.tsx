import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Veille RSS — IA News Monitor',
  description: 'Tableau de bord de veille IA multi-sources avec résumés automatiques en français',
  robots: 'noindex, nofollow',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
