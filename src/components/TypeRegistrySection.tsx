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
  Info,
  CheckCircle2
} from 'lucide-react';

type RegistryTab = 'partner' | 'equipment' | 'service';

interface TypeRegistrySectionProps {
  typeRegistry: RegisteredType[];
  onAddType: (category: RegisteredTypeCategory, name: string) => Promise<void>;
  onUpdateType: (id: string, updates: Partial<Omit<RegisteredType, 'id' | 'updatedAt' | 'updatedBy'>>) => Promise<void>;
  onDeleteType: (id: string) => Promise<void>;
  getTypeUsageCount: (category: RegisteredTypeCategory, name: string) => number;
}

const TABS: { key: RegistryTab; label: string }[] = [
  { key: 'partner', label: 'Tipos de Parceiro' },
  { key: 'equipment', label: 'Tipos de Equipamento' },
  { key: 'service', label: 'Tipos de Serviço' },
];

const CATEGORY_META: Record<RegisteredTypeCategory, { title: string; description: string; icon: ReactNode; accent: string }> = {
  partner: { title: 'Tipos de Parceiro', description: 'Classificação usada no cadastro de parceiros.', icon: <Briefcase className="h-5 w-5" />, accent: 'bg-emerald-100 text-emerald-700' },
  equipment_component: { title: 'Componentes GPS', description: 'Tipos de equipamentos GPS do estoque.', icon: <Cpu className="h-5 w-5" />, accent: 'bg-blue-100 text-blue-700' },
  equipment_machine: { title: 'Máquinas / Frota', description: 'Tipos de máquinas da frota.', icon: <Tractor className="h-5 w-5" />, accent: 'bg-amber-100 text-amber-700' },
  service: { title: 'Tipos de Serviço', description: 'Ações das Ordens de Serviço e serviços de manutenção.', icon: <Wrench className="h-5 w-5" />, accent: 'bg-violet-100 text-violet-700' },
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

    return (
      <div
        key={t.id}
        className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors sm:p-4 ${
          t.active ? 'border-slate-200 bg-white hover:border-slate-300' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold truncate ${t.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{t.name}</span>
            {!t.active && (
              <span className="inline-flex items-center text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border bg-slate-100 text-slate-500 border-slate-200">
                Inativo
              </span>
            )}
            {protectedType && (
              <span className="inline-flex items-center text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border bg-emerald-50 text-emerald-700 border-emerald-100">
                Padrão do sistema
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] text-slate-400 font-medium">
            {inUse
              ? `Em uso por ${usage} ${usage === 1 ? 'registro' : 'registros'} — apenas desativação permitida`
              : 'Nenhum registro em uso'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-4">
          <button
            onClick={() => startEdit(t)}
            disabled={loading || inUse}
            aria-label={`Editar ${t.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-30"
            title={inUse ? 'Tipo em uso não pode ser renomeado' : 'Renomear tipo'}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleToggleActive(t)}
            disabled={loading}
            aria-label={t.active ? `Desativar ${t.name}` : `Reativar ${t.name}`}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              t.active
                ? 'text-amber-500 hover:bg-amber-50 hover:text-amber-600'
                : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600'
            }`}
            title={t.active ? 'Desativar tipo' : 'Reativar tipo'}
          >
            <Power className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleDeleteClick(t)}
            disabled={loading || inUse || protectedType}
            aria-label={`Excluir ${t.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-30"
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

    return (
      <div key={category} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.accent}`}>
              {meta.icon}
            </span>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">{meta.title}</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">{items.length} {items.length === 1 ? 'tipo cadastrado' : 'tipos cadastrados'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => startAdd(category)}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Adicionar tipo
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">{meta.description}</p>

          {items.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <span className="flex justify-center text-slate-300">{meta.icon}</span>
              <p className="mt-2 text-xs font-bold text-slate-500">Nenhum tipo encontrado</p>
              <p className="text-[10px] text-slate-400 mt-1">Ajuste a busca ou cadastre um novo tipo.</p>
            </div>
          ) : (
            <div className="space-y-3">{items.map(renderRow)}</div>
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
      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
        <span className="leading-relaxed">
          Tipos desativados deixam de aparecer nos formulários, mas registros existentes mantêm o valor. Tipos em uso só podem ser desativados.
        </span>
      </div>

      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span className="whitespace-pre-line">{success}</span>
        </div>
      )}

      {!isFormOpen && error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}

      <div role="tablist" aria-label="Categorias de cadastro" className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => { setActiveTab(tab.key); setSearchTerm(''); }}
            className={`min-h-10 rounded-xl px-2 py-2 text-[11px] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              activeTab === tab.key
                ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative rounded-xl shadow-sm">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Filtrar tipos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="block min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {totalInTab === 0 && searchTerm === '' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">
          Nenhum tipo registrado ainda para esta categoria. Os valores padrão do sistema continuam sendo usados nos formulários.
        </div>
      )}

      {visibleCategories.map(renderPanel)}

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
          <div className="w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-md sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  {formMode === 'add' ? <Plus className="h-5 w-5" /> : <Edit2 className="h-5 w-5" />}
                </span>
                <div>
                  <h2 id="type-form-title" className="text-sm font-extrabold text-slate-900">
                    {formMode === 'add' ? `Adicionar em ${CATEGORY_META[formCategory].title}` : 'Renomear tipo'}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {formMode === 'add' ? CATEGORY_META[formCategory].description : 'Atualize o nome exibido nos formulários.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeForm}
                disabled={loading}
                aria-label="Fechar formulário"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleSave(); }}
              className="p-5"
            >
              {error && (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  {error}
                </div>
              )}

              <label className="block text-[10px] uppercase font-black text-slate-400">
                Nome do tipo <span className="text-rose-500">*</span>
                <input
                  autoFocus
                  type="text"
                  value={typeName}
                  maxLength={64}
                  onChange={(e) => { setTypeName(e.target.value); setError(null); }}
                  placeholder="Ex.: Sensor de Umidade"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium normal-case text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </label>

              <div className="mt-5 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={loading}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-11 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
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
