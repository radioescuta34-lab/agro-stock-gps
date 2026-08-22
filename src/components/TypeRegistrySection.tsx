import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RegisteredType, RegisteredTypeCategory } from '../types';
import { PROTECTED_TYPE_NAMES } from '../constants/typeRegistry';
import { useNotifications } from './NotificationProvider';
import {
  Briefcase,
  ChevronRight,
  Cpu,
  Edit,
  Info,
  Layers,
  MoreVertical,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Tractor,
  X,
  Zap
} from 'lucide-react';

type RegistryTab = 'partner' | 'vehicle' | 'equipment_component' | 'service';

interface TypeRegistrySectionProps {
  typeRegistry: RegisteredType[];
  onAddType: (category: RegisteredTypeCategory, name: string) => Promise<void>;
  onUpdateType: (id: string, updates: Partial<Omit<RegisteredType, 'id' | 'updatedAt' | 'updatedBy'>>) => Promise<void>;
  onDeleteType: (id: string) => Promise<void>;
  getTypeUsageCount: (category: RegisteredTypeCategory, name: string) => number;
}

const TABS: { key: RegistryTab; label: string; shortLabel: string; icon: ReactNode }[] = [
  { key: 'partner', label: 'Parceiro', shortLabel: 'Parceiro', icon: <Briefcase className="h-4 w-4" /> },
  { key: 'vehicle', label: 'Veículo', shortLabel: 'Veículo', icon: <Tractor className="h-4 w-4" /> },
  { key: 'equipment_component', label: 'Componente GPS', shortLabel: 'GPS', icon: <Cpu className="h-4 w-4" /> },
  { key: 'service', label: 'Serviço', shortLabel: 'Serviço', icon: <Zap className="h-4 w-4" /> }
];

const TAB_DESKTOP_LABELS: Record<RegistryTab, string> = {
  partner: 'Parceiro',
  vehicle: 'Veículo',
  equipment_component: 'Componente GPS',
  service: 'Serviço'
};

const CATEGORY_META: Record<RegisteredTypeCategory, { title: string; badge: string; example: string }> = {
  partner: { title: 'Tipos de Parceiro', badge: 'Parceiro', example: 'Ex.: Assistência Técnica Autorizada' },
  vehicle: { title: 'Tipos de Veículo', badge: 'Veículo', example: 'Ex.: Trator Agrícola' },
  equipment_component: { title: 'Componentes GPS', badge: 'Componente GPS', example: 'Ex.: Sensor de Ângulo' },
  service: { title: 'Tipos de Serviço', badge: 'Serviço', example: 'Ex.: Calibração de Offset' }
};

const STATUS_FILTER_OPTIONS: { key: 'active' | 'inactive' | 'all'; label: string }[] = [
  { key: 'active', label: 'Ativos' },
  { key: 'inactive', label: 'Inativos' },
  { key: 'all', label: 'Todos os status' }
];

const statusFilterLabel = (filter: 'active' | 'inactive' | 'all') =>
  filter === 'active' ? 'Ativos' : filter === 'inactive' ? 'Inativos' : 'Todos';

export default function TypeRegistrySection({
  typeRegistry = [],
  onAddType,
  onUpdateType,
  onDeleteType,
  getTypeUsageCount
}: TypeRegistrySectionProps) {
  const { confirmDialog, showToast } = useNotifications();
  const [activeTab, setActiveTab] = useState<RegistryTab>('partner');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('all');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [formCategory, setFormCategory] = useState<RegisteredTypeCategory>('partner');
  const [selectedType, setSelectedType] = useState<RegisteredType | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeActive, setTypeActive] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteMenuRef = useRef<HTMLDivElement>(null);

  const visibleCategories: RegisteredTypeCategory[] = [activeTab];

  useEffect(() => {
    if (!isFormOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isFormOpen]);

  useEffect(() => {
    if (!isFormOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) closeForm();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFormOpen, loading]);

  useEffect(() => {
    if (!deleteMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(event.target as Node)) {
        setDeleteMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [deleteMenuOpen]);

  const isProtected = (t: RegisteredType) =>
    (PROTECTED_TYPE_NAMES[t.category] || []).includes(t.name);

  const closeForm = () => {
    setFormMode('add');
    setSelectedType(null);
    setTypeName('');
    setTypeActive(true);
    setFormError('');
    setIsFormOpen(false);
    setDeleteMenuOpen(false);
  };

  const startAdd = () => {
    setFormMode('add');
    setFormCategory(activeTab);
    setSelectedType(null);
    setTypeName('');
    setTypeActive(true);
    setFormError('');
    setIsFormOpen(true);
  };

  const startEdit = (t: RegisteredType) => {
    setFormMode('edit');
    setFormCategory(t.category);
    setSelectedType(t);
    setTypeName(t.name);
    setTypeActive(t.active);
    setFormError('');
    setIsFormOpen(true);
    setDeleteMenuOpen(false);
  };

  const handleSave = async () => {
    const trimmed = typeName.trim();
    if (!trimmed) {
      setFormError('Informe o nome do tipo.');
      return;
    }
    if (trimmed.length > 64) {
      setFormError('O nome deve ter no máximo 64 caracteres.');
      return;
    }
    const duplicate = typeRegistry.some(t =>
      t.category === formCategory && t.id !== selectedType?.id &&
      t.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setFormError('Já existe um tipo com esse nome nesta lista.');
      return;
    }

    setLoading(true);
    setFormError('');
    try {
      if (formMode === 'add') {
        await onAddType?.(formCategory, trimmed);
        showToast('success', 'Tipo cadastrado com sucesso.');
      } else if (selectedType) {
        await onUpdateType?.(selectedType.id, { name: trimmed, active: typeActive });
        showToast('success', 'Tipo atualizado com sucesso.');
      }
      closeForm();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar o tipo.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = async (t: RegisteredType) => {
    if (isProtected(t)) return;
    const usage = getTypeUsageCount?.(t.category, t.name) ?? 0;
    if (usage > 0) return;

    const confirmed = await confirmDialog({
      title: 'Excluir Tipo',
      message: `Tem certeza de que deseja excluir o tipo "${t.name}"?`,
      confirmLabel: 'Sim, Excluir',
      cancelLabel: 'Cancelar',
      danger: true
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      await onDeleteType?.(t.id);
      showToast('success', 'Tipo excluído com sucesso.');
      closeForm();
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao excluir o tipo.');
    } finally {
      setLoading(false);
    }
  };

  const tabItems = useMemo(
    () => typeRegistry.filter(t => visibleCategories.includes(t.category)),
    [typeRegistry, activeTab]
  );

  const filteredItems = useMemo(() =>
    tabItems
      .filter(t => {
        const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
        const matchesSearch = !query || t.name.toLocaleLowerCase('pt-BR').includes(query);
        const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? t.active : !t.active);
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  [tabItems, searchTerm, statusFilter]);

  const requestRename = (t: RegisteredType) => {
    startEdit(t);
  };

  const renderCard = (t: RegisteredType) => {
    const meta = CATEGORY_META[t.category];
    const usage = getTypeUsageCount?.(t.category, t.name) ?? 0;
    const inUse = usage > 0;
    const protectedType = isProtected(t);

    return (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        aria-label={`Renomear tipo ${t.name}`}
        onClick={() => requestRename(t)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            requestRename(t);
          }
        }}
        className={`group cursor-pointer rounded-2xl border p-4 text-left shadow-sm transition-all hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          t.active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/80'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${t.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <p className={`truncate text-xs font-bold ${t.active ? 'text-slate-900' : 'text-slate-500 line-through decoration-slate-300'}`}>
                {t.name}
              </p>
              {!t.active && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">Inativo</span>
              )}
              {protectedType && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  Padrão
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
              <span className={inUse ? 'font-medium text-amber-600' : 'text-slate-400'}>
                {inUse
                  ? `${usage} ${usage === 1 ? 'registro vinculado' : 'registros vinculados'}`
                  : 'Sem registros vinculados'}
              </span>
            </div>
          </div>

          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-400" />
        </div>
      </div>
    );
  };

  const desktopGrid = 'grid-cols-[minmax(240px,2fr)_minmax(150px,1fr)_36px]';

  const renderDesktopRow = (t: RegisteredType) => {
    const usage = getTypeUsageCount?.(t.category, t.name) ?? 0;
    const inUse = usage > 0;
    const protectedType = isProtected(t);

    return (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        aria-label={`Renomear tipo ${t.name}`}
        onClick={() => requestRename(t)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            requestRename(t);
          }
        }}
        className="cursor-pointer px-5 py-3.5 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
      >
        <div className={`grid items-center gap-4 ${desktopGrid}`}>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className={`truncate text-xs font-bold ${t.active ? 'text-slate-900' : 'text-slate-500 line-through decoration-slate-300'}`}>
              {t.name}
            </p>
            {!t.active && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">Inativo</span>
            )}
            {protectedType && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                <ShieldCheck className="h-2.5 w-2.5" />
                Padrão
              </span>
            )}
          </div>

          <span className={`text-[10px] font-medium ${inUse ? 'text-amber-600' : 'text-slate-400'}`}>
            {inUse
              ? `${usage} ${usage === 1 ? 'registro vinculado' : 'registros vinculados'}`
              : 'Sem registros vinculados'}
          </span>

          <div className="flex justify-end">
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-400" />
          </div>
        </div>
      </div>
    );
  };

  const hasActiveFilters = Boolean(searchTerm.trim()) || statusFilter !== 'all';

  return (
    <div className="space-y-4" id="type-registry-section">
      {/* Header */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Cadastro de tipos</h1>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                {filteredItems.length} {filteredItems.length === 1 ? 'tipo' : 'tipos'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Padronize as classificações usadas nos formulários de parceiros, equipamentos e serviços.
            </p>
          </div>
          <button
            type="button"
            onClick={startAdd}
            className="flex min-h-10 shrink-0 items-center gap-1.5 self-start rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>

        {/* Category tabs */}
        <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Categorias de cadastro">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.key);
                  setSearchTerm('');
                  setStatusFilter('all');
                  setMobileSearchOpen(false);
                  setMobileFiltersOpen(false);
                }}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold transition ${
                  isActive
                    ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{TAB_DESKTOP_LABELS[tab.key]}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile search/filters toggles */}
        <div className="mt-3 flex items-center gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => { setMobileSearchOpen(open => !open); setMobileFiltersOpen(false); }}
            aria-label="Buscar tipos"
            aria-expanded={mobileSearchOpen}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
              mobileSearchOpen || searchTerm
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-500'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => { setMobileFiltersOpen(open => !open); setMobileSearchOpen(false); }}
            aria-label="Filtrar tipos por status"
            aria-expanded={mobileFiltersOpen}
            className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
              mobileFiltersOpen || statusFilter !== 'all'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-500'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {statusFilter !== 'all' && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600" />}
          </button>

          {!mobileFiltersOpen && statusFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="flex min-h-7 w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700"
            >
              {statusFilterLabel(statusFilter)} <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {mobileSearchOpen && (
          <div className="relative mt-3 sm:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              autoFocus
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar tipo por nome"
              aria-label="Buscar tipos"
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-10 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Limpar busca"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {mobileFiltersOpen && (
          <div className="mt-3 rounded-xl bg-slate-50 p-2 sm:hidden">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Filtrar tipos por status"
            >
              {STATUS_FILTER_OPTIONS.map(option => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Desktop filters */}
      <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar tipo por nome..."
            aria-label="Buscar tipos"
            id="search-types-input"
            className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-emerald-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="min-h-10 max-w-44 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-400"
          aria-label="Filtrar tipos por status"
          id="filter-types-status-select"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>

      {/* List */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Layers className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 text-sm font-bold text-slate-700">
            {hasActiveFilters ? 'Nenhum tipo encontrado' : `Nenhum tipo em ${TABS.find(tab => tab.key === activeTab)?.label.toLowerCase()}`}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {hasActiveFilters
              ? 'Ajuste a busca ou os filtros para encontrar o tipo.'
              : 'Os valores padrão do sistema continuam sendo usados nos formulários. Use "Adicionar" para cadastrar um novo tipo.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop list */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block" id="types-list-desktop">
            <div className={`grid items-center gap-4 border-b border-slate-200 bg-slate-50/70 px-5 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400 ${desktopGrid}`}>
              <span>Tipo</span>
              <span>Uso</span>
              <span />
            </div>
            <div className="divide-y divide-slate-100">
              {filteredItems.map(renderDesktopRow)}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden" id="types-list">
            {filteredItems.map(renderCard)}
          </div>
        </>
      )}

      {/* Add/rename form modal */}
      {isFormOpen && createPortal(
        <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Fechar formulário"
            className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
            onClick={() => !loading && closeForm()}
          />
          <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  {formMode === 'add' ? <Plus className="h-5 w-5" /> : <Edit className="h-5 w-5" />}
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                    {formMode === 'add' ? 'Novo tipo' : 'Renomear tipo'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formMode === 'add'
                      ? CATEGORY_META[formCategory].title
                      : 'Atualize o nome exibido nos formulários.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {formMode === 'edit' && selectedType && !isProtected(selectedType) && (
                  <div className="relative" ref={deleteMenuRef}>
                    <button
                      type="button"
                      onClick={() => setDeleteMenuOpen(open => !open)}
                      disabled={loading}
                      aria-label="Mais opções"
                      aria-expanded={deleteMenuOpen}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>
                    {deleteMenuOpen && (
                      <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            setDeleteMenuOpen(false);
                            void handleDeleteClick(selectedType);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => !loading && closeForm()}
                  disabled={loading}
                  aria-label="Fechar"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <form onSubmit={(event) => { event.preventDefault(); void handleSave(); }} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-slate-50/50 px-4 py-5 sm:px-6">
                <label className="block text-xs font-bold text-slate-700">
                  Nome do tipo <span className="text-rose-500">*</span>
                  <input
                    autoFocus
                    type="text"
                    value={typeName}
                    maxLength={64}
                    onChange={(event) => { setTypeName(event.target.value); if (formError) setFormError(''); }}
                    aria-invalid={Boolean(formError)}
                    placeholder={CATEGORY_META[formCategory].example}
                    className={`mt-1.5 block min-h-11 w-full rounded-xl border bg-white px-3.5 text-sm font-normal outline-none transition ${
                      formError
                        ? 'border-rose-400 ring-2 ring-rose-100'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10'
                    }`}
                  />
                  {formError && <span className="mt-1.5 block text-[10px] font-semibold text-rose-600">{formError}</span>}
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={typeActive}
                    onChange={(e) => setTypeActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700">Tipo ativo</span>
                </label>
              </div>

              <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
                <button
                  type="button"
                  disabled={loading}
                  onClick={closeForm}
                  className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-11 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : formMode === 'add' ? 'Cadastrar tipo' : 'Salvar alterações'}
                </button>
              </footer>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Footer hint */}
      <div className="flex items-center gap-1.5 px-1 pt-1">
        <Info className="h-3 w-3 shrink-0 text-slate-300" />
        <span className="text-[10px] leading-relaxed text-slate-400">
          Tipos desativados somem dos formulários, mas registros existentes mantêm o valor.
        </span>
      </div>
    </div>
  );
}
