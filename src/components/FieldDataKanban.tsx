import React, { useState } from 'react';
import { Machine, FieldDataCollection, UserRole } from '../types';
import { 
  getISOWeekId, 
  isLateInWeek, 
  getWeekFormattedLabel, 
  getDayOfWeekNumber 
} from '../utils/dateUtils';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Search, 
  Calendar, 
  Layers, 
  CheckCheck, 
  HelpCircle,
  Tractor,
  Activity,
  X,
  Filter
} from 'lucide-react';

interface FieldDataKanbanProps {
  machines: Machine[];
  fieldDataCollections: FieldDataCollection[];
  role: UserRole;
  currentUserName: string;
  initialStatusFilter?: 'Pendente' | 'Concluído';
  onToggleCollectionStatus: (machine: Machine, targetWeekId: string, currentStatus: 'Pendente' | 'Concluído') => Promise<void>;
  onBulkCompleteFrente?: (frenteMachines: Machine[], targetWeekId: string) => Promise<void>;
}

export default function FieldDataKanban({
  machines,
  fieldDataCollections,
  role,
  currentUserName,
  initialStatusFilter,
  onToggleCollectionStatus,
  onBulkCompleteFrente
}: FieldDataKanbanProps) {
  const currentWeekId = getISOWeekId(new Date());
  const lateInWeek = isLateInWeek(new Date());
  const dayNum = getDayOfWeekNumber(new Date());

  const [selectedWeekId, setSelectedWeekId] = useState<string>(currentWeekId);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pendente' | 'Concluído'>(initialStatusFilter || 'all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Group machines by fleet/frente
  const fleeteGroups: { [fleet: string]: Machine[] } = {};
  machines.forEach(m => {
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

  // Calculations for current selected week
  const totalMachinesCount = machines.length;
  const completedMachinesCount = machines.filter(m => getMachineStatus(m.id) === 'Concluído').length;
  const pendingMachinesCount = totalMachinesCount - completedMachinesCount;
  const coveragePercent = totalMachinesCount > 0 ? Math.round((completedMachinesCount / totalMachinesCount) * 100) : 0;

  // Toggle machine collection status
  const handleCardClick = async (machine: Machine) => {
    const currentStatus = getMachineStatus(machine.id);
    setUpdatingId(machine.id);
    try {
      await onToggleCollectionStatus(machine, selectedWeekId, currentStatus);
    } catch (err) {
      console.error("Erro ao alterar status de recolhimento:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Bulk complete all machines in a frente
  const handleBulkComplete = async (frenteName: string, frenteMachines: Machine[]) => {
    if (!onBulkCompleteFrente) return;
    const pendingInFrente = frenteMachines.filter(m => getMachineStatus(m.id) === 'Pendente');
    if (pendingInFrente.length === 0) return;

    if (window.confirm(`Deseja marcar todas as ${pendingInFrente.length} máquina(s) da "${frenteName}" como CONCLUÍDAS para a ${getWeekFormattedLabel(selectedWeekId)}?`)) {
      setUpdatingId(frenteName);
      try {
        await onBulkCompleteFrente(pendingInFrente, selectedWeekId);
      } catch (err) {
        console.error("Erro no recolhimento em lote:", err);
      } finally {
        setUpdatingId(null);
      }
    }
  };

  const dayNames = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  const currentDayName = dayNames[dayNum - 1] || '';

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
    const frentePercent = totalInFrente > 0 ? Math.round((completedInFrente / totalInFrente) * 100) : 0;
    const isFrenteComplete = completedInFrente === totalInFrente && totalInFrente > 0;

    return (
      <div 
        key={frenteName} 
        className={`bg-white rounded-2xl border ${isFrenteComplete ? 'border-emerald-300 shadow-sm' : 'border-slate-200 shadow-sm'} overflow-hidden transition-all duration-200`}
      >
        {/* Frente Header */}
        <div className={`p-4 border-b ${isFrenteComplete ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}>
          <div className="flex justify-between items-center mb-1.5">
            <h4 className="font-black text-sm flex items-center gap-1.5 truncate">
              <Layers className="h-4 w-4 text-emerald-400" />
              {frenteName}
            </h4>
            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${isFrenteComplete ? 'bg-white text-emerald-800' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
              {completedInFrente}/{totalInFrente} ({frentePercent}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2 border border-white/10">
            <div 
              className={`h-full transition-all duration-300 ${isFrenteComplete ? 'bg-white' : 'bg-emerald-400'}`} 
              style={{ width: `${frentePercent}%` }}
            />
          </div>

          {/* Bulk Complete Button */}
          {!isFrenteComplete && onBulkCompleteFrente && (
            <button
              onClick={() => handleBulkComplete(frenteName, allMachinesInFrente)}
              disabled={updatingId === frenteName}
              className="mt-3 w-full py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded-xl text-[11px] font-bold border border-emerald-500/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {updatingId === frenteName ? 'Processando...' : 'Concluir Toda a Frente'}
            </button>
          )}
        </div>

        {/* Machine Cards List inside Frente */}
        <div className="p-3 space-y-2.5 max-h-[500px] overflow-y-auto bg-slate-50/50">
          {filteredMachines.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-xs italic">
              Nenhuma máquina encontrada na busca.
            </div>
          ) : (
            filteredMachines.map(machine => {
              const status = getMachineStatus(machine.id);
              const isCompleted = status === 'Concluído';
              const rec = getCollectionRecord(machine.id);

              let cardStyle = '';
              let badgeStyle = '';
              let statusIcon = null;

              if (isCompleted) {
                cardStyle = 'bg-emerald-50 border-emerald-300 hover:border-emerald-400 text-slate-900 shadow-2xs';
                badgeStyle = 'bg-emerald-600 text-white';
                statusIcon = <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
              } else if (lateInWeek) {
                cardStyle = 'bg-rose-50 border-rose-300 hover:border-rose-400 text-slate-900 shadow-2xs';
                badgeStyle = 'bg-rose-600 text-white font-bold';
                statusIcon = <AlertTriangle className="h-4 w-4 text-rose-600" />;
              } else {
                cardStyle = 'bg-amber-50/80 border-amber-300 hover:border-amber-400 text-slate-900 shadow-2xs';
                badgeStyle = 'bg-amber-500 text-white font-bold';
                statusIcon = <Clock className="h-4 w-4 text-amber-600" />;
              }

              return (
                <div
                  key={machine.id}
                  onClick={() => handleCardClick(machine)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${cardStyle} hover:shadow-md ${updatingId === machine.id ? 'opacity-50 pointer-events-none' : ''}`}
                  id={`kanban-machine-${machine.prefix}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Tractor className="h-4 w-4 text-slate-600" />
                        <span className="font-black text-sm text-slate-900 tracking-tight">
                          {machine.prefix}
                        </span>
                        <span className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-bold">
                          {machine.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                        {machine.brand} {machine.model}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {statusIcon}
                    </div>
                  </div>

                  {/* Status Footer */}
                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                    <span className={`px-2 py-0.5 rounded-md font-bold ${badgeStyle}`}>
                      {isCompleted ? '✓ Concluído' : lateInWeek ? '⚠️ Pendente (Fim de Semana)' : '🕒 Pendente'}
                    </span>

                    {isCompleted && rec?.collectedAt && (
                      <span className="text-[10px] text-emerald-800 font-semibold truncate max-w-[120px]" title={`Recolhido por ${rec.collectedBy || 'Técnico'}`}>
                        {new Date(rec.collectedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} {new Date(rec.collectedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {/* Hover Prompt */}
                  <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 rounded-xl transition-opacity flex items-center justify-center pointer-events-none">
                    <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-md">
                      Clique para alternar status
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6" id="field-data-kanban-container">
      
      {/* Header Banner & Cycle Info */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-3xl text-white shadow-md border border-slate-700">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold tracking-wider uppercase flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Ciclo Semanal Ativo
              </span>
              <span className="text-slate-300 text-xs font-semibold">
                {getWeekFormattedLabel(selectedWeekId)} ({selectedWeekId})
              </span>
            </div>
            <h2 className="text-xl font-black mt-2 tracking-tight flex items-center gap-2">
              Kanban de Recolhimento de Dados de Campo
            </h2>
            <p className="text-slate-300 text-xs mt-1 max-w-2xl leading-relaxed">
              Recolha a telemetria das máquinas. À medida que você conclui os dados das máquinas, a Frente de Trabalho avança automaticamente de <strong>Pendente</strong> para <strong>Em Andamento</strong> e <strong>Concluído</strong>.
            </p>
          </div>

          {/* KPI Summary Cards */}
          <div className="flex flex-wrap items-center gap-3 self-stretch lg:self-auto">
            {/* Total */}
            <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 text-center min-w-[100px] flex-1 lg:flex-initial">
              <span className="block text-[10px] uppercase font-bold text-slate-300">Total Frota</span>
              <span className="text-lg font-black text-white">{totalMachinesCount}</span>
            </div>

            {/* Concluídas */}
            <div className="bg-emerald-500/20 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-emerald-500/30 text-center min-w-[100px] flex-1 lg:flex-initial">
              <span className="block text-[10px] uppercase font-bold text-emerald-300">Concluídas</span>
              <span className="text-lg font-black text-emerald-300">{completedMachinesCount}</span>
            </div>

            {/* Pendentes */}
            <div className={`backdrop-blur-md px-4 py-2.5 rounded-2xl border text-center min-w-[100px] flex-1 lg:flex-initial ${lateInWeek && pendingMachinesCount > 0 ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 animate-pulse' : 'bg-amber-500/20 border-amber-500/30 text-amber-300'}`}>
              <span className="block text-[10px] uppercase font-bold">Pendentes</span>
              <span className="text-lg font-black">{pendingMachinesCount}</span>
            </div>

            {/* Coverage % */}
            <div className="bg-indigo-500/20 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-indigo-500/30 text-center min-w-[100px] flex-1 lg:flex-initial">
              <span className="block text-[10px] uppercase font-bold text-indigo-300">Cobertura</span>
              <span className="text-lg font-black text-indigo-200">{coveragePercent}%</span>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="w-full sm:w-2/3 flex items-center gap-3">
            <span className="text-[11px] font-bold text-slate-300 whitespace-nowrap">Progresso da Semana:</span>
            <div className="w-full bg-slate-700/80 h-3 rounded-full overflow-hidden p-0.5 border border-white/10">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${coveragePercent}%` }}
              />
            </div>
            <span className="text-xs font-bold text-emerald-400 whitespace-nowrap">{coveragePercent}%</span>
          </div>

          <div className="text-[11px] text-slate-300 flex items-center gap-2 self-end sm:self-auto">
            <span className="font-semibold">Dia atual: {currentDayName}</span>
            {lateInWeek ? (
              <span className="bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded-md font-bold text-[10px] border border-rose-500/40 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Fim de semana (Atenção!)
              </span>
            ) : (
              <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md font-bold text-[10px] border border-amber-500/30 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Em andamento
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Email Alert Automation */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4" id="kanban-control-bar">

        {/* Active status filter chip (arrived from dashboard card) */}
        {statusFilter !== 'all' && (
          <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-emerald-800 font-semibold">
              <Filter className="h-4 w-4 text-emerald-600 shrink-0" />
              Filtro ativo: máquinas {statusFilter === 'Concluído' ? 'concluídas' : 'pendentes'}
            </div>
            <button
              onClick={() => setStatusFilter('all')}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold hover:bg-emerald-100 transition-all cursor-pointer"
              title="Limpar filtro e mostrar todas as máquinas"
            >
              <X className="h-3.5 w-3.5" />
              Limpar filtro
            </button>
          </div>
        )}

        {/* Top Control Line: Search + Help Hint */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="relative w-full lg:w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Buscar máquinas por prefixo ou modelo..."
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <HelpCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Clique em qualquer máquina para concluir o recolhimento. A frente avança automaticamente entre os quadros!</span>
          </div>
        </div>

      </div>

      {/* THE 3 KANBAN QUADROS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start" id="kanban-3-quadros">
        
        {/* QUADRO 1: PENDENTE */}
        <div className="bg-slate-100/80 p-4 rounded-2xl border border-amber-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center bg-amber-500 text-white px-4 py-3 rounded-xl shadow-xs">
            <div className="flex items-center gap-2 font-black text-sm">
              <Clock className="h-4 w-4 text-white" />
              <span>1. Pendente</span>
            </div>
            <span className="bg-white text-amber-900 font-bold text-xs px-2.5 py-0.5 rounded-full shadow-2xs">
              {frentesPendente.length} {frentesPendente.length === 1 ? 'frente' : 'frentes'}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 px-1 font-medium">
            Frentes com 0% das máquinas recolhidas.
          </p>

          <div className="space-y-4 min-h-[200px]">
            {frentesPendente.length === 0 ? (
              <div className="bg-white p-8 text-center rounded-2xl border border-dashed border-amber-200 text-slate-400 text-xs">
                Nenhuma frente totalmente pendente.
              </div>
            ) : (
              frentesPendente.map(frenteName => renderFrenteCard(frenteName))
            )}
          </div>
        </div>

        {/* QUADRO 2: EM ANDAMENTO */}
        <div className="bg-slate-100/80 p-4 rounded-2xl border border-blue-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center bg-blue-600 text-white px-4 py-3 rounded-xl shadow-xs">
            <div className="flex items-center gap-2 font-black text-sm">
              <Activity className="h-4 w-4 text-white" />
              <span>2. Em andamento</span>
            </div>
            <span className="bg-white text-blue-900 font-bold text-xs px-2.5 py-0.5 rounded-full shadow-2xs">
              {frentesEmAndamento.length} {frentesEmAndamento.length === 1 ? 'frente' : 'frentes'}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 px-1 font-medium">
            Frentes com recolhimento parcial iniciado.
          </p>

          <div className="space-y-4 min-h-[200px]">
            {frentesEmAndamento.length === 0 ? (
              <div className="bg-white p-8 text-center rounded-2xl border border-dashed border-blue-200 text-slate-400 text-xs">
                Nenhuma frente em andamento no momento.
              </div>
            ) : (
              frentesEmAndamento.map(frenteName => renderFrenteCard(frenteName))
            )}
          </div>
        </div>

        {/* QUADRO 3: CONCLUÍDO */}
        <div className="bg-slate-100/80 p-4 rounded-2xl border border-emerald-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xs">
            <div className="flex items-center gap-2 font-black text-sm">
              <CheckCircle2 className="h-4 w-4 text-white" />
              <span>3. Concluído</span>
            </div>
            <span className="bg-white text-emerald-900 font-bold text-xs px-2.5 py-0.5 rounded-full shadow-2xs">
              {frentesConcluido.length} {frentesConcluido.length === 1 ? 'frente' : 'frentes'}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 px-1 font-medium">
            Frentes com 100% dos dados de máquinas recolhidos.
          </p>

          <div className="space-y-4 min-h-[200px]">
            {frentesConcluido.length === 0 ? (
              <div className="bg-white p-8 text-center rounded-2xl border border-dashed border-emerald-200 text-slate-400 text-xs">
                Nenhuma frente 100% concluída ainda.
              </div>
            ) : (
              frentesConcluido.map(frenteName => renderFrenteCard(frenteName))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
