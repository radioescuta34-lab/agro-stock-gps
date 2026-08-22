import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Machine, FieldDataCollection, UserRole } from '../types';
import { 
  getISOWeekId, 
  isLateInWeek, 
  getWeekFormattedLabel
} from '../utils/dateUtils';
import { 
  CheckCircle2, 
  Search, 
  HelpCircle,
  X,
  Filter,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MousePointerClick,
  Columns3,
  History,
  CircleDashed,
  Activity,
  Check,
  Loader2
} from 'lucide-react';

interface FieldDataKanbanProps {
  machines: Machine[];
  fieldDataCollections: FieldDataCollection[];
  role: UserRole;
  currentUserName: string;
  initialStatusFilter?: 'Pendente' | 'Concluído';
  onCompleteCollection: (machine: Machine, targetWeekId: string) => Promise<void>;
  onEnsureWeekRecords?: (machines: Machine[], targetWeekId: string) => Promise<void>;
}

export default function FieldDataKanban({
  machines,
  fieldDataCollections,
  role,
  currentUserName,
  initialStatusFilter,
  onCompleteCollection,
  onEnsureWeekRecords
}: FieldDataKanbanProps) {
  const [currentWeekId, setCurrentWeekId] = useState(() => getISOWeekId(new Date()));
  const lateInWeek = isLateInWeek(new Date());

  const [selectedWeekId, setSelectedWeekId] = useState<string>(currentWeekId);
  const [searchTerm, setSearchTerm] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStep, setHelpStep] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pendente' | 'Concluído'>(initialStatusFilter || 'all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const ensuringWeekRef = useRef<string | null>(null);

  const closeHelp = () => {
    setHelpOpen(false);
    setHelpStep(0);
  };

  useEffect(() => {
    if (!helpOpen) return;

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
      if (event.key === 'Escape') closeHelp();
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
  }, [helpOpen]);

  const helpSteps = [
    {
      title: 'Entenda o quadro',
      description: 'As máquinas são agrupadas por frente e a posição de cada frente reflete o andamento das coletas da semana.',
      icon: Columns3,
      accent: 'bg-slate-900 text-white',
      content: (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Pendente', color: 'bg-amber-500', detail: 'Nenhuma coleta' },
            { label: 'Em andamento', color: 'bg-blue-500', detail: 'Coleta parcial' },
            { label: 'Concluída', color: 'bg-emerald-500', detail: 'Todas coletadas' }
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
              <span className={`mx-auto mb-2 block h-2.5 w-2.5 rounded-full ${item.color}`} />
              <p className="text-[11px] font-bold leading-tight text-slate-800">{item.label}</p>
              <p className="mt-1 text-[9px] leading-tight text-slate-500">{item.detail}</p>
            </div>
          ))}
        </div>
      )
    },
    {
      title: 'Registre uma coleta',
      description: 'Na semana atual, toque ou clique na máquina pendente assim que os dados forem recolhidos.',
      icon: MousePointerClick,
      accent: 'bg-emerald-600 text-white',
      content: (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <div>
                <p className="text-sm font-bold text-slate-900">Máquina 80119</p>
                <p className="text-[11px] text-slate-500">Case · Colhedora</p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Clique para concluir</span>
          </div>
        </div>
      )
    },
    {
      title: 'O quadro avança sozinho',
      description: 'Ao concluir a primeira máquina, a frente vai para Em andamento. Ao concluir a última, ela vai para Concluída.',
      icon: CheckCircle2,
      accent: 'bg-blue-600 text-white',
      content: (
        <div className="rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
          Não é necessário arrastar cards nem concluir a frente manualmente. Cada máquina concluída fica bloqueada contra um segundo clique e registra data, horário e responsável.
        </div>
      )
    },
    {
      title: 'Consulte outras semanas',
      description: 'Use o seletor de semana para revisar o histórico sem alterar os registros já encerrados.',
      icon: History,
      accent: 'bg-violet-600 text-white',
      content: (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
          <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-violet-600" /><strong className="text-slate-800">Semana atual:</strong> permite registrar coletas.</div>
          <div className="flex items-center gap-2"><History className="h-4 w-4 text-violet-600" /><strong className="text-slate-800">Semanas anteriores:</strong> somente leitura.</div>
          <p className="border-t border-slate-100 pt-2 text-[11px]">O histórico mostra quem concluiu, quando concluiu e quais máquinas não foram recolhidas.</p>
        </div>
      )
    }
  ];

  const activeHelpStep = helpSteps[helpStep];
  const ActiveHelpIcon = activeHelpStep.icon;

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextWeekId = getISOWeekId(new Date());
      setCurrentWeekId(previousWeekId => {
        if (previousWeekId !== nextWeekId) {
          setSelectedWeekId(selected => selected === previousWeekId ? nextWeekId : selected);
        }
        return nextWeekId;
      });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const missingCurrentWeekRecords = machines.filter(machine =>
    !fieldDataCollections.some(item => item.weekId === currentWeekId && item.machineId === machine.id)
  );

  useEffect(() => {
    if (!onEnsureWeekRecords || missingCurrentWeekRecords.length === 0 || ensuringWeekRef.current === currentWeekId) return;
    ensuringWeekRef.current = currentWeekId;
    onEnsureWeekRecords(machines, currentWeekId)
      .catch(error => console.error('Erro ao inicializar semana de recolhimento:', error))
      .finally(() => {
        ensuringWeekRef.current = null;
      });
  }, [currentWeekId, machines, missingCurrentWeekRecords.length, onEnsureWeekRecords]);

  const availableWeekIds = Array.from(new Set([
    currentWeekId,
    ...fieldDataCollections.map(item => item.weekId).filter(Boolean)
  ])).sort().reverse();
  const isCurrentWeek = selectedWeekId === currentWeekId;
  const selectedWeekRecords = fieldDataCollections.filter(item => item.weekId === selectedWeekId);
  const displayMachines: Machine[] = isCurrentWeek
    ? machines
    : selectedWeekRecords.map(record => {
        const currentMachine = machines.find(machine => machine.id === record.machineId);
        return {
          id: record.machineId,
          prefix: record.machinePrefix,
          type: record.machineType || currentMachine?.type || 'Outro',
          brand: record.machineBrand || currentMachine?.brand || 'Não informado',
          model: record.machineModel || currentMachine?.model || 'Não informado',
          fleet: record.fleet || record.frente || currentMachine?.fleet || 'Sem Frente',
          updatedAt: record.updatedAt
        };
      });

  // Group machines by fleet/frente
  const fleeteGroups: { [fleet: string]: Machine[] } = {};
  displayMachines.forEach(m => {
    const fleetName = m.fleet?.trim() ? m.fleet.trim() : 'Sem Frente Atribuída';
    if (!fleeteGroups[fleetName]) {
      fleeteGroups[fleetName] = [];
    }
    fleeteGroups[fleetName].push(m);
  });

  const allFleets = Object.keys(fleeteGroups).sort();

  // Helper to get collection record for a machine in selected week
  const getCollectionRecord = (machineId: string) => {
    return fieldDataCollections.find(c => c.machineId === machineId && c.weekId === selectedWeekId);
  };

  const getMachineStatus = (machineId: string): 'Pendente' | 'Concluído' => {
    const rec = getCollectionRecord(machineId);
    return rec?.status === 'Concluído' ? 'Concluído' : 'Pendente';
  };

  const formatCollectionDate = (value: any) => {
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculations for current selected week
  const totalMachinesCount = displayMachines.length;
  const completedMachinesCount = displayMachines.filter(m => getMachineStatus(m.id) === 'Concluído').length;
  const coveragePercent = totalMachinesCount > 0 ? Math.round((completedMachinesCount / totalMachinesCount) * 100) : 0;

  // Toggle machine collection status
  const handleCardClick = async (machine: Machine) => {
    const currentStatus = getMachineStatus(machine.id);
    if (!isCurrentWeek || currentStatus === 'Concluído') return;
    setUpdatingId(machine.id);
    try {
      await onCompleteCollection(machine, selectedWeekId);
    } catch (err) {
      console.error("Erro ao concluir recolhimento:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Classify each Frente into one of the 3 Quadros:
  // 1. "Pendente": completedCount === 0
  // 2. "Em andamento": completedCount > 0 && pendingCount > 0
  // 3. "Concluído": pendingCount === 0 (and totalCount > 0)
  const frentesPendente: string[] = [];
  const frentesEmAndamento: string[] = [];
  const frentesConcluido: string[] = [];

  allFleets.forEach(frenteName => {
    const frenteMachines = fleeteGroups[frenteName];
    const total = frenteMachines.length;
    const completed = frenteMachines.filter(m => getMachineStatus(m.id) === 'Concluído').length;
    const pending = total - completed;

    if (completed === 0) {
      frentesPendente.push(frenteName);
    } else if (pending > 0) {
      frentesEmAndamento.push(frenteName);
    } else {
      frentesConcluido.push(frenteName);
    }
  });

  // Render a Frente Card inside a Quadro column
  const renderFrenteCard = (frenteName: string) => {
    const allMachinesInFrente = fleeteGroups[frenteName];
    const filteredMachines = allMachinesInFrente.filter(m => {
      const matchesSearch = !searchTerm.trim() ||
        m.prefix.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.brand.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || getMachineStatus(m.id) === statusFilter;
      return matchesSearch && matchesStatus;
    });

    const totalInFrente = allMachinesInFrente.length;
    const completedInFrente = allMachinesInFrente.filter(m => getMachineStatus(m.id) === 'Concluído').length;
    const frenteProgress = totalInFrente > 0 ? Math.round((completedInFrente / totalInFrente) * 100) : 0;
    return (
      <div 
        key={frenteName} 
        className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_-20px_rgba(15,23,42,0.55)]"
      >
        {/* Frente Header */}
        <div className="border-b border-slate-100 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">Frente operacional</span>
              <h4 className="mt-0.5 truncate text-sm font-bold text-slate-900">{frenteName}</h4>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
              {completedInFrente}/{totalInFrente}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${frenteProgress}%` }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-slate-500">{frenteProgress}%</span>
          </div>
        </div>

        {/* Machine List */}
        <div className="space-y-2.5 bg-slate-50/70 p-2.5">
          {filteredMachines.length === 0 ? (
            <p className="rounded-lg bg-white px-4 py-4 text-center text-xs text-slate-400">
              Nenhuma máquina encontrada na busca.
            </p>
          ) : (
            filteredMachines.map(machine => {
              const collectionRecord = getCollectionRecord(machine.id);
              const status = getMachineStatus(machine.id);
              const isCompleted = status === 'Concluído';

              const stateClass = isCompleted
                ? 'bg-emerald-500'
                : lateInWeek
                  ? 'bg-rose-500'
                  : 'bg-amber-500';

              return (
                <button
                  type="button"
                  key={machine.id}
                  onClick={() => handleCardClick(machine)}
                  disabled={!isCurrentWeek || isCompleted || updatingId === machine.id}
                  className={`relative w-full overflow-hidden rounded-xl border py-3 pl-4 pr-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isCompleted
                      ? 'border-emerald-200/80 bg-emerald-50/50'
                      : 'border-slate-200 bg-white hover:-translate-y-px hover:border-slate-300 hover:shadow-md active:translate-y-0'
                  } ${updatingId === machine.id
                    ? 'cursor-wait opacity-50'
                    : !isCurrentWeek || isCompleted
                      ? 'cursor-default'
                      : 'cursor-pointer'}`}
                  id={`kanban-machine-${machine.prefix}`}
                  title={!isCurrentWeek ? 'Semanas encerradas são somente para consulta' : isCompleted ? 'Coleta já concluída' : 'Marcar coleta como concluída'}
                >
                  <span className={`absolute inset-y-0 left-0 w-1 ${stateClass}`} aria-hidden="true" />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-sm text-slate-900 tracking-tight">
                        {machine.prefix}
                      </span>
                      {isCompleted && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                    </div>
                    <span className="ml-2 max-w-[42%] shrink-0 truncate whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {machine.type}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-600">
                    {machine.brand} {machine.model}
                  </p>
                  {isCompleted && collectionRecord && (
                    <div className="mt-2.5 flex items-center gap-1.5 border-t border-emerald-100 pt-2 text-[10px] font-semibold text-emerald-700">
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        Recolhida em {formatCollectionDate(collectionRecord.collectedAt)}
                        {collectionRecord.collectedBy ? ` · ${collectionRecord.collectedBy}` : ''}
                      </span>
                    </div>
                  )}
                  {!isCurrentWeek && !isCompleted && (
                    <p className="mt-2.5 border-t border-slate-100 pt-2 text-[10px] font-semibold text-rose-600">Não recolhida nesta semana</p>
                  )}
                  {isCurrentWeek && !isCompleted && (
                    <div className="mt-2.5 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500">
                      {updatingId === machine.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                      ) : (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                      {updatingId === machine.id ? 'Registrando coleta...' : 'Marcar como recolhida'}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

      </div>
    );
  };

  const renderKanbanColumn = ({
    title,
    subtitle,
    frentes,
    Icon,
    shellClass,
    railClass,
    iconClass,
    countClass
  }: {
    title: string;
    subtitle: string;
    frentes: string[];
    Icon: React.ComponentType<{ className?: string }>;
    shellClass: string;
    railClass: string;
    iconClass: string;
    countClass: string;
  }) => (
    <section className={`overflow-hidden rounded-2xl border ${shellClass}`}>
      <div className={`h-1 ${railClass}`} aria-hidden="true" />
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-[10px] font-medium text-slate-500">{subtitle}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${countClass}`}>
          {frentes.length} {frentes.length === 1 ? 'frente' : 'frentes'}
        </span>
      </div>
      <div className="min-h-[140px] space-y-3 px-3 pb-3">
        {frentes.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 text-center text-xs font-medium text-slate-400">
            Nenhuma frente nesta etapa
          </div>
        ) : (
          frentes.map(frenteName => renderFrenteCard(frenteName))
        )}
      </div>
    </section>
  );

  return (
    <div className="space-y-5" id="field-data-kanban-container">
      
      {/* Compact Week Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Recolhimento semanal
            </h2>
            <p className="text-slate-500 text-sm mt-0.5">
              {completedMachinesCount} de {totalMachinesCount} máquinas recolhidas
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="relative hidden w-56 sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="min-h-9 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Buscar máquina..."
                aria-label="Buscar máquina ou modelo"
              />
            </div>
            <button
              type="button"
              onClick={() => setMobileSearchOpen(open => !open)}
              aria-label={mobileSearchOpen ? 'Fechar busca' : 'Buscar máquina'}
              aria-expanded={mobileSearchOpen}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors sm:hidden ${
                mobileSearchOpen || searchTerm
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 text-slate-500'
              }`}
            >
              <Search className="h-4 w-4" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setHelpStep(0);
                  setHelpOpen(true);
                }}
                aria-label="Abrir ajuda do recolhimento semanal"
                aria-haspopup="dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedWeekId}
              onChange={(event) => {
                setSelectedWeekId(event.target.value);
                setStatusFilter('all');
              }}
              className="min-h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Selecionar semana do recolhimento"
            >
              {availableWeekIds.map(weekId => (
                <option key={weekId} value={weekId}>
                  {getWeekFormattedLabel(weekId)}{weekId === currentWeekId ? ' · Atual' : ''}
                </option>
              ))}
            </select>
          </div>
          {!isCurrentWeek && (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">Somente leitura</span>
          )}
          {isCurrentWeek && lateInWeek && <span className="text-xs font-bold text-rose-600">Prazo encerrado</span>}
          {isCurrentWeek && missingCurrentWeekRecords.length > 0 && (
            <span className="text-[10px] font-semibold text-amber-600">Preparando histórico semanal…</span>
          )}
        </div>

        {(mobileSearchOpen || searchTerm) && (
          <div className="relative mt-3 sm:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              autoFocus={mobileSearchOpen}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-10 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Buscar máquina ou modelo"
              aria-label="Buscar máquina ou modelo"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Limpar busca"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-3 mt-3">
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
          <span className="text-xs font-bold text-slate-700 whitespace-nowrap">{coveragePercent}%</span>
        </div>

        {/* Active status filter chip (arrived from dashboard card) */}
        {statusFilter !== 'all' && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
              <Filter className="h-4 w-4 text-slate-500 shrink-0" />
              Máquinas {statusFilter === 'Concluído' ? 'concluídas' : 'pendentes'}
            </div>
            <button
              onClick={() => setStatusFilter('all')}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
              title="Limpar filtro e mostrar todas as máquinas"
              aria-label="Limpar filtro de status"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {helpOpen && createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kanban-help-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-slate-950/60 backdrop-blur-[2px]"
            aria-label="Fechar ajuda"
            onClick={closeHelp}
          />

          <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="kanban-help-title" className="text-base font-bold text-slate-900">Como funciona o recolhimento</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Guia rápido · Etapa {helpStep + 1} de {helpSteps.length}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeHelp}
                aria-label="Fechar ajuda"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
              <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${activeHelpStep.accent}`}>
                <ActiveHelpIcon className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold tracking-tight text-slate-900">{activeHelpStep.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{activeHelpStep.description}</p>
              <div className="mt-5">{activeHelpStep.content}</div>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
              <div className="mb-4 flex items-center justify-center gap-1.5" aria-label={`Etapa ${helpStep + 1} de ${helpSteps.length}`}>
                {helpSteps.map((step, index) => (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => setHelpStep(index)}
                    aria-label={`Ir para etapa ${index + 1}: ${step.title}`}
                    aria-current={index === helpStep ? 'step' : undefined}
                    className="group flex h-6 items-center px-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    <span className={`block h-1.5 rounded-full transition-all ${index === helpStep ? 'w-7 bg-emerald-600' : 'w-1.5 bg-slate-200 group-hover:bg-slate-300'}`} />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {helpStep > 0 && (
                  <button
                    type="button"
                    onClick={() => setHelpStep(step => step - 1)}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => helpStep === helpSteps.length - 1 ? closeHelp() : setHelpStep(step => step + 1)}
                  className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  {helpStep === helpSteps.length - 1 ? 'Entendi' : 'Próximo'}
                  {helpStep < helpSteps.length - 1 && <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* THE 3 KANBAN QUADROS */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3" id="kanban-3-quadros">
        {renderKanbanColumn({
          title: 'Pendente',
          subtitle: 'Aguardando início',
          frentes: frentesPendente,
          Icon: CircleDashed,
          shellClass: 'border-amber-200/70 bg-amber-50/30',
          railClass: 'bg-amber-400',
          iconClass: 'bg-amber-100 text-amber-700',
          countClass: 'bg-amber-100/80 text-amber-800'
        })}
        {renderKanbanColumn({
          title: 'Em andamento',
          subtitle: 'Coleta parcial',
          frentes: frentesEmAndamento,
          Icon: Activity,
          shellClass: 'border-sky-200/70 bg-sky-50/30',
          railClass: 'bg-sky-500',
          iconClass: 'bg-sky-100 text-sky-700',
          countClass: 'bg-sky-100/80 text-sky-800'
        })}
        {renderKanbanColumn({
          title: 'Concluído',
          subtitle: 'Todas recolhidas',
          frentes: frentesConcluido,
          Icon: CheckCircle2,
          shellClass: 'border-emerald-200/70 bg-emerald-50/30',
          railClass: 'bg-emerald-500',
          iconClass: 'bg-emerald-100 text-emerald-700',
          countClass: 'bg-emerald-100/80 text-emerald-800'
        })}
      </div>

    </div>
  );
}
