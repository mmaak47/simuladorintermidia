'use client';

import { LocationUploader } from '@/components/simulator/LocationUploader';
import { CreativeUploader } from '@/components/simulator/CreativeUploader';
import { ScreenDetector } from '@/components/simulator/ScreenDetector';
import { DetectionDebugOverlay } from '@/components/simulator/DetectionDebugOverlay';
import { PreviewCanvas } from '@/components/simulator/PreviewCanvas';
import { ControlPanel } from '@/components/simulator/ControlPanel';
import { ExportBar } from '@/components/simulator/ExportBar';
import { useCompositionStore } from '@/store/composition-store';

export default function SimulatorPage() {
  const { location, corners, creative, hybridDetection } = useCompositionStore();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left control panel */}
      <aside className="w-80 flex-shrink-0 border-r border-zinc-800 bg-surface-1 overflow-y-auto">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-lg font-semibold">DOOH Simulator</h1>
          <p className="text-xs text-zinc-500 mt-1">Modo Cinematográfico</p>
        </div>

        <div className="p-4 space-y-6">
          {/* Step 1: Upload location */}
          <section>
            <h2 className="text-sm font-medium text-zinc-400 mb-2">1. Localização</h2>
            <LocationUploader />
          </section>

          {/* Step 2: Detect screen */}
          {location && (
            <section>
              <h2 className="text-sm font-medium text-zinc-400 mb-2">2. Detectar tela</h2>
              <ScreenDetector />
              {!corners && (
                <p className="text-xs text-zinc-600 mt-2">
                  Ou clique na imagem para posicionar a tela manualmente.
                </p>
              )}
            </section>
          )}

          {/* Step 3: Upload creative */}
          {corners && (
            <section>
              <h2 className="text-sm font-medium text-zinc-400 mb-2">3. Criativo</h2>
              <CreativeUploader />
            </section>
          )}

          {/* Step 4: Display & cinematic controls */}
          {creative && corners && <ControlPanel />}

          {/* Debug overlay controls */}
          {hybridDetection && (
            <section>
              <h2 className="text-sm font-medium text-zinc-400 mb-2">Debug</h2>
              <DetectionDebugOverlay />
            </section>
          )}
        </div>
      </aside>

      {/* Main preview area */}
      <main className="flex-1 flex flex-col bg-surface-0 min-w-0">
        <div className="flex-1 relative min-h-0">
          {location ? (
            <PreviewCanvas />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600">
              <p>Faça upload de uma foto ou vídeo da localização</p>
            </div>
          )}
        </div>

        {/* Export bar */}
        {creative && corners && <ExportBar />}
      </main>
    </div>
  );
}
