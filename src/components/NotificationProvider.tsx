import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
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
  resolve?: (value: boolean) => void;
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

  const closeModal = useCallback(() => {
    setModal(null);
  }, []);

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
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden animate-slide-up">
            <div className={`p-6 border-b border-slate-100 flex items-start gap-4 ${modal.kind === 'confirm' && modal.danger ? 'bg-rose-50/50' : 'bg-slate-50/50'}`}>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${DIALOG_ICONS[modal.icon || (modal.danger ? 'error' : 'info')].box}`}>
                {DIALOG_ICONS[modal.icon || (modal.danger ? 'error' : 'info')].icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900 leading-snug">{modal.title}</h3>
                {modal.message && (
                  <div className="text-xs text-slate-500 mt-1.5 leading-relaxed break-words whitespace-pre-line">{modal.message}</div>
                )}
              </div>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 flex-wrap">
              {modal.cancelLabel && (
                <button
                  type="button"
                  onClick={() => {
                    if (modal.kind === 'confirm') modal.resolve?.(false);
                    modal.onCancel?.();
                    closeModal();
                  }}
                  className="px-4 py-2 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                >
                  {modal.cancelLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (modal.kind === 'confirm') modal.resolve?.(true);
                  modal.onOk?.();
                  closeModal();
                }}
                className={`px-5 py-2 text-white font-bold text-xs rounded-xl transition-all shadow-sm ${modal.kind === 'confirm' && modal.danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
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
