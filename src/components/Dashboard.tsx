import { createEquipmentAvailabilityResolver } from '../utils/equipmentAvailability';
import type { ComponentLoan, ComponentMaintenance, Location } from '../types';
import React, { useState } from 'react';
import { 
  AutopilotComponent, 
  Machine, 
  MovementLog, 
  UserRole,
  License,
  CompanyProfile,
  FieldDataCollection,
  DashboardNavPreset
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
  Shield,
  Kanban,
  HelpCircle
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { getISOWeekId, getWeekFormattedLabel } from '../utils/dateUtils';
import HelpGuideModal from './HelpGuideModal';
import type { HelpGuideStep } from './HelpGuideModal';

interface DashboardProps {
  loans?: ComponentLoan[]; maintenances?: ComponentMaintenance[]; locations?: Location[];
  key?: string;
  components: AutopilotComponent[];
  machines: Machine[];
  movements: MovementLog[];
  licenses?: License[];
  fieldDataCollections?: FieldDataCollection[];
  role: UserRole;
  companyProfile: CompanyProfile;
  onNavigate: (tab: string, subtab?: string, preset?: DashboardNavPreset) => void;
  onSeedData?: () => void;
}

export default function Dashboard({ 
  loans = [], maintenances = [], locations = [],
  components, 
  machines, 
  movements, 
  licenses = [],
  fieldDataCollections = [],
  role,
  companyProfile,
  onNavigate,
  onSeedData
}: DashboardProps) {
  const isAdminOrTech = role === 'administrador' || role === 'tecnico' || role === 'ADMINISTRADOR' || role === 'TECNICO_CAMPO';

  const [helpOpen, setHelpOpen] = useState(false);

  const helpSteps: HelpGuideStep[] = [
    {
      title: 'Visão Geral dos Equipamentos',
      description: 'O primeiro painel exibe os KPIs do inventário de componentes de piloto automático: total, em operação, em manutenção e disponíveis no almoxarifado. Cada card é clicável e leva à aba de Componentes com filtro aplicado. Abaixo, um gráfico de barras mostra a distribuição por marca (Trimble, Topcon, John Deere etc.).',
      icon: Cpu,
      accent: 'bg-emerald-600 text-white'
    },
    {
      title: 'Painel de Licenças',
      description: 'A seção de licenças rastreia ativações de sinais GPS (ex.: CenterPoint, Sitestrak). Mostra licenças ativas, expiradas e pendentes. Se houver contratos vencidos ou a vencer nos próximos 30 dias, um alerta amarelo aparece com aviso para renovação junto ao fornecedor.',
      icon: Key,
      accent: 'bg-indigo-600 text-white'
    },
    {
      title: 'Recolhimento de Dados de Campo',
      description: 'Este painel acompanha o status semanal do recolhimento de telemetria das máquinas. Exibe quantas frentes de trabalho existem, quantas máquinas já concluíram o recolhimento e quantas estão pendentes. O gráfico de rosca mostra a porcentagem de cobertura da semana atual.',
      icon: Activity,
      accent: 'bg-blue-600 text-white'
    },
    {
      title: 'Lançamentos Recentes',
      description: 'A coluna esquerda na parte inferior lista as últimas 4 movimentações de campo registradas no sistema (instalações, remoções, manutenções, calibrações). Cada lançamento mostra o componente, prefixo da máquina, técnico responsável e data.',
      icon: ClipboardList,
      accent: 'bg-violet-600 text-white'
    },
    {
      title: 'Ações Rápidas e Diretrizes',
      description: 'No canto inferior direito, os botões permitem registrar novas movimentações de campo ou adicionar equipamentos ao estoque. Também são exibidas as diretrizes de manutenção GPS: remoção no final de safra, diagnóstico de defeitos e descarte patrimonial correto.',
      icon: AlertTriangle,
      accent: 'bg-amber-600 text-white'
    }
  ];
  
  // 1. Calculations: Component Inventory
  const totalComponents = components.length;
  const operational = createEquipmentAvailabilityResolver({ movements, loans, maintenances, machines, locations });
  const inUseCount = components.filter(c => operational(c).filterValue === 'Em Uso').length;
  const availableCount = components.filter(c => operational(c).availableForUse).length;
  const maintenanceCount = components.filter(c => operational(c).filterValue === 'Manutenção').length;
  const discardedCount = components.filter(c => c.status === 'Descartado').length;

  const totalMachines = machines.length;

  const getBrandColor = (brand: string) => {
    switch (brand.toLowerCase()) {
      case 'trimble': return 'bg-indigo-600';
      case 'topcon': return 'bg-sky-500';
      case 'john deere': return 'bg-emerald-600';
      case 'case ih': return 'bg-amber-500';
      case 'valtra': return 'bg-purple-600';
      case 'hexagon': return 'bg-teal-500';
      case 'raven': return 'bg-rose-500';
      default: return 'bg-slate-500';
    }
  };

  // Component brand distribution (dynamic — reflects every brand in the registry)
  const componentBrandStats = Array.from(
    new Set(components.map(c => c.brand).filter(Boolean))
  ).map((name) => {
    const count = components.filter(c => c.brand === name).length;
    const percent = totalComponents > 0 ? Math.round((count / totalComponents) * 100) : 0;
    return { name, count, percent, colorClass: getBrandColor(name) };
  }).sort((a, b) => b.count - a.count);

  const componentBrandSummary = componentBrandStats.length > 0
    ? componentBrandStats.map(b => `${b.count} ${b.name}`).join(' • ')
    : 'Nenhum hardware cadastrado';

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

  const licenseBrandStats = Array.from(
    new Set(licenses.map(l => l.brand).filter(Boolean))
  ).map((name) => {
    const count = licenses.filter(l => l.brand === name).length;
    return { name, count };
  }).sort((a, b) => b.count - a.count);

  const licenseBrandSummary = licenseBrandStats.length > 0
    ? licenseBrandStats.map(b => `${b.count} ${b.name}`).join(' • ')
    : 'Nenhuma licença cadastrada';

  // 3. Calculations: Field Data Collection Overview
  const currentWeekId = getISOWeekId(new Date());

  const fleetNamesSet = new Set(machines.map(m => m.fleet?.trim() ? m.fleet.trim() : 'Sem Frente Atribuída'));
  const totalFrentes = fleetNamesSet.size;

  const fieldDataCompletedCount = machines.filter(m => {
    const rec = fieldDataCollections.find(c => c.machineId === m.id && c.weekId === currentWeekId);
    return rec?.status === 'Concluído';
  }).length;

  const fieldDataPendingCount = totalMachines - fieldDataCompletedCount;
  const fieldDataCoveragePercent = totalMachines > 0 ? Math.round((fieldDataCompletedCount / totalMachines) * 100) : 0;

  const fieldDataPieChart = [
    { name: 'Máquinas Concluídas', value: fieldDataCompletedCount, color: '#10b981' },
    { name: 'Máquinas Pendentes', value: fieldDataPendingCount, color: '#f59e0b' }
  ];

  return (
    <div className="space-y-8" id="dashboard-tab">

      {/* ================= PANEL 1: COMPONENT INVENTORY OVERVIEW ================= */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" id="component-inventory-panel">
        
        {/* Panel Title banner */}
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-emerald-400" />
            <h2 className="text-md font-bold tracking-tight">Visão Geral dos Equipamentos</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Ajuda sobre o painel de equipamentos"
              title="Como usar esta tela"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white/70 shadow-sm transition-colors hover:bg-white/20 hover:text-white"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
            {totalComponents === 0 && onSeedData && isAdminOrTech && (
              <button
                onClick={onSeedData}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                id="seed-database-btn"
              >
                <Cpu className="h-3.5 w-3.5" />
                Popular Banco de Dados de Teste
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Component KPI Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total */}
            <button
              onClick={() => onNavigate('components')}
              title="Ver todos os componentes"
              className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between text-left cursor-pointer hover:bg-white hover:border-slate-300 hover:shadow-md active:scale-[0.98] transition-all"
            >
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total de GPS</span>
                <span className="text-xl font-extrabold text-slate-800 block mt-1">{totalComponents}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">{componentBrandSummary}</span>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Cpu className="h-5 w-5" />
              </div>
            </button>

            {/* In Use */}
            <button
              onClick={() => onNavigate('components', undefined, { componentStatus: 'Em Uso' })}
              title="Ver componentes em operação"
              className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between text-left cursor-pointer hover:bg-white hover:border-slate-300 hover:shadow-md active:scale-[0.98] transition-all"
            >
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
            </button>

            {/* In Maintenance */}
            <button
              onClick={() => onNavigate('components', undefined, { componentStatus: 'Manutenção' })}
              title="Ver componentes em manutenção"
              className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between text-left cursor-pointer hover:bg-white hover:border-slate-300 hover:shadow-md active:scale-[0.98] transition-all"
            >
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">Em Manutenção</span>
                <span className="text-xl font-extrabold text-amber-600 block mt-1">{maintenanceCount}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Aguardando laboratório</span>
              </div>
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                <Wrench className="h-5 w-5" />
              </div>
            </button>

            {/* Stock */}
            <button
              onClick={() => onNavigate('components', undefined, { componentStatus: 'Disponível' })}
              title="Ver componentes no almoxarifado"
              className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between text-left cursor-pointer hover:bg-white hover:border-slate-300 hover:shadow-md active:scale-[0.98] transition-all"
            >
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">No Almoxarifado</span>
                <span className="text-xl font-extrabold text-slate-800 block mt-1">{availableCount}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Prontos para instalação</span>
              </div>
              <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
                <TrendingUp className="h-5 w-5" />
              </div>
            </button>
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
                {componentBrandStats.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    Nenhum hardware cadastrado.
                  </p>
                ) : (
                  componentBrandStats.map(brand => (
                    <button
                      key={brand.name}
                      onClick={() => onNavigate('components', undefined, { componentBrand: brand.name })}
                      title={`Ver equipamentos ${brand.name}`}
                      className="w-full text-left block rounded-xl hover:bg-white hover:shadow-sm transition-all px-1.5 py-1 -mx-1.5 cursor-pointer active:scale-[0.99]"
                    >
                      <div className="flex justify-between items-center text-xs font-semibold mb-1">
                        <span className="text-slate-600">Equipamentos {brand.name}</span>
                        <span className="text-slate-950 font-bold">{brand.count} un. ({brand.percent}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div className={`${brand.colorClass} h-full rounded-full transition-all duration-500`} style={{ width: `${brand.percent}%` }}></div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Fleet machinery overview */}
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-between">
              <div>
                <h3 translate="no" className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 notranslate">Máquinas da Frota</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => onNavigate('machines', undefined, { machineType: 'Trator' })}
                    title="Ver tratores cadastrados"
                    className="w-full flex justify-between items-center text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer active:scale-[0.99]"
                  >
                    <span className="text-slate-500">Tratores Operacionais:</span>
                    <span className="font-bold text-slate-800">{machines.filter(m => m.type === 'Trator').length}</span>
                  </button>
                  <button
                    onClick={() => onNavigate('machines', undefined, { machineType: 'Colhedora' })}
                    title="Ver colhedoras cadastradas"
                    className="w-full flex justify-between items-center text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer active:scale-[0.99]"
                  >
                    <span className="text-slate-500">Colhedoras de Cana:</span>
                    <span className="font-bold text-slate-800">{machines.filter(m => m.type === 'Colhedora').length}</span>
                  </button>
                  <button
                    onClick={() => onNavigate('machines', undefined, { machineType: 'Pulverizador' })}
                    title="Ver pulverizadores cadastrados"
                    className="w-full flex justify-between items-center text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer active:scale-[0.99]"
                  >
                    <span className="text-slate-500">Pulverizadores:</span>
                    <span className="font-bold text-slate-800">{machines.filter(m => m.type === 'Pulverizador').length}</span>
                  </button>
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
            <h2 className="text-md font-bold tracking-tight">Visão Geral de Licenças</h2>
          </div>
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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Total Licenses */}
            <button
              onClick={() => onNavigate('licenses')}
              title="Ver todas as licenças"
              className="bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 flex items-center justify-between text-left cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-md active:scale-[0.98] transition-all"
            >
              <div>
                <span className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Ativações</span>
                <span className="text-xl font-extrabold text-indigo-955 block mt-1">{totalLicenses}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">{licenseBrandSummary}</span>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Key className="h-5 w-5" />
              </div>
            </button>

            {/* Active Licenses */}
            <button
              onClick={() => onNavigate('licenses', undefined, { licenseFilter: 'active' })}
              title="Ver licenças ativas (desbloqueadas em campo)"
              className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between text-left cursor-pointer hover:bg-white hover:border-slate-300 hover:shadow-md active:scale-[0.98] transition-all"
            >
              <div>
                <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">Sinais Ativos</span>
                <span className="text-xl font-extrabold text-emerald-600 block mt-1">{activeLicensesCount}</span>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Operacionais em campo</span>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </button>

            {/* Expired Contracts */}
            <button
              onClick={() => onNavigate('licenses', undefined, { licenseFilter: 'expired' })}
              title="Ver licenças expiradas ou com data vencida"
              className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-center justify-between text-left cursor-pointer hover:bg-white hover:border-slate-300 hover:shadow-md active:scale-[0.98] transition-all"
            >
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
            </button>
          </div>

        </div>

      </div>

      {/* ================= PANEL 3: VISÃO GERAL DO RECOLHIMENTO DE DADOS DE CAMPO ================= */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" id="dashboard-field-data-panel">
        <div className="bg-slate-900 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center text-white gap-2">
          <div className="flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-emerald-400" />
            <h2 className="text-md font-bold tracking-tight">Visão Geral Recolhimento de Dados</h2>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          {/* Left Column: 4 Key Indicator Cards + Quick Action */}
          <div className="lg:col-span-7 space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Acompanhamento gerencial do recolhimento de telemetria e dados dos monitores de piloto automático nas frentes de trabalho agrícolas.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Total Frentes */}
              <button
                onClick={() => onNavigate('movements', 'kanban')}
                title="Abrir Kanban de Recolhimento"
                className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center cursor-pointer hover:bg-white hover:border-slate-300 hover:shadow-md active:scale-[0.98] transition-all"
              >
                <span className="block text-[10px] uppercase font-bold text-slate-500">Frentes Cadastradas</span>
                <span className="text-xl font-black text-slate-900 mt-1 block">{totalFrentes}</span>
                <span className="text-[10px] text-slate-500 font-semibold mt-0.5 block truncate">Frentes de Trabalho</span>
              </button>

              {/* Concluídas */}
              <button
                onClick={() => onNavigate('movements', 'kanban', { kanbanStatus: 'Concluído' })}
                title="Ver máquinas concluídas no Kanban"
                className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 text-center cursor-pointer hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-md active:scale-[0.98] transition-all"
              >
                <span className="block text-[10px] uppercase font-bold text-emerald-700">Concluídas</span>
                <span className="text-xl font-black text-emerald-700 mt-1 block">{fieldDataCompletedCount}</span>
                <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 block">Máquinas em dia</span>
              </button>

              {/* Pendentes */}
              <button
                onClick={() => onNavigate('movements', 'kanban', { kanbanStatus: 'Pendente' })}
                title="Ver máquinas pendentes no Kanban"
                className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 text-center cursor-pointer hover:bg-amber-100 hover:border-amber-300 hover:shadow-md active:scale-[0.98] transition-all"
              >
                <span className="block text-[10px] uppercase font-bold text-amber-700">Pendentes</span>
                <span className="text-xl font-black text-amber-700 mt-1 block">{fieldDataPendingCount}</span>
                <span className="text-[10px] text-amber-600 font-semibold mt-0.5 block">Aguardando recolher</span>
              </button>

              {/* Percentual */}
              <button
                onClick={() => onNavigate('movements', 'kanban')}
                title="Abrir Kanban de Recolhimento"
                className="bg-indigo-50 p-3.5 rounded-2xl border border-indigo-200 text-center cursor-pointer hover:bg-indigo-100 hover:border-indigo-300 hover:shadow-md active:scale-[0.98] transition-all"
              >
                <span className="block text-[10px] uppercase font-bold text-indigo-700">Cobertura</span>
                <span className="text-xl font-black text-indigo-700 mt-1 block">{fieldDataCoveragePercent}%</span>
                <span className="text-[10px] text-indigo-600 font-semibold mt-0.5 block">Progresso Semanal</span>
              </button>
            </div>

            {/* Quick Action to open Field Services Kanban */}
            <div className="pt-2">
              <button
                onClick={() => onNavigate('movements', 'kanban')}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer hover:shadow-md"
                id="btn-go-to-kanban-from-dashboard"
              >
                <Kanban className="h-4 w-4" />
                Abrir Kanban de Recolhimento Completo (Serviços de Campo)
                <ArrowRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </div>

          {/* Right Column: Modern Recharts Donut Pie Chart */}
          <div className="lg:col-span-5 bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col items-center justify-center min-h-[240px]">
            <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5 self-start">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Gráfico de Recolhimento Semanal
            </h3>

            <div className="w-full h-44 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fieldDataPieChart}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {fieldDataPieChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(val: number) => [`${val} máquina(s)`, 'Quantidade']}
                    contentStyle={{ borderRadius: '12px', fontSize: '12px', padding: '8px 12px', borderColor: '#e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center Donut Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-900">{fieldDataCoveragePercent}%</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Concluído</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-2 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                <span className="text-slate-700 text-[11px] font-semibold">Concluídas ({fieldDataCompletedCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                <span className="text-slate-700 text-[11px] font-semibold">Pendentes ({fieldDataPendingCount})</span>
              </div>
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

      <HelpGuideModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Como usar o Painel de Visão Geral"
        steps={helpSteps}
      />
    </div>
  );
}
