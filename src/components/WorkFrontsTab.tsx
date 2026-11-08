import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, ClipboardCheck, Plus, Search, X } from 'lucide-react';
import type { UserRole, WorkFront, WorkFrontOperation } from '../types';
import { isAdminRole } from '../utils/roles';

interface WorkFrontsTabProps {
  workFronts: WorkFront[];
  role: UserRole;
  onAdd: (front: Omit<WorkFront, 'id' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
  onEdit: (id: string, changes: Partial<WorkFront>) => Promise<void>;
}

const operationOptions: WorkFrontOperation[] = ['Colheita', 'Vinhaça', 'Plantio', 'Tratos culturais', 'Outra'];

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${checked ? 'bg-emerald-600' : 'bg-slate-300'}`}
  >
    <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>;
}

export default function WorkFrontsTab({ workFronts, role, onAdd, onEdit }: WorkFrontsTabProps) {
  const canManage = isAdminRole(role);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<WorkFront | 'new' | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [operationType, setOperationType] = useState<WorkFrontOperation>('Colheita');
  const [collectsFieldData, setCollectsFieldData] = useState(true);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => workFronts.filter(front =>
    [front.name, front.code, front.operationType].filter(Boolean).some(value => value!.toLowerCase().includes(query.trim().toLowerCase()))
  ).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [workFronts, query]);

  const begin = (front?: WorkFront) => {
    setEditor(front || 'new');
    setName(front?.name || ''); setCode(front?.code || '');
    setOperationType(front?.operationType || 'Colheita');
    setCollectsFieldData(front?.collectsFieldData ?? true); setActive(front?.active ?? true);
  };
  const close = () => !saving && setEditor(null);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), code: code.trim(), operationType, collectsFieldData, active };
      if (editor === 'new') await onAdd(payload);
      else if (editor) await onEdit(editor.id, payload);
      setEditor(null);
    } finally { setSaving(false); }
  };

  return <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <section className="border-b border-slate-200 pb-5 sm:flex sm:items-end sm:justify-between sm:gap-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Frentes de trabalho</h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">Defina as operações da empresa e escolha quais participam do recolhimento semanal.</p>
      </div>
      {canManage && <button onClick={() => begin()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:mt-0"><Plus className="h-4 w-4" />Nova frente</button>}
    </section>

    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-700"><span className="tabular-nums">{filtered.length}</span> {filtered.length === 1 ? 'frente cadastrada' : 'frentes cadastradas'}</p>
        <label className="relative block sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome, código ou operação" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label>
      </div>
      {filtered.length === 0 ? <div className="px-6 py-16 text-center"><ClipboardCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-slate-700">Nenhuma frente encontrada</p><p className="mt-1 text-sm text-slate-500">Cadastre uma frente para controlar sua participação na coleta.</p></div> :
        <div className="divide-y divide-slate-100">
          {filtered.map(front => <button key={front.id} onClick={() => canManage && begin(front)} disabled={!canManage} className="group flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 disabled:cursor-default sm:px-6">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${front.collectsFieldData && front.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><ClipboardCheck className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-bold text-slate-900">{front.name}</span>{front.code && <span className="text-xs font-medium text-slate-500">{front.code}</span>}</span><span className="mt-0.5 block text-sm text-slate-500">{front.operationType} · {front.collectsFieldData && front.active ? 'Participa da coleta semanal' : front.active ? 'Fora da coleta semanal' : 'Inativa'}</span></span>
            {front.collectsFieldData && front.active && <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 sm:inline-flex"><Check className="h-3.5 w-3.5" />Coleta</span>}
            {canManage && <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />}
          </button>)}
        </div>}
    </section>

    {editor && <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/40 p-0 sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="work-front-editor-title">
      <form onSubmit={save} className="w-full rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-5"><div><h2 id="work-front-editor-title" className="text-lg font-bold text-slate-900">{editor === 'new' ? 'Nova frente de trabalho' : 'Editar frente de trabalho'}</h2><p className="mt-1 text-sm text-slate-500">A vinculação nas máquinas define a coleta semanal.</p></div><button type="button" onClick={close} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button></div>
        <div className="space-y-4 px-5 py-5"><label className="block text-sm font-bold text-slate-700">Nome da frente<input autoFocus required maxLength={128} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Frente 10" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label>
          <div className="grid gap-4 sm:grid-cols-[0.7fr_1.3fr]"><label className="block text-sm font-bold text-slate-700">Código<input maxLength={32} value={code} onChange={e => setCode(e.target.value)} placeholder="Opcional" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label><label className="block text-sm font-bold text-slate-700">Operação<select value={operationType} onChange={e => setOperationType(e.target.value as WorkFrontOperation)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100">{operationOptions.map(option => <option key={option}>{option}</option>)}</select></label></div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3.5"><div><span className="block text-sm font-bold text-slate-800">Participa da coleta semanal</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Máquinas desta frente aparecerão no recolhimento.</span></div><Switch checked={collectsFieldData} onChange={() => setCollectsFieldData(value => !value)} label="Alternar participação na coleta semanal" /></div>
          {editor !== 'new' && <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3.5"><div><span className="block text-sm font-bold text-slate-800">Frente ativa</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Inative para preservar vínculos sem permitir novos usos.</span></div><Switch checked={active} onChange={() => setActive(value => !value)} label="Alternar frente ativa" /></div>}</div>
        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4"><button type="button" disabled={saving} onClick={close} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancelar</button><button disabled={saving} className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar frente'}</button></div>
      </form>
    </div>}
  </div>;
}
