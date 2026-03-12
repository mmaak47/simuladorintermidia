'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export type LeadFieldKey = 'name' | 'company' | 'whatsapp' | 'email';

interface LeadFieldConfig {
  key: LeadFieldKey;
  label: string;
  required?: boolean;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel';
}

interface LeadCaptureModalProps {
  title: string;
  description: string[];
  fields: LeadFieldConfig[];
  submitLabel: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSubmit: (data: Record<LeadFieldKey, string>) => void | Promise<void>;
}

const EMPTY: Record<LeadFieldKey, string> = {
  name: '',
  company: '',
  whatsapp: '',
  email: '',
};

export function LeadCaptureModal({
  title,
  description,
  fields,
  submitLabel,
  cancelLabel,
  onCancel,
  onSubmit,
}: LeadCaptureModalProps) {
  const [values, setValues] = useState<Record<LeadFieldKey, string>>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const canSubmit = useMemo(() => {
    return fields.every((f) => !f.required || values[f.key].trim().length > 0);
  }, [fields, values]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: values.name.trim(),
        company: values.company.trim(),
        whatsapp: values.whatsapp.trim(),
        email: values.email.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-white/10 bg-black/90 p-4 sm:max-h-[calc(100dvh-2rem)] sm:p-5"
        style={{
          boxShadow: '0 16px 56px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
      >
        <h3 className="text-base font-heading font-semibold text-white">{title}</h3>
        <div className="mt-2 space-y-1">
          {description.map((line) => (
            <p key={line} className="text-xs text-neutral-400 font-body leading-relaxed">
              {line}
            </p>
          ))}
        </div>

        <div className="mt-4 space-y-2.5">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-[10px] text-neutral-500 font-body mb-1">
                {field.label}
                {field.required ? ' *' : ''}
              </label>
              <input
                type={field.type ?? 'text'}
                required={field.required}
                value={values[field.key]}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
                placeholder={field.placeholder ?? ''}
                className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-xs text-white font-body placeholder:text-neutral-700 focus:outline-none focus:border-accent/30 transition-colors"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl px-4 py-2.5 text-xs text-neutral-500 font-body hover:text-white transition-all duration-200 bg-white/[0.03] hover:bg-white/[0.06]"
            >
              {cancelLabel ?? 'Cancelar'}
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-xs text-white font-body font-medium hover:bg-accent/90 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enviando...' : submitLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
