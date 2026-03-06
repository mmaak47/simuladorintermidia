import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DOOH Simulator — Cinematic Mode',
  description: 'Simulate ads on real-world screens with cinematic realism',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-surface-0">{children}</body>
    </html>
  );
}
