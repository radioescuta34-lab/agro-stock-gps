import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Save,
  Loader2,
  Eye,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CheckSquare,
  Square,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  RemoveFormatting
} from 'lucide-react';
import { useNotifications } from './NotificationProvider';
import {
  DEFAULT_WHATS_NEW,
  WHATS_NEW_ACCENTS,
  WHATS_NEW_ICON_OPTIONS,
  getWhatsNewAccent,
  getWhatsNewIcon,
  type WhatsNewCategory,
  type WhatsNewItem
} from '../constants/whatsNew';
import {
  getPublishedWhatsNew,
  getWhatsNewDraft,
  publishWhatsNew,
  saveWhatsNewDraft,
  type PublishedWhatsNew,
  type WhatsNewDraftCategory
} from '../utils/whatsNewFirestore';
import WhatsNewModal from './WhatsNewModal';
import { sanitizeRichText } from '../utils/richText';

interface WhatsNewAdminProps {
  currentUserName: string;
  isDemo?: boolean;
}

interface DraftItem extends WhatsNewItem {
  selected: boolean;
}

interface DraftCategory {
  key: string;
  title: string;
  items: DraftItem[];
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 600;

function createKey(): string {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTimestamp(value: unknown): string {
  if (!value) return '—';
  try {
    if (value instanceof Date) return value.toLocaleString('pt-BR');
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().toLocaleString('pt-BR');
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value).toLocaleString('pt-BR');
    }
  } catch {
    return '—';
  }
  return '—';
}

function toDraft(categories: Array<WhatsNewCategory | WhatsNewDraftCategory>, fallbackSelected: boolean): DraftCategory[] {
  return categories.map(category => ({
    key: createKey(),
    title: category.title,
    items: category.items.map(item => {
      const selected = typeof (item as Partial<DraftItem>).selected === 'boolean'
        ? (item as DraftItem).selected
        : fallbackSelected;
      return {
        title: item.title,
        description: sanitizeRichText(item.description),
        icon: item.icon,
        accent: item.accent,
        selected
      };
    })
  }));
}

function toStoredCategories(categories: DraftCategory[]): WhatsNewDraftCategory[] {
  return categories.map(category => ({
    title: category.title,
    items: category.items.map(item => ({
      title: item.title,
      description: sanitizeRichText(item.description),
      icon: item.icon,
      accent: item.accent,
      selected: item.selected
    }))
  }));
}

function serializeCategories(categories: DraftCategory[]): string {
  return JSON.stringify(toStoredCategories(categories));
}

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const sanitizedValue = sanitizeRichText(value);
    if (editor && document.activeElement !== editor && editor.innerHTML !== sanitizedValue) {
      editor.innerHTML = sanitizedValue;
    }
  }, [value]);

  const syncValue = () => {
    const editor = editorRef.current;
    if (editor) onChange(sanitizeRichText(editor.innerHTML));
  };

  const format = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    syncValue();
  };

  const tools = [
    { command: 'bold', label: 'Negrito', icon: Bold },
    { command: 'italic', label: 'Itálico', icon: Italic },
    { command: 'underline', label: 'Sublinhado', icon: Underline },
    { command: 'insertUnorderedList', label: 'Lista com marcadores', icon: List },
    { command: 'insertOrderedList', label: 'Lista numerada', icon: ListOrdered },
    { command: 'removeFormat', label: 'Limpar formatação', icon: RemoveFormatting }
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white transition-shadow focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50/80 px-2 py-1.5" role="toolbar" aria-label="Formatação da descrição">
        {tools.map(({ command, label, icon: Icon }) => (
          <button
            key={command}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={event => event.preventDefault()}
            onClick={() => format(command)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={syncValue}
        onPaste={() => window.requestAnimationFrame(syncValue)}
        className="min-h-20 px-3 py-2 text-sm leading-relaxed text-slate-700 outline-none empty:before:pointer-events-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}

export default function WhatsNewAdmin({ currentUserName, isDemo = false }: WhatsNewAdminProps) {
  const { showToast } = useNotifications();
  const [categories, setCategories] = useState<DraftCategory[]>(() => toDraft(DEFAULT_WHATS_NEW, true));
  const [lastPublishedId, setLastPublishedId] = useState<number | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const hydratedRef = useRef(false);
  const latestCategoriesRef = useRef(categories);
  const lastSavedJsonRef = useRef<string>(serializeCategories(categories));
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveErrorNotifiedRef = useRef(false);
  const currentUserNameRef = useRef(currentUserName);

  latestCategoriesRef.current = categories;
  currentUserNameRef.current = currentUserName;

  const persistDraft = async (nextCategories: DraftCategory[]) => {
    if (isDemo) return;
    const json = serializeCategories(nextCategories);
    if (json === lastSavedJsonRef.current) return;

    setSaveState('saving');
    try {
      await saveWhatsNewDraft(toStoredCategories(nextCategories), currentUserNameRef.current);
      lastSavedJsonRef.current = json;
      saveErrorNotifiedRef.current = false;
      setSaveState('saved');
    } catch (error) {
      console.error('Não foi possível salvar o rascunho das novidades:', error);
      setSaveState('error');
      if (!saveErrorNotifiedRef.current) {
        saveErrorNotifiedRef.current = true;
        showToast('error', 'Não foi possível salvar o rascunho das novidades. Verifique se as regras do Firestore foram publicadas.');
      }
    }
  };

  const clearAutosaveTimer = () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  };

  const load = async () => {
    setLoading(true);
    clearAutosaveTimer();
    hydratedRef.current = false;

    if (isDemo) {
      const demoCategories = toDraft(DEFAULT_WHATS_NEW, true);
      setCategories(demoCategories);
      latestCategoriesRef.current = demoCategories;
      setLastPublishedId(null);
      setLastPublishedAt(null);
      setExpandedKey(demoCategories[0]?.key ?? null);
      lastSavedJsonRef.current = serializeCategories(demoCategories);
      hydratedRef.current = true;
      setSaveState('idle');
      setLoading(false);
      return;
    }

    let draft: Awaited<ReturnType<typeof getWhatsNewDraft>> = null;
    let published: PublishedWhatsNew | null = null;
    let draftFailed = false;

    try {
      draft = await getWhatsNewDraft();
    } catch (error) {
      draftFailed = true;
      console.warn('Falha ao carregar o rascunho das novidades:', error);
    }

    try {
      published = await getPublishedWhatsNew();
    } catch (error) {
      console.warn('Falha ao carregar novidades publicadas:', error);
      showToast('error', 'Não foi possível carregar as novidades publicadas.');
    }

    const source = draft
      ? draft.categories
      : published?.content && published.content.length > 0
        ? published.content
        : DEFAULT_WHATS_NEW;

    const nextCategories = toDraft(source, true);

    setCategories(nextCategories);
    latestCategoriesRef.current = nextCategories;
    setLastPublishedId(published?.lastPublishedId ?? null);
    setLastPublishedAt(published?.publishedAt ?? null);
    setExpandedKey(nextCategories[0]?.key ?? null);

    lastSavedJsonRef.current = serializeCategories(nextCategories);
    hydratedRef.current = true;
    saveErrorNotifiedRef.current = false;
    setSaveState(draft ? 'saved' : 'idle');

    if (draftFailed && !isDemo) {
      showToast('error', 'O rascunho salvo não pôde ser carregado. Publique as regras do Firestore para habilitar o salvamento automático.');
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    latestCategoriesRef.current = categories;
    if (!hydratedRef.current) return;

    const json = serializeCategories(categories);
    if (json === lastSavedJsonRef.current) return;

    if (isDemo) {
      lastSavedJsonRef.current = json;
      setSaveState('saved');
      return;
    }

    setSaveState('saving');
    clearAutosaveTimer();
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistDraft(latestCategoriesRef.current);
    }, AUTOSAVE_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, isDemo]);

  useEffect(() => {
    return () => {
      clearAutosaveTimer();
      if (!hydratedRef.current || isDemo) return;
      const json = serializeCategories(latestCategoriesRef.current);
      if (json === lastSavedJsonRef.current) return;
      void saveWhatsNewDraft(
        toStoredCategories(latestCategoriesRef.current),
        currentUserNameRef.current
      ).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  const reload = async () => {
    clearAutosaveTimer();
    await persistDraft(latestCategoriesRef.current);
    await load();
  };

  const totalItems = useMemo(
    () => categories.reduce((total, category) => total + category.items.length, 0),
    [categories]
  );

  const selectedItems = useMemo(
    () => categories.reduce((total, category) => total + category.items.filter(item => item.selected).length, 0),
    [categories]
  );

  const toggleExpanded = (key: string) => {
    setExpandedKey(prev => (prev === key ? null : key));
  };

  const updateCategoryTitle = (categoryIndex: number, title: string) => {
    setCategories(prev => prev.map((category, index) => (index === categoryIndex ? { ...category, title } : category)));
  };

  const toggleCategory = (categoryIndex: number, selected: boolean) => {
    setCategories(prev => prev.map((category, index) => (
      index === categoryIndex
        ? { ...category, items: category.items.map(item => ({ ...item, selected })) }
        : category
    )));
  };

  const toggleItem = (categoryIndex: number, itemIndex: number, selected: boolean) => {
    setCategories(prev => prev.map((category, index) => {
      if (index !== categoryIndex) return category;
      return {
        ...category,
        items: category.items.map((item, i) => (i === itemIndex ? { ...item, selected } : item))
      };
    }));
  };

  const addCategory = () => {
    const key = createKey();
    setCategories(prev => [
      ...prev,
      {
        key,
        title: 'Nova categoria',
        items: [{ title: 'Nova melhoria', description: '', icon: 'Sparkles', accent: WHATS_NEW_ACCENTS[0].value, selected: true }]
      }
    ]);
    setExpandedKey(key);
  };

  const removeCategory = (categoryIndex: number) => {
    const target = categories[categoryIndex];
    const next = categories.filter((_, index) => index !== categoryIndex);
    setCategories(next);
    if (target && expandedKey === target.key) {
      setExpandedKey(next[Math.min(categoryIndex, next.length - 1)]?.key ?? null);
    }
  };

  const moveCategory = (categoryIndex: number, direction: -1 | 1) => {
    setCategories(prev => {
      const target = categoryIndex + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[categoryIndex], next[target]] = [next[target], next[categoryIndex]];
      return next;
    });
  };

  const updateItem = (categoryIndex: number, itemIndex: number, updates: Partial<DraftItem>) => {
    setCategories(prev => prev.map((category, index) => {
      if (index !== categoryIndex) return category;
      return {
        ...category,
        items: category.items.map((item, i) => (i === itemIndex ? { ...item, ...updates } : item))
      };
    }));
  };

  const addItem = (categoryIndex: number) => {
    setCategories(prev => prev.map((category, index) => {
      if (index !== categoryIndex) return category;
      return {
        ...category,
        items: [...category.items, { title: 'Nova melhoria', description: '', icon: 'Sparkles', accent: WHATS_NEW_ACCENTS[0].value, selected: true }]
      };
    }));
  };

  const removeItem = (categoryIndex: number, itemIndex: number) => {
    setCategories(prev => prev.map((category, index) => {
      if (index !== categoryIndex) return category;
      return { ...category, items: category.items.filter((_, i) => i !== itemIndex) };
    }));
  };

  const moveItem = (categoryIndex: number, itemIndex: number, direction: -1 | 1) => {
    setCategories(prev => prev.map((category, index) => {
      if (index !== categoryIndex) return category;
      const target = itemIndex + direction;
      if (target < 0 || target >= category.items.length) return category;
      const items = [...category.items];
      [items[itemIndex], items[target]] = [items[target], items[itemIndex]];
      return { ...category, items };
    }));
  };

  const handlePublish = async () => {
    const cleaned = categories
      .map(category => ({
        title: category.title.trim(),
        items: category.items
          .filter(item => item.selected)
          .map(item => ({
            title: item.title.trim(),
            description: sanitizeRichText(item.description).trim(),
            icon: item.icon,
            accent: item.accent
          }))
          .filter(item => item.title.length > 0)
      }))
      .filter(category => category.title.length > 0 && category.items.length > 0);

    if (cleaned.length === 0) {
      showToast('error', 'Selecione ao menos uma novidade para publicar.');
      return;
    }

    setPublishing(true);
    try {
      const { newId } = await publishWhatsNew({ content: cleaned, publishedBy: currentUserName });
      setLastPublishedId(newId);
      setLastPublishedAt(new Date());
      showToast('success', `Novidades publicadas com sucesso (versão ${newId}).`);
    } catch (error) {
      console.error('Erro ao publicar novidades:', error);
      showToast('error', 'Não foi possível publicar as novidades. Tente novamente.');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando novidades publicadas...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">Gerenciar Novidades</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Marque as melhorias que devem aparecer no pop-up e clique em publicar. O rascunho é salvo automaticamente e as não marcadas ficam guardadas para uma próxima publicação.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                {lastPublishedId === null ? 'Nenhuma versão publicada' : `Versão publicada: ${lastPublishedId}`}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formatTimestamp(lastPublishedAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                {categories.length} categoria(s) · {totalItems} melhoria(s)
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                {selectedItems} selecionada(s) para publicar
              </span>
              {isDemo ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                  Modo demonstração · rascunho não é salvo
                </span>
              ) : saveState === 'saving' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Salvando rascunho...
                </span>
              ) : saveState === 'error' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Falha ao salvar rascunho
                </span>
              ) : saveState === 'saved' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Rascunho salvo
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid w-full shrink-0 grid-cols-2 gap-2 xl:flex xl:w-auto xl:flex-wrap xl:justify-end">
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 xl:px-4"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            disabled={selectedItems === 0}
            className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 xl:px-4"
          >
            <Eye className="h-4 w-4" />
            Pré-visualizar
          </button>
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={publishing || selectedItems === 0}
            className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 xl:col-auto"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Publicar novidades
          </button>
        </div>
      </header>

      <div className="space-y-5">
        {categories.map((category, categoryIndex) => {
          const isExpanded = expandedKey === category.key;
          const panelId = `whatsnew-category-${category.key}`;
          const allSelected = category.items.length > 0 && category.items.every(item => item.selected);
          const someSelected = category.items.some(item => item.selected);
          const selectedInCategory = category.items.filter(item => item.selected).length;

          return (
            <section key={category.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(category.key)}
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    aria-label={isExpanded ? `Recolher ${category.title || 'categoria'}` : `Expandir ${category.title || 'categoria'}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCategory(categoryIndex, !allSelected)}
                    role="checkbox"
                    aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
                    aria-label={`Selecionar todas as melhorias de ${category.title || 'categoria'}`}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${allSelected || someSelected ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'}`}
                  >
                    {allSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                  </button>
                  <span className="hidden text-xs font-bold uppercase tracking-widest text-slate-400 sm:inline">Categoria</span>
                  {isExpanded ? (
                    <input
                      type="text"
                      value={category.title}
                      onChange={event => updateCategoryTitle(categoryIndex, event.target.value)}
                      placeholder="Título da categoria"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(category.key)}
                      className="min-w-0 flex-1 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {category.title.trim() || 'Sem título'}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {category.items.length} melhoria(s) · {selectedInCategory} selecionada(s)
                      </span>
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => moveCategory(categoryIndex, -1)}
                    disabled={categoryIndex === 0}
                    aria-label="Mover categoria para cima"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCategory(categoryIndex, 1)}
                    disabled={categoryIndex === categories.length - 1}
                    aria-label="Mover categoria para baixo"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCategory(categoryIndex)}
                    aria-label="Remover categoria"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div id={panelId} className="mt-4 space-y-4">
                  {category.items.map((item, itemIndex) => {
                    const ItemIcon = getWhatsNewIcon(item.icon);
                    return (
                      <div
                        key={itemIndex}
                        className={`rounded-xl border p-4 transition-colors ${item.selected ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-100 bg-slate-50/40 opacity-90'}`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => toggleItem(categoryIndex, itemIndex, !item.selected)}
                            role="checkbox"
                            aria-checked={item.selected}
                            aria-label={`Incluir "${item.title || 'melhoria'}" na publicação`}
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${item.selected ? 'text-emerald-600 hover:bg-emerald-100/60' : 'text-slate-300 hover:bg-slate-100'}`}
                          >
                            {item.selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                          </button>
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${getWhatsNewAccent(item.accent)}`}>
                            <ItemIcon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item.title}
                                onChange={event => updateItem(categoryIndex, itemIndex, { title: event.target.value })}
                                placeholder="Título da melhoria"
                                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                              />
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveItem(categoryIndex, itemIndex, -1)}
                                  disabled={itemIndex === 0}
                                  aria-label="Mover melhoria para cima"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveItem(categoryIndex, itemIndex, 1)}
                                  disabled={itemIndex === category.items.length - 1}
                                  aria-label="Mover melhoria para baixo"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeItem(categoryIndex, itemIndex)}
                                  aria-label="Remover melhoria"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <RichTextEditor
                              value={item.description}
                              onChange={description => updateItem(categoryIndex, itemIndex, { description })}
                              placeholder="Descreva o que a melhoria faz e onde ela fica."
                            />
                            <p className="text-xs text-slate-400">Use a barra para destacar trechos e organizar a descrição em listas.</p>

                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                                Ícone
                                <select
                                  value={item.icon}
                                  onChange={event => updateItem(categoryIndex, itemIndex, { icon: event.target.value })}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                >
                                  {WHATS_NEW_ICON_OPTIONS.map(iconName => (
                                    <option key={iconName} value={iconName}>{iconName}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                                Cor
                                <select
                                  value={item.accent}
                                  onChange={event => updateItem(categoryIndex, itemIndex, { accent: event.target.value })}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                >
                                  {WHATS_NEW_ACCENTS.map(accent => (
                                    <option key={accent.value} value={accent.value}>{accent.label}</option>
                                  ))}
                                  {!WHATS_NEW_ACCENTS.some(accent => accent.value === item.accent) && (
                                    <option value={item.accent}>Personalizada</option>
                                  )}
                                </select>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => addItem(categoryIndex)}
                    className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-500 transition-colors hover:border-emerald-400 hover:text-emerald-600"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar melhoria
                  </button>
                </div>
              )}
            </section>
          );
        })}

        <button
          type="button"
          onClick={addCategory}
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-bold text-slate-500 transition-colors hover:border-emerald-400 hover:text-emerald-600"
        >
          <Plus className="h-4 w-4" />
          Adicionar categoria
        </button>
      </div>

      <WhatsNewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        content={categories
          .map(category => ({ title: category.title, items: category.items.filter(item => item.selected) }))
          .filter(category => category.items.length > 0)}
        publishedId={null}
      />
    </div>
  );
}
