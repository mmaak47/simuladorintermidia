'use client';

import { useState, useCallback } from 'react';
import { useCompositionStore } from '@/store/composition-store';
import { checkCompliance, type ComplianceReport, type Severity } from '@/lib/creative-compliance';
import { computeScreenAspect } from '@dooh/core';

const SEVERITY_ICON: Record<Severity, string> = {
  pass: '✅',
  warn: '⚠️',
  fail: '❌',
};

const SEVERITY_COLOR: Record<Severity, string> = {
  pass: 'text-green-400',
  warn: 'text-yellow-400',
  fail: 'text-red-400',
};

export function CompliancePanel() {
  const { creative, corners, location } = useCompositionStore();
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = useCallback(() => {
    if (!creative || !corners || !location) return;

    setLoading(true);
    // Use requestAnimationFrame to not block the UI
    requestAnimationFrame(() => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const screenAspect = computeScreenAspect(corners);
        const result = checkCompliance(
          img,
          creative.width,
          creative.height,
          screenAspect,
          location.width,
          location.height,
        );
        setReport(result);
        setLoading(false);
      };
      img.onerror = () => setLoading(false);
      img.src = creative.url;
    });
  }, [creative, corners, location]);

  if (!creative || !corners) return null;

  return (
    <section className="rounded-panel bg-white/[0.04] p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-label font-heading font-semibold text-white/70 uppercase tracking-wider">
          Conformidade
        </h3>
        <button
          onClick={runCheck}
          disabled={loading}
          className="text-xs font-body font-medium py-1.5 px-3 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Analisando...' : 'Verificar'}
        </button>
      </div>

      {report && (
        <div className="space-y-2 animate-fade-in">
          {/* Score bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  report.score >= 80 ? 'bg-green-500' :
                  report.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${report.score}%` }}
              />
            </div>
            <span className={`text-sm font-body font-bold tabular-nums ${
              report.score >= 80 ? 'text-green-400' :
              report.score >= 50 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {report.score}
            </span>
          </div>

          {/* Issue list */}
          <div className="space-y-1.5">
            {report.issues.map((issue) => (
              <div key={issue.id} className="flex gap-2 items-start">
                <span className="text-sm flex-shrink-0">{SEVERITY_ICON[issue.severity]}</span>
                <div className="min-w-0">
                  <p className={`text-xs font-body font-semibold ${SEVERITY_COLOR[issue.severity]}`}>
                    {issue.title}
                  </p>
                  <p className="text-xs font-body text-neutral-500 leading-relaxed">
                    {issue.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
