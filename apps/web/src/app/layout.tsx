import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import './globals.css';

const deploymentVersion = process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION ?? 'dev';

export const metadata: Metadata = {
  title: 'DOOH Simulator — Intermidia',
  description: 'Simulate ads on real-world screens with cinematic realism',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="dooh-deployment-version" content={deploymentVersion} />
      </head>
      <body className="min-h-screen bg-surface-0 font-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
