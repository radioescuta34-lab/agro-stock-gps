import { createEquipmentAvailabilityResolver, AVAILABILITY_STYLES, resolveServiceAction } from '../utils/equipmentAvailability';
import type { ComponentLoan } from '../types';
import { createEquipmentDestinationResolver, DESTINATION_LABELS } from '../utils/equipmentDestinations';
import { LocationHistory } from './StorageControls';
import type { LocationEvent } from '../types';
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AutopilotComponent,
  Machine,
  Location,
  MovementLog,
  ComponentMaintenance,
  License,
} from '../types';
import {
  Cpu,
  Edit,
  Trash2,
  X,
  MapPin,
  Tractor,
  History,
  Wrench,
  Key,
  Info,
  MoreVertical,
  Warehouse,
  Handshake,
  ArrowRightLeft,
} from 'lucide-react';

interface EquipmentDetailModalProps {
  locationEvents?: LocationEvent[];
  onTransfer?: (component: AutopilotComponent) => void;
  component: AutopilotComponent;
  machines?: Machine[];
  locations?: Location[];
  loans?: ComponentLoan[];
  movements?: MovementLog[];
  maintenances?: ComponentMaintenance[];
  licenses?: License[];
  isAdminOrTech: boolean;
  onEdit: (comp: AutopilotComponent) => void;
  onDelete: (id: string) => Promise<boolean>;
  onClose: () => void;
}

type TabId = 'dados' | 'localizacao' | 'historico' | 'manutencao' | 'licencas';

const STATUS_STYLES: Record<string, string> = {
  'Disponível': 'border-blue-100 bg-blue-50 text-blue-700',
  'Em Uso': 'border-emerald-100 bg-emerald-50 text-emerald-700',
  'Manutenção': 'border-amber-100 bg-amber-50 text-amber-700',
  'Descartado': 'border-rose-100 bg-rose-50 text-rose-700',
};

const TAB_META: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'dados', label: 'Dados', icon: Info },
  { id: 'localizacao', label: 'Localização', icon: MapPin },
  { id: 'historico', label: 'Histórico', icon: History },
  { id: 'manutencao', label: 'Manutenção', icon: Wrench },
  { id: 'licencas', label: 'Licenças', icon: Key },
];

export default function EquipmentDetailModal({
  locationEvents = [], onTransfer,
  component,
  machines = [],
  locations = [],
  loans = [], movements = [],
  maintenances = [],
  licenses = [],
  isAdminOrTech,
  onEdit,
  onDelete,
  onClose,
}: EquipmentDetailModalProps) {
  const [tab, setTab] = useState<TabId>('dados');
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (!actionsOpen) return;
    const outside = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); setActionsOpen(false); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [actionsOpen]);

  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [tab]);

  const location = createEquipmentDestinationResolver(machines, locations, maintenances)(component);
  const machine = location.kind === 'machine' ? machines.find(item => location.key === 'machine:' + item.id) : undefined;
  const storage = locations.find(item => location.key === `${location.kind}:location:${item.id}`);
  const DestinationIcon = { machine: Tractor, internal: Warehouse, service: Wrench, loan: Handshake, unknown: MapPin }[location.kind];
  const operational = createEquipmentAvailabilityResolver({ movements, loans, maintenances, machines, locations })(component);
  const canTransfer = onTransfer && isAdminOrTech && operational.canTransfer;
  const repairOrders = movements.filter(order => resolveServiceAction(order) === 'MAINTENANCE' && [order.componentId, order.primaryComponentId, ...(order.componentIds || [])].includes(component.id));

  const componentMovements = movements
    .filter((m) => m.id === component.id || m.componentId === component.id || (Array.isArray(m.componentIds) && m.componentIds.includes(component.id)))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const componentMaintenances = maintenances
    .filter((m) => m.componentId === component.id)
    .sort((a, b) => String(b.sentDate || '').localeCompare(String(a.sentDate || '')));

  const componentLicenses = licenses.filter(
    (l) => l.associatedComponentSerial === component.serialNumber
  );

  const handleDeleteClick = async () => {
    setActionsOpen(false);
    const deleted = await onDelete(component.id);
    if (deleted) onClose();
  };

  const activeTab = TAB_META.find((t) => t.id === tab)!;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Fechar detalhes do equipamento"
        className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div role="dialog" aria-modal="true" aria-labelledby={headingId} className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-2xl">
        {/* Header */}
        <div className="relative shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 sm:flex">
              <Cpu className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 sm:pr-32">
              <h2 id={headingId} className="break-words pr-10 text-base font-semibold leading-snug text-slate-900 sm:pr-0 sm:text-lg">{component.name}</h2>
              <p className="mt-2 flex min-h-11 items-center break-all pr-32 font-mono text-xs text-slate-500 sm:mt-1 sm:min-h-0 sm:pr-0">S/N {component.serialNumber}</p>
            </div>
          </div>

          <div ref={actionsRef} className="absolute bottom-4 right-16 flex items-center sm:bottom-auto sm:top-5">
            {isAdminOrTech && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(component)}
                  aria-label="Editar equipamento"
                  title="Editar equipamento"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:h-9 sm:w-9"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setActionsOpen((o) => !o)}
                  aria-label="Mais ações"
                  aria-expanded={actionsOpen}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:h-9 sm:w-9"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {actionsOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <button
                      type="button"
                      onClick={handleDeleteClick}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir equipamento
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="absolute right-4 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:top-5 sm:h-9 sm:w-9"
            >
              <X className="h-5 w-5" />
            </button>
        </div>

        {/* Tabs */}
        <nav aria-label="Seções do equipamento" className="flex shrink-0 gap-1 overflow-x-auto overscroll-x-contain border-b border-slate-200 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-6">
          {TAB_META.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={event => { setTab(t.id); event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-600 ${
                  tab === t.id
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="hidden h-4 w-4 sm:block" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div ref={contentRef} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6 ${tab === 'localizacao' ? 'bg-white' : 'bg-slate-50/60'}`}>
          {activeTab.id === 'dados' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Equipamento GPS</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{component.name}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${AVAILABILITY_STYLES[operational.tone]}`}>
                  {operational.label}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Número de série</dt>
                  <dd className="mt-1 break-all font-mono text-xs font-semibold text-slate-700">{component.serialNumber}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Marca</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-700">{component.brand}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-700">{component.type}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Disponibilidade</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-700">{operational.label}</dd>
                </div>
              </dl>
              {operational.reason && <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-sm leading-relaxed text-slate-600">{operational.reason}</p>{operational.pendingOrders.length > 0 && <button type="button" onClick={() => setTab('historico')} className="mt-2 min-h-11 text-sm font-semibold text-emerald-700">Ver O.S. vinculada no histórico</button>}</div>}
            </section>
          )}

          {activeTab.id === 'localizacao' && (
            <section aria-label="Localização atual" className="space-y-6">
              <p className="text-xs font-medium text-slate-500">Localização atual</p>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <DestinationIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-semibold leading-snug text-slate-900 sm:text-xl">{location.label}</h3>
                    <p className="mt-1 text-sm text-slate-500">{DESTINATION_LABELS[location.kind].category}{storage?.code ? ` · ${storage.code}` : ''}</p>
                  </div>
                </div>
                {canTransfer && <div className="flex justify-end border-t border-slate-100 pt-4 sm:shrink-0 sm:border-0 sm:pt-0"><button type="button" onClick={() => onTransfer(component)} aria-label="Transferir equipamento para outro local" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:min-h-9"><ArrowRightLeft className="h-4 w-4" />Transferir</button></div>}
              </div>
              {storage?.address && <div className="border-t border-slate-100 pt-5"><p className="text-xs text-slate-500">Endereço / referência</p><p className="mt-1 break-words text-sm leading-relaxed text-slate-700">{storage.address}</p></div>}

                {machine && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-slate-100 pt-5 [&_dd]:break-words">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Máquina</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-slate-700">{machine.prefix}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Modelo</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-slate-700">{machine.model || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Marca</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-slate-700">{machine.brand || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Frota</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-slate-700">{machine.fleet || '—'}</dd>
                    </div>
                  </dl>
                )}

                {component.status === 'Em Uso' && component.currentMachine && !machine && location.kind === 'unknown' && (
                  <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    Vínculo legado: <span className="font-mono font-semibold">{component.currentMachine}</span>
                    {' '}(máquina não cadastrada na frota)
                  </p>
                )}
            </section>
          )}

          {activeTab.id === 'historico' && (
            <section className="space-y-2">
              <LocationHistory events={locationEvents.filter(item => item.componentId === component.id)} />
              {componentMovements.length === 0 && !locationEvents.some(item => item.componentId === component.id) && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                  Nenhuma movimentação registrada para este equipamento.
                </div>
              )}
              {componentMovements.map((m) => (
                <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      {m.action}
                      {m.osNumber ? <span className="ml-1.5 text-[10px] text-slate-400">O.S. #{String(m.osNumber).padStart(4, '0')}</span> : null}
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      m.status === 'Concluída' ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : m.status === 'Cancelada' ? 'border-rose-100 bg-rose-50 text-rose-600'
                      : m.status ? 'border-amber-100 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}>
                      {m.status || 'Fluxo direto'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.machinePrefix === 'Almoxarifado' ? 'Almoxarifado' : `Veículo ${m.machinePrefix}`}
                    {' · '}{m.date ? new Date(m.date).toLocaleDateString('pt-BR') : '—'}
                    {m.technicianName ? ` · ${m.technicianName}` : ''}
                  </p>
                  {m.notes ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{m.notes}</p> : null}
                </div>
              ))}
            </section>
          )}

          {activeTab.id === 'manutencao' && (
            <section className="space-y-2">
              {componentMaintenances.length === 0 && repairOrders.length === 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                  Nenhuma manutenção registrada para este equipamento.
                </div>
              )}
              {repairOrders.map(order => <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm font-semibold text-slate-900">O.S. #{String(order.osNumber ?? '—').padStart(4, '0')} · Manutenção interna</p><p className="mt-1 text-sm text-slate-600">{order.status || 'Aberta'} · {order.technicianName}</p>{order.notes && <p className="mt-2 text-sm text-slate-600">{order.notes}</p>}</article>)}
              {componentMaintenances.map((m) => (
                <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      {m.providerName}
                      {m.osNumber ? <span className="ml-1.5 text-[10px] text-slate-400">O.S. #{String(m.osNumber).padStart(4, '0')}</span> : null}
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      m.status === 'Em Manutenção' ? 'border-amber-100 bg-amber-50 text-amber-700'
                      : m.status === 'Concluído' ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-rose-100 bg-rose-50 text-rose-600'
                    }`}>{m.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Enviado em {m.sentDate ? new Date(m.sentDate).toLocaleDateString('pt-BR') : '—'}
                    {m.returnDate ? ` · Retornado em ${new Date(m.returnDate).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                  {m.issueDescription ? <p className="mt-2 text-xs text-slate-600">{m.issueDescription}</p> : null}
                  {m.servicesPerformed ? <p className="mt-1 text-xs text-slate-600"><strong>Serviços:</strong> {m.servicesPerformed}</p> : null}
                  {m.replacedParts ? <p className="mt-1 text-xs text-slate-600"><strong>Peças:</strong> {m.replacedParts}</p> : null}
                  {m.cost ? <p className="mt-1 text-xs font-semibold text-slate-700">Custo: R$ {Number(m.cost).toFixed(2)}</p> : null}
                </div>
              ))}
            </section>
          )}

          {activeTab.id === 'licencas' && (
            <section className="space-y-2">
              {componentLicenses.length === 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                  Nenhuma licença vinculada a este equipamento (S/N {component.serialNumber}).
                </div>
              )}
              {componentLicenses.map((l) => (
                <div key={l.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">{l.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      l.status === 'Ativa' ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : l.status === 'Expirada' ? 'border-rose-100 bg-rose-50 text-rose-600'
                      : l.status === 'Pendente' ? 'border-amber-100 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}>{l.status}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-500">Código: {l.code}</p>
                  <p className="text-xs text-slate-500">
                    {l.type}
                    {l.expirationDate ? ` · Vencimento ${l.expirationDate.split('T')[0] || l.expirationDate}` : ''}
                  </p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
