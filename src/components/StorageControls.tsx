import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { AutopilotComponent, Location, LocationEvent } from '../types';
import type { StorageCommand, StorageState } from '../utils/storageModel';

export const storageInput = 'w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
export const storagePrimary = 'min-h-11 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-emerald-700';

export function ReviewDestinationDialog({ component, state, onCommand, onClose }: { component: AutopilotComponent; state: StorageState; onCommand: (command: StorageCommand) => Promise<void>; onClose: () => void }) {
  const [destination, setDestination] = useState(''); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const formId = useId();
  return <StorageDialog title="Conferir destino legado" onClose={onClose} busy={busy} actions={<button disabled={busy} form={formId} className={storagePrimary}>{busy ? 'Salvando…' : 'Confirmar conferência'}</button>}>
    <form id={formId} className="space-y-4" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await onCommand({ type: 'review', componentIds: [component.id], locationId: destination.startsWith('location:') ? destination.slice(9) : '', machineId: destination.startsWith('machine:') ? destination.slice(8) : '', notes }); onClose(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível conferir.'); } finally { setBusy(false); } }}>
      <p className="text-sm text-slate-600">{component.name} · S/N {component.serialNumber} · {component.status}</p><p className="text-xs text-slate-500">Confirme o destino real após revisar o relatório e o backup. O status e os históricos antigos serão preservados. O.S. pendentes ou destinos que não correspondem à operação em aberto impedem a correção.</p>
      <label className="block text-xs font-semibold text-slate-600">Destino confirmado *<select required value={destination} onChange={event => setDestination(event.target.value)} className={storageInput + ' mt-2'}><option value="">Selecione o destino real</option><optgroup label="Armazenamentos e parceiros">{state.locations.filter(item => item.isActive).map(item => <option key={item.id} value={'location:' + item.id}>{item.name} · {item.kind === 'INTERNAL' ? 'Armazenamento' : item.kind === 'EXTERNAL_SERVICE' ? 'Assistência' : 'Empréstimo'}</option>)}</optgroup><optgroup label="Máquinas da frota">{state.machines.filter(item => item.active !== false).map(item => <option key={item.id} value={'machine:' + item.id}>{item.prefix} · {item.model}</option>)}</optgroup></select></label>
      <label className="block text-xs font-semibold text-slate-600">Justificativa *<textarea required maxLength={512} value={notes} onChange={event => setNotes(event.target.value)} className={storageInput + ' mt-2 min-h-24'} /></label>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    </form>
  </StorageDialog>;
}

export function StorageSelect({ locations, value, onChange, defaultId, label = 'Local de recebimento', excludeId }: { locations: Location[]; value: string; onChange: (value: string) => void; defaultId?: string; label?: string; excludeId?: string }) {
  const id = useId();
  const options = locations.filter(item => item.kind === 'INTERNAL' && item.isActive && item.id !== excludeId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return <div className="space-y-1.5"><label htmlFor={id} className="block text-xs font-semibold text-slate-600">{label} <span aria-hidden="true">*</span></label>
    <select id={id} required className={storageInput} value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Selecione o armazenamento</option>
      {value && !options.some(item => item.id === value) && <option value={value} disabled>Local indisponível — selecione outro</option>}
      {options.map(item => <option key={item.id} value={item.id}>{item.name}{item.id === defaultId ? ' · Padrão' : ''}</option>)}
    </select>
    {!options.length && <p className="text-xs text-amber-700">Cadastre um local ativo em Cadastros → Locais de armazenamento.</p>}
  </div>;
}

export function StorageDialog({ title, onClose, children, actions, busy = false }: { title: string; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const heading = useId(); const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement;
    const scroll = window.scrollY;
    const previous = { overflow: document.body.style.overflow, position: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
    Object.assign(document.body.style, { overflow: 'hidden', position: 'fixed', top: `-${scroll}px`, width: '100%' });
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      // A confirmation dialog or a nested storage dialog owns keyboard focus while on top.
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const last = dialogs.at(-1);
      if (document.getElementById('notification-modal-title') || (last && last !== ref.current && !ref.current?.contains(last))) return;
      if (event.key === 'Escape') { event.stopImmediatePropagation(); if (!busyRef.current) closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = (Array.from(ref.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') || []) as HTMLElement[]).filter(item => item.getClientRects().length);
      const first = elements[0], lastElement = elements.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); lastElement?.focus(); }
      else if (!event.shiftKey && (document.activeElement === lastElement || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); Object.assign(document.body.style, previous); window.scrollTo(0, scroll); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  return createPortal(<div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={heading} className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl outline-none sm:rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3"><h2 id={heading} className="text-lg font-bold text-slate-900">{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Fechar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"><X size={20} /></button></header>
      <div className="overflow-y-auto overscroll-contain p-5">{children}</div>
      {actions && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{actions}</footer>}
    </div>
  </div>, document.body);
}

export function LocationHistory({ events }: { events: LocationEvent[] }) {
  const timestamp = (value: any) => value?.toDate ? value.toDate() : new Date(value);
  return events.length ? <ol className="divide-y divide-slate-100">{[...events].sort((a,b) => timestamp(b.createdAt).getTime() - timestamp(a.createdAt).getTime()).map(event => <li key={event.id} className="space-y-1 py-3 text-sm">
    <p className="font-semibold text-slate-800">{event.action} · {event.componentName}</p><p className="text-slate-600">{event.from.label} → {event.to.label}</p><p className="text-xs text-slate-500">S/N {event.componentSerial} · {event.actorName} · {timestamp(event.createdAt).toLocaleString('pt-BR')}</p>{event.notes && <p className="text-xs text-slate-600">{event.notes}</p>}
  </li>)}</ol> : <p className="py-6 text-sm text-slate-500">Nenhuma movimentação registrada neste fluxo. O histórico antigo não foi alterado.</p>;
}

export function TransferDialog({ components, locations, defaultId, onClose, onTransfer, review = false }: { components: AutopilotComponent[]; locations: Location[]; defaultId?: string; onClose: () => void; onTransfer: (ids: string[], locationId: string, notes: string) => Promise<void>; review?: boolean }) {
  const [destination, setDestination] = useState(''); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const formId = useId();
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await onTransfer(components.map(item => item.id), destination, notes); onClose(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível transferir.'); } finally { setBusy(false); } };
  return <StorageDialog title={review ? 'Conferir armazenamento' : 'Transferir equipamentos'} onClose={onClose} busy={busy} actions={<button form={formId} className={storagePrimary} disabled={busy}>{busy ? 'Salvando…' : 'Confirmar destino'}</button>}>
    <form id={formId} onSubmit={submit} className="space-y-4"><p className="text-sm text-slate-600">{components.length} equipamento(s). O status será preservado. A alteração fica registrada no histórico.</p>
      <ul className="max-h-36 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{components.map(item => <li key={item.id} className="py-1">{item.name} · S/N {item.serialNumber} · Origem: {locations.find(loc => loc.id === item.currentLocationId)?.name || item.currentMachine || 'Não identificada'}</li>)}</ul>
      <StorageSelect locations={locations} value={destination} onChange={setDestination} defaultId={defaultId} />
      <label className="block text-xs font-semibold text-slate-600">{review ? 'Justificativa da conferência *' : 'Observação (opcional)'}<textarea required={review} maxLength={512} value={notes} onChange={event => setNotes(event.target.value)} className={storageInput + ' mt-2 min-h-24'} /></label>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    </form>
  </StorageDialog>;
}
