import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UserProfile } from '../types';
import { auth } from '../firebase';
import {
  LifeBuoy,
  Paperclip,
  X,
  CheckCircle2,
  Loader2,
  FileText,
  AlertTriangle,
  RefreshCw,
  Inbox,
  Search,
  ChevronDown,
  Clock3,
  Send,
  CircleCheckBig,
  MessageSquareText,
  ArrowRight,
  ShieldCheck,
  Plus,
  Check,
  ArrowLeft
} from 'lucide-react';

interface SupportAttachment {
  id: string;
  filename: string;
  mimeType: string;
  base64: string;
  previewUrl: string | null;
  sizeBytes: number;
}

interface TicketSuccess {
  ticketId: string;
  attachmentsFailed: string[];
}

interface TrackedTicket {
  id: string;
  titulo: string;
  descricao?: string;
  autorNome?: string;
  prioridade: string;
  status: string;
  anexosEnviados?: number;
  createdAt: string | null;
  updatedAt?: string | null;
  comments?: SupportComment[];
}

interface SupportComment {
  id: string;
  text: string;
  createdAt: string | null;
  authorName: string;
  source: 'app' | 'trello';
}

interface SupportTabProps {
  user: UserProfile;
  onBackToDashboard?: () => void;
}

const MAX_FILES = 4;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const COMPRESS_THRESHOLD = 800 * 1024;
const MAX_DIMENSION = 1600;
const MAX_DESC_LENGTH = 5000;

const PRIORIDADES = [
  { value: 'baixa', label: 'Baixa', dot: 'bg-emerald-500' },
  { value: 'media', label: 'Média', dot: 'bg-amber-500' },
  { value: 'alta', label: 'Alta', dot: 'bg-rose-500' }
];

const STATUS_META: Record<string, { badge: string; dot: string; ring: string; step: number; label: string }> = {
  'Novo': { badge: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500', ring: 'ring-sky-500/10', step: 1, label: 'Recebido' },
  'Em Estudo': { badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500', ring: 'ring-violet-500/10', step: 2, label: 'Em análise' },
  'Em Andamento': { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', ring: 'ring-amber-500/10', step: 3, label: 'Em atendimento' },
  'Concluído': { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', ring: 'ring-emerald-500/10', step: 4, label: 'Resolvido' }
};

const TICKET_STEPS = ['Recebido', 'Em análise', 'Em atendimento', 'Resolvido'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTicketDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '';
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const elapsed = Date.now() - timestamp;
  if (elapsed < 60_000) return 'agora';
  if (elapsed < 3_600_000) return `há ${Math.max(1, Math.floor(elapsed / 60_000))} min`;
  if (elapsed < 86_400_000) return `há ${Math.max(1, Math.floor(elapsed / 3_600_000))} h`;
  if (elapsed < 172_800_000) return 'ontem';
  return formatTicketDate(iso);
}

function clampPreview(text: string, maxLength = 150): string {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function normalizeSupportDisplayName(value: string): string {
  return (value || '').trim().toLocaleLowerCase('pt-BR');
}

function statusBadgeClasses(status: string): string {
  return STATUS_META[status]?.badge || 'bg-slate-100 text-slate-600 border-slate-200';
}

function generateAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Erro ao ler o arquivo ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível processar a imagem neste navegador.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Não foi possível processar a imagem.'));
    img.src = dataUrl;
  });
}

async function buildHeaders(user: UserProfile): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    /* ignore */
  }
  if (!headers['Authorization'] && user.uid) {
    headers['X-Client-Uid'] = user.uid;
    headers['X-Client-Email'] = user.email || '';
    headers['X-Client-Name'] = user.name || '';
  }
  return headers;
}

function MeusChamados({ user }: { user: UserProfile }) {
  const [tickets, setTickets] = useState<TrackedTicket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'abertos' | 'concluidos'>('todos');
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingTicket, setReplyingTicket] = useState<string | null>(null);
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const headers = await buildHeaders(user);
      const res = await fetch('/api/support/tickets', { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Erro ao carregar seus chamados.');
      }
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      setLastLoadedAt(new Date().toISOString());
    } catch (err: any) {
      if (!silent) {
        setError(err?.message || 'Erro ao carregar seus chamados.');
        setTickets([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user.uid, user.email, user.name]);

  useEffect(() => {
    loadTickets(false);
  }, [loadTickets]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadTickets(true);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadTickets]);

  const visibleTickets = (tickets || []).filter((ticket) => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    const matchesQuery = !normalizedQuery
      || ticket.id.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
      || ticket.titulo.toLocaleLowerCase('pt-BR').includes(normalizedQuery);
    const matchesStatus = statusFilter === 'todos'
      || (statusFilter === 'abertos' && ticket.status !== 'Concluído')
      || (statusFilter === 'concluidos' && ticket.status === 'Concluído');
    return matchesQuery && matchesStatus;
  });

  const openCount = (tickets || []).filter((ticket) => ticket.status !== 'Concluído').length;
  const closedCount = (tickets || []).filter((ticket) => ticket.status === 'Concluído').length;

  const submitReply = async (ticketId: string) => {
    const message = (replyDrafts[ticketId] || '').trim();
    if (!message || replyingTicket) return;
    setReplyingTicket(ticketId);
    setReplyErrors((current) => ({ ...current, [ticketId]: '' }));
    try {
      const headers = await buildHeaders(user);
      const res = await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}/comments`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, authorName: user.name })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.comment) {
        throw new Error(data?.error || 'Não foi possível enviar sua mensagem.');
      }
      setTickets((current) => current?.map((ticket) => ticket.id === ticketId
        ? {
            ...ticket,
            comments: [...(ticket.comments || []), data.comment],
            updatedAt: data.comment.createdAt || ticket.updatedAt
          }
        : ticket) || []);
      setReplyDrafts((current) => ({ ...current, [ticketId]: '' }));
    } catch (err: any) {
      setReplyErrors((current) => ({
        ...current,
        [ticketId]: err?.message || 'Não foi possível enviar sua mensagem.'
      }));
    } finally {
      setReplyingTicket(null);
    }
  };

  const renderTicket = (t: TrackedTicket) => {
    const prio = PRIORIDADES.find((p) => p.value === t.prioridade);
    const status = STATUS_META[t.status];
    const currentStep = status?.step || 1;
    const isExpanded = expandedTicket === t.id;
    const messageCount = (t.comments?.length || 0) + (t.descricao ? 1 : 0);
    const lastComment = t.comments?.[t.comments.length - 1];
    const latestText = lastComment?.text || t.descricao || '';
    const latestActivityAt = lastComment?.createdAt || t.updatedAt || t.createdAt;
    const waitingForCustomer = t.status !== 'Concluído' && lastComment?.source === 'trello';
    const responsibilityLabel = waitingForCustomer ? 'Aguardando você' : 'Aguardando suporte';
    return (
      <article key={t.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-md">
        <button
          type="button"
          onClick={() => setExpandedTicket(isExpanded ? null : t.id)}
          className="flex w-full items-start gap-3 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 sm:items-center sm:px-5"
          aria-expanded={isExpanded}
          aria-controls={`ticket-${t.id}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="min-w-0 truncate text-sm font-extrabold text-slate-900 sm:text-[15px]">{t.titulo}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadgeClasses(t.status)}`}>
                {status?.label || t.status}
              </span>
              {t.status !== 'Concluído' && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${waitingForCustomer ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${waitingForCustomer ? 'bg-amber-500' : 'bg-sky-500'}`} />
                  {responsibilityLabel}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-600 notranslate">{t.id}</span>
              <span aria-hidden="true" className="text-slate-300">•</span>
              <span>{formatTicketDate(t.createdAt)}</span>
              {prio && (
                <>
                  <span aria-hidden="true" className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${prio.dot}`} />Prioridade {prio.label.toLocaleLowerCase('pt-BR')}</span>
                </>
              )}
            </div>
            {!isExpanded && latestText && (
              <div className="mt-2 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="truncate text-xs leading-relaxed text-slate-600">{clampPreview(latestText)}</p>
                <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
                  <span>{t.comments?.length || 0} {(t.comments?.length || 0) === 1 ? 'resposta' : 'respostas'}</span>
                  <span aria-hidden="true">•</span>
                  <span>Atualizado {formatRelativeDate(latestActivityAt)}</span>
                </div>
              </div>
            )}
          </div>
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform sm:mt-0 ${isExpanded ? 'rotate-180' : ''}`} />
        </button>

        {isExpanded && (
          <div id={`ticket-${t.id}`} className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
            <div className="relative px-1 pb-1" aria-label={`Andamento: ${status?.label || t.status}`}>
              <div className="absolute left-[12.5%] right-[12.5%] top-3.5 h-0.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                  style={{ width: `${((currentStep - 1) / Math.max(TICKET_STEPS.length - 1, 1)) * 100}%` }}
                />
              </div>
              <div className="relative grid grid-cols-4 gap-1">
              {TICKET_STEPS.map((step, index) => {
                const current = index === currentStep - 1;
                const completed = index < currentStep - 1 || (t.status === 'Concluído' && current);
                return (
                  <div
                    key={step}
                    className="flex min-w-0 flex-col items-center text-center"
                    aria-current={current ? 'step' : undefined}
                  >
                    <div className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${completed ? 'border-emerald-500 bg-emerald-500 text-white' : current ? 'border-emerald-500 bg-white text-emerald-600 ring-4 ring-emerald-500/10' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                      {completed ? (
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      ) : current ? (
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      ) : (
                        <span className="text-[9px] font-extrabold">{index + 1}</span>
                      )}
                    </div>
                    <p className={`mt-2 text-[9px] font-bold leading-tight sm:text-[10px] ${current ? 'text-emerald-700' : completed ? 'text-slate-600' : 'text-slate-400'}`}>{step}</p>
                  </div>
                );
              })}
              </div>
            </div>

            <section className="mt-5 border-t border-slate-200 pt-4" aria-label="Conversa do chamado">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-xs font-extrabold text-slate-800">Conversa</h3>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <span>{messageCount} {messageCount === 1 ? 'mensagem' : 'mensagens'}</span>
                  {latestActivityAt && <span className="ml-1.5">· Atualizado {formatRelativeDate(latestActivityAt)}</span>}
                </div>
              </div>

              <div className="space-y-3">
                {t.descricao && (
                  <div className="w-full rounded-2xl border border-emerald-100 border-l-4 border-l-emerald-500 bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-700">Solicitação original</span>
                      <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
                        <span className="font-bold text-slate-700">{t.autorNome || 'Você'}</span>
                        <span>via Agro Stock</span>
                        <span aria-hidden="true" className="text-slate-300">•</span>
                        <span>{formatTicketDate(t.createdAt)}</span>
                      </div>
                    </div>
                    <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{t.descricao}</p>
                  </div>
                )}

                {(t.comments || []).map((comment) => {
                  const fromApp = comment.source === 'app';
                  const isGenericCustomerName = normalizeSupportDisplayName(comment.authorName) === 'cliente';
                  const displayAuthorName = fromApp && isGenericCustomerName
                    ? (t.autorNome || user.name || 'Cliente')
                    : (comment.authorName || (fromApp ? t.autorNome || user.name || 'Cliente' : 'Equipe de suporte'));
                  return (
                    <div key={comment.id} className={`${fromApp ? 'ml-auto rounded-tr-md border-emerald-100 bg-emerald-50/80 sm:max-w-[78%]' : 'mr-auto rounded-tl-md border-slate-200 bg-white sm:max-w-[78%]'} max-w-[92%] rounded-2xl border px-4 py-3.5 shadow-sm`}>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
                        <span className={`font-extrabold ${fromApp ? 'text-emerald-800' : 'text-slate-700'}`}>{displayAuthorName}</span>
                        <span className={fromApp ? 'text-emerald-600' : 'text-slate-500'}>{fromApp ? 'via Agro Stock' : '· Suporte'}</span>
                        <span aria-hidden="true" className="text-slate-300">•</span>
                        <span className={fromApp ? 'text-emerald-600' : 'text-slate-400'}>{formatTicketDate(comment.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{comment.text}</p>
                    </div>
                  );
                })}

                {!t.descricao && (!t.comments || t.comments.length === 0) && (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">Nenhuma mensagem registrada.</p>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-500/10">
                <label htmlFor={`reply-${t.id}`} className="sr-only">Responder ao chamado {t.id}</label>
                <textarea
                  id={`reply-${t.id}`}
                  value={replyDrafts[t.id] || ''}
                  onChange={(event) => setReplyDrafts((current) => ({ ...current, [t.id]: event.target.value.slice(0, 2000) }))}
                  rows={2}
                  placeholder="Escreva uma resposta para a equipe de suporte..."
                  className="max-h-40 min-h-16 w-full resize-y border-0 bg-transparent px-2 py-1.5 text-sm leading-relaxed text-slate-700 outline-none placeholder:text-slate-400"
                />
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-1 pt-2">
                  <span className="text-[9px] text-slate-400">{(replyDrafts[t.id] || '').length}/2000</span>
                  <button
                    type="button"
                    onClick={() => submitReply(t.id)}
                    disabled={replyingTicket === t.id || !(replyDrafts[t.id] || '').trim()}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[11px] font-extrabold text-white transition hover:bg-emerald-700 disabled:pointer-events-none disabled:bg-slate-300"
                  >
                    {replyingTicket === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Enviar resposta
                  </button>
                </div>
              </div>
              {replyErrors[t.id] && <p className="mt-2 text-[11px] font-medium text-rose-600" role="alert">{replyErrors[t.id]}</p>}
            </section>

            {typeof t.anexosEnviados === 'number' && t.anexosEnviados > 0 && (
              <div className="mt-4 flex justify-end border-t border-slate-200 pt-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{t.anexosEnviados} {t.anexosEnviados === 1 ? 'anexo' : 'anexos'}</span>
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <div>
      {loading && tickets === null && (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-500" />
            <p className="mt-3 text-xs text-slate-500">Carregando seus chamados...</p>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-rose-700">{error}</p>
            <button onClick={() => loadTickets(false)} className="text-xs font-bold text-rose-600 underline mt-1">
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!loading && !error && tickets && tickets.length === 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm sm:py-16">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-300 to-transparent" />
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
            <Inbox className="h-7 w-7 text-emerald-600" />
          </div>
          <p className="text-base font-bold text-slate-900">Tudo certo por aqui</p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">Você ainda não tem chamados. Use <strong className="font-semibold text-slate-600">Novo chamado</strong> para registrar uma solicitação e acompanhar as atualizações neste espaço.</p>
        </div>
      )}

      {!loading && !error && tickets && tickets.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Filtrar chamados por status">
            {[
              { value: 'todos' as const, label: 'Todos', count: tickets.length, countClass: 'text-slate-900' },
              { value: 'abertos' as const, label: 'Em aberto', count: openCount, countClass: 'text-amber-600' },
              { value: 'concluidos' as const, label: 'Resolvidos', count: closedCount, countClass: 'text-emerald-600' }
            ].map((item, index) => {
              const active = statusFilter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setStatusFilter(item.value)}
                  aria-pressed={active}
                  className={`relative min-h-[68px] px-3 py-3 text-left transition-colors focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 sm:px-5 ${index > 0 ? 'border-l border-slate-100' : ''} ${active ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}`}
                >
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-emerald-700' : 'text-slate-400'}`}>{item.label}</p>
                  <p className={`mt-0.5 text-lg font-extrabold ${active ? 'text-emerald-700' : item.countClass}`}>{item.count}</p>
                  {active && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-emerald-500" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Buscar chamados</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por assunto ou protocolo" className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-xs text-slate-700 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15" />
            </label>
            <div className="flex min-h-9 shrink-0 items-center justify-end gap-2 text-[11px] text-slate-400">
              {lastLoadedAt && <span>Atualizado {formatRelativeDate(lastLoadedAt)}</span>}
              <button type="button" onClick={() => loadTickets(false)} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-bold text-slate-500 transition hover:bg-white hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Atualizando' : 'Atualizar'}
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {visibleTickets.map(renderTicket)}
          </div>

          {visibleTickets.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
              <Search className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">Nenhum chamado encontrado</p>
              <p className="mt-1 text-xs text-slate-500">Tente outro termo ou selecione outro resumo.</p>
              <button type="button" onClick={() => { setQuery(''); setStatusFilter('todos'); }} className="mt-3 text-xs font-bold text-emerald-700 hover:text-emerald-800">Limpar filtros</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SupportTab({ user, onBackToDashboard }: SupportTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'form' | 'chamados'>('chamados');
  const [titulo, setTitulo] = useState('');
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta'>('media');
  const [descricao, setDescricao] = useState('');
  const [attachments, setAttachments] = useState<SupportAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<TicketSuccess | null>(null);

  const resetForm = () => {
    setTitulo('');
    setDescricao('');
    setPrioridade('media');
    setAttachments([]);
    setError(null);
    setSuccess(null);
  };

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    setError(null);
    if (files.length === 0) return;

    const remaining = MAX_FILES - attachments.length;
    if (files.length > remaining) {
      setError(`Você pode anexar no máximo ${MAX_FILES} arquivos por ticket.`);
    }
    const selected = files.slice(0, Math.max(remaining, 0));
    if (selected.length === 0) return;

    const processed: SupportAttachment[] = [];
    for (const file of selected) {
      try {
        if (file.type === 'application/pdf') {
          if (file.size > MAX_FILE_BYTES) {
            setError(`O arquivo ${file.name} excede o limite de 6MB.`);
            continue;
          }
          const dataUrl = await readAsDataUrl(file);
          processed.push({
            id: generateAttachmentId(),
            filename: file.name,
            mimeType: file.type,
            base64: dataUrl.substring(dataUrl.indexOf(',') + 1),
            previewUrl: null,
            sizeBytes: file.size
          });
        } else if (file.type.startsWith('image/')) {
          let dataUrl = await readAsDataUrl(file);
          let mimeType = file.type;
          let filename = file.name;
          let sizeBytes = file.size;
          if (mimeType !== 'image/gif' && sizeBytes > COMPRESS_THRESHOLD) {
            dataUrl = await compressImage(dataUrl);
            mimeType = 'image/jpeg';
            sizeBytes = Math.round(dataUrl.length * 0.75);
            if (!/\.jpe?g$/i.test(filename)) {
              filename = `${filename.replace(/\.[^.]+$/, '')}.jpg`;
            }
          }
          if (sizeBytes > MAX_FILE_BYTES) {
            setError(`O arquivo ${file.name} excede o limite de 6MB.`);
            continue;
          }
          processed.push({
            id: generateAttachmentId(),
            filename,
            mimeType,
            base64: dataUrl.substring(dataUrl.indexOf(',') + 1),
            previewUrl: dataUrl,
            sizeBytes
          });
        } else {
          setError(`Formato não suportado (${file.name}). Use imagens PNG, JPG, WEBP, GIF ou PDF.`);
        }
      } catch (err: any) {
        setError(err?.message || `Erro ao processar ${file.name}.`);
      }
    }

    if (processed.length > 0) {
      setAttachments(prev => [...prev, ...processed].slice(0, MAX_FILES));
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!titulo.trim()) {
      setError('Informe um título para o ticket.');
      return;
    }
    if (!descricao.trim()) {
      setError('Descreva o problema ou a solicitação.');
      return;
    }

    setLoading(true);
    try {
      const headers = await buildHeaders(user);
      headers['Content-Type'] = 'application/json';
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          prioridade,
          autorNome: user.name,
          autorEmail: user.email,
          autorUid: user.uid,
          anexos: attachments.map(a => ({
            filename: a.filename,
            mimeType: a.mimeType,
            base64: a.base64
          }))
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Erro ao criar o ticket. Tente novamente.');
      }
      setSuccess({
        ticketId: data.ticketId,
        attachmentsFailed: Array.isArray(data.attachmentsFailed) ? data.attachmentsFailed : []
      });
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar o ticket. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewTicket = () => {
    resetForm();
    setView('form');
  };

  const handleGoToChamados = () => {
    resetForm();
    setView('chamados');
  };

  if (success) {
    return (
      <div className="mx-auto max-w-2xl py-4 sm:py-8">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-white px-5 py-8 text-center shadow-sm sm:px-10 sm:py-10">
          <div className="absolute inset-x-0 top-0 h-1 bg-emerald-500" />
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Chamado recebido</p>
          <h1 className="mt-2 text-xl font-extrabold text-slate-900">Seu chamado já está na fila</h1>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">Use o protocolo abaixo para identificar a solicitação e acompanhar cada mudança de status.</p>

          <div className="mt-6 inline-flex rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4">
            <span className="font-mono text-xl font-extrabold tracking-wider text-slate-900 notranslate select-all">
              {success.ticketId}
            </span>
          </div>

          <div className="mx-auto mt-7 grid max-w-md grid-cols-3 gap-1 text-left">
            {['Recebido', 'Em análise', 'Resolvido'].map((step, index) => (
              <div key={step}>
                <div className={`mb-2 h-1 rounded-full ${index === 0 ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <p className={`text-[10px] font-semibold ${index === 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{step}</p>
              </div>
            ))}
          </div>

          {success.attachmentsFailed.length > 0 && (
            <div className="mx-auto mt-5 flex max-w-md items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700">
                Não foi possível anexar: {success.attachmentsFailed.join(', ')}. A equipe de suporte pode solicitar os arquivos novamente.
              </p>
            </div>
          )}

          <div className="mx-auto mt-7 flex max-w-md flex-col gap-2 sm:flex-row-reverse">
            <button
              onClick={handleGoToChamados}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
            >
              Acompanhar chamado
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleNewTicket}
              className="min-h-11 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Abrir outro ticket
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {onBackToDashboard && (
        <button
          type="button"
          onClick={onBackToDashboard}
          className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-xs font-bold text-slate-600 transition-colors hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:hidden"
          aria-label="Voltar ao dashboard"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
            <ArrowLeft className="h-4 w-4" />
          </span>
          Dashboard
        </button>
      )}
      <header className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 px-5 py-4 text-white shadow-sm sm:px-6 sm:py-5">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-2/5 opacity-30"
          style={{ backgroundImage: 'repeating-linear-gradient(118deg, transparent 0, transparent 22px, rgba(52, 211, 153, 0.16) 23px, transparent 24px)' }}
          aria-hidden="true"
        />
        <div className="relative flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Central de atendimento</p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">{view === 'chamados' ? 'Seus chamados de suporte' : 'Como podemos ajudar?'}</h1>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-300 sm:text-sm">{view === 'chamados' ? 'Acompanhe o andamento das solicitações ou abra um novo chamado.' : 'Conte o que aconteceu para direcionarmos o atendimento.'}</p>
          </div>
        </div>
        <div className="relative mt-4 flex items-center border-t border-white/10 pt-3" aria-label="Fluxo do atendimento">
          {[
            { icon: Send, label: 'Você envia' },
            { icon: MessageSquareText, label: 'Nós analisamos' },
            { icon: CircleCheckBig, label: 'Você acompanha' }
          ].map((item, index) => (
            <React.Fragment key={item.label}>
              {index > 0 && <span className="mx-2 h-px min-w-2 flex-1 bg-white/15" aria-hidden="true" />}
              <div className="flex min-w-0 shrink-0 items-center gap-1.5 text-slate-300">
                <item.icon className="h-3.5 w-3.5 text-emerald-300" />
                <span className="whitespace-nowrap text-[9px] font-semibold sm:text-[10px]">{item.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </header>

      <div className="mb-4 mt-4 flex min-h-12 items-center justify-between gap-3 border-b border-slate-200 pb-4">
        {view === 'chamados' ? (
          <>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-900">Meus chamados</h2>
              <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">Consulte protocolos e atualizações do atendimento.</p>
            </div>
            <button
              type="button"
              onClick={handleNewTicket}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" />
              Novo chamado
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleGoToChamados}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar aos chamados
          </button>
        )}
      </div>

      {view === 'chamados' ? (
        <MeusChamados user={user} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
              <h2 className="text-base font-extrabold text-slate-900">Novo chamado</h2>
              <p className="mt-1 text-xs text-slate-500">Conte o que aconteceu. Campos com <span className="text-rose-500">*</span> são obrigatórios.</p>
            </div>
            <div className="space-y-5 p-4 sm:p-6">
              <div>
                <label htmlFor="support-title" className="mb-1.5 block text-xs font-bold text-slate-700">Assunto <span className="text-rose-500">*</span></label>
                <input id="support-title" type="text" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={150} placeholder="Ex.: Não consigo concluir uma ordem de serviço" className="min-h-11 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="support-description" className="block text-xs font-bold text-slate-700">O que aconteceu? <span className="text-rose-500">*</span></label>
                  <span className={`text-[10px] font-semibold ${descricao.length > MAX_DESC_LENGTH - 200 ? 'text-amber-600' : 'text-slate-400'}`}>{descricao.length}/{MAX_DESC_LENGTH}</span>
                </div>
                <textarea id="support-description" value={descricao} onChange={e => setDescricao(e.target.value.slice(0, MAX_DESC_LENGTH))} rows={7} placeholder="Informe o que você estava fazendo, o que apareceu na tela e o resultado que esperava..." className="w-full resize-y rounded-xl border border-slate-300 px-3.5 py-3 text-sm leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" />
                <p className="mt-1.5 text-[10px] text-slate-400">Não inclua senhas, chaves de acesso ou outros dados sigilosos.</p>
              </div>

              <fieldset>
                <legend className="mb-1.5 text-xs font-bold text-slate-700">Qual é o impacto?</legend>
                <div className="grid grid-cols-3 gap-2">
                  {PRIORIDADES.map((p) => (
                    <button key={p.value} type="button" onClick={() => setPrioridade(p.value as 'baixa' | 'media' | 'alta')} aria-pressed={prioridade === p.value} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${prioridade === p.value ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}>
                      <span className={`h-2 w-2 rounded-full ${p.dot}`} />{p.label}
                      {prioridade === p.value && <Check className="hidden h-3.5 w-3.5 sm:block" />}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Baixa: dúvida ou melhoria · Média: dificulta a operação · Alta: operação interrompida</p>
              </fieldset>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-700">Evidências <span className="font-normal text-slate-400">(opcional)</span></label>
                  <span className="text-[10px] text-slate-400">{attachments.length}/{MAX_FILES} arquivos</span>
                </div>
                <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" onChange={handleFilesChange} className="hidden" />

                {attachments.length > 0 && (
                  <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {attachments.map(att => (
                      <div key={att.id} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {att.previewUrl ? <img src={att.previewUrl} alt={att.filename} className="h-full w-full object-cover" /> : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2"><FileText className="h-7 w-7 text-rose-500" /><span className="text-[9px] font-bold uppercase text-slate-500">PDF</span></div>
                        )}
                        <button type="button" onClick={() => handleRemoveAttachment(att.id)} title={`Remover ${att.filename}`} className="absolute right-1 top-1 rounded-lg bg-slate-900/75 p-1.5 text-white opacity-100 transition hover:bg-rose-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><X className="h-3 w-3" /></button>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-5"><p className="truncate text-[9px] font-semibold text-white">{att.filename}</p><p className="text-[8px] text-slate-300">{formatFileSize(att.sizeBytes)}</p></div>
                      </div>
                    ))}
                  </div>
                )}
                {attachments.length < MAX_FILES && (
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-3 text-xs font-bold text-slate-500 transition-all hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 disabled:pointer-events-none disabled:opacity-50">
                    <Paperclip className="h-4 w-4" />Adicionar captura de tela ou PDF
                  </button>
                )}
                <p className="mt-1.5 text-[10px] text-slate-400">PNG, JPG, WEBP, GIF ou PDF · até 6 MB por arquivo</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" /><p className="text-xs text-rose-700">{error}</p></div>
              )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-6">
              <p className="mb-3 text-[10px] leading-relaxed text-slate-500 sm:mb-0 sm:max-w-xs">Após o envio, você receberá um protocolo para acompanhar o atendimento.</p>
              <button type="button" onClick={handleSubmit} disabled={loading || !titulo.trim() || !descricao.trim()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:pointer-events-none disabled:bg-slate-300 sm:w-auto">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Enviando...</> : <><Send className="h-4 w-4" />Enviar chamado</>}
              </button>
            </div>
          </section>

          <aside className="hidden space-y-3 lg:block">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /><h2 className="text-xs font-extrabold text-slate-800">Para resolver mais rápido</h2></div>
              <ol className="mt-4 space-y-4">
                {[
                  ['01', 'Diga onde aconteceu', 'Informe a tela ou função utilizada.'],
                  ['02', 'Descreva a sequência', 'Conte os passos até o problema.'],
                  ['03', 'Mostre o resultado', 'Anexe uma captura, se possível.']
                ].map(([number, title, copy]) => (
                  <li key={number} className="flex gap-3"><span className="font-mono text-[10px] font-bold text-emerald-600">{number}</span><div><p className="text-[11px] font-bold text-slate-700">{title}</p><p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{copy}</p></div></li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-2.5"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><div><p className="text-[11px] font-bold text-slate-700">A prioridade orienta a triagem</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">Use alta somente quando a operação estiver interrompida.</p></div></div>
            </div>
          </aside>

          <details className="rounded-2xl border border-slate-200 bg-white lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-slate-700"><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Como agilizar o atendimento</span><ChevronDown className="h-4 w-4 text-slate-400" /></summary>
            <div className="border-t border-slate-100 px-4 py-3 text-[11px] leading-relaxed text-slate-500">Informe a tela usada, os passos até o problema e, se possível, envie uma captura. Não inclua senhas ou chaves de acesso.</div>
          </details>
        </div>
      )}
    </div>
  );
}
