'use client';

import { useCallback, useRef, useState } from 'react';
import { useClientStore } from '@/store/client-store';
import { SimulationStatusCard } from '@/components/client/SimulationStatusCard';
import { CreativeUploadAnalyzer } from '@/components/client/CreativeUploadAnalyzer';
import { CreativeCompatibilityWarning } from '@/components/client/CreativeCompatibilityWarning';
import { CompatiblePointsSuggestion } from '@/components/client/CompatiblePointsSuggestion';
import { analyzeCreative, type CreativeAnalysis } from '@/services/creative_analysis';
import { checkCompatibility, type CompatibilityResult } from '@/services/aspect_ratio_utils';
import type { CreativeSource, PointPreset } from '@dooh/core';

type UploadPhase =
  | 'idle'
  | 'analyzing'
  | 'logo-review'
  | 'compatibility-warning'
  | 'compatible-points';

export function CreativeUploadCenter() {
  const { selectedPoint, uploadedCreative, setCreative, simulationStatus } = useClientStore();
  const setPoint = useClientStore((s) => s.setPoint);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Analysis state
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [analysis, setAnalysis] = useState<CreativeAnalysis | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [compatibility, setCompatibility] = useState<CompatibilityResult | null>(null);
  // Store the creative that passed logo review but still needs ratio check
  const [pendingCreative, setPendingCreative] = useState<CreativeSource | null>(null);

  const resetAnalysis = useCallback(() => {
    setPhase('idle');
    setAnalysis(null);
    setPendingFile(null);
    setPendingUrl(null);
    setCompatibility(null);
    setPendingCreative(null);
  }, []);

  const proceedToSimulation = useCallback(
    (creative: CreativeSource) => {
      resetAnalysis();
      setCreative(creative);
    },
    [setCreative, resetAnalysis],
  );

  // Check ratio compatibility and either warn or proceed
  const checkRatioAndProceed = useCallback(
    (creative: CreativeSource) => {
      if (!selectedPoint) { proceedToSimulation(creative); return; }
      const result = checkCompatibility(creative.width, creative.height, selectedPoint.screenAspect);
      if (result.compatible) {
        proceedToSimulation(creative);
      } else {
        setCompatibility(result);
        setPendingCreative(creative);
        setPhase('compatibility-warning');
      }
    },
    [selectedPoint, proceedToSimulation],
  );

  const handleFile = useCallback(
    (file: File) => {
      if (!selectedPoint) return;
      const url = URL.createObjectURL(file);
      setPendingFile(file);
      setPendingUrl(url);
      setPhase('analyzing');

      analyzeCreative(file)
        .then((result) => {
          setAnalysis(result);

          if (result.creativeType === 'logo') {
            // Show logo review UI
            setPhase('logo-review');
          } else if (result.creativeType === 'campaign_video') {
            // Videos: build creative, check ratio, proceed
            const vid = document.createElement('video');
            vid.preload = 'metadata';
            vid.onloadedmetadata = () => {
              const creative: CreativeSource = {
                url,
                type: 'video',
                width: vid.videoWidth,
                height: vid.videoHeight,
                duration: vid.duration,
              };
              checkRatioAndProceed(creative);
            };
            vid.src = url;
          } else {
            // Campaign image: check ratio compatibility
            const creative: CreativeSource = {
              url,
              type: 'image',
              width: result.width,
              height: result.height,
            };
            checkRatioAndProceed(creative);
          }
        })
        .catch(() => {
          // If analysis fails, fall through to original behavior
          const isVideo = file.type.startsWith('video/');
          if (isVideo) {
            const vid = document.createElement('video');
            vid.preload = 'metadata';
            vid.onloadedmetadata = () => {
              proceedToSimulation({ url, type: 'video', width: vid.videoWidth, height: vid.videoHeight, duration: vid.duration });
            };
            vid.src = url;
          } else {
            const img = new Image();
            img.onload = () => {
              proceedToSimulation({ url, type: 'image', width: img.naturalWidth, height: img.naturalHeight });
            };
            img.src = url;
          }
        });
    },
    [selectedPoint, checkRatioAndProceed, proceedToSimulation],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ── No point selected ──
  if (!selectedPoint) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4 animate-fade-in max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-500">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-heading font-medium text-white/80">
              Selecione uma praça e um ponto para iniciar a simulação.
            </p>
            <p className="text-xs text-neutral-600 font-body mt-1.5">
              Use o painel à direita para navegar pelo inventário
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Analyzing uploaded file ──
  if (phase === 'analyzing') {
    return (
      <div className="flex items-center justify-center h-full animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-400 font-body">Analisando criativo...</p>
        </div>
      </div>
    );
  }

  // ── Logo review flow ──
  if (phase === 'logo-review' && analysis && pendingFile && pendingUrl) {
    return (
      <CreativeUploadAnalyzer
        analysis={analysis}
        originalFile={pendingFile}
        originalUrl={pendingUrl}
        selectedPoint={selectedPoint}
        onProceed={(creative) => checkRatioAndProceed(creative)}
        onCancel={() => {
          resetAnalysis();
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
    );
  }

  // ── Compatibility warning ──
  if (phase === 'compatibility-warning' && compatibility && pendingCreative) {
    return (
      <CreativeCompatibilityWarning
        compatibility={compatibility}
        onContinue={() => proceedToSimulation(pendingCreative)}
        onShowCompatible={() => setPhase('compatible-points')}
      />
    );
  }

  // ── Compatible points suggestion ──
  if (phase === 'compatible-points' && pendingCreative) {
    return (
      <CompatiblePointsSuggestion
        creativeWidth={pendingCreative.width}
        creativeHeight={pendingCreative.height}
        currentPointId={selectedPoint.id}
        onSelectPoint={(point: PointPreset) => {
          setPoint(point);
          proceedToSimulation(pendingCreative);
        }}
        onBack={() => setPhase('compatibility-warning')}
      />
    );
  }

  // ── Point selected, has creative → show processing status ──
  if (uploadedCreative) {
    // Video points skip the status card here — handled by the simulator page
    const isVideoPoint = selectedPoint.baseMediaType === 'video';

    // While still in uploading/preparing, show the status card (image points only)
    if (!isVideoPoint && (simulationStatus === 'uploading' || simulationStatus === 'preparing' || simulationStatus === 'error')) {
      return (
        <SimulationStatusCard
          status={simulationStatus}
          point={selectedPoint}
          creative={uploadedCreative}
          onRetry={() => {
            resetAnalysis();
            setCreative(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
        />
      );
    }

    // Fallback: done or rendering → show confirmation + remove button
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4 animate-fade-in max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-heading font-medium text-white/80">Simulação pronta</p>
            <p className="text-xs text-neutral-500 font-body mt-1">
              {uploadedCreative.type === 'video' ? '🎬' : '🖼️'} {uploadedCreative.width}×{uploadedCreative.height}
              {uploadedCreative.duration ? ` • ${uploadedCreative.duration.toFixed(1)}s` : ''}
            </p>
            <p className="text-xs text-neutral-600 font-body mt-1">
              Simulando em: <span className="text-accent">{selectedPoint.name}</span>
            </p>
          </div>
          <button
            onClick={() => {
              resetAnalysis();
              setCreative(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="text-xs text-red-400/80 hover:text-red-300 font-body transition-colors cursor-pointer"
          >
            Remover criativo
          </button>
        </div>
      </div>
    );
  }

  // ── Point selected, no creative → upload area ──
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div
        className={`w-full max-w-2xl rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200 ${
          dragging
            ? 'border-accent bg-accent/5 shadow-[0_0_40px_rgba(254,92,43,0.1)]'
            : 'border-white/10 hover:border-white/20'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-500">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div>
            <p className="text-base font-heading font-semibold text-white">Envie sua logo ou criativo para visualizar a simulação.</p>
            <p className="text-sm text-neutral-500 font-body mt-1">PNG, JPG ou vídeo</p>
          </div>
          <div className="text-xs text-neutral-600 font-body">
            Ponto selecionado: <span className="text-accent">{selectedPoint.name}</span>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded-xl bg-accent px-8 py-3 text-sm text-white font-body font-medium hover:bg-accent/90 hover:-translate-y-0.5 transition-all duration-200 shadow-[0_0_20px_rgba(254,92,43,0.15)] cursor-pointer"
          >
            Selecionar arquivo
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            onChange={handleChange}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}
