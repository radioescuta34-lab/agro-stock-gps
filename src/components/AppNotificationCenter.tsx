import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  Clock3,
  KeyRound,
  LifeBuoy,
  PackageOpen,
  Smartphone,
  Wrench,
  X
} from 'lucide-react';
import { ComponentLoan, ComponentMaintenance, License, UserProfile } from '../types';
import { getOverdueLoans } from '../utils/loansAlerts';
import { getOverdueMaintenances } from '../utils/maintenanceAlerts';
import { buildAuthenticatedHeaders, canUseWebPush, subscribeDeviceToPush } from '../utils/pushNotifications';

type NotificationKind = 'support' | 'license' | 'maintenance' | 'loan';

interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  date: string;
  tab: string;
  urgent?: boolean;
}

interface SupportTicketSummary {
  id: string;
  titulo: string;
  status: string;
  updatedAt?: string | null;
  createdAt?: string | null;
  comments?: Array<{ id: string; source: 'app' | 'trello'; text: string; createdAt: string | null }>;
}

interface Props {
  user: UserProfile;
  licenses: License[];
  maintenances: ComponentMaintenance[];
  loans: ComponentLoan[];
  maintenanceOverdueDays?: number;
  onNavigate: (tab: string) => void;
}

const iconByKind = {
  support: LifeBuoy,
  license: KeyRound,
  maintenance: Wrench,
  loan: PackageOpen
};

const toneByKind = {
  support: 'bg-sky-50 text-sky-700',
  license: 'bg-rose-50 text-rose-700',
  maintenance: 'bg-amber-50 text-amber-700',
  loan: 'bg-violet-50 text-violet-700'
};

function toIsoDate(value: unknown): string {
  if (!value) return new Date(0).toISOString();
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().toISOString();
  const date = new Date(value as string);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function relativeDate(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return 'agora';
  if (elapsed < 3_600_000) return `há ${Math.max(1, Math.floor(elapsed / 60_000))} min`;
  if (elapsed < 86_400_000) return `há ${Math.max(1, Math.floor(elapsed / 3_600_000))} h`;
  if (elapsed < 172_800_000) return 'ontem';
  return new Date(value).toLocaleDateString('pt-BR');
}

export default function AppNotificationCenter({
  user,
  licenses,
  maintenances,
  loans,
  maintenanceOverdueDays = 7,
  onNavigate
}: Props) {
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [pushState, setPushState] = useState<'idle' | 'loading' | 'enabled' | 'denied' | 'unavailable'>('idle');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const storageKey = `agro_stock_gps_notification_reads_${user.uid}`;

  const loadTickets = useCallback(async () => {
    try {
      const headers = await buildAuthenticatedHeaders(user);
      const response = await fetch('/api/support/tickets', { headers });
      const data = await response.json();
      if (response.ok && Array.isArray(data.tickets)) setTickets(data.tickets);
    } catch {
      // Operational notifications remain available even when support is temporarily offline.
    }
  }, [user]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setReadIds(new Set<string>(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []));
    } catch {
      setReadIds(new Set());
    }
    void loadTickets();
    const timer = window.setInterval(loadTickets, 60_000);
    return () => window.clearInterval(timer);
  }, [loadTickets, storageKey]);

  useEffect(() => {
    if (!canUseWebPush()) setPushState('unavailable');
    else if (Notification.permission === 'granted') setPushState('enabled');
    else if (Notification.permission === 'denied') setPushState('denied');
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const items = useMemo<NotificationItem[]>(() => {
    const result: NotificationItem[] = [];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    tickets.forEach(ticket => {
      const comments = ticket.comments || [];
      const lastComment = comments[comments.length - 1];
      if (ticket.status === 'Concluído') {
        const date = ticket.updatedAt || lastComment?.createdAt || ticket.createdAt || now.toISOString();
        result.push({
          id: `support-complete-${ticket.id}-${date}`,
          kind: 'support',
          title: 'Chamado concluído',
          message: ticket.titulo,
          date,
          tab: 'support'
        });
      } else if (lastComment?.source === 'trello') {
        result.push({
          id: `support-reply-${ticket.id}-${lastComment.id}`,
          kind: 'support',
          title: 'Suporte respondeu seu chamado',
          message: ticket.titulo,
          date: lastComment.createdAt || ticket.updatedAt || now.toISOString(),
          tab: 'support',
          urgent: true
        });
      }
    });

    licenses.forEach(license => {
      if (!license.expirationDate || license.expirationDate >= today) return;
      result.push({
        id: `license-expired-${license.id}-${license.expirationDate}`,
        kind: 'license',
        title: 'Licença vencida',
        message: `${license.name} venceu em ${new Date(`${license.expirationDate}T12:00:00`).toLocaleDateString('pt-BR')}.`,
        date: new Date(`${license.expirationDate}T12:00:00`).toISOString(),
        tab: 'licenses',
        urgent: true
      });
    });

    getOverdueMaintenances(maintenances, maintenanceOverdueDays, now).forEach(maintenance => {
      result.push({
        id: `maintenance-overdue-${maintenance.id}-${maintenance.sentDate}`,
        kind: 'maintenance',
        title: 'Retorno de manutenção atrasado',
        message: `${maintenance.componentName} · ${maintenance.providerName}`,
        date: new Date(`${maintenance.sentDate}T12:00:00`).toISOString(),
        tab: 'components',
        urgent: true
      });
    });

    getOverdueLoans(loans, today).forEach(loan => {
      result.push({
        id: `loan-overdue-${loan.id}-${loan.estimatedReturnDate}`,
        kind: 'loan',
        title: 'Empréstimo com devolução atrasada',
        message: `${loan.contractNumber} · ${loan.thirdPartyName}`,
        date: new Date(`${loan.estimatedReturnDate}T12:00:00`).toISOString(),
        tab: 'loans',
        urgent: true
      });
    });

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [tickets, licenses, maintenances, loans, maintenanceOverdueDays]);

  const unreadCount = items.filter(item => !readIds.has(item.id)).length;

  const persistReads = (next: Set<string>) => {
    setReadIds(next);
    localStorage.setItem(storageKey, JSON.stringify(Array.from(next).slice(-500)));
  };

  const markRead = (id: string) => persistReads(new Set<string>(readIds).add(id));
  const markAllRead = () => persistReads(new Set<string>([...readIds, ...items.map(item => item.id)]));

  const activatePush = async () => {
    setPushState('loading');
    try {
      const state = await subscribeDeviceToPush(user);
      setPushState(state === 'subscribed' ? 'enabled' : state);
    } catch {
      setPushState('unavailable');
    }
  };

  const openItem = (item: NotificationItem) => {
    markRead(item.id);
    setOpen(false);
    onNavigate(item.tab);
  };

  const panel = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={panelRef}
      className="fixed inset-x-3 top-[4.5rem] z-[90] flex max-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 md:absolute md:inset-auto md:right-5 md:top-[4.5rem] md:w-[390px]"
      role="dialog"
      aria-label="Central de notificações"
    >
      <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3.5">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">Notificações</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Alertas operacionais que precisam da sua atenção.</p>
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50" title="Marcar todas como lidas">
              <CheckCheck className="mr-1 inline h-3.5 w-3.5" /> Lidas
            </button>
          )}
          <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar notificações">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {pushState !== 'enabled' && (
        <div className="m-3 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
          <div className="rounded-lg bg-white p-2 text-emerald-700 shadow-sm"><Smartphone className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-800">Alertas neste dispositivo</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">
              {pushState === 'denied' ? 'A permissão está bloqueada nas configurações do navegador.' : pushState === 'unavailable' ? 'Instale o app ou abra por HTTPS para ativar alertas nativos.' : 'Receba avisos mesmo quando o Agro Stock estiver fechado.'}
            </p>
            {(pushState === 'idle' || pushState === 'loading') && (
              <button disabled={pushState === 'loading'} onClick={activatePush} className="mt-2 text-[10px] font-extrabold text-emerald-700 hover:text-emerald-800 disabled:opacity-60">
                {pushState === 'loading' ? 'Ativando…' : 'Ativar notificações'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-400"><Bell className="h-6 w-6" /></div>
            <p className="mt-3 text-sm font-bold text-slate-800">Tudo em dia por aqui</p>
            <p className="mt-1 max-w-60 text-[11px] leading-relaxed text-slate-500">Novas respostas, vencimentos e pendências operacionais aparecerão aqui.</p>
          </div>
        ) : items.map(item => {
          const Icon = iconByKind[item.kind];
          const isUnread = !readIds.has(item.id);
          return (
            <button key={item.id} onClick={() => openItem(item)} className={`group flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${isUnread ? 'bg-emerald-50/25' : ''}`}>
              <span className={`mt-0.5 rounded-xl p-2 ${toneByKind[item.kind]}`}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-2">
                  <span className="flex-1 text-xs font-extrabold leading-snug text-slate-900">{item.title}</span>
                  {isUnread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                </span>
                <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-slate-600">{item.message}</span>
                <span className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-slate-400"><Clock3 className="h-3 w-3" /> {relativeDate(toIsoDate(item.date))}</span>
              </span>
              <ChevronRight className="mt-4 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => { setOpen(value => !value); if (!open) void loadTickets(); }}
        className={`relative rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${open ? 'bg-slate-800 text-emerald-300' : ''}`}
        aria-label={unreadCount ? `Notificações, ${unreadCount} não lidas` : 'Notificações'}
        aria-expanded={open}
      >
        {unreadCount ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full border-2 border-slate-900 bg-rose-500 px-1 text-[8px] font-black leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {panel}
    </>
  );
}
