import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FieldDataCollection, Machine, MachineType, MovementLog, MovementStatus, UserRole } from '../types';
import { useNotifications } from './NotificationProvider';
import { getISOWeekId, getWeekFormattedLabel } from '../utils/dateUtils';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  X, 
  Truck, 
  Info,
  Filter,
  History,
  ClipboardList,
  SlidersHorizontal,
  MoreVertical,
  CalendarCheck2,
  AlertCircle
} from 'lucide-react';

interface MachinesTabProps {
  machines: Machine[];
  movements?: MovementLog[];
  fieldDataCollections?: FieldDataCollection[];
  role: UserRole;
  initialTypeFilter?: MachineType;
  machineTypes?: MachineType[];
  onAddMachine: (mac: Omit<Machine, 'id' | 'updatedAt'>) => Promise<void>;
  onEditMachine: (id: string, updates: Partial<Machine>) => Promise<void>;
  onDeleteMachine: (id: string) => Promise<void>;
}

export default function MachinesTab({
  machines,
  movements = [],
  fieldDataCollections = [],
  role,
  initialTypeFilter,
  machineTypes = ['Trator', 'Colhedora', 'Pulverizador', 'Outro'],
  onAddMachine,
  onEditMachine,
  onDeleteMachine
}: MachinesTabProps) {
  const isAdminOrTech = role === 'administrador' || role === 'tecnico' || role === 'ADMINISTRADOR' || role === 'TECNICO_CAMPO';
  const { showToast, confirmDialog } = useNotifications();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(initialTypeFilter || 'all');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileTypeOpen, setMobileTypeOpen] = useState(false);

  const [isAdding, setIsAdding] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [historyMachine, setHistoryMachine] = useState<Machine | null>(null);
  const [machineDetailTab, setMachineDetailTab] = useState<'summary' | 'history'>('summary');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'os' | 'collections'>('all');
  const [machineActionsOpen, setMachineActionsOpen] = useState(false);
  const machineActionsRef = useRef<HTMLDivElement>(null);

  // Form states
  const [prefix, setPrefix] = useState('');
  const [type, setType] = useState<MachineType>('Trator');
  const [model, setModel] = useState('');
  const [brand, setBrand] = useState('');
  const [fleet, setFleet] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdding && !editingMachine && !historyMachine) return;

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
  }, [isAdding, editingMachine, historyMachine]);

  useEffect(() => {
    if (!historyMachine) {
      setMachineActionsOpen(false);
      return;
    }

    const closeActions = (event: MouseEvent) => {
      if (machineActionsRef.current && !machineActionsRef.current.contains(event.target as Node)) {
        setMachineActionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMachineActionsOpen(false);
    };

    document.addEventListener('mousedown', closeActions);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeActions);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [historyMachine]);

  const resetForm = () => {
    setPrefix('');
    setType('Trator');
    setModel('');
    setBrand('');
    setFleet('');
    setError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminOrTech) return;

    if (!prefix || !model || !brand) {
      setError('Preencha os campos obrigatórios.');
      return;
    }

    // Check duplicate prefix
    if (machines.some(m => m.prefix.trim().toUpperCase() === prefix.trim().toUpperCase())) {
      setError('Este Prefixo de Máquina já está cadastrado.');
      return;
    }

    setLoading(true);
    try {
      await onAddMachine({
        prefix: prefix.trim().toUpperCase(),
        type,
        model: model.trim(),
        brand: brand.trim(),
        fleet: fleet.trim()
      });
      setIsAdding(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar máquina.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMachine) return;

    if (!model || !brand) {
      setError('Modelo e Fabricante da máquina são obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      await onEditMachine(editingMachine.id, {
        type,
        model: model.trim(),
        brand: brand.trim(),
        fleet: fleet.trim()
      });
      setEditingMachine(null);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar máquina.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (mac: Machine) => {
    setEditingMachine(mac);
    setPrefix(mac.prefix);
    setType(mac.type);
    setModel(mac.model);
    setBrand(mac.brand);
    setFleet(mac.fleet || '');
    setIsAdding(false);
  };

  const handleDelete = async (id: string): Promise<boolean> => {
    if (!isAdminOrTech) return false;
    const machine = machines.find(item => item.id === id);
    const linkedOrders = machine
      ? movements.filter(movement => movement.machineId
          ? movement.machineId === machine.id
          : movement.machinePrefix.trim().toUpperCase() === machine.prefix.trim().toUpperCase())
      : [];

    if (linkedOrders.length > 0) {
      showToast('warning', `Esta máquina possui ${linkedOrders.length} O.S. vinculada(s) e não pode ser removida. O histórico deve ser preservado.`);
      return false;
    }

    const confirmed = await confirmDialog({
      title: 'Remover Máquina',
      message: 'Tem certeza de que deseja remover esta máquina da frota?',
      confirmLabel: 'Sim, Remover',
      cancelLabel: 'Cancelar',
      danger: true
    });
    if (confirmed) {
      try {
        await onDeleteMachine(id);
        return true;
      } catch (err: any) {
        showToast('error', err.message || 'Erro ao remover máquina.');
        return false;
      }
    }
    return false;
  };

  const filteredMachines = machines.filter(m => {
    const matchesSearch = m.prefix.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          m.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (m.fleet || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' ? true : m.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getMachineMovements = (machine: Machine) => movements
    .filter(movement => movement.machineId
      ? movement.machineId === machine.id
      : movement.machinePrefix.trim().toUpperCase() === machine.prefix.trim().toUpperCase())
    .sort((a, b) => {
      const dateA = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const dateB = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      return dateB - dateA;
    });

  const getMachineCollections = (machine: Machine) => fieldDataCollections
    .filter(collection => collection.machineId
      ? collection.machineId === machine.id
      : collection.machinePrefix.trim().toUpperCase() === machine.prefix.trim().toUpperCase())
    .sort((a, b) => {
      const valueA = a.collectedAt || a.updatedAt || a.createdAt;
      const valueB = b.collectedAt || b.updatedAt || b.createdAt;
      const dateA = valueA?.toDate ? valueA.toDate().getTime() : new Date(valueA || 0).getTime();
      const dateB = valueB?.toDate ? valueB.toDate().getTime() : new Date(valueB || 0).getTime();
      return dateB - dateA;
    });

  const formatMovementDate = (value: any) => {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
  };

  const formatCollectionDate = (value: any) => {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime())
      ? '-'
      : date.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
  };

  const currentWeekId = getISOWeekId(new Date());
  const selectedMachineMovements = historyMachine ? getMachineMovements(historyMachine) : [];
  const selectedMachineCollections = historyMachine ? getMachineCollections(historyMachine) : [];
  const completedMachineCollections = selectedMachineCollections.filter(collection => collection.status === 'Concluído');
  const latestCompletedCollection = completedMachineCollections[0];
  const currentWeekCollection = selectedMachineCollections.find(collection => collection.weekId === currentWeekId);
  const selectedMachineHistory = [
    ...selectedMachineMovements.map(movement => {
      const value = movement.date;
      const timestamp = value?.toDate ? value.toDate().getTime() : new Date(value).getTime();
      return { kind: 'os' as const, id: `os-${movement.id}`, timestamp, movement };
    }),
    ...selectedMachineCollections.map(collection => {
      const value = collection.collectedAt || collection.updatedAt || collection.createdAt;
      const timestamp = value?.toDate ? value.toDate().getTime() : new Date(value || 0).getTime();
      return { kind: 'collection' as const, id: `collection-${collection.id}`, timestamp, collection };
    })
  ]
    .filter(item => historyFilter === 'all' || (historyFilter === 'os' ? item.kind === 'os' : item.kind === 'collection'))
    .sort((a, b) => b.timestamp - a.timestamp);

  const statusStyle: Record<MovementStatus, string> = {
    'Aberta': 'border-amber-200 bg-amber-50 text-amber-700',
    'Agendada': 'border-sky-200 bg-sky-50 text-sky-700',
    'Em Atendimento': 'border-blue-200 bg-blue-50 text-blue-700',
    'Concluída': 'border-emerald-200 bg-emerald-50 text-emerald-700',
    'Cancelada': 'border-slate-200 bg-slate-50 text-slate-500'
  };

  return (
    <div className="space-y-4 sm:space-y-6" id="machines-tab">

      {/* Active preset filter chip (arrived from dashboard card) */}
      {typeFilter !== 'all' && (
        <div className="hidden items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 animate-fade-in md:flex">
          <div className="flex items-center gap-2 text-xs text-emerald-800 font-semibold">
            <Filter className="h-4 w-4 text-emerald-600 shrink-0" />
            Filtro ativo: {typeFilter}
            <span className="text-emerald-600 font-bold">({filteredMachines.length} máquina{filteredMachines.length === 1 ? '' : 's'})</span>
          </div>
          <button
            onClick={() => setTypeFilter('all')}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold hover:bg-emerald-100 transition-all cursor-pointer"
            title="Limpar filtro e mostrar todas as máquinas"
          >
            <X className="h-3.5 w-3.5" />
            Limpar filtro
          </button>
        </div>
      )}

      {/* Header and Add Button */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Gestão de frota</h1>
          <p className="text-slate-500 text-xs mt-1">
            Cadastre máquinas e veículos, acompanhe licenças e consulte o histórico de manutenção.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdminOrTech && !isAdding && !editingMachine && (
            <button
              onClick={() => { setIsAdding(true); resetForm(); }}
              className="flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
              id="open-add-machine-form"
            >
              <Plus className="h-4 w-4" />
              Cadastrar Veículo
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMobileSearchOpen(open => !open);
              setMobileTypeOpen(false);
            }}
            aria-label={mobileSearchOpen ? 'Fechar busca' : 'Buscar veículos'}
            aria-expanded={mobileSearchOpen}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors md:hidden ${
              mobileSearchOpen || searchTerm
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-500'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileTypeOpen(open => !open);
              setMobileSearchOpen(false);
            }}
            aria-label={mobileTypeOpen ? 'Fechar filtro de tipo' : 'Filtrar por tipo'}
            aria-expanded={mobileTypeOpen}
            className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors md:hidden ${
              mobileTypeOpen || typeFilter !== 'all'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-500'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {typeFilter !== 'all' && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600" />}
          </button>
        </div>

        {(mobileSearchOpen || searchTerm) && (
          <div className="relative md:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              autoFocus={mobileSearchOpen}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-10 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Buscar por prefixo, marca ou modelo"
              aria-label="Buscar veículos"
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')} aria-label="Limpar busca" className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {mobileTypeOpen && (
          <div className="rounded-xl bg-slate-50 p-2 md:hidden">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setMobileTypeOpen(false);
              }}
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Filtrar veículos por tipo"
            >
              <option value="all">Todos os veículos</option>
              {machineTypes.map(t => <option key={t} value={t}>{t}s</option>)}
            </select>
          </div>
        )}

        {!mobileTypeOpen && typeFilter !== 'all' && (
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className="flex min-h-7 w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700 md:hidden"
          >
            {typeFilter} <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Forms Area */}
      {isAdminOrTech && isAdding && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" id="add-machine-form-block">
          <button
            type="button"
            aria-label="Fechar cadastro de veículo"
            className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
            onClick={() => !loading && setIsAdding(false)}
          />
          <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Truck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">Cadastrar veículo</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Adicione uma máquina ou veículo à frota da empresa.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !loading && setIsAdding(false)}
                disabled={loading}
                aria-label="Fechar cadastro"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:py-5">
              {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">{error}</p>}

              <form id="add-machine-form" onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Prefixo do Veículo *</label>
              <input
                type="text"
                required
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: T01, C14, P08"
                id="input-machine-prefix"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Veículo *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MachineType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                id="select-machine-type"
              >
                {machineTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Modelo da Máquina *</label>
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: John Deere 8320 / Case CH570"
                id="input-machine-model"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fabricante/Marca *</label>
              <input
                type="text"
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: John Deere, Case IH, Valtra"
                id="input-machine-brand"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Frota / Frente de Trabalho</label>
              <input
                type="text"
                value={fleet}
                onChange={(e) => setFleet(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: Frente 01, Frota Cana"
                id="input-machine-fleet"
              />
            </div>

              </form>
            </div>

            <div className="ios-safe-action-bar grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white px-4 pt-3 sm:flex sm:justify-end">
              <button
                type="button"
                disabled={loading}
                onClick={() => !loading && setIsAdding(false)}
                className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="add-machine-form"
                disabled={loading}
                className="min-h-10 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70"
              >
                {loading ? 'Salvando...' : 'Cadastrar Veículo'}
              </button>
            </div>
          </div>
        </div>
        , document.body
      )}

      {editingMachine && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" id="edit-machine-form-block">
          <button
            type="button"
            aria-label="Fechar edição do veículo"
            className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
            onClick={() => !loading && setEditingMachine(null)}
          />
          <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Edit className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">Editar veículo · {editingMachine.prefix}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Atualize os dados cadastrais da máquina.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !loading && setEditingMachine(null)}
                disabled={loading}
                aria-label="Fechar edição"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:py-5">
              {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">{error}</p>}

              <form id="edit-machine-form" onSubmit={handleUpdate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Veículo *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MachineType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                id="edit-machine-type"
              >
                {machineTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Modelo da Máquina *</label>
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                placeholder="Ex: John Deere 8320"
                id="edit-machine-model"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fabricante/Marca *</label>
              <input
                type="text"
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                placeholder="Ex: John Deere"
                id="edit-machine-brand"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Frota / Frente de Trabalho</label>
              <input
                type="text"
                value={fleet}
                onChange={(e) => setFleet(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                placeholder="Ex: Frente 01, Frota Cana"
                id="edit-machine-fleet"
              />
            </div>

              </form>
            </div>

            <div className="ios-safe-action-bar grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white px-4 pt-3 sm:flex sm:justify-end">
              <button
                type="button"
                disabled={loading}
                onClick={() => !loading && setEditingMachine(null)}
                className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="edit-machine-form"
                disabled={loading}
                className="min-h-10 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70"
              >
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
        , document.body
      )}

      {/* Filter panel */}
      <div className="hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex md:flex-row md:gap-4">
        <div className="flex-1 relative rounded-xl shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
            placeholder="Buscar veículos por prefixo, marca ou modelo..."
            id="search-machines-input"
          />
        </div>

        <div className="w-full md:w-56 flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap uppercase">Tipo:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="block w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none"
            id="filter-machine-type-select"
          >
            <option value="all">Todos os Veículos</option>
            {machineTypes.map(t => <option key={t} value={t}>{t}s</option>)}
          </select>
        </div>
      </div>

      {/* Machines grid */}
      {filteredMachines.length === 0 ? (
        <div className="bg-white p-12 text-center border border-slate-200 rounded-2xl text-slate-400 text-sm">
          Nenhum veículo cadastrado corresponde aos critérios de busca.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="machines-grid-list">
          {filteredMachines.map((mac) => {
            let typeColor = 'bg-slate-100 text-slate-800';
            if (mac.type === 'Trator') typeColor = 'bg-emerald-50 text-emerald-800 border-emerald-100';
            if (mac.type === 'Colhedora') typeColor = 'bg-amber-50 text-amber-800 border-amber-100';
            if (mac.type === 'Pulverizador') typeColor = 'bg-blue-50 text-blue-800 border-blue-100';
            const serviceHistory = getMachineMovements(mac);
            const collectionHistory = getMachineCollections(mac);
            const historyCount = serviceHistory.length + collectionHistory.length;

            return (
              <div 
                key={mac.id} 
                role="button"
                tabIndex={0}
                aria-label={`Abrir detalhes e histórico de ${mac.prefix}`}
                onClick={() => {
                  setMachineDetailTab('summary');
                  setHistoryFilter('all');
                  setHistoryMachine(mac);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setMachineDetailTab('summary');
                    setHistoryFilter('all');
                    setHistoryMachine(mac);
                  }
                }}
                className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:translate-y-0"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-slate-400 font-semibold uppercase">Prefixo</span>
                      <h3 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">{mac.prefix}</h3>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${typeColor}`}>
                      {mac.type}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs">
                    <p className="text-slate-600">
                      <span className="text-slate-400 font-medium">Marca:</span> {mac.brand}
                    </p>
                    <p className="text-slate-600">
                      <span className="text-slate-400 font-medium">Modelo:</span> {mac.model}
                    </p>
                    <p className="text-slate-600 flex items-center gap-1.5">
                      <span className="text-slate-400 font-medium">Frota/Frente:</span> 
                      {mac.fleet ? (
                        <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md font-bold text-[10px] border border-emerald-100">
                          {mac.fleet}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Sem vínculo</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMachineDetailTab('history');
                      setHistoryFilter('all');
                      setHistoryMachine(mac);
                    }}
                    className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    aria-label={`Ver histórico completo de ${mac.prefix}`}
                  >
                    <History className="h-3.5 w-3.5" />
                    {historyCount === 0 ? 'Sem histórico' : `${historyCount} evento${historyCount === 1 ? '' : 's'}`}
                  </button>

                  <span className="text-[10px] font-semibold text-slate-400 transition-colors group-hover:text-slate-600">
                    Ver detalhes
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {historyMachine && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Fechar histórico da máquina"
            className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
            onClick={() => setHistoryMachine(null)}
          />
          <div className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <History className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-slate-900 sm:text-lg">
                    Veículo · {historyMachine.prefix}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {historyMachine.brand} {historyMachine.model}
                  </p>
                </div>
              </div>
              <div ref={machineActionsRef} className="relative flex shrink-0 items-center gap-1">
                {machineDetailTab === 'summary' && isAdminOrTech && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const machine = historyMachine;
                        setMachineActionsOpen(false);
                        setHistoryMachine(null);
                        startEdit(machine);
                      }}
                      aria-label="Editar veículo"
                      title="Editar veículo"
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMachineActionsOpen(open => !open)}
                      aria-label="Mais ações do veículo"
                      aria-expanded={machineActionsOpen}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>
                    {machineActionsOpen && (
                      <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                        <button
                          type="button"
                          onClick={async () => {
                            setMachineActionsOpen(false);
                            const deleted = await handleDelete(historyMachine.id);
                            if (deleted) setHistoryMachine(null);
                          }}
                          className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir veículo
                        </button>
                      </div>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setHistoryMachine(null)}
                  aria-label="Fechar detalhes do veículo"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 border-b border-slate-200 bg-white px-4 sm:px-5" role="tablist" aria-label="Detalhes do veículo">
              <button
                type="button"
                role="tab"
                aria-selected={machineDetailTab === 'summary'}
                onClick={() => {
                  setMachineActionsOpen(false);
                  setMachineDetailTab('summary');
                }}
                className={`flex min-h-11 items-center justify-center gap-2 border-b-2 px-2 text-xs font-bold transition-colors ${
                  machineDetailTab === 'summary'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Truck className="h-4 w-4" />
                Resumo
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={machineDetailTab === 'history'}
                onClick={() => {
                  setMachineActionsOpen(false);
                  setMachineDetailTab('history');
                }}
                className={`flex min-h-11 items-center justify-center gap-2 border-b-2 px-2 text-xs font-bold transition-colors ${
                  machineDetailTab === 'history'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <History className="h-4 w-4" />
                Histórico
                {(selectedMachineMovements.length + selectedMachineCollections.length) > 0 && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {selectedMachineMovements.length + selectedMachineCollections.length}
                  </span>
                )}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-4 py-4 sm:px-5">
              {machineDetailTab === 'summary' ? (
                <div className="space-y-3">
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Prefixo</p>
                        <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{historyMachine.prefix}</p>
                      </div>
                      <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                        {historyMachine.type}
                      </span>
                    </div>

                    <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fabricante</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-800">{historyMachine.brand}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Modelo</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-800">{historyMachine.model}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-800">{historyMachine.type}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Frota / Frente</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-800">{historyMachine.fleet || 'Sem vínculo'}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Ordens de serviço</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {selectedMachineMovements.length === 0
                            ? 'Nenhum serviço registrado para este veículo.'
                            : `${selectedMachineMovements.length} registro${selectedMachineMovements.length === 1 ? '' : 's'} no histórico.`}
                        </p>
                      </div>
                      <span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-emerald-50 px-2 text-sm font-bold text-emerald-700">
                        {selectedMachineMovements.length}
                      </span>
                    </div>
                    {selectedMachineMovements.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryFilter('os');
                          setMachineDetailTab('history');
                        }}
                        className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <History className="h-4 w-4" />
                        Visualizar histórico de O.S.
                      </button>
                    )}
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">Recolhimento de dados</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          {latestCompletedCollection
                            ? `Última coleta em ${formatCollectionDate(latestCompletedCollection.collectedAt || latestCompletedCollection.updatedAt)}.`
                            : 'Nenhuma coleta concluída para este veículo.'}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                        currentWeekCollection?.status === 'Concluído'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}>
                        {currentWeekCollection?.status === 'Concluído' ? 'Em dia' : 'Pendente nesta semana'}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Concluídas</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{completedMachineCollections.length}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Semana atual</p>
                        <p className="mt-1 text-xs font-bold text-slate-700">{getWeekFormattedLabel(currentWeekId)}</p>
                      </div>
                    </div>
                    {selectedMachineCollections.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryFilter('collections');
                          setMachineDetailTab('history');
                        }}
                        className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <CalendarCheck2 className="h-4 w-4" />
                        Visualizar histórico de coletas
                      </button>
                    )}
                  </section>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filtrar histórico da máquina">
                    {[
                      { value: 'all', label: 'Todos', count: selectedMachineMovements.length + selectedMachineCollections.length },
                      { value: 'os', label: 'O.S.', count: selectedMachineMovements.length },
                      { value: 'collections', label: 'Coletas', count: selectedMachineCollections.length }
                    ].map(filter => (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => setHistoryFilter(filter.value as 'all' | 'os' | 'collections')}
                        aria-pressed={historyFilter === filter.value}
                        className={`min-h-9 shrink-0 rounded-lg border px-3 text-[11px] font-bold transition-colors ${
                          historyFilter === filter.value
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {filter.label} <span className={historyFilter === filter.value ? 'text-slate-300' : 'text-slate-400'}>{filter.count}</span>
                      </button>
                    ))}
                  </div>

                  {selectedMachineHistory.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
                      <ClipboardList className="mx-auto h-7 w-7 text-slate-300" />
                      <p className="mt-3 text-sm font-semibold text-slate-700">Nenhum evento neste filtro</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Ordens de serviço e coletas futuras aparecerão automaticamente aqui.
                      </p>
                    </div>
                  ) : selectedMachineHistory.map(item => {
                    if (item.kind === 'os') {
                      const movement = item.movement;
                      const status = movement.status || 'Aberta';
                      return (
                        <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                <ClipboardList className="h-4 w-4" />
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">O.S. #{String(movement.osNumber || '').padStart(4, '0')}</p>
                                <p className="mt-0.5 text-[11px] text-slate-500">{movement.action} · {formatMovementDate(movement.date)}</p>
                              </div>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyle[status]}`}>
                              {status === 'Em Atendimento' ? 'Em atendimento' : status}
                            </span>
                          </div>
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <p className="text-xs font-semibold text-slate-700">{movement.componentName}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-slate-400">S/N {movement.componentSerial}</p>
                            {movement.notes && <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{movement.notes}</p>}
                          </div>
                          <p className="mt-2 text-[10px] text-slate-400">Responsável: {movement.technicianName}</p>
                        </article>
                      );
                    }

                    const collection = item.collection;
                    const isCompleted = collection.status === 'Concluído';
                    const isCurrent = collection.weekId === currentWeekId;
                    const statusLabel = isCompleted ? 'Concluída' : isCurrent ? 'Pendente' : 'Não recolhida';
                    return (
                      <article key={item.id} className={`rounded-xl border bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${isCompleted ? 'border-emerald-100' : isCurrent ? 'border-amber-100' : 'border-rose-100'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isCompleted ? 'bg-emerald-50 text-emerald-600' : isCurrent ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                              {isCompleted ? <CalendarCheck2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                            </span>
                            <div>
                              <p className="text-sm font-bold text-slate-900">Coleta de dados</p>
                              <p className="mt-0.5 text-[11px] text-slate-500">{getWeekFormattedLabel(collection.weekId)} · {collection.weekId}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${isCompleted ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : isCurrent ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          {isCompleted ? (
                            <>
                              <p className="text-xs font-semibold text-slate-700">Concluída em {formatCollectionDate(collection.collectedAt || collection.updatedAt)}</p>
                              <p className="mt-1 text-[10px] text-slate-400">Responsável: {collection.collectedBy || 'Não informado'}</p>
                            </>
                          ) : (
                            <p className="text-[11px] leading-relaxed text-slate-500">
                              {isCurrent ? 'Aguardando o recolhimento dos dados desta semana.' : 'A semana foi encerrada sem registro de coleta para esta máquina.'}
                            </p>
                          )}
                          <p className="mt-2 text-[10px] text-slate-400">Frente: {collection.fleet || collection.frente || 'Sem vínculo'}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}

      {(role === 'tecnico' || role === 'TECNICO_CAMPO') && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-3 text-xs text-emerald-800">
          <Info className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Como Técnico, você agora possui permissões completas de cadastro e manutenção da frota de veículos. Certifique-se de manter os dados de marcas e modelos atualizados para auxiliar nas auditorias logísticas.
          </p>
        </div>
      )}

    </div>
  );
}
