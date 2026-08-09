import React, { useState } from 'react';
import { 
  AutopilotComponent, 
  Machine, 
  MovementAction, 
  MovementLog, 
  UserRole 
} from '../types';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  Wrench, 
  Check, 
  X, 
  Calendar, 
  FileText, 
  AlertCircle 
} from 'lucide-react';

interface MovementsTabProps {
  movements: MovementLog[];
  components: AutopilotComponent[];
  machines: Machine[];
  role: UserRole;
  currentUserId: string;
  currentUserName: string;
  onAddMovement: (log: Omit<MovementLog, 'id' | 'technicianId' | 'technicianName' | 'createdAt'>) => Promise<void>;
}

export default function MovementsTab({
  movements,
  components,
  machines,
  role,
  currentUserId,
  currentUserName,
  onAddMovement
}: MovementsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [componentId, setComponentId] = useState('');
  const [machinePrefix, setMachinePrefix] = useState('');
  const [action, setAction] = useState<MovementAction>('Instalação');
  const [notes, setNotes] = useState('');
  const [dateStr, setDateStr] = useState(new Date().toISOString().substring(0, 16)); // YYYY-MM-DDTHH:MM

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset form
  const resetForm = () => {
    setComponentId('');
    setMachinePrefix('');
    setAction('Instalação');
    setNotes('');
    setDateStr(new Date().toISOString().substring(0, 16));
    setError(null);
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

    // Validation for specific actions
    if (action === 'Instalação' && !machinePrefix) {
      setError('Para instalação, você precisa especificar uma máquina destino.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await onAddMovement({
        componentId,
        componentSerial: selectedComp.serialNumber,
        componentName: selectedComp.name,
        machinePrefix: action === 'Instalação' ? machinePrefix : 'Almoxarifado',
        action,
        date: new Date(dateStr).toISOString(),
        notes: notes.trim()
      });

      setSuccess('Serviço/Movimentação lançado com sucesso! Inventário atualizado.');
      setTimeout(() => {
        setIsAdding(false);
        resetForm();
        setSuccess(null);
      }, 1500);

    } catch (err: any) {
      setError(err.message || 'Erro ao lançar movimentação.');
    } finally {
      setLoading(false);
    }
  };

  // Sort movements newest first
  const sortedMovements = [...movements].sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
    const dateB = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
    return dateB - dateA;
  });

  const filteredMovements = sortedMovements.filter(m => {
    const matchesSearch = m.componentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          m.componentSerial.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.machinePrefix.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.technicianName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = actionFilter === 'all' ? true : m.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  // Filter components that are available for installation
  const availableComponents = components.filter(c => c.status === 'Disponível');
  // Filter components that are in use (to remove or maintain)
  const activeComponents = components.filter(c => c.status === 'Em Uso');

  // Find currently selected component status
  const currentSelectedComp = components.find(c => c.id === componentId);

  return (
    <div className="space-y-6" id="movements-tab">
      
      {/* Header and Add Button */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Movimentações e Serviços de Campo</h1>
          <p className="text-slate-500 text-xs mt-1">
            Lance instalações em tratores/colhedoras, remoções, calibrações de sinal ou ordens de manutenção.
          </p>
        </div>

        {!isAdding && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setIsAdding(true); resetForm(); }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 animate-pulse"
              id="open-add-movement-form"
            >
              <Plus className="h-4 w-4" />
              Lançar Novo Serviço
            </button>
          </div>
        )}
      </div>

      {/* Lançamento Form Area */}
      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-md animate-fade-in" id="add-movement-form-block">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-md font-bold text-slate-900 flex items-center gap-1.5">
              <ClipboardList className="h-5 w-5 text-emerald-600" />
              Lançamento Técnico de Serviço (Ordem de Serviço)
            </h2>
            <button onClick={() => setIsAdding(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && <p className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl text-xs mb-4">{error}</p>}
          {success && <p className="bg-emerald-50 border border-emerald-200 text-emerald-600 p-3 rounded-xl text-xs mb-4">{success}</p>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Action type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Atividade *</label>
                <select
                  value={action}
                  onChange={(e) => {
                    setAction(e.target.value as MovementAction);
                    setComponentId(''); // Reset selected component as pool changes
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

              {/* Date selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Data/Hora da Operação *</label>
                <div className="relative rounded-xl shadow-sm">
                  <input
                    type="datetime-local"
                    required
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                    id="input-movement-date"
                  />
                </div>
              </div>

              {/* Component selection based on action */}
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
                    // Pre-fill active machine prefix if removing/calibrating
                    const selected = components.find(c => c.id === id);
                    if (selected && selected.currentMachine) {
                      setMachinePrefix(selected.currentMachine);
                    } else {
                      setMachinePrefix('');
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                  id="select-movement-component"
                >
                  <option value="">-- Selecione o Componente --</option>
                  
                  {action === 'Instalação' ? (
                    availableComponents.map(c => (
                      <option key={c.id} value={c.id}>{c.brand} {c.name} (S/N: {c.serialNumber})</option>
                    ))
                  ) : action === 'Remoção' || action === 'Calibração' ? (
                    // Removing/calibrating can target active components
                    activeComponents.map(c => (
                      <option key={c.id} value={c.id}>{c.brand} {c.name} (S/N: {c.serialNumber}) - Instalado em: {c.currentMachine}</option>
                    ))
                  ) : (
                    // Maintenance can target any active or available component
                    components.filter(c => c.status !== 'Descartado').map(c => (
                      <option key={c.id} value={c.id}>{c.brand} {c.name} (S/N: {c.serialNumber}) - Status: {c.status}</option>
                    ))
                  )}
                </select>
                {action === 'Instalação' && availableComponents.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">Nenhum componente disponível em estoque para instalação direta. Cadastre novos equipamentos ou remova algum existente.</p>
                )}
              </div>

              {/* Machine selection (Only needed for Installation or Removal/Calibration lookup) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Máquina do Campo * {action === 'Instalação' ? '(Selecione para instalar)' : '(Identificado automaticamente)'}
                </label>
                {action === 'Instalação' ? (
                  <select
                    required
                    value={machinePrefix}
                    onChange={(e) => setMachinePrefix(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                    id="select-movement-machine"
                  >
                    <option value="">-- Selecione a Máquina da Usina --</option>
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

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notas Técnicas / Observações / Diagnóstico</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: Realizada calibração de sinal RTX. Antena acoplada no teto do trator prefixo T01. Sinais operacionais normais."
                id="textarea-movement-notes"
              />
            </div>

            {/* Submission information summary */}
            <div className="bg-slate-50 p-3 rounded-xl text-[11px] text-slate-500 flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" />
              <span>
                Log assinado por: <strong>{currentUserName}</strong> ({(role === 'administrador' || role === 'ADMINISTRADOR') ? 'Administrador' : 'Técnico'}). Este registro fará parte do livro de auditoria e não poderá ser alterado posteriormente.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                id="submit-movement-btn"
              >
                {loading ? 'Lançando...' : 'Registrar Serviço'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Movements Filters */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        
        {/* Search input */}
        <div className="flex-1 relative rounded-xl shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
            placeholder="Buscar histórico por equipamento, S/N, prefixo de veículo ou técnico..."
            id="search-movements-input"
          />
        </div>

        {/* Action filter */}
        <div className="w-full md:w-56 flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap uppercase">Atividade:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="block w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none"
            id="filter-movement-action-select"
          >
            <option value="all">Todas as Atividades</option>
            <option value="Instalação">Instalações</option>
            <option value="Remoção">Remoções</option>
            <option value="Manutenção">Manutenções</option>
            <option value="Calibração">Calibrações</option>
          </select>
        </div>

      </div>

      {/* Log list display */}
      {filteredMovements.length === 0 ? (
        <div className="bg-white p-12 text-center border border-slate-200 rounded-2xl text-slate-400 text-sm">
          Nenhuma movimentação ou atividade técnica registrada corresponde aos filtros.
        </div>
      ) : (
        <>
        {/* Mobile Cards */}
        <div className="md:hidden grid grid-cols-1 gap-4" id="movements-mobile-cards">
          {filteredMovements.map((move) => {
            let actionBadge = 'bg-slate-100 text-slate-700 border-slate-200';
            if (move.action === 'Instalação') actionBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';
            if (move.action === 'Remoção') actionBadge = 'bg-slate-100 text-slate-700 border-slate-200';
            if (move.action === 'Manutenção') actionBadge = 'bg-amber-50 text-amber-700 border-amber-100';
            if (move.action === 'Calibração') actionBadge = 'bg-indigo-50 text-indigo-700 border-indigo-100';

            const moveDate = move.date?.toDate ? move.date.toDate() : new Date(move.date);

            return (
              <div key={move.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${actionBadge}`}>
                    {move.action}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap">
                    {moveDate.toLocaleDateString('pt-BR')} {moveDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900">{move.componentName}</h3>
                  <p className="text-[10px] text-slate-500 font-mono font-medium mt-0.5">S/N: {move.componentSerial}</p>
                </div>

                <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3">
                  <p className="text-slate-600">
                    <span className="text-slate-400 font-medium">Veículo Alvo:</span>{' '}
                    {move.machinePrefix === 'Almoxarifado' ? (
                      <span className="text-slate-400 italic">Almoxarifado</span>
                    ) : (
                      <span className="font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md inline-block w-fit">
                        {move.machinePrefix}
                      </span>
                    )}
                  </p>
                  <p className="text-slate-600">
                    <span className="text-slate-400 font-medium">Técnico:</span> {move.technicianName}
                  </p>
                  {move.notes && (
                    <p className="text-slate-600 leading-relaxed italic border-l-2 border-slate-200 pl-2 mt-1">
                      {move.notes}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="movements-table-container">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Operação</th>
                  <th className="py-3 px-4">Equipamento GPS</th>
                  <th className="py-3 px-4">S/N</th>
                  <th className="py-3 px-4">Veículo Alvo</th>
                  <th className="py-3 px-4">Técnico Operador</th>
                  <th className="py-3 px-4">Observações Técnicas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700" id="movements-table-body">
                {filteredMovements.map((move) => {
                  let actionBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                  if (move.action === 'Instalação') actionBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                  if (move.action === 'Remoção') actionBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                  if (move.action === 'Manutenção') actionBadge = 'bg-amber-50 text-amber-700 border-amber-100';
                  if (move.action === 'Calibração') actionBadge = 'bg-indigo-50 text-indigo-700 border-indigo-100';

                  const moveDate = move.date?.toDate ? move.date.toDate() : new Date(move.date);

                  return (
                    <tr key={move.id} className="hover:bg-slate-50/50 transition-colors align-top">
                      <td className="py-3.5 px-4 font-medium text-slate-500 whitespace-nowrap">
                        {moveDate.toLocaleDateString('pt-BR')} {moveDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${actionBadge}`}>
                          {move.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {move.componentName}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-500">
                        {move.componentSerial}
                      </td>
                      <td className="py-3.5 px-4">
                        {move.machinePrefix === 'Almoxarifado' ? (
                          <span className="text-slate-400 italic">Almoxarifado</span>
                        ) : (
                          <span className="font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                            {move.machinePrefix}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {move.technicianName}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs text-slate-600 leading-normal italic">
                        {move.notes ? `"${move.notes}"` : <span className="text-slate-300">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

    </div>
  );
}
