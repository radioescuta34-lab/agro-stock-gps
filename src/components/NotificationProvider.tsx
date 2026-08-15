import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, XCircle, Info, X, AlertOctagon } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';
type DialogIcon = 'info' | 'warning' | 'success' | 'error';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface DialogOptions {
  title: string;
  message?: string;
  icon?: DialogIcon;
  okLabel?: string;
  onOk?: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ModalState {
  kind: 'dialog' | 'confirm';
  title: string;
  message?: string;
  icon?: DialogIcon;
  okLabel?: string;
  onOk?: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
  danger?: boolean;
}

interface NotificationContextValue {
  showToast: (type: ToastType, message: string) => void;
  showDialog: (options: DialogOptions) => void;
  confirmDialog: (options: ConfirmOptions) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications deve ser usado dentro de <NotificationProvider>');
  }
  return ctx;
}

const TOAST_DURATION = 4500;

const TOAST_STYLES: Record<ToastType, { box: string; icon: React.ReactNode }> = {
  success: {
    box: 'bg-white border-emerald-200 text-emerald-800',
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
  },
  error: {
    box: 'bg-white border-rose-200 text-rose-800',
    icon: <XCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
  },
  info: {
    box: 'bg-white border-sky-200 text-sky-800',
    icon: <Info className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
  },
  warning: {
    box: 'bg-white border-amber-200 text-amber-800',
    icon: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
  }
};

const DIALOG_ICONS: Record<DialogIcon, { box: string; icon: React.ReactNode }> = {
  info: {
    box: 'bg-sky-100 text-sky-700',
    icon: <Info className="h-5 w-5" />
  },
  warning: {
    box: 'bg-amber-100 text-amber-700',
    icon: <AlertTriangle className="h-5 w-5" />
  },
  success: {
    box: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 className="h-5 w-5" />
  },
  error: {
    box: 'bg-rose-100 text-rose-700',
    icon: <AlertOctagon className="h-5 w-5" />
  }
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const idRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
    window.setTimeout(() => dismissToast(id), TOAST_DURATION);
  }, [dismissToast]);

  const cancelModal = useCallback(() => {
    modal?.onCancel?.();
    setModal(null);
  }, [modal]);

  const acceptModal = useCallback(() => {
    modal?.onOk?.();
    setModal(null);
  }, [modal]);

  useEffect(() => {
    if (!modal) return;

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
      if (event.key === 'Escape') cancelModal();
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
  }, [modal, cancelModal]);

  const showDialog = useCallback((options: DialogOptions) => {
    setModal({ kind: 'dialog', ...options });
  }, []);

  const confirmDialog = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setModal({
        kind: 'confirm',
        ...options,
        okLabel: options.confirmLabel,
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
        cancelLabel: options.cancelLabel
      });
    });
  }, []);

  const value = useMemo<NotificationContextValue>(() => ({
    showToast,
    showDialog,
    confirmDialog
  }), [showToast, showDialog, confirmDialog]);

  return (
    <NotificationContext.Provider value={value}>
      {children}

      {/* Toasts */}
      {toasts.length > 0 && createPortal(
        <div className="fixed top-4 right-4 z-[120] flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
          {toasts.map(toast => {
            const style = TOAST_STYLES[toast.type];
            return (
              <div
                key={toast.id}
                className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg flex items-start gap-2.5 text-xs font-semibold animate-slide-in-right ${style.box}`}
                role="status"
              >
                {style.icon}
                <div className="leading-normal flex-1 min-w-0 break-words">{toast.message}</div>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="text-current opacity-50 hover:opacity-100 transition-opacity shrink-0"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}

      {/* Modal Dialog / Confirm */}
      {modal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="notification-modal-title" aria-describedby={modal.message ? 'notification-modal-message' : undefined}>
          <button
            type="button"
            aria-label="Cancelar e fechar"
            className="absolute inset-0 cursor-default bg-slate-950/60 backdrop-blur-[2px] animate-fade-in"
            onClick={cancelModal}
          />
          <div className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-100 bg-white shadow-2xl animate-slide-up sm:max-w-md sm:rounded-3xl">
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
            <div className={`flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:gap-4 sm:p-6 ${modal.kind === 'confirm' && modal.danger ? 'bg-rose-50/50' : 'bg-slate-50/50'}`}>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${DIALOG_ICONS[modal.icon || (modal.danger ? 'error' : 'info')].box}`}>
                {DIALOG_ICONS[modal.icon || (modal.danger ? 'error' : 'info')].icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 id="notification-modal-title" className="text-base font-bold leading-snug text-slate-900">{modal.title}</h3>
                {modal.message && (
                  <div id="notification-modal-message" className="mt-1.5 break-words whitespace-pre-line text-[13px] leading-relaxed text-slate-500 sm:text-xs">{modal.message}</div>
                )}
              </div>
              <button
                onClick={cancelModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="ios-safe-action-bar grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white px-4 pt-3 sm:flex sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
              {modal.cancelLabel && (
                <button
                  type="button"
                  autoFocus={modal.kind === 'confirm' && modal.danger}
                  onClick={cancelModal}
                  className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 sm:min-w-28"
                >
                  {modal.cancelLabel}
                </button>
              )}
              <button
                type="button"
                onClick={acceptModal}
                className={`min-h-11 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:min-w-28 ${!modal.cancelLabel ? 'col-span-2' : ''} ${modal.kind === 'confirm' && modal.danger ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500' : 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500'}`}
              >
                {modal.okLabel || (modal.kind === 'confirm' ? 'Confirmar' : 'Ok')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </NotificationContext.Provider>
  );
}
