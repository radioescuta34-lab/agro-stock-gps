import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Check } from 'lucide-react';
import { WHATS_NEW_STORAGE_KEY, getWhatsNewAccent, getWhatsNewIcon, type WhatsNewCategory } from '../constants/whatsNew';
import { sanitizeRichText } from '../utils/richText';

interface WhatsNewModalProps {
  open: boolean;
  onClose: () => void;
  content: WhatsNewCategory[];
  publishedId: number | null;
}

export default function WhatsNewModal({ open, onClose, content, publishedId }: WhatsNewModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const close = () => {
    if (dontShowAgain && publishedId !== null) {
      try {
        localStorage.setItem(WHATS_NEW_STORAGE_KEY, String(publishedId));
      } catch (error) {
        console.warn('Não foi possível salvar preferência de "Não exibir mais" (Novidades):', error);
      }
    }
    setDontShowAgain(false);
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

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/60 backdrop-blur-[2px]"
        aria-label="Fechar novidades"
        onClick={close}
      />

      <div className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[88dvh] sm:max-w-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="whats-new-title" className="text-base font-bold text-slate-900">Novidades</h3>
              <p className="mt-0.5 text-xs text-slate-500">Veja o que mudou nas últimas atualizações</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar novidades"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-8">
            {content.map((category) => (
              <section key={category.title} className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{category.title}</h4>
                <div className="space-y-3">
                  {category.items.map((item) => {
                    const ItemIcon = getWhatsNewIcon(item.icon);
                    return (
                      <article
                        key={item.title}
                        className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition-shadow hover:shadow-sm"
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${getWhatsNewAccent(item.accent)}`}>
                          <ItemIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-base font-semibold text-slate-900">{item.title}</h5>
                          <div
                            className="mt-1 text-sm leading-relaxed text-slate-600 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                            dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="shrink-0 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_24px_-20px_rgba(15,23,42,0.5)] sm:px-6 sm:py-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm leading-snug text-slate-600">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
              <span>Não exibir mais estas novidades</span>
            </label>
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:w-auto"
            >
              <Check className="h-4 w-4" />
              Entendi
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
