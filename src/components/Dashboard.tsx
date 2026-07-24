import React from 'react';
import { 
  AutopilotComponent, 
  Machine, 
  MovementLog, 
  UserRole,
  License,
  CompanyProfile
} from '../types';
import { 
  Cpu, 
  TrendingUp, 
  CheckCircle2, 
  Wrench, 
  AlertTriangle, 
  ClipboardList, 
  Activity, 
  ArrowRight,
  Key,
  Clock,
  Calendar,
  Tag,
  Shield
} from 'lucide-react';

interface DashboardProps {
  key?: string;
  components: AutopilotComponent[];
  machines: Machine[];
  movements: MovementLog[];
  licenses?: License[];
  role: UserRole;
  companyProfile: CompanyProfile;
  onNavigate: (tab: string) => void;
  onSeedData?: () => void;
}

export default function Dashboard({ 
  components, 
  machines, 
  movements, 
  licenses = [],
  role,
  companyProfile,
  onNavigate,
  onSeedData
}: DashboardProps) {
  const isAdminOrTech = role === 'administrador' || role === 'tecnico' || role === 'ADMINISTRADOR' || role === 'TECNICO_CAMPO';
  
  // 1. Calculations: Component Inventory
  const totalComponents = components.length;
  const inUseCount = components.filter(c => c.status === 'Em Uso').length;
  const availableCount = components.filter(c => c.status === 'Disponível').length;
  const maintenanceCount = components.filter(c => c.status === 'Manutenção').length;
  const discardedCount = components.filter(c => c.status === 'Descartado').length;

  const trimbleCount = components.filter(c => c.brand === 'Trimble').length;
  const topconCount = components.filter(c => c.brand === 'Topcon').length;
  const totalMachines = machines.length;

  // Component brand percentages
  const trimblePercent = totalComponents > 0 ? Math.round((trimbleCount / totalComponents) * 100) : 0;
  const topconPercent = totalComponents > 0 ? Math.round((topconCount / totalComponents) * 100) : 0;

  // Recent 4 movements
  const recentMovements = [...movements]
    .sort((a, b) => {
      const dateA = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const dateB = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      return dateB - dateA;
    })
    .slice(0, 4);

  // 2. Calculations: License Inventory
  const totalLicenses = licenses.length;
  const activeLicensesCount = licenses.filter(l => l.status === 'Ativa' && l.unlockStatus === 'desbloqueado').length;
  const availableLicensesCount = licenses.filter(l => l.status === 'Disponível').length;
  const expiredLicensesCount = licenses.filter(l => l.status === 'Expirada').length;
  const pendingLicensesCount = licenses.filter(l => l.status === 'Pendente').length;

  // Expiration / Warning warnings
  let expiringSoonCount = 0;
  let actuallyExpiredCount = 0;

  licenses.forEach(lic => {
    if (lic.status === 'Expirada') {
      actuallyExpiredCount++;
    } else if (lic.expirationDate) {
      const exp = new Date(lic.expirationDate);
      const today = new Date();
      const diffTime = exp.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) {
        actuallyExpiredCount++;
      } else if (diffDays <= 30) {
        expiringSoonCount++;
      }
    }
  });

  const trimbleLicCount = licenses.filter(l => l.brand === 'Trimble').length;
  const topconLicCount = licenses.filter(l => l.brand === 'Topcon').length;
  const signalLicCount = licenses.filter(l => l.type === 'Assinatura de Sinal').length;
  const activationLicCount = licenses.filter(l => l.type === 'Ativação de Tela').length;

  return (
    <div className="space-y-8" id="dashboard-tab">
      
      {/* Welcome / Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            <span translate="no" className="notranslate">Agro Stock GPS - {companyProfile.name}</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gerenciamento integrado de licenças e hardware agrícola de alta precisão para usinas sucroenergéticas.
          </p>
        </div>
        
        {totalComponents === 0 && onSeedData && isAdminOrTech && (
          <button
            onClick={onSeedData}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm shrink-0"
            id="seed-database-btn"
          >
            <Cpu className="h-4 w-4" />
            Popular Banco de Dados de Teste
          </button>
        )}
      </div>

      {/* ================= PANEL 1: COMPONENT INVENTORY OVERVIEW ================= */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" id="component-inventory-panel">
        
        {/* Panel Title banner */}
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-emerald-400" />
            <h2 className="text-md font-bold tracking-tight">1. Visão Geral do Inventário de Componentes</h2>
          </div>
          <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-bold">
            {totalComponents} Hardwares Cadastrados
          </span>
        </div>

        <div className="p-6 space-y-6">
          {/* Component KPI Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between">
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total de GPS</span>
                <span className="text-xl font-extrabold text-slate-800 block mt-1">{totalComponents}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">{trimbleCount} Trimble • {topconCount} Topcon</span>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Cpu className="h-5 w-5" />
              </div>
            </div>

            {/* In Use */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between">
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">Em Operação</span>
                <span className="text-xl font-extrabold text-emerald-600 block mt-1">{inUseCount}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                  {totalComponents > 0 ? Math.round((inUseCount / totalComponents) * 100) : 0}% da frota ativa
                </span>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>

            {/* In Maintenance */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between">
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">Em Manutenção</span>
                <span className="text-xl font-extrabold text-amber-600 block mt-1">{maintenanceCount}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Aguardando laboratório</span>
              </div>
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                <Wrench className="h-5 w-5" />
              </div>
            </div>

            {/* Stock */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between">
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">No Almoxarifado</span>
                <span className="text-xl font-extrabold text-slate-800 block mt-1">{availableCount}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Prontos para instalação</span>
              </div>
              <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Distribution chart and stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            
            {/* Visual Progress Bar Distribution */}
            <div className="md:col-span-2 space-y-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-emerald-500" />
                Tecnologias de Piloto Automático Instaladas
              </h3>
              
              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between items-center text-xs font-semibold mb-1">
                    <span className="text-slate-600">Equipamentos Trimble</span>
                    <span className="text-slate-950 font-bold">{trimbleCount} un. ({trimblePercent}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${trimblePercent}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs font-semibold mb-1">
                    <span className="text-slate-600">Equipamentos Topcon</span>
                    <span className="text-slate-950 font-bold">{topconCount} un. ({topconPercent}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-sky-500 h-full rounded-full transition-all duration-500" style={{ width: `${topconPercent}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fleet machinery overview */}
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-between">
              <div>
                <h3 translate="no" className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 notranslate">Máquinas da Frota</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-500">Tratores Operacionais:</span>
                    <span className="font-bold text-slate-800">{machines.filter(m => m.type === 'Trator').length}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-500">Colhedoras de Cana:</span>
                    <span className="font-bold text-slate-800">{machines.filter(m => m.type === 'Colhedora').length}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-500">Pulverizadores:</span>
                    <span className="font-bold text-slate-800">{machines.filter(m => m.type === 'Pulverizador').length}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onNavigate('components')}
                className="mt-4 w-full py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-[11px] font-bold border border-slate-200 transition-all flex items-center justify-center gap-1.5"
              >
                Ver Estoque Completo
                <ArrowRight className="h-3 w-3 text-slate-400" />
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* ================= PANEL 2: LICENSE INVENTORY OVERVIEW ================= */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" id="license-inventory-panel">
        
        {/* Panel Title banner */}
        <div className="bg-indigo-950 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2.5">
            <Key className="h-5 w-5 text-indigo-400" />
            <h2 className="text-md font-bold tracking-tight">2. Visão Geral do Inventário de Licenças</h2>
          </div>
          <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-bold">
            {totalLicenses} Contratos / Chaves de Ativação
          </span>
        </div>

        <div className="p-6 space-y-6">
          
          {/* Warnings Bar (If any licenses are expired or expiring soon) */}
          {(expiringSoonCount > 0 || actuallyExpiredCount > 0) && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-800">Atenção Técnica: Contratos de Sinais Expirando</h4>
                  <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                    Há <strong className="font-extrabold">{actuallyExpiredCount}</strong> licença(s) expirada(s) e <strong className="font-extrabold">{expiringSoonCount}</strong> assinatura(s) de sinal que expira(m) nos próximos 30 dias. Providencie a renovação com o fornecedor para evitar paralisação em campo.
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('licenses')}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-bold transition-all shrink-0 self-start md:self-center"
              >
                Verificar Vencimentos
              </button>
            </div>
          )}

          {/* Licenses KPI Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Licenses */}
            <div className="bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 flex items-center justify-between">
              <div>
                <span className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Ativações</span>
                <span className="text-xl font-extrabold text-indigo-955 block mt-1">{totalLicenses}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">{trimbleLicCount} Trimble • {topconLicCount} Topcon</span>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Key className="h-5 w-5" />
              </div>
            </div>

            {/* Active Licenses */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between">
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">Sinais Ativos</span>
                <span className="text-xl font-extrabold text-emerald-600 block mt-1">{activeLicensesCount}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Operacionais em campo</span>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>

            {/* Expired Contracts */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between">
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">Expiradas</span>
                <span className={`text-xl font-extrabold block mt-1 ${actuallyExpiredCount > 0 ? 'text-rose-600 animate-pulse' : 'text-slate-800'}`}>
                  {actuallyExpiredCount}
                </span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Requer assinatura</span>
              </div>
              <div className={`p-2.5 rounded-xl ${actuallyExpiredCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                <Clock className="h-5 w-5" />
              </div>
            </div>

            {/* Available Licenses */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between">
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">No Estoque</span>
                <span className="text-xl font-extrabold text-indigo-700 block mt-1">{availableLicensesCount}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Livres para vincular</span>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl">
                <Tag className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Types and association details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            
            {/* Split by Type of License */}
            <div className="bg-indigo-50/10 p-5 rounded-2xl border border-slate-150 space-y-4">
              <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">Distribuição por Tipo de Ativação</h3>
              
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="bg-white p-3 rounded-xl border border-slate-150">
                  <span className="text-[10px] text-slate-400 font-semibold block">Sinais de Correção</span>
                  <span className="text-lg font-black text-slate-800 mt-1 block">{signalLicCount}</span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">RTX, RTK, Omnistar</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-150">
                  <span className="text-[10px] text-slate-400 font-semibold block">Recursos de Monitor</span>
                  <span className="text-lg font-black text-slate-800 mt-1 block">{activationLicCount}</span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Seção, Taxa Var, Piloto</span>
                </div>
              </div>
            </div>

            {/* Quick list of contracts needing renewal soon */}
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Auditoria Contratual Rápida</h3>
                {licenses.filter(l => l.status === 'Expirada' || (l.expirationDate && new Date(l.expirationDate).getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000)).length === 0 ? (
                  <p className="text-xs text-emerald-600 font-medium bg-emerald-50 p-2.5 rounded-xl border border-emerald-150">
                    ✓ Tudo em dia! Nenhuma licença pendente de renovação técnica imediata.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[85px] overflow-y-auto pr-1">
                    {licenses
                      .filter(l => l.status === 'Expirada' || (l.expirationDate && new Date(l.expirationDate).getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000))
                      .slice(0, 2)
                      .map(lic => {
                        const isExp = lic.status === 'Expirada' || (lic.expirationDate && new Date(lic.expirationDate).getTime() < Date.now());
                        return (
                          <div key={lic.id} className="flex justify-between items-center text-xs">
                            <span className="text-slate-600 truncate max-w-[170px] font-medium" title={lic.name}>{lic.name}</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] uppercase ${isExp ? 'bg-rose-150 text-rose-600' : 'bg-amber-150 text-amber-600'}`}>
                              {isExp ? 'Expirada' : 'Expira Breve'}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <button
                onClick={() => onNavigate('licenses')}
                className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5"
              >
                Gerenciar Painel de Contratos e Licenças
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* ================= RECENT MOVEMENT & QUICK SHORTCUTS ROW ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Recent movements */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-md font-extrabold text-slate-900 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-emerald-500" />
              Lançamentos & Serviços Recentes em Campo
            </h2>
            <button 
              onClick={() => onNavigate('movements')}
              className="text-emerald-600 hover:text-emerald-700 font-bold text-xs flex items-center gap-1 transition-colors"
              id="view-all-movements-link"
            >
              Ver tudo
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {recentMovements.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
              Nenhum lançamento ou serviço técnico efetuado em campo até o momento.
            </div>
          ) : (
            <div className="divide-y divide-slate-100" id="recent-movements-list">
              {recentMovements.map((move) => {
                let badgeBg = 'bg-slate-50 text-slate-700';
                if (move.action === 'Instalação') badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                if (move.action === 'Remoção') badgeBg = 'bg-slate-100 text-slate-700 border-slate-200';
                if (move.action === 'Manutenção') badgeBg = 'bg-amber-50 text-amber-700 border-amber-100';
                if (move.action === 'Calibração') badgeBg = 'bg-indigo-50 text-indigo-700 border-indigo-100';

                const moveDate = move.date?.toDate ? move.date.toDate() : new Date(move.date);

                return (
                  <div key={move.id} className="py-3.5 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeBg}`}>
                          {move.action}
                        </span>
                        <span className="font-bold text-slate-800 text-xs">
                          {move.componentName}
                        </span>
                        <span className="text-slate-400 text-[11px] font-mono">
                          ({move.componentSerial})
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Instalado no prefixo: <span className="font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{move.machinePrefix}</span> • Técnico encarregado: {move.technicianName}
                      </p>
                      {move.notes && (
                        <p className="text-[11px] text-slate-400 mt-1 bg-slate-50/50 p-2 rounded border border-slate-100 italic">
                          "{move.notes}"
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold shrink-0">
                      {moveDate.toLocaleDateString('pt-BR')} {moveDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Fast actions / guidelines */}
        <div className="space-y-6">
          {/* Fast Actions Panel */}
          <div className="bg-gradient-to-br from-emerald-800 to-slate-900 text-white p-6 rounded-2xl shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 text-emerald-600 opacity-20">
              <Cpu className="h-40 w-40" />
            </div>

            <div className="relative z-10">
              <h3 className="text-lg font-bold">Lançamentos de Campo</h3>
              <p className="text-emerald-100 text-xs mt-1.5 leading-relaxed">
                Adicione novas instalações, trocas de antena ou envie aparelhos para manutenção periódica de forma ágil no tablet ou celular.
              </p>

              <div className="mt-6 space-y-2">
                <button
                  onClick={() => onNavigate('movements')}
                  className="w-full py-2.5 px-4 bg-white hover:bg-emerald-50 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                  id="dash-log-btn"
                >
                  <ClipboardList className="h-4 w-4 text-emerald-600" />
                  Lançar Serviço / Movimentação
                </button>
                
                {isAdminOrTech && (
                  <button
                    onClick={() => onNavigate('components')}
                    className="w-full py-2.5 px-4 bg-emerald-700/60 hover:bg-emerald-700/80 text-white font-bold text-xs rounded-xl transition-all border border-emerald-600/50 flex items-center justify-center gap-2"
                    id="dash-add-comp-btn"
                  >
                    <Cpu className="h-4 w-4 text-emerald-300" />
                    Adicionar Equipamento ao Estoque
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* System Guidelines Info */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
              Diretrizes de Manutenção GPS
            </h3>

            <div className="space-y-4 mt-4 text-xs text-slate-600 leading-normal">
              <div className="flex gap-2.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <p>
                  <strong>Remoções no final de safra:</strong> Todo componente de piloto automático deve ser retirado no final do ciclo de colheita para evitar sinistros no campo.
                </p>
              </div>

              <div className="flex gap-2.5">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <p>
                  <strong>Diagnóstico de Componente:</strong> Se o componentes apresentar defeitos, agende manutenção e registre no sistema.
                </p>
              </div>

              <div className="flex gap-2.5">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-500 mt-1.5 shrink-0" />
                <p>
                  <strong>Descarte:</strong> Equipamentos com quebra estrutural severa devem ser avaliados pelo encarregado da Geotecnologia e Descartado para correta baixa patrimonial.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
