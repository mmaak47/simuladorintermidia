'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PreviewCanvas } from '@/components/simulator/PreviewCanvas';
import { WebGLPreviewCanvas } from '@/components/simulator/WebGLPreviewCanvas';
import { ExportBar } from '@/components/simulator/ExportBar';
import { PointBrowserPanel } from '@/components/client/PointBrowserPanel';
import { CreativeUploadCenter } from '@/components/client/CreativeUploadCenter';
import { EnvironmentPanel } from '@/components/client/EnvironmentPanel';
import { InsertionsImpactCard } from '@/components/client/InsertionsImpactCard';
import { SimulationStatusCard } from '@/components/client/SimulationStatusCard';
import { BeforeAfterSlider } from '@/components/client/BeforeAfterSlider';
import { VideoSimulationCard } from '@/components/client/VideoSimulationCard';
import { LeadCaptureModal } from '@/components/client/LeadCaptureModal';
import { AttentionHeatmapPanel } from '@/components/client/AttentionHeatmapPanel';
import { ABCreativePanel } from '@/components/client/ABCreativePanel';
import { useClientStore } from '@/store/client-store';
import { useCompositionStore } from '@/store/composition-store';
import { useVideoRenderStore } from '@/store/video-render-store';
import { useLeadSessionStore } from '@/store/lead-session-store';
import { usePointStore } from '@/store/point-store';
import { useBackgroundVideoRender } from '@/hooks/useBackgroundVideoRender';
import { extractVideoFrame } from '@/lib/video-frame-extractor';
import { useDemoVideoInit } from '@/hooks/useDemoVideoInit';
import { useInsertionCounter } from '@/hooks/useInsertionCounter';
import { AppShell } from '@/components/layout/AppShell';
import { submitLead } from '@/lib/lead-api';

const VISION_BASE = process.env.NEXT_PUBLIC_VISION_API_URL ?? 'http://localhost:8000';

export default function SimulatorPage() {
  // Initialize demo video assets at runtime
  useDemoVideoInit();
  const { selectedPoint, hoveredPoint, uploadedCreative, simulationStatus } = useClientStore();
  const setSimulationStatus = useClientStore((s) => s.setSimulationStatus);
  const location = useCompositionStore((s) => s.location);
  const corners = useCompositionStore((s) => s.corners);
  const faces = useCompositionStore((s) => s.faces);
  const creative = useCompositionStore((s) => s.creative);
  const loadPointPreset = useCompositionStore((s) => s.loadPointPreset);
  const setCreative = useCompositionStore((s) => s.setCreative);
  const reset = useCompositionStore((s) => s.reset);

  // ─── Video render workflow ──────────────────────────────────
  const videoMode = useVideoRenderStore((s) => s.mode);
  const beforeImage = useVideoRenderStore((s) => s.beforeImage);
  const afterImage = useVideoRenderStore((s) => s.afterImage);
  const renderProgress = useVideoRenderStore((s) => s.renderProgress);
  const renderedVideoUrl = useVideoRenderStore((s) => s.renderedVideoUrl);
  const setVideoMode = useVideoRenderStore((s) => s.setMode);
  const setPreviewImages = useVideoRenderStore((s) => s.setPreviewImages);
  const videoReset = useVideoRenderStore((s) => s.reset);
  const { startRender } = useBackgroundVideoRender();
  const markSimulation = useLeadSessionStore((s) => s.markSimulation);
  const markCreativeUploaded = useLeadSessionStore((s) => s.markCreativeUploaded);
  const markVideoRequest = useLeadSessionStore((s) => s.markVideoRequest);
  const leadGateOpen = useLeadSessionStore((s) => s.leadGateOpen);
  const pendingPoint = useLeadSessionStore((s) => s.pendingPoint);
  const closeLeadGate = useLeadSessionStore((s) => s.closeLeadGate);
  const markLeadCaptured = useLeadSessionStore((s) => s.markLeadCaptured);
  const [showVideoChoiceModal, setShowVideoChoiceModal] = useState(false);
  const [showVideoLeadFormModal, setShowVideoLeadFormModal] = useState(false);
  const [downloadClientName, setDownloadClientName] = useState<string>('');
  const [webglFailed, setWebglFailed] = useState(false);
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attentionOverlayEnabled, setAttentionOverlayEnabled] = useState(true);
  const [attentionOpacity, setAttentionOpacity] = useState(0.45);
  const [attentionHeatmapUrl, setAttentionHeatmapUrl] = useState<string | null>(null);
  const [attentionScore, setAttentionScore] = useState<number | null>(null);
  const [attentionZones, setAttentionZones] = useState<Array<{ x: number; y: number; width: number; height: number; score: number }>>([]);
  const [abVariant, setAbVariant] = useState<typeof uploadedCreative | null>(null);
  const [abCompareEnabled, setAbCompareEnabled] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);

  // The active point shown in preview: hovered takes priority over selected
  const activePoint = hoveredPoint ?? selectedPoint;
  const isVideoPoint = activePoint?.baseMediaType === 'video';

  // Track which point is currently loaded into composition store
  const loadedPointRef = useRef<string | null>(null);

  // Load active point preset into composition store (atomic single-set)
  useEffect(() => {
    if (!activePoint) {
      if (loadedPointRef.current) {
        reset();
        loadedPointRef.current = null;
      }
      return;
    }
    if (loadedPointRef.current === activePoint.id) return;

    loadedPointRef.current = activePoint.id;
    videoReset();

    const clientCreative = useClientStore.getState().uploadedCreative;
    if (clientCreative) {
      setSimulationStatus('preparing');
    }

    loadPointPreset(activePoint);

    if (clientCreative) {
      setCreative(clientCreative);
    }
  }, [activePoint, loadPointPreset, setCreative, reset, setSimulationStatus, videoReset]);

  // Sync uploaded creative into composition store whenever it changes
  useEffect(() => {
    if (uploadedCreative) {
      markCreativeUploaded();
      setCreative(uploadedCreative);
      if (activePoint && loadedPointRef.current === activePoint.id) {
        setSimulationStatus('preparing');
      }
    } else {
      videoReset();
    }
  }, [uploadedCreative, setCreative, activePoint, setSimulationStatus, videoReset, markCreativeUploaded]);

  // Count unique simulated points after each completed simulation
  useEffect(() => {
    if (simulationStatus === 'done' && activePoint?.id) {
      markSimulation(activePoint.id);
    }
  }, [simulationStatus, activePoint?.id, markSimulation]);

  // Cleanup: reset all stores when leaving the page
  useEffect(() => {
    return () => {
      useCompositionStore.getState().reset();
      useClientStore.getState().setSimulationStatus('idle');
      useVideoRenderStore.getState().reset();
    };
  }, []);

  // Mobile stability: use legacy preview pipeline on narrow viewports.
  useEffect(() => {
    const onResize = () => setIsNarrowViewport(window.innerWidth < 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const hasScreenSelection = !!corners;
  const useLegacyPreview = webglFailed || faces.length > 1 || isNarrowViewport;
  const showSimulation = !!creative && hasScreenSelection && !!location;
  const isHoverPreview = !!hoveredPoint && hoveredPoint.id !== selectedPoint?.id;
  const liveInsertions = useInsertionCounter(
    uploadedCreative,
    showSimulation && !isHoverPreview && simulationStatus === 'done',
  );

  // Once the canvas is ready to render (all data present), advance from preparing → rendering
  useEffect(() => {
    if (showSimulation && simulationStatus === 'preparing') {
      setSimulationStatus('rendering');
    }
  }, [showSimulation, simulationStatus, setSimulationStatus]);

  // Auto-transition rendering → done
  const [canvasReady, setCanvasReady] = useState(false);
  useEffect(() => {
    if (simulationStatus !== 'rendering') {
      setCanvasReady(false);
      return;
    }
    // Video points get a fast transition — instant preview replaces the wait
    const delay = isVideoPoint ? 400 : 600;
    const timer = setTimeout(() => {
      setCanvasReady(true);
      setSimulationStatus('done');
    }, delay);
    return () => clearTimeout(timer);
  }, [simulationStatus, isVideoPoint, setSimulationStatus]);

  // Status card: only for IMAGE-based points (video points skip the blocking overlay)
  const showStatusCard = !isVideoPoint
    && !isHoverPreview
    && uploadedCreative !== null
    && (simulationStatus === 'uploading' || simulationStatus === 'preparing' || simulationStatus === 'rendering' || simulationStatus === 'error')
    && !canvasReady;

  // ─── Video: capture first composited frame ──────────────────
  const handleFirstRender = useCallback(async (canvas: HTMLCanvasElement) => {
    if (!isVideoPoint || !activePoint) return;
    // Only capture once per creative+point combo
    if (useVideoRenderStore.getState().mode !== 'idle') return;

    const afterUrl = canvas.toDataURL('image/jpeg', 0.92);
    try {
      const beforeUrl = await extractVideoFrame(
        activePoint.baseMediaUrl,
        0,
        activePoint.baseWidth,
        activePoint.baseHeight,
      );
      setPreviewImages(beforeUrl, afterUrl);
    } catch {
      // If frame extraction fails, use the composited frame for both
      setPreviewImages(afterUrl, afterUrl);
    }
    setVideoMode('deciding');
  }, [isVideoPoint, activePoint, setPreviewImages, setVideoMode]);

  // ─── Video workflow handlers ────────────────────────────────
  const handleGenerateVideo = useCallback(() => {
    markVideoRequest();
    setShowVideoChoiceModal(true);
  }, [markVideoRequest]);

  const handleWhatsApp = useCallback(() => {
    markVideoRequest();
    setShowVideoLeadFormModal(true);
  }, [markVideoRequest]);

  const handleContinuePreview = useCallback(() => {
    setVideoMode('idle');
  }, [setVideoMode]);

  const handleVideoChoiceWait = useCallback(() => {
    setShowVideoChoiceModal(false);
    startRender();
  }, [startRender]);

  const handleVideoChoiceWhatsApp = useCallback(() => {
    setShowVideoChoiceModal(false);
    setShowVideoLeadFormModal(true);
  }, []);

  const handleVideoLeadSubmit = useCallback(async (lead: { name: string; company: string; whatsapp: string; email: string }) => {
    await submitLead({
      ...lead,
      pointName: activePoint?.name ?? '',
      source: 'whatsapp_video',
    });
    setDownloadClientName(lead.name);
    markLeadCaptured();
    setShowVideoLeadFormModal(false);
    startRender();
  }, [activePoint?.name, markLeadCaptured, startRender]);

  const handleVideoLeadCancel = useCallback(() => {
    setShowVideoLeadFormModal(false);
  }, []);

  const handleLeadGateSubmit = useCallback(async (lead: { name: string; company: string; whatsapp: string; email: string }) => {
    await submitLead({
      ...lead,
      pointName: pendingPoint?.name ?? '',
      source: 'gate',
    });
    markLeadCaptured();
    if (pendingPoint) {
      const point = usePointStore.getState().getPointById(pendingPoint.id);
      if (point) {
        useClientStore.getState().setPoint(point);
      }
    }
    closeLeadGate();
  }, [pendingPoint, markLeadCaptured, closeLeadGate]);

  const handleDownloadVideo = useCallback(() => {
    if (!renderedVideoUrl) return;
    const a = document.createElement('a');
    a.href = renderedVideoUrl;
    a.download = buildSimulationFileName({
      pointName: activePoint?.name,
      clientName: downloadClientName,
      ext: 'webm',
    });
    a.click();
  }, [renderedVideoUrl, activePoint?.name, downloadClientName]);

  const handleRetry = useCallback(() => {
    const cr = useClientStore.getState().uploadedCreative;
    if (cr && activePoint) {
      setSimulationStatus('preparing');
      loadPointPreset(activePoint);
      setCreative(cr);
    }
  }, [activePoint, loadPointPreset, setCreative, setSimulationStatus]);

  const handleGenerateAttentionHeatmap = useCallback(async () => {
    if (!uploadedCreative || uploadedCreative.type !== 'image') return;

    setAttentionLoading(true);
    try {
      const source = await fetch(uploadedCreative.url);
      const blob = await source.blob();
      const file = new File([blob], 'creative.png', { type: blob.type || 'image/png' });

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/vision/attention-heatmap', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) return;
      const data = await res.json() as {
        heatmapUrl: string;
        visibilityScore: number;
        zones: Array<{ x: number; y: number; width: number; height: number; score: number }>;
      };

      setAttentionHeatmapUrl(`${VISION_BASE}${data.heatmapUrl}`);
      setAttentionScore(data.visibilityScore);
      setAttentionZones(data.zones || []);
      setAttentionOverlayEnabled(true);
    } finally {
      setAttentionLoading(false);
    }
  }, [uploadedCreative]);

  useEffect(() => {
    setAttentionHeatmapUrl(null);
    setAttentionScore(null);
    setAttentionZones([]);
  }, [uploadedCreative?.url, activePoint?.id]);

  useEffect(() => {
    setAbVariant(null);
    setAbCompareEnabled(false);
  }, [uploadedCreative?.url, activePoint?.id]);

  // Before/After slider visibility
  const showBeforeAfter = isVideoPoint
    && !isHoverPreview
    && !!beforeImage
    && !!afterImage
    && (videoMode === 'deciding' || videoMode === 'capturing-lead');

  // Video decision / progress / complete card visibility
  const showVideoCard = isVideoPoint
    && !isHoverPreview
    && (videoMode === 'deciding' || videoMode === 'rendering' || videoMode === 'complete' || videoMode === 'error');

  return (
    <AppShell>
      <div className="flex-1 flex min-h-0 relative">
        {/* ─── Center: Simulation / Upload area ─────────────── */}
        <main className="flex-1 relative min-h-0 bg-surface-0 overflow-hidden">
          {showSimulation ? (
            <>
              {useLegacyPreview ? (
                <PreviewCanvas
                  readOnly
                  onFirstRender={isVideoPoint ? handleFirstRender : undefined}
                />
              ) : (
                <WebGLPreviewCanvas
                  onFirstRender={isVideoPoint ? handleFirstRender : undefined}
                  onWebGLError={() => setWebglFailed(true)}
                />
              )}

              {attentionHeatmapUrl && attentionOverlayEnabled && (
                <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center p-4">
                  <img
                    src={attentionHeatmapUrl}
                    alt="Attention heatmap"
                    className="w-full h-full object-contain"
                    style={{ opacity: attentionOpacity }}
                  />
                </div>
              )}

              {/* ─── Image status overlay (image points only) ──── */}
              {showStatusCard && (
                <div className="absolute inset-0 z-40 bg-surface-0/80 backdrop-blur-sm">
                  <SimulationStatusCard
                    status={simulationStatus}
                    point={activePoint}
                    creative={uploadedCreative}
                    onRetry={handleRetry}
                  />
                </div>
              )}

              {/* ─── Before/After slider (video points) ────────── */}
              {showBeforeAfter && beforeImage && afterImage && (
                <div className="absolute inset-0 z-[35]">
                  <BeforeAfterSlider
                    beforeImage={beforeImage}
                    afterImage={afterImage}
                    beforeLabel="Ponto original"
                    afterLabel="Com seu anúncio"
                  />
                </div>
              )}

              {abCompareEnabled && uploadedCreative?.type === 'image' && abVariant?.type === 'image' && (
                <div className="absolute inset-0 z-[36]">
                  <BeforeAfterSlider
                    beforeImage={uploadedCreative.url}
                    afterImage={abVariant.url}
                    beforeLabel="Variante A"
                    afterLabel="Variante B"
                  />
                </div>
              )}

              {/* ─── Video decision / render status card ───────── */}
              {showVideoCard && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 pointer-events-auto w-[calc(100%-1rem)] max-w-md sm:w-auto">
                  <VideoSimulationCard
                    mode={videoMode}
                    pointName={activePoint?.name ?? ''}
                    renderProgress={renderProgress}
                    renderedVideoUrl={renderedVideoUrl}
                    onGenerateVideo={handleGenerateVideo}
                    onWhatsApp={handleWhatsApp}
                    onContinuePreview={handleContinuePreview}
                    onDownload={handleDownloadVideo}
                  />
                </div>
              )}

              {/* ─── WhatsApp lead capture form ────────────────── */}
              {showVideoChoiceModal && (
                <div className="absolute inset-0 z-40 pointer-events-auto">
                  <LeadCaptureModal
                    title="Simulações em vídeo podem levar alguns minutos para serem geradas."
                    description={[
                      'Você pode continuar aguardando ou receber o vídeo quando estiver pronto.',
                    ]}
                    fields={[]}
                    submitLabel="Aguardar renderização"
                    cancelLabel="Receber vídeo no WhatsApp quando estiver pronto"
                    onCancel={handleVideoChoiceWhatsApp}
                    onSubmit={async () => handleVideoChoiceWait()}
                  />
                </div>
              )}

              {showVideoLeadFormModal && (
                <div className="absolute inset-0 z-40 pointer-events-auto">
                  <LeadCaptureModal
                    title="Receber vídeo no WhatsApp quando estiver pronto"
                    description={[
                      'Preencha seus dados e enviaremos a simulação quando a renderização terminar.',
                    ]}
                    fields={[
                      { key: 'name', label: 'Nome', required: true, placeholder: 'Seu nome' },
                      { key: 'company', label: 'Empresa', required: true, placeholder: 'Sua empresa' },
                      { key: 'whatsapp', label: 'WhatsApp', required: true, type: 'tel', placeholder: '(00) 00000-0000' },
                      { key: 'email', label: 'E-mail', required: true, type: 'email', placeholder: 'voce@empresa.com' },
                    ]}
                    submitLabel="Receber vídeo no WhatsApp quando estiver pronto"
                    cancelLabel="Cancelar"
                    onCancel={handleVideoLeadCancel}
                    onSubmit={handleVideoLeadSubmit}
                  />
                </div>
              )}

              {/* ─── Environment controls (floating top-left) ───── */}
              <div
                className="hidden md:block absolute top-3 left-3 z-30 w-56 pointer-events-auto"
                style={{
                  borderRadius: 16,
                  background: 'rgba(0, 0, 0, 0.85)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  border: '1px solid rgba(254, 92, 43, 0.12)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset',
                  padding: '14px 12px',
                }}
              >
                <EnvironmentPanel />
              </div>

              {!isHoverPreview && uploadedCreative?.type === 'image' && (
                <div className="hidden md:block absolute top-3 left-[15.5rem] z-30 w-56 pointer-events-auto">
                  <AttentionHeatmapPanel
                    loading={attentionLoading}
                    visibilityScore={attentionScore}
                    overlayEnabled={attentionOverlayEnabled}
                    overlayOpacity={attentionOpacity}
                    zones={attentionZones}
                    onGenerate={handleGenerateAttentionHeatmap}
                    onToggleOverlay={setAttentionOverlayEnabled}
                    onOpacityChange={setAttentionOpacity}
                  />
                </div>
              )}

              {!isHoverPreview && uploadedCreative?.type === 'image' && (
                <div className="hidden md:block absolute top-[15.6rem] left-[15.5rem] z-30 w-56 pointer-events-auto">
                  <ABCreativePanel
                    variant={abVariant}
                    enabled={abCompareEnabled}
                    onVariantChange={setAbVariant}
                    onEnabledChange={setAbCompareEnabled}
                  />
                </div>
              )}

              {/* ─── Impact counter card (floating) ──────── */}
              {!isHoverPreview && activePoint && (
                <div className="hidden md:block absolute bottom-20 left-3 z-30 w-72 pointer-events-none animate-fade-in">
                  <InsertionsImpactCard
                    value={activePoint.minimumInsertions}
                    liveInsertions={liveInsertions}
                    pointName={activePoint.name}
                  />
                </div>
              )}

              {/* Video point badge */}
              {isVideoPoint && !isHoverPreview && (
                <div className="hidden lg:block absolute top-3 left-[15.5rem] z-30 pointer-events-none">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-body font-medium bg-accent/10 text-accent border border-accent/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    {videoMode === 'rendering' ? 'Renderizando vídeo...' : 'Ponto em vídeo'}
                  </span>
                </div>
              )}

              {/* Point info bar */}
              {activePoint && (
                <div className="hidden md:block absolute bottom-0 left-0 right-0 px-6 py-3 bg-gradient-to-t from-black/80 to-transparent z-20 pointer-events-none">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-neutral-400 font-body">
                          {isHoverPreview ? 'Pré-visualizando:' : 'Simulando em:'}
                          {' '}
                          <span className="text-accent font-medium">{activePoint.name}</span>
                          {activePoint.city && (
                            <span className="text-neutral-600"> — {activePoint.city}</span>
                          )}
                        </p>
                        {isHoverPreview && (
                          <span className="text-[9px] text-neutral-600 font-body bg-white/5 px-2 py-0.5 rounded-full">
                            hover
                          </span>
                        )}
                      </div>
                      {activePoint.address && !isHoverPreview && (
                        <p className="text-[10px] text-neutral-600 font-body">
                          📍 {activePoint.address}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <CreativeUploadCenter />
          )}
        </main>

        {/* ─── Right: Floating inventory panel ──────────────── */}
        <div className="absolute right-2 left-2 bottom-2 top-auto z-30 max-h-[46vh] min-h-[16rem] flex flex-col pointer-events-none lg:top-3 lg:right-3 lg:bottom-3 lg:left-auto lg:w-80 lg:max-h-none lg:min-h-0">
          <div
            className="flex-1 min-h-0 pointer-events-auto flex flex-col overflow-hidden"
            style={{
              borderRadius: 18,
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(254, 92, 43, 0.12)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset',
            }}
          >
            <PointBrowserPanel />
          </div>
        </div>
      </div>

      {leadGateOpen && (
        <LeadCaptureModal
          title="Você já explorou algumas simulações."
          description={[
            'Para continuar testando mais pontos, informe seus dados.',
          ]}
          fields={[
            { key: 'name', label: 'Nome', required: true, placeholder: 'Seu nome' },
            { key: 'company', label: 'Empresa', required: true, placeholder: 'Sua empresa' },
            { key: 'whatsapp', label: 'WhatsApp', required: true, type: 'tel', placeholder: '(00) 00000-0000' },
            { key: 'email', label: 'E-mail', required: true, type: 'email', placeholder: 'voce@empresa.com' },
          ]}
          submitLabel="Continuar simulação"
          cancelLabel="Cancelar"
          onCancel={closeLeadGate}
          onSubmit={handleLeadGateSubmit}
        />
      )}

      {/* ─── Export bar (bottom) ──────────────────────────────── */}
      {showSimulation && !isHoverPreview && <ExportBar />}
    </AppShell>
  );
}

function buildSimulationFileName(params: {
  pointName?: string | null;
  clientName?: string | null;
  ext: string;
}): string {
  const parts = ['Simulação Intermidia'];
  if (params.pointName && params.pointName.trim()) {
    parts.push(params.pointName.trim());
  }
  if (params.clientName && params.clientName.trim()) {
    parts.push(params.clientName.trim());
  }

  const raw = parts.join(' - ');
  const safe = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `${safe || 'Simulacao Intermidia'}.${params.ext}`;
}
