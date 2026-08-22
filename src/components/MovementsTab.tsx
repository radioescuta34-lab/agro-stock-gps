import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  AutopilotComponent, 
  Machine, 
  MovementAction, 
  MovementLog, 
  MovementStatus,
  UserRole,
  FieldDataCollection
} from '../types';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  X, 
  Kanban,
  MoreVertical,
  Play,
  Check,
  Ban,
  Clock,
  SlidersHorizontal,
  Edit,
  Trash2
} from 'lucide-react';
import FieldDataKanban from './FieldDataKanban';
import { useNotifications } from './NotificationProvider';

interface MovementsTabProps {
  movements: MovementLog[];
  components: AutopilotComponent[];
  machines: Machine[];
  fieldDataCollections?: FieldDataCollection[];
  role: UserRole;
  currentUserId: string;
  currentUserName: string;
  onAddMovement: (log: Omit<MovementLog, 'id' | 'technicianId' | 'technicianName' | 'createdAt'>) => Promise<void>;
  onUpdateMovement?: (movement: MovementLog, updates: Partial<MovementLog>) => Promise<void>;
  onDeleteMovement?: (movement: MovementLog) => Promise<void>;
  onCompleteCollection?: (machine: Machine, targetWeekId: string) => Promise<void>;
  onEnsureWeekRecords?: (machines: Machine[], targetWeekId: string) => Promise<void>;
  onTransitionOSStatus?: (movement: MovementLog, nextStatus: MovementStatus, actionLabel: string, detail?: string) => Promise<void>;
  initialSubTab?: 'os' | 'kanban';
  initialKanbanStatus?: 'Pendente' | 'Concluído';
}

const STATUS_META: Record<MovementStatus, { label: string; dot: string; badge: string }> = {
  'Aberta': { label: 'Aberta', dot: 'bg-amber-500', badge: 'text-amber-700 bg-amber-50 border-amber-200' },
  'Agendada': { label: 'Agendada', dot: 'bg-sky-500', badge: 'text-sky-700 bg-sky-50 border-sky-200' },
  'Em Atendimento': { label: 'Em atendimento', dot: 'bg-blue-500', badge: 'text-blue-700 bg-blue-50 border-blue-200' },
  'Concluída': { label: 'Concluída', dot: 'bg-emerald-500', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  'Cancelada': { label: 'Cancelada', dot: 'bg-slate-400', badge: 'text-slate-500 bg-slate-50 border-slate-200' }
};

const ACTION_LABELS: Record<MovementAction, string> = {
  'Instalação': 'Instalação',
  'Remoção': 'Remoção',
  'Manutenção': 'Manutenção',
  'Calibração': 'Calibração'
};

export default function MovementsTab({
  movements,
  components,
  machines,
  fieldDataCollections = [],
  role,
  currentUserId,
  currentUserName,
  onAddMovement,
  onUpdateMovement,
  onDeleteMovement,
  onCompleteCollection,
  onEnsureWeekRecords,
  onTransitionOSStatus,
  initialSubTab,
  initialKanbanStatus
}: MovementsTabProps) {
  const { showToast, confirmDialog } = useNotifications();
  const isAdmin = role === 'administrador' || role === 'ADMINISTRADOR';
  const [subTab, setSubTab] = useState<'os' | 'kanban'>(initialSubTab || 'os');

  // OS list filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MovementStatus>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [technicianFilter, setTechnicianFilter] = useState<string>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // OS form / details / menu state
  const [isAdding, setIsAdding] = useState(false);
  const [editingMove, setEditingMove] = useState<MovementLog | null>(null);
  const [selectedMove, setSelectedMove] = useState<MovementLog | null>(null);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const detailMenuRef = useRef<HTMLDivElement>(null);

  // Form states
  const [componentId, setComponentId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [machinePrefix, setMachinePrefix] = useState('');
  const [action, setAction] = useState<MovementAction>('Instalação');
  const [notes, setNotes] = useState('');
  const [dateStr, setDateStr] = useState(new Date().toISOString().substring(0, 16));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Close OS menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMenu = menuRef.current && menuRef.current.contains(target);
      const inTrigger = (e.target as HTMLElement).closest?.('[data-os-menu-trigger]');
      if (!inMenu && !inTrigger) {
        setMenuOpenId(null);
        setMenuAnchor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpenId(null);
        setMenuAnchor(null);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!selectedMove) {
      setDetailMenuOpen(false);
      return;
    }

    const closeDetailMenu = (event: MouseEvent) => {
      if (detailMenuRef.current && !detailMenuRef.current.contains(event.target as Node)) {
        setDetailMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailMenuOpen(false);
    };

    document.addEventListener('mousedown', closeDetailMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeDetailMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedMove]);

  useEffect(() => {
    if (!isAdding && !editingMove && !selectedMove) return;
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
    return () => {
      document.body.style.position = previousStyles.position;
      document.body.style.top = previousStyles.top;
      document.body.style.width = previousStyles.width;
      document.body.style.overflow = previousStyles.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isAdding, editingMove, selectedMove]);

  // Reset form
  const resetForm = () => {
    setComponentId('');
    setMachineId('');
    setMachinePrefix('');
    setAction('Instalação');
    setNotes('');
    setDateStr(new Date().toISOString().substring(0, 16));
    setError(null);
  };

  const closeForm = (force = false) => {
    if (loading && !force) return;
    setIsAdding(false);
    setEditingMove(null);
    resetForm();
  };

  const startEdit = (movement: MovementLog) => {
    setSelectedMove(null);
    setEditingMove(movement);
    setIsAdding(false);
    setComponentId(movement.componentId);
    setMachineId(movement.machineId || machines.find(machine => machine.prefix === movement.machinePrefix)?.id || '');
    setMachinePrefix(movement.machinePrefix === 'Almoxarifado' ? '' : movement.machinePrefix);
    setAction(movement.action);
    setNotes(movement.notes || '');
    const date = movement.date?.toDate ? movement.date.toDate() : new Date(movement.date);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().substring(0, 16);
    setDateStr(localDate);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!componentId) {
      setError('Por favor, selecione o equipamento GPS.');
      return;
    }

    const selectedComp = components.find(c => c.id === componentId);
    if (!selectedComp) {
      setError('Equipamento inválido.');
      return;
    }

    if (action === 'Instalação' && !machinePrefix) {
      setError('Para instalação, você precisa especificar uma máquina destino.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const linkedMachine = machines.find(machine => machine.id === machineId)
        || machines.find(machine => machine.prefix === machinePrefix);

      const movementData = {
        componentId,
        componentSerial: selectedComp.serialNumber,
        componentName: selectedComp.name,
        machineId: linkedMachine?.id || '',
        machinePrefix: linkedMachine?.prefix || machinePrefix || 'Almoxarifado',
        action,
        date: new Date(dateStr).toISOString(),
        notes: notes.trim()
      };

      if (editingMove) {
        if (!onUpdateMovement) throw new Error('A edição de O.S. não está disponível.');
        await onUpdateMovement(editingMove, movementData);
        showToast('success', `O.S. #${String(editingMove.osNumber || '').padStart(4, '0')} atualizada.`);
        closeForm(true);
        return;
      }

      await onAddMovement(movementData);

      showToast('success', 'Ordem de serviço criada com sucesso.');
      closeForm(true);

    } catch (err: any) {
      setError(err.message || 'Erro ao lançar ordem de serviço.');
    } finally {
      setLoading(false);
    }
  };

  const sortedMovements = [...movements].sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
    const dateB = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
    return dateB - dateA;
  });

  const technicians = Array.from(new Set(movements.map(m => m.technicianName))).sort();
  const activeFilterCount = [statusFilter, actionFilter, technicianFilter].filter(value => value !== 'all').length;

  const filteredMovements = sortedMovements.filter(m => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q ||
      String(m.osNumber || '').includes(q) ||
      m.componentName.toLowerCase().includes(q) ||
      m.componentSerial.toLowerCase().includes(q) ||
      m.machinePrefix.toLowerCase().includes(q) ||
      m.technicianName.toLowerCase().includes(q) ||
      m.action.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || (m.status || 'Aberta') === statusFilter;
    const matchesAction = actionFilter === 'all' || m.action === actionFilter;
    const matchesTech = technicianFilter === 'all' || m.technicianName === technicianFilter;
    return matchesSearch && matchesStatus && matchesAction && matchesTech;
  });

  // Status quick counts (for filter shortcuts)
  const countByStatus = (s: MovementStatus) => movements.filter(m => (m.status || 'Aberta') === s).length;
  const quickCounts = [
    { key: 'all' as const, label: 'Todas', count: movements.length },
    { key: 'Aberta' as MovementStatus, label: 'Abertas', count: countByStatus('Aberta') },
    { key: 'Em Atendimento' as MovementStatus, label: 'Em atendimento', count: countByStatus('Em Atendimento') },
    { key: 'Concluída' as MovementStatus, label: 'Concluídas', count: countByStatus('Concluída') }
  ];

  const reservedComponentIds = new Set(movements
    .filter(movement => movement.id !== editingMove?.id && !['Concluída', 'Cancelada'].includes(movement.status || 'Aberta'))
    .map(movement => movement.componentId));
  const availableComponents = components.filter(c => c.status === 'Disponível' && !reservedComponentIds.has(c.id));
  const activeComponents = components.filter(c => c.status === 'Em Uso' && !reservedComponentIds.has(c.id));
  const includeEditingComponent = (items: AutopilotComponent[]) => {
    const current = editingMove ? components.find(component => component.id === editingMove.componentId) : undefined;
    return current && !items.some(component => component.id === current.id) ? [...items, current] : items;
  };
  const installationComponents = includeEditingComponent(availableComponents);
  const operationComponents = includeEditingComponent(activeComponents);
  const maintenanceComponents = includeEditingComponent(components.filter(c => c.status !== 'Descartado' && !reservedComponentIds.has(c.id)));

  const formatDate = (d: any) => {
    if (!d) return '-';
    const date = d?.toDate ? d.toDate() : new Date(d);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const formatDateTime = (d: any) => {
    if (!d) return '-';
    const date = d?.toDate ? d.toDate() : new Date(d);
    if (isNaN(date.getTime())) return '-';
    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getStatusMeta = (move: MovementLog) => STATUS_META[(move.status || 'Aberta')];

  const runTransition = async (move: MovementLog, nextStatus: MovementStatus, actionLabel: string, detail?: string) => {
    if (!onTransitionOSStatus) return false;
    setConfirmingAction(move.id + nextStatus);
    setMenuOpenId(null);
    setMenuAnchor(null);
    try {
      await onTransitionOSStatus(move, nextStatus, actionLabel, detail);
      showToast('success', `O.S. #${String(move.osNumber || '').padStart(4, '0')} atualizada para ${STATUS_META[nextStatus].label}.`);
      return true;
    } catch (err: any) {
      console.error('Falha na transição de O.S.:', err);
      showToast('error', err?.message || 'Não foi possível atualizar o status da O.S.');
      return false;
    } finally {
      setConfirmingAction(null);
    }
  };

  const canEditMovement = (move: MovementLog) => ['Aberta', 'Agendada'].includes(move.status || 'Aberta') && Boolean(onUpdateMovement);
  const canDeleteMovement = (move: MovementLog) => isAdmin && ['Aberta', 'Agendada'].includes(move.status || 'Aberta') && Boolean(onDeleteMovement);

  const requestDeleteMovement = async (move: MovementLog) => {
    if (!onDeleteMovement) return;
    const confirmed = await confirmDialog({
      title: `Excluir O.S. #${String(move.osNumber || '').padStart(4, '0')}?`,
      message: 'Esta ação remove definitivamente a ordem ainda não executada. Para ordens que já começaram, utilize Cancelar O.S. para preservar o histórico.',
      confirmLabel: 'Excluir O.S.',
      cancelLabel: 'Manter O.S.',
      danger: true
    });
    if (!confirmed) return;

    setConfirmingAction(move.id + 'delete');
    try {
      await onDeleteMovement(move);
      setSelectedMove(null);
      setMenuOpenId(null);
      setMenuAnchor(null);
      showToast('success', 'Ordem de serviço excluída.');
    } catch (err: any) {
      showToast('error', err?.message || 'Não foi possível excluir a O.S.');
    } finally {
      setConfirmingAction(null);
    }
  };

  const requestCancelMovement = async (move: MovementLog) => {
    const confirmed = await confirmDialog({
      title: `Cancelar O.S. #${String(move.osNumber || '').padStart(4, '0')}?`,
      message: 'A ordem permanecerá no histórico como cancelada e não alterará a situação do equipamento.',
      confirmLabel: 'Cancelar O.S.',
      cancelLabel: 'Voltar',
      danger: true
    });
    if (!confirmed) return;
    const succeeded = await runTransition(move, 'Cancelada', 'O.S. cancelada');
    if (succeeded) setSelectedMove(null);
  };

  const requestStatusTransition = async (move: MovementLog, nextStatus: MovementStatus, actionLabel: string) => {
    if (nextStatus === 'Concluída') {
      const confirmed = await confirmDialog({
        title: `Concluir O.S. #${String(move.osNumber || '').padStart(4, '0')}?`,
        message: 'A conclusão será registrada no histórico e atualizará automaticamente a situação e a localização do equipamento.',
        confirmLabel: 'Concluir O.S.',
        cancelLabel: 'Voltar'
      });
      if (!confirmed) return false;
    }
    return runTransition(move, nextStatus, actionLabel);
  };

  const availableTransitions = (move: MovementLog): { status: MovementStatus; label: string }[] => {
    const s = move.status || 'Aberta';
    switch (s) {
      case 'Aberta':
        return [
          { status: 'Agendada', label: 'Agendar atendimento' },
          { status: 'Em Atendimento', label: 'Iniciar atendimento' },
          { status: 'Cancelada', label: 'Cancelar O.S.' }
        ];
      case 'Agendada':
        return [
          { status: 'Aberta', label: 'Voltar para aberta' },
          { status: 'Em Atendimento', label: 'Iniciar atendimento' },
          { status: 'Cancelada', label: 'Cancelar O.S.' }
        ];
      case 'Em Atendimento':
        return [
          { status: 'Agendada', label: 'Reagendar atendimento' },
          { status: 'Concluída', label: 'Concluir O.S.' },
          { status: 'Cancelada', label: 'Cancelar O.S.' }
        ];
      default:
        return [];
    }
  };

  const renderStatusBadge = (move: MovementLog) => {
    const meta = getStatusMeta(move);
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${meta.badge}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    );
  };

  const toggleOSMenu = (moveId: string, button: HTMLButtonElement) => {
    if (menuOpenId === moveId) {
      setMenuOpenId(null);
      setMenuAnchor(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = 192;
    const move = movements.find(item => item.id === moveId);
    const menuItems = move ? availableTransitions(move).length + (canEditMovement(move) ? 1 : 0) + (canDeleteMovement(move) ? 1 : 0) : 0;
    const estimatedMenuHeight = 8 + menuItems * 36;
    const left = Math.min(rect.left, window.innerWidth - menuWidth - 8);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= estimatedMenuHeight
      ? rect.bottom + 4
      : Math.max(8, rect.top - estimatedMenuHeight - 4);
    setMenuAnchor({ top, left });
    setMenuOpenId(moveId);
  };

  return (
    <div className="space-y-5" id="movements-tab">

      {/* Page header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Serviços de Campo</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Gerencie ordens de serviço, manutenções e recolhimentos.
            </p>
          </div>
        </div>

        {/* Sub-tabs (navigation) */}
        <div className="mt-4 grid grid-cols-2 border-b border-slate-200 sm:flex sm:items-center sm:gap-5" id="movements-sub-tabs">
          <button
            onClick={() => setSubTab('os')}
            className={`-mb-px flex min-w-0 cursor-pointer items-center justify-center gap-2 border-b-2 px-1 pb-2.5 text-[13px] font-bold transition-colors sm:shrink-0 sm:justify-start sm:px-0 sm:text-sm ${subTab === 'os' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <ClipboardList className="h-4 w-4" />
            Ordens de serviço
          </button>
          <button
            onClick={() => setSubTab('kanban')}
            className={`-mb-px flex min-w-0 cursor-pointer items-center justify-center gap-2 border-b-2 px-1 pb-2.5 text-[13px] font-bold transition-colors sm:shrink-0 sm:justify-start sm:px-0 sm:text-sm ${subTab === 'kanban' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Kanban className="h-4 w-4" />
            <span className="sm:hidden">Recolhimento</span>
            <span className="hidden sm:inline">Recolhimento semanal</span>
          </button>
        </div>
      </div>

      {subTab === 'kanban' ? (
        <FieldDataKanban
          machines={machines}
          fieldDataCollections={fieldDataCollections}
          role={role}
          currentUserName={currentUserName}
          initialStatusFilter={initialKanbanStatus}
          onCompleteCollection={onCompleteCollection || (async () => {})}
          onEnsureWeekRecords={onEnsureWeekRecords}
        />
      ) : (
        <>
        {/* Sub-area header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">Ordens de serviço</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              Acompanhe instalações, manutenções e recolhimentos.
            </p>
          </div>
          {!isAdding && !editingMove && (
            <button
              onClick={() => { setIsAdding(true); resetForm(); }}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:px-4"
              id="open-add-movement-form"
            >
              <Plus className="h-4 w-4" />
              <span className="sm:hidden">Nova ordem</span>
              <span className="hidden sm:inline">Nova ordem de serviço</span>
            </button>
          )}
        </div>

        {/* Quick status counts */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          {quickCounts.map(qc => (
            <button
              key={qc.key}
              onClick={() => setStatusFilter(qc.key as any)}
              className={`w-full cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors sm:w-auto ${statusFilter === qc.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {qc.label} <span className="opacity-70">{qc.count}</span>
            </button>
          ))}
        </div>

        {/* Filters + table in one functional container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="os-list-container">

          {/* Filters bar */}
          <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:p-4 lg:flex-row">
            <div className="flex gap-2 lg:flex-1">
              <div className="relative min-w-0 flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Buscar ordem de serviço..."
                  aria-label="Buscar por O.S., equipamento, série, veículo ou técnico"
                  id="search-movements-input"
                />
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(open => !open)}
                aria-expanded={mobileFiltersOpen}
                aria-controls="mobile-os-filters"
                className={`relative flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors lg:hidden ${
                  mobileFiltersOpen || activeFilterCount > 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            <div
              id="mobile-os-filters"
              className={`${mobileFiltersOpen ? 'grid' : 'hidden'} grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 lg:flex lg:bg-transparent lg:p-0`}
            >
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="min-h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 lg:bg-slate-50"
                id="filter-movement-status-select"
              >
                <option value="all">Status: Todos</option>
                <option value="Aberta">Aberta</option>
                <option value="Agendada">Agendada</option>
                <option value="Em Atendimento">Em atendimento</option>
                <option value="Concluída">Concluída</option>
                <option value="Cancelada">Cancelada</option>
              </select>

              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="min-h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 lg:bg-slate-50"
                id="filter-movement-action-select"
              >
                <option value="all">Tipo: Todos</option>
                <option value="Instalação">Instalação</option>
                <option value="Remoção">Remoção</option>
                <option value="Manutenção">Manutenção</option>
                <option value="Calibração">Calibração</option>
              </select>

              <select
                value={technicianFilter}
                onChange={(e) => setTechnicianFilter(e.target.value)}
                className="col-span-2 min-h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 lg:col-span-1 lg:bg-slate-50"
                id="filter-movement-technician-select"
              >
                <option value="all">Técnico: Todos</option>
                {technicians.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setActionFilter('all');
                    setTechnicianFilter('all');
                  }}
                  className="col-span-2 min-h-9 rounded-lg text-xs font-semibold text-slate-500 transition-colors hover:bg-white hover:text-slate-700 lg:hidden"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            {!mobileFiltersOpen && activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 lg:hidden" aria-label="Filtros ativos">
                {statusFilter !== 'all' && (
                  <button type="button" onClick={() => setStatusFilter('all')} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600">
                    {STATUS_META[statusFilter].label} <X className="h-3 w-3" />
                  </button>
                )}
                {actionFilter !== 'all' && (
                  <button type="button" onClick={() => setActionFilter('all')} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600">
                    {actionFilter} <X className="h-3 w-3" />
                  </button>
                )}
                {technicianFilter !== 'all' && (
                  <button type="button" onClick={() => setTechnicianFilter('all')} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600">
                    {technicianFilter} <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Create / edit OS form */}
          {(isAdding || editingMove) && createPortal(
            <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" id="add-movement-form-block">
              <button
                type="button"
                aria-label="Fechar formulário de nova ordem"
                className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
                onClick={() => closeForm()}
              />
              <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <ClipboardList className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 sm:text-lg">
                        {editingMove ? `Editar O.S. #${String(editingMove.osNumber || '').padStart(4, '0')}` : 'Nova ordem de serviço'}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {editingMove ? 'Ajuste os dados antes do início do atendimento.' : 'Informe os dados necessários para abrir o atendimento.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => closeForm()}
                    disabled={loading}
                    aria-label="Fechar formulário"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:py-5">
                  {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">{error}</p>}
                  {success && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-600">{success}</p>}

                  <form id="new-os-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de serviço *</label>
                    <select
                      value={action}
                      onChange={(e) => {
                        setAction(e.target.value as MovementAction);
                        setComponentId('');
                        setMachineId('');
                        setMachinePrefix('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                      id="select-movement-action"
                    >
                      <option value="Instalação">Instalação (Colocar GPS em máquina)</option>
                      <option value="Remoção">Remoção (Retirar GPS de máquina para o estoque)</option>
                      <option value="Manutenção">Enviar para Manutenção/Conserto</option>
                      <option value="Calibração">Calibração de Offset / Ajustes periódicos</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Data/Hora da Operação *</label>
                    <input
                      type="datetime-local"
                      required
                      value={dateStr}
                      onChange={(e) => setDateStr(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                      id="input-movement-date"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Equipamento GPS * {action === 'Instalação' && '(Apenas Disponíveis)'}
                    </label>
                    <select
                      required
                      value={componentId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setComponentId(id);
                        const selected = components.find(c => c.id === id);
                        if (selected && selected.currentMachine) {
                          setMachinePrefix(selected.currentMachine);
                          setMachineId(machines.find(machine => machine.prefix === selected.currentMachine)?.id || '');
                        } else {
                          setMachineId('');
                          setMachinePrefix('');
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                      id="select-movement-component"
                    >
                      <option value="">-- Selecione o Equipamento --</option>
                      {action === 'Instalação' ? (
                        installationComponents.map(c => (
                          <option key={c.id} value={c.id}>{c.brand} {c.name} (S/N: {c.serialNumber})</option>
                        ))
                      ) : action === 'Remoção' || action === 'Calibração' ? (
                        operationComponents.map(c => (
                          <option key={c.id} value={c.id}>{c.brand} {c.name} (S/N: {c.serialNumber}) - Instalado em: {c.currentMachine}</option>
                        ))
                      ) : (
                        maintenanceComponents.map(c => (
                          <option key={c.id} value={c.id}>{c.brand} {c.name} (S/N: {c.serialNumber}) - Status: {c.status}</option>
                        ))
                      )}
                    </select>
                    {action === 'Instalação' && availableComponents.length === 0 && (
                      <p className="text-[10px] text-amber-600 mt-1">Nenhum componente disponível em estoque para instalação direta.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Máquina do Campo * {action === 'Instalação' ? '(Selecione para instalar)' : '(Identificado automaticamente)'}
                    </label>
                    {action === 'Instalação' ? (
                      <select
                        required
                        value={machinePrefix}
                        onChange={(e) => {
                          const nextPrefix = e.target.value;
                          setMachinePrefix(nextPrefix);
                          setMachineId(machines.find(machine => machine.prefix === nextPrefix)?.id || '');
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                        id="select-movement-machine"
                      >
                        <option value="">-- Selecione a Máquina --</option>
                        {machines.map(m => (
                          <option key={m.id} value={m.prefix}>
                            {m.prefix} - {m.brand} {m.model} ({m.type}){m.fleet ? ` [Frota: ${m.fleet}]` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        disabled
                        value={machinePrefix || 'Almoxarifado Central'}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 text-slate-500 text-xs"
                        id="input-movement-machine-readonly"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Observações / Diagnóstico</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                    placeholder="Ex: Realizada calibração de sinal RTX. Antena acoplada no teto do trator prefixo T01."
                    id="textarea-movement-notes"
                  />
                </div>

                  </form>
                </div>

                <div className="ios-safe-action-bar grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white px-4 pt-3 sm:flex sm:justify-end">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => closeForm()}
                    className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    form="new-os-form"
                    disabled={loading}
                    className="min-h-10 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70"
                    id="submit-movement-btn"
                  >
                    {loading ? (editingMove ? 'Salvando...' : 'Criando...') : (editingMove ? 'Salvar alterações' : 'Criar O.S.')}
                  </button>
                </div>
              </div>
            </div>
            , document.body
          )}

          {/* Desktop table */}
          {filteredMovements.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400 sm:p-12">
              Nenhuma ordem de serviço corresponde aos filtros.
            </div>
          ) : (
            <>
            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden" id="movements-mobile-list">
              {filteredMovements.map((move) => (
                <article
                  key={move.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMove(move)}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setSelectedMove(move);
                    }
                  }}
                  className="cursor-pointer px-4 py-3.5 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                  aria-label={`Abrir detalhes da O.S. ${String(move.osNumber || '').padStart(4, '0')}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 text-left">
                      <span className="text-xs font-bold text-slate-900">
                        #{String(move.osNumber || '').padStart(4, '0')}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400">{formatDate(move.date)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {renderStatusBadge(move)}
                      {(canEditMovement(move) || availableTransitions(move).length > 0 || canDeleteMovement(move)) && (
                        <button
                          type="button"
                          data-os-menu-trigger
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleOSMenu(move.id, event.currentTarget);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          aria-label={`Ações da O.S. ${String(move.osNumber || '').padStart(4, '0')}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 block w-full text-left">
                    <span className="block text-[11px] font-semibold text-slate-600">{ACTION_LABELS[move.action]}</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-800">{move.componentName}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-400">S/N {move.componentSerial}</span>
                    <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
                      <span className="font-medium text-slate-700">
                        {move.machinePrefix === 'Almoxarifado' ? 'Almoxarifado' : `Veículo ${move.machinePrefix}`}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">•</span>
                      <span>{move.technicianName}</span>
                    </span>
                  </div>
                </article>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block" id="movements-table-container">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-3 px-4">O.S.</th>
                    <th className="py-3 px-4">Abertura</th>
                    <th className="py-3 px-4">Serviço</th>
                    <th className="py-3 px-4">Equipamento</th>
                    <th className="py-3 px-4">Veículo</th>
                    <th className="py-3 px-4">Técnico</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700" id="movements-table-body">
                  {filteredMovements.map((move) => {
                    const meta = getStatusMeta(move);
                    return (
                      <tr
                        key={move.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedMove(move)}
                        onKeyDown={(event) => {
                          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            setSelectedMove(move);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-emerald-50/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                        aria-label={`Abrir detalhes da O.S. ${String(move.osNumber || '').padStart(4, '0')}`}
                      >
                        <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                          #{String(move.osNumber || '').padStart(4, '0')}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-500 whitespace-nowrap">
                          {formatDate(move.date)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                          {ACTION_LABELS[move.action]}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800">{move.componentName}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">S/N {move.componentSerial}</span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {move.machinePrefix === 'Almoxarifado' ? (
                            <span className="text-slate-400 italic">Almoxarifado</span>
                          ) : (
                            <span className="font-bold text-slate-800">{move.machinePrefix}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-800 whitespace-nowrap">
                          {move.technicianName}
                        </td>
                        <td className="py-3 px-4">
                          {renderStatusBadge(move)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {(canEditMovement(move) || availableTransitions(move).length > 0 || canDeleteMovement(move)) && <div className="relative inline-block">
                            <button
                              data-os-menu-trigger
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleOSMenu(move.id, event.currentTarget);
                              }}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                              aria-label="Ações da ordem"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {/* OS Detail modal */}
        {selectedMove && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]" onClick={() => setSelectedMove(null)} />
            <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 sm:text-lg">
                      O.S. #{String(selectedMove.osNumber || '').padStart(4, '0')}
                    </h3>
                    {renderStatusBadge(selectedMove)}
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    {ACTION_LABELS[selectedMove.action]} · {selectedMove.machinePrefix === 'Almoxarifado' ? 'Almoxarifado' : `Veículo ${selectedMove.machinePrefix}`}
                  </p>
                </div>
                <div ref={detailMenuRef} className="relative flex shrink-0 items-center gap-1">
                  {canEditMovement(selectedMove) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDetailMenuOpen(false);
                        startEdit(selectedMove);
                      }}
                      aria-label="Editar ordem de serviço"
                      title="Editar O.S."
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  )}
                  {(canDeleteMovement(selectedMove) || availableTransitions(selectedMove).some(t => t.status === 'Cancelada')) && (
                    <>
                      <button
                        type="button"
                        onClick={() => setDetailMenuOpen(open => !open)}
                        aria-label="Mais ações da ordem de serviço"
                        aria-expanded={detailMenuOpen}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </button>
                      {detailMenuOpen && (
                        <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                          {availableTransitions(selectedMove).some(t => t.status === 'Cancelada') && (
                            <button
                              type="button"
                              disabled={confirmingAction === selectedMove.id + 'Cancelada'}
                              onClick={() => {
                                setDetailMenuOpen(false);
                                requestCancelMovement(selectedMove);
                              }}
                              className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                            >
                              <Ban className="h-4 w-4" />
                              {confirmingAction === selectedMove.id + 'Cancelada' ? 'Cancelando...' : 'Cancelar O.S.'}
                            </button>
                          )}
                          {canDeleteMovement(selectedMove) && (
                            <button
                              type="button"
                              disabled={confirmingAction === selectedMove.id + 'delete'}
                              onClick={() => {
                                setDetailMenuOpen(false);
                                requestDeleteMovement(selectedMove);
                              }}
                              className="flex min-h-10 w-full items-center gap-2 rounded-lg border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" /> Excluir O.S.
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDetailMenuOpen(false);
                      setSelectedMove(null);
                    }}
                    aria-label="Fechar detalhes da ordem"
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:py-5">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Equipamento</p>
                  <p className="text-sm font-bold text-slate-900">{selectedMove.componentName}</p>
                  <p className="text-xs text-slate-500 font-mono">S/N {selectedMove.componentSerial}</p>
                </div>

                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Responsável</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedMove.technicianName}</p>
                  <p className="text-xs text-slate-500">Abertura: {formatDateTime(selectedMove.date)}</p>
                </div>

                {selectedMove.notes && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Observações técnicas</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{selectedMove.notes}</p>
                  </div>
                )}

                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-3">Histórico da O.S.</p>
                  <ol className="space-y-3">
                    {(selectedMove.history || []).map((h, i) => (
                      <li key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 mt-1" />
                          {i < (selectedMove.history?.length || 0) - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
                        </div>
                        <div className="pb-1">
                          <p className="text-sm font-semibold text-slate-800">{h.action}</p>
                          {h.detail && <p className="text-xs text-slate-500 mt-0.5">{h.detail}</p>}
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {formatDateTime(h.timestamp)} · {h.actorName}
                          </p>
                        </div>
                      </li>
                    ))}
                    {(selectedMove.history || []).length === 0 && (
                      <p className="text-xs text-slate-400">Sem histórico registrado.</p>
                    )}
                  </ol>
                </div>
              </div>

              {availableTransitions(selectedMove).some(t => t.status !== 'Cancelada') && (
                <div className="ios-safe-action-bar grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white px-4 pt-3 sm:flex sm:justify-end">
                  {availableTransitions(selectedMove).filter(t => t.status !== 'Cancelada').map(t => (
                    <button
                      key={t.status}
                      disabled={confirmingAction === selectedMove.id + t.status}
                      onClick={async () => {
                        const labelMap: Record<MovementStatus, string> = {
                          'Agendada': 'Atendimento agendado',
                          'Em Atendimento': 'Atendimento iniciado',
                          'Concluída': 'O.S. concluída',
                          'Cancelada': 'O.S. cancelada',
                          'Aberta': 'O.S. reaberta'
                        };
                        const succeeded = await requestStatusTransition(selectedMove, t.status, labelMap[t.status]);
                        if (succeeded) setSelectedMove(null);
                      }}
                      className={`min-h-10 cursor-pointer rounded-xl px-3 py-2 text-xs font-bold transition-colors sm:px-4 ${
                        t.status === 'Agendada'
                            ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      } ${availableTransitions(selectedMove).filter(item => item.status !== 'Cancelada').length === 1 ? 'col-span-2 sm:col-auto' : ''} disabled:cursor-wait disabled:opacity-60`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        </>
      )}

      {/* OS actions dropdown (portal so it's not clipped by overflow container) */}
      {menuAnchor && menuOpenId && createPortal(
        (() => {
          const move = movements.find(m => m.id === menuOpenId);
          if (!move) return null;
          return (
            <div
              ref={menuRef}
              className="fixed z-50 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1"
              style={{ top: menuAnchor.top, left: menuAnchor.left }}
            >
              {canEditMovement(move) && (
                <button
                  onClick={() => {
                    setMenuOpenId(null);
                    setMenuAnchor(null);
                    startEdit(move);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Edit className="h-3.5 w-3.5" /> Editar O.S.
                </button>
              )}
              {availableTransitions(move).filter(t => t.status !== 'Cancelada').map(t => (
                <button
                  key={t.status}
                  disabled={confirmingAction === move.id + t.status}
                  onClick={() => {
                    const labelMap: Record<MovementStatus, string> = {
                      'Agendada': 'Atendimento agendado',
                      'Em Atendimento': 'Atendimento iniciado',
                      'Concluída': 'O.S. concluída',
                      'Cancelada': 'O.S. cancelada',
                      'Aberta': 'O.S. reaberta'
                    };
                    requestStatusTransition(move, t.status, labelMap[t.status]);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {t.status === 'Em Atendimento' ? <Play className="h-3.5 w-3.5" /> :
                   t.status === 'Concluída' ? <Check className="h-3.5 w-3.5" /> :
                   <Clock className="h-3.5 w-3.5" />}
                  {confirmingAction === move.id + t.status ? 'Processando...' : t.label}
                </button>
              ))}
              {availableTransitions(move).some(t => t.status === 'Cancelada') && (
                <button
                  disabled={confirmingAction === move.id + 'Cancelada'}
                  onClick={() => {
                    setMenuOpenId(null);
                    setMenuAnchor(null);
                    requestCancelMovement(move);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <Ban className="h-3.5 w-3.5" /> Cancelar O.S.
                </button>
              )}
              {canDeleteMovement(move) && (
                <button
                  disabled={confirmingAction === move.id + 'delete'}
                  onClick={() => {
                    setMenuOpenId(null);
                    setMenuAnchor(null);
                    requestDeleteMovement(move);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg border-t border-slate-100 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir O.S.
                </button>
              )}
            </div>
          );
        })(),
        document.body
      )}

    </div>
  );
}
