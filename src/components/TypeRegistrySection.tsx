import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RegisteredType, RegisteredTypeCategory } from '../types';
import { PROTECTED_TYPE_NAMES } from '../constants/typeRegistry';
import { useNotifications } from './NotificationProvider';
import {
  Briefcase,
  Cpu,
  Tractor,
  Wrench,
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Power,
  ShieldCheck,
  CheckCircle2,
  Tag,
  Layers,
  Zap
} from 'lucide-react';

type RegistryTab = 'partner' | 'equipment' | 'service';

interface TypeRegistrySectionProps {
  typeRegistry: RegisteredType[];
  onAddType: (category: RegisteredTypeCategory, name: string) => Promise<void>;
  onUpdateType: (id: string, updates: Partial<Omit<RegisteredType, 'id' | 'updatedAt' | 'updatedBy'>>) => Promise<void>;
  onDeleteType: (id: string) => Promise<void>;
  getTypeUsageCount: (category: RegisteredTypeCategory, name: string) => number;
}

const TABS: { key: RegistryTab; label: string; icon: ReactNode; shortLabel: string }[] = [
  { key: 'partner', label: 'Tipos de Parceiro', icon: <Briefcase className="h-3.5 w-3.5" />, shortLabel: 'Parceiro' },
  { key: 'equipment', label: 'Tipos de Equipamento', icon: <Layers className="h-3.5 w-3.5" />, shortLabel: 'Equipamento' },
  { key: 'service', label: 'Tipos de Serviço', icon: <Zap className="h-3.5 w-3.5" />, shortLabel: 'Serviço' },
];

const CATEGORY_META: Record<RegisteredTypeCategory, {
  title: string;
  description: string;
  icon: ReactNode;
  gradient: string;
  iconBg: string;
  example: string;
  emptyTitle: string;
  emptyHint: string;
}> = {
  partner: {
    title: 'Tipos de Parceiro',
    description: 'Classificação dos parceiros cadastrados no sistema.',
    icon: <Briefcase className="h-5 w-5" />,
    gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
    iconBg: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25',
    example: 'Ex.: Assistência Técnica Autorizada',
    emptyTitle: 'Nenhum tipo de parceiro cadastrado',
    emptyHint: 'Cadastre tipos para classificar parceiros como assistência técnica, prestador de serviço e recebedor de empréstimo.',
  },
  equipment_component: {
    title: 'Componentes GPS',
    description: 'Tipos de equipamentos GPS do estoque.',
    icon: <Cpu className="h-5 w-5" />,
    gradient: 'from-blue-500/10 via-blue-500/5 to-transparent',
    iconBg: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25',
    example: 'Ex.: Sensor de Ângulo',
    emptyTitle: 'Nenhum tipo de componente cadastrado',
    emptyHint: 'Cadastre tipos como Antena/Receptor, Monitor/Display, Controladora, Motor de Passo e outros.',
  },
  equipment_machine: {
    title: 'Máquinas / Frota',
    description: 'Tipos de máquinas da frota.',
    icon: <Tractor className="h-5 w-5" />,
    gradient: 'from-amber-500/10 via-amber-500/5 to-transparent',
    iconBg: 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25',
    example: 'Ex.: Trator Agrícola',
    emptyTitle: 'Nenhum tipo de máquina cadastrado',
    emptyHint: 'Cadastre tipos como Trator, Colhedora, Pulverizador e outros utilizados na frota.',
  },
  service: {
    title: 'Tipos de Serviço',
    description: 'Ações das Ordens de Serviço e serviços de manutenção.',
    icon: <Wrench className="h-5 w-5" />,
    gradient: 'from-violet-500/10 via-violet-500/5 to-transparent',
    iconBg: 'bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-lg shadow-violet-500/25',
    example: 'Ex.: Calibração de Offset',
    emptyTitle: 'Nenhum tipo de serviço cadastrado',
    emptyHint: 'Cadastre ações como Instalação, Remoção, Manutenção, Calibração e outros.',
  },
};

export default function TypeRegistrySection({
  typeRegistry = [],
  onAddType,
  onUpdateType,
  onDeleteType,
  getTypeUsageCount
}: TypeRegistrySectionProps) {
  const { confirmDialog } = useNotifications();
  const [activeTab, setActiveTab] = useState<RegistryTab>('partner');
  const [searchTerm, setSearchTerm] = useState('');
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [formCategory, setFormCategory] = useState<RegisteredTypeCategory>('partner');
  const [selectedType, setSelectedType] = useState<RegisteredType | null>(null);
  const [typeName, setTypeName] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const visibleCategories: RegisteredTypeCategory[] = activeTab === 'equipment'
    ? ['equipment_component', 'equipment_machine']
    : [activeTab];

  useEffect(() => {
    if (!isFormOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) closeForm();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFormOpen, loading]);

  const isProtected = (t: RegisteredType) =>
    (PROTECTED_TYPE_NAMES[t.category] || []).includes(t.name);

  const closeForm = () => {
    setFormMode('add');
    setSelectedType(null);
    setTypeName('');
    setError(null);
    setIsFormOpen(false);
  };

  const startAdd = (category: RegisteredTypeCategory) => {
    setFormMode('add');
    setFormCategory(category);
    setSelectedType(null);
    setTypeName('');
    setError(null);
    setSuccess(null);
    setIsFormOpen(true);
  };

  const startEdit = (t: RegisteredType) => {
    setFormMode('edit');
    setFormCategory(t.category);
    setSelectedType(t);
    setTypeName(t.name);
    setError(null);
    setSuccess(null);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    const trimmed = typeName.trim();
    if (!trimmed) {
      setError('Informe o nome do tipo.');
      return;
    }
    if (trimmed.length > 64) {
      setError('O nome deve ter no máximo 64 caracteres.');
      return;
    }
    const duplicate = typeRegistry.some(t =>
      t.category === formCategory && t.id !== selectedType?.id &&
      t.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setError('Já existe um tipo com esse nome nesta lista.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (formMode === 'add') {
        await onAddType?.(formCategory, trimmed);
        setSuccess('Tipo cadastrado com sucesso!');
      } else if (selectedType) {
        await onUpdateType?.(selectedType.id, { name: trimmed });
        setSuccess('Tipo atualizado com sucesso!');
      }
      closeForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar o tipo.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (t: RegisteredType) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await onUpdateType?.(t.id, { active: !t.active });
      setSuccess(t.active ? `"${t.name}" foi desativado.` : `"${t.name}" foi reativado.`);
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar o status do tipo.');
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
    setError(null);
    setSuccess(null);
    try {
      await onDeleteType?.(t.id);
      setSuccess('Tipo excluído com sucesso.');
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir o tipo.');
    } finally {
      setLoading(false);
    }
  };

  const filterByName = (list: RegisteredType[]) =>
    list.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const renderRow = (t: RegisteredType) => {
    const usage = getTypeUsageCount?.(t.category, t.name) ?? 0;
    const inUse = usage > 0;
    const protectedType = isProtected(t);
    const meta = CATEGORY_META[t.category];

    return (
      <div
        key={t.id}
        className={`group relative flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-all duration-200 sm:p-4 ${
          t.active
            ? 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-md hover:shadow-slate-100'
            : 'border-slate-200/60 bg-slate-50/80'
        }`}
      >
        {/* Subtle left accent for active items */}
        {t.active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        )}

        <div className="min-w-0 pl-1">
          <div className="flex items-center gap-2.5">
            <span className={`text-[13px] font-bold tracking-tight ${t.active ? 'text-slate-800' : 'text-slate-400 line-through decoration-slate-300'}`}>
              {t.name}
            </span>
            {!t.active && (
              <span className="inline-flex items-center text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-widest bg-slate-200/80 text-slate-500">
                Inativo
              </span>
            )}
            {protectedType && (
              <span className="inline-flex items-center gap-1 text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-widest bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60">
                <ShieldCheck className="h-2.5 w-2.5" />
                Padrão
              </span>
            )}
          </div>
          <p className={`mt-1.5 text-[10px] font-medium ${inUse ? 'text-amber-600' : 'text-slate-400'}`}>
            {inUse ? (
              <span className="flex items-center gap-1">
                <Tag className="h-2.5 w-2.5" />
                {usage} {usage === 1 ? 'registro vinculado' : 'registros vinculados'}
              </span>
            ) : (
              'Sem registros vinculados'
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-4">
          <button
            onClick={() => startEdit(t)}
            disabled={loading || inUse}
            aria-label={`Editar ${t.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-all duration-150 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-20"
            title={inUse ? 'Tipo em uso não pode ser renomeado' : 'Renomear tipo'}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleToggleActive(t)}
            disabled={loading}
            aria-label={t.active ? `Desativar ${t.name}` : `Reativar ${t.name}`}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              t.active
                ? 'text-slate-300 hover:bg-amber-50 hover:text-amber-500'
                : 'text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600'
            }`}
            title={t.active ? 'Desativar tipo' : 'Reativar tipo'}
          >
            <Power className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleDeleteClick(t)}
            disabled={loading || inUse || protectedType}
            aria-label={`Excluir ${t.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-all duration-150 hover:bg-rose-50 hover:text-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-20"
            title={
              protectedType
                ? 'Tipo padrão do sistema não pode ser excluído'
                : inUse
                  ? 'Tipo em uso — apenas desativação é permitida'
                  : 'Excluir tipo'
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderPanel = (category: RegisteredTypeCategory) => {
    const meta = CATEGORY_META[category];
    const items = filterByName(typeRegistry.filter(t => t.category === category)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const activeCount = items.filter(t => t.active).length;
    const inactiveCount = items.length - activeCount;

    return (
      <div key={category} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:shadow-md transition-shadow duration-300">
        {/* Gradient header */}
        <div className={`relative bg-gradient-to-r ${meta.gradient} border-b border-slate-100 px-5 py-4 sm:px-6`}>
          {/* Decorative circle */}
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/30 blur-xl" />

          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.iconBg} transition-transform duration-200 group-hover:scale-105`}>
                {meta.icon}
              </span>
              <div>
                <h3 className="text-[13px] font-extrabold tracking-tight text-slate-900">{meta.title}</h3>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">
                    {items.length} {items.length === 1 ? 'tipo' : 'tipos'}
                  </span>
                  {inactiveCount > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {inactiveCount} {inactiveCount === 1 ? 'inativo' : 'inativos'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => startAdd(category)}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:from-emerald-700 hover:to-emerald-600 hover:shadow-lg hover:shadow-emerald-500/30 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:translate-y-0 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Adicionar tipo
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <p className="mb-4 text-[11px] leading-relaxed text-slate-500">{meta.description}</p>

          {items.length === 0 ? (
            <div className="relative overflow-hidden rounded-xl border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/50 py-10">
              {/* Decorative dots */}
              <div className="absolute right-4 top-4 grid grid-cols-3 gap-1 opacity-20">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="h-1 w-1 rounded-full bg-slate-400" />
                ))}
              </div>

              <div className="relative flex flex-col items-center px-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${meta.iconBg} opacity-40`}>
                  {meta.icon}
                </div>
                <p className="mt-3 text-xs font-bold text-slate-600">{meta.emptyTitle}</p>
                <p className="mt-1.5 max-w-xs text-center text-[10px] leading-relaxed text-slate-400">{meta.emptyHint}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">{items.map(renderRow)}</div>
          )}
        </div>
      </div>
    );
  };

  const totalInTab = useMemo(
    () => typeRegistry.filter(t => visibleCategories.includes(t.category)).length,
    [typeRegistry, visibleCategories]
  );

  return (
    <div className="space-y-4">
      {/* Info banner - refined */}
      <div className="relative overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 via-blue-50/80 to-blue-50/40 p-3.5">
        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-blue-100/40 blur-xl" />
        <div className="relative flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-blue-900">Regras de cadastro</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-blue-600/80">
              Tipos desativados somem dos formulários, mas registros existentes mantêm o valor. Tipos em uso só podem ser desativados.
            </p>
          </div>
        </div>
      </div>

      {/* Success / Error */}
      {success && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-emerald-50/60 p-3.5 text-xs font-bold text-emerald-800 shadow-sm shadow-emerald-100">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          </span>
          <span className="whitespace-pre-line">{success}</span>
        </div>
      )}

      {!isFormOpen && error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}

      {/* Tabs - premium pill style */}
      <div role="tablist" aria-label="Categorias de cadastro" className="relative grid grid-cols-3 gap-1 rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-1 shadow-inner">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => { setActiveTab(tab.key); setSearchTerm(''); }}
              className={`relative flex items-center justify-center gap-1.5 min-h-[42px] rounded-xl px-2 py-2 text-[11px] font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isActive
                  ? 'bg-white text-emerald-700 shadow-md shadow-slate-200/60 ring-1 ring-slate-200/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors duration-200" />
        </div>
        <input
          type="text"
          placeholder="Filtrar tipos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="block min-h-11 w-full rounded-xl border border-slate-200/80 bg-white py-2.5 pl-10 pr-3 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200 shadow-sm"
        />
      </div>

      {/* Empty tab state */}
      {totalInTab === 0 && searchTerm === '' && (
        <div className="rounded-xl border border-slate-200/60 bg-gradient-to-r from-slate-50 to-white p-3.5">
          <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
            Nenhum tipo registrado ainda para esta categoria. Os valores padrão do sistema continuam sendo usados nos formulários.
          </p>
        </div>
      )}

      {/* Panels */}
      <div className="space-y-4">
        {visibleCategories.map(renderPanel)}
      </div>

      {/* Modal */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="type-form-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loading) closeForm();
          }}
        >
          <div className="w-full overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white shadow-2xl sm:max-w-md sm:rounded-3xl">
            {/* Modal header with accent */}
            <div className="relative overflow-hidden border-b border-slate-100 px-6 py-5">
              <div className={`absolute inset-0 bg-gradient-to-r ${CATEGORY_META[formCategory].gradient}`} />
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/30 blur-xl" />

              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${CATEGORY_META[formCategory].iconBg}`}>
                    {formMode === 'add' ? <Plus className="h-5 w-5" /> : <Edit2 className="h-5 w-5" />}
                  </span>
                  <div>
                    <h2 id="type-form-title" className="text-sm font-extrabold text-slate-900 tracking-tight">
                      {formMode === 'add' ? `Novo tipo` : 'Renomear tipo'}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formMode === 'add'
                        ? `Adicionar em ${CATEGORY_META[formCategory].title}`
                        : 'Atualize o nome exibido nos formulários'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={loading}
                  aria-label="Fechar formulário"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-all duration-150 hover:bg-white/80 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleSave(); }}
              className="p-6"
            >
              {error && (
                <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  {error}
                </div>
              )}

              <label className="block">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Nome do tipo <span className="text-rose-500">*</span>
                </span>
                <input
                  autoFocus
                  type="text"
                  value={typeName}
                  maxLength={64}
                  onChange={(e) => { setTypeName(e.target.value); setError(null); }}
                  placeholder={CATEGORY_META[formCategory].example}
                  className="mt-2 block min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200"
                />
              </label>

              <div className="mt-6 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={loading}
                  className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:from-emerald-700 hover:to-emerald-600 hover:shadow-lg hover:shadow-emerald-500/30 disabled:cursor-not-allowed disabled:from-emerald-300 disabled:to-emerald-300 disabled:shadow-none"
                >
                  {formMode === 'add' ? 'Cadastrar tipo' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
