import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface HelpGuideStep {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  content?: React.ReactNode;
}

interface HelpGuideModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  steps: HelpGuideStep[];
}

export default function HelpGuideModal({ open, onClose, title, steps }: HelpGuideModalProps) {
  const [step, setStep] = useState(0);

  const close = () => {
    setStep(0);
    onClose();
  };

  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    const previousStyles = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.position = previousStyles.position;
      document.body.style.top = previousStyles.top;
      document.body.style.width = previousStyles.width;
      document.body.style.overflow = previousStyles.overflow;
      window.scrollTo(0, scrollY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const activeStep = steps[step];
  const ActiveStepIcon = activeStep.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-guide-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/60 backdrop-blur-[2px]"
        aria-label="Fechar ajuda"
        onClick={close}
      />

      <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="help-guide-title" className="text-base font-bold text-slate-900">{title}</h3>
              <p className="mt-0.5 text-xs text-slate-500">Guia rápido · Etapa {step + 1} de {steps.length}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar ajuda"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
          <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${activeStep.accent}`}>
            <ActiveStepIcon className="h-6 w-6" />
          </div>
          <h4 className="text-xl font-bold tracking-tight text-slate-900">{activeStep.title}</h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{activeStep.description}</p>
          {activeStep.content && <div className="mt-5">{activeStep.content}</div>}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
          <div className="mb-4 flex items-center justify-center gap-1.5" aria-label={`Etapa ${step + 1} de ${steps.length}`}>
            {steps.map((s, index) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setStep(index)}
                aria-label={`Ir para etapa ${index + 1}: ${s.title}`}
                aria-current={index === step ? 'step' : undefined}
                className="group flex h-6 items-center px-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                <span className={`block h-1.5 rounded-full transition-all ${index === step ? 'w-7 bg-emerald-600' : 'w-1.5 bg-slate-200 group-hover:bg-slate-300'}`} />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
            )}
            <button
              type="button"
              onClick={() => step === steps.length - 1 ? close() : setStep(s => s + 1)}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              {step === steps.length - 1 ? 'Entendi' : 'Próximo'}
              {step < steps.length - 1 && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}