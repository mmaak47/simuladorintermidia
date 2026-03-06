import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold tracking-tight">DOOH Simulator</h1>
      <p className="text-lg text-zinc-400 max-w-xl text-center">
        Simule anúncios em telas do mundo real com realismo cinematográfico.
      </p>
      <div className="flex gap-4">
        <Link
          href="/simulator"
          className="rounded-lg bg-accent px-6 py-3 text-white font-medium hover:bg-accent-hover transition-colors"
        >
          Abrir Simulador
        </Link>
        <Link
          href="/simulator/cinematic"
          className="rounded-lg border border-zinc-700 px-6 py-3 text-zinc-300 font-medium hover:border-accent transition-colors"
        >
          Modo Cinematográfico
        </Link>
      </div>
    </main>
  );
}
