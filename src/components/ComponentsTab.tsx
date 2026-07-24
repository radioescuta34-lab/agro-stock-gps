import React, { useState } from 'react';
import { 
  AutopilotComponent, 
  ComponentBrand, 
  ComponentStatus, 
  UserRole,
  ComponentMaintenance,
  MaintenanceProvider,
  Machine
} from '../types';
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit, 
  Check, 
  X, 
  Cpu, 
  ShieldAlert,
  Info,
  Wrench,
  History,
  ArrowLeft,
  Calendar,
  AlertTriangle
} from 'lucide-react';

interface ComponentsTabProps {
  components: AutopilotComponent[];
  machines: Machine[];
  role: UserRole;
  onAddComponent: (comp: Omit<AutopilotComponent, 'id' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
  onEditComponent: (id: string, updates: Partial<AutopilotComponent>) => Promise<void>;
  onDeleteComponent: (id: string) => Promise<void>;
  maintenances?: ComponentMaintenance[];
  onSendToMaintenance?: (maint: Omit<ComponentMaintenance, 'id' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
  onReturnFromMaintenance?: (maintId: string, returnData: {
    returnDate: string;
    replacedParts: string;
    servicesPerformed: string;
    cost: number;
    status: 'Concluído' | 'Sem Conserto';
  }) => Promise<void>;
  providers?: MaintenanceProvider[];
  onAddProvider?: (provider: Omit<MaintenanceProvider, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
}

export default function ComponentsTab({
  components,
  machines = [],
  role,
  onAddComponent,
  onEditComponent,
  onDeleteComponent,
  maintenances = [],
  onSendToMaintenance,
  onReturnFromMaintenance,
  providers = [],
  onAddProvider
}: ComponentsTabProps) {
  const isAdminOrTech = role === 'administrador' || role === 'tecnico' || role === 'ADMINISTRADOR' || role === 'TECNICO_CAMPO';

  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [isAdding, setIsAdding] = useState(false);
  const [editingComp, setEditingComp] = useState<AutopilotComponent | null>(null);

  // Form states
  const [serialNumber, setSerialNumber] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState<ComponentBrand>('Trimble');
  const [type, setType] = useState('Antena/Receptor');
  const [status, setStatus] = useState<ComponentStatus>('Disponível');
  const [currentMachine, setCurrentMachine] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Maintenance Submodule states
  const [showMaintenanceView, setShowMaintenanceView] = useState(false);
  const [isSendingToMaint, setIsSendingToMaint] = useState(false);
  const [maintComponentId, setMaintComponentId] = useState('');
  const [maintProviderName, setMaintProviderName] = useState('');
  const [maintIssueDescription, setMaintIssueDescription] = useState('');
  const [maintSentDate, setMaintSentDate] = useState(new Date().toISOString().split('T')[0]);

  const [returningMaint, setReturningMaint] = useState<ComponentMaintenance | null>(null);
  const [maintReturnDate, setMaintReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [maintReplacedParts, setMaintReplacedParts] = useState('');
  const [maintServicesPerformed, setMaintServicesPerformed] = useState('');
  const [maintCost, setMaintCost] = useState<number>(0);
  const [maintReturnStatus, setMaintReturnStatus] = useState<'Concluído' | 'Sem Conserto'>('Concluído');
  const [maintListTab, setMaintListTab] = useState<'ativos' | 'historico'>('ativos');

  // New Maintenance Provider form states
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderPhone, setNewProviderPhone] = useState('');
  const [newProviderEmail, setNewProviderEmail] = useState('');
  const [newProviderAddress, setNewProviderAddress] = useState('');
  const [newProviderContact, setNewProviderContact] = useState('');

  const handleAddProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProviderName.trim()) {
      setError('Por favor, preencha o nome da assistência técnica.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (onAddProvider) {
        await onAddProvider({
          name: newProviderName.trim(),
          phone: newProviderPhone.trim(),
          email: newProviderEmail.trim(),
          address: newProviderAddress.trim(),
          contactPerson: newProviderContact.trim()
        });
      }
      setMaintProviderName(newProviderName.trim()); // Auto-populate
      setIsAddingProvider(false);
      setNewProviderName('');
      setNewProviderPhone('');
      setNewProviderEmail('');
      setNewProviderAddress('');
      setNewProviderContact('');
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar nova assistência técnica.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendToMaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintComponentId || !maintProviderName || !maintIssueDescription) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    const comp = components.find(c => c.id === maintComponentId);
    if (!comp) return;

    setLoading(true);
    setError(null);
    try {
      if (onSendToMaintenance) {
        await onSendToMaintenance({
          componentId: comp.id,
          componentSerial: comp.serialNumber,
          componentName: comp.name,
          componentBrand: comp.brand,
          componentType: comp.type,
          sentDate: new Date(maintSentDate).toISOString(),
          providerName: maintProviderName,
          issueDescription: maintIssueDescription,
          status: 'Em Manutenção'
        });
      }
      setIsSendingToMaint(false);
      setMaintComponentId('');
      setMaintProviderName('');
      setMaintIssueDescription('');
      setMaintSentDate(new Date().toISOString().split('T')[0]);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar equipamento para manutenção.');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnFromMaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningMaint) return;

    setLoading(true);
    setError(null);
    try {
      if (onReturnFromMaintenance) {
        await onReturnFromMaintenance(returningMaint.id, {
          returnDate: new Date(maintReturnDate).toISOString(),
          replacedParts: maintReplacedParts,
          servicesPerformed: maintServicesPerformed,
          cost: Number(maintCost) || 0,
          status: maintReturnStatus
        });
      }
      setReturningMaint(null);
      setMaintReplacedParts('');
      setMaintServicesPerformed('');
      setMaintCost(0);
      setMaintReturnStatus('Concluído');
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar retorno de manutenção.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSerialNumber('');
    setName('');
    setBrand('Trimble');
    setType('Antena/Receptor');
    setStatus('Disponível');
    setCurrentMachine('');
    setError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminOrTech) {
      setError('Apenas administradores ou técnicos podem cadastrar componentes.');
      return;
    }
    if (!serialNumber || !name || !type) {
      setError('Preencha os campos obrigatórios.');
      return;
    }

    // Check duplicate serial
    if (components.some(c => c.serialNumber.trim() === serialNumber.trim())) {
      setError('Este Número de Série já está cadastrado no sistema.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onAddComponent({
        serialNumber: serialNumber.trim(),
        name: name.trim(),
        brand,
        type,
        status,
        currentMachine: status === 'Em Uso' ? currentMachine.trim() : ''
      });
      setIsAdding(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar componente.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingComp) return;

    if (!name || !type) {
      setError('Nome e Tipo são obrigatórios.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onEditComponent(editingComp.id, {
        name: name.trim(),
        brand: isAdminOrTech ? brand : editingComp.brand, // Block editing brand if not admin/tech
        serialNumber: isAdminOrTech ? serialNumber.trim() : editingComp.serialNumber,
        type,
        status,
        currentMachine: status === 'Em Uso' ? currentMachine.trim() : ''
      });
      setEditingComp(null);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar componente.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (comp: AutopilotComponent) => {
    setEditingComp(comp);
    setSerialNumber(comp.serialNumber);
    setName(comp.name);
    setBrand(comp.brand);
    setType(comp.type);
    setStatus(comp.status);
    setCurrentMachine(comp.currentMachine || '');
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (!isAdminOrTech) return;
    if (window.confirm('Tem certeza de que deseja excluir este componente do estoque? Esta ação é irreversível.')) {
      try {
        await onDeleteComponent(id);
      } catch (err: any) {
        alert(err.message || 'Erro ao excluir componente.');
      }
    }
  };

  // Filtered listing
  const filteredComponents = components.filter(c => {
    const matchesSearch = c.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.currentMachine && c.currentMachine.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesBrand = brandFilter === 'all' ? true : c.brand === brandFilter;
    const matchesStatus = statusFilter === 'all' ? true : c.status === statusFilter;
    const matchesType = typeFilter === 'all' ? true : c.type === typeFilter;

    return matchesSearch && matchesBrand && matchesStatus && matchesType;
  });

  const componentTypes = [
    'Antena/Receptor',
    'Monitor/Display',
    'Controladora',
    'Motor de Passo',
    'Cabo/Chicote',
    'Sensor de Ângulo',
    'Outro'
  ];

  if (showMaintenanceView) {
    const activeMaintenances = maintenances.filter(m => m.status === 'Em Manutenção');
    const pastMaintenances = maintenances.filter(m => m.status !== 'Em Manutenção');

    return (
      <div className="space-y-6 animate-fade-in" id="maintenance-module">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm gap-4">
          <div>
            <button
              onClick={() => { setShowMaintenanceView(false); setIsSendingToMaint(false); setReturningMaint(null); setError(null); }}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-2 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Estoque
            </button>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-600" />
              Gerenciamento de Manutenção Externa
            </h1>
            <p className="text-slate-500 text-xs mt-1">
              Envie equipamentos com defeito para reparo em assistência autorizada, registre as peças substituídas e finalize o retorno para o estoque.
            </p>
          </div>

          {isAdminOrTech && !isSendingToMaint && !returningMaint && (
            <button
              onClick={() => { setIsSendingToMaint(true); setError(null); }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 whitespace-nowrap self-start"
              id="send-to-maintenance-btn"
            >
              <Plus className="h-4 w-4" />
              Enviar para Manutenção
            </button>
          )}
        </div>

        {error && (
          <p className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl text-xs">
            {error}
          </p>
        )}

        {/* 1. Form Send to Maintenance */}
        {isSendingToMaint && (
          <div className="bg-white p-6 rounded-2xl border border-amber-200 shadow-md animate-fade-in">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-md font-bold text-slate-900 flex items-center gap-1.5">
                <Wrench className="h-5 w-5 text-amber-600" />
                Enviar Equipamento para Manutenção Externa
              </h2>
              <button 
                onClick={() => setIsSendingToMaint(false)} 
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendToMaintSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Selecionar Equipamento Danificado *</label>
                <select
                  required
                  value={maintComponentId}
                  onChange={(e) => setMaintComponentId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-xs bg-white"
                >
                  <option value="">-- Selecione o Equipamento --</option>
                  {components
                    .filter(c => c.status !== 'Manutenção' && c.status !== 'Descartado')
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        [{c.brand}] {c.name} - S/N: {c.serialNumber} ({c.status})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700">Empresa / Assistência Técnica de Destino *</label>
                  <button
                    type="button"
                    onClick={() => { setIsAddingProvider(true); setError(null); }}
                    className="text-[10px] text-amber-600 hover:text-amber-800 font-bold flex items-center gap-1 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Nova Assistência Técnica
                  </button>
                </div>
                <input
                  type="text"
                  required
                  list="providers-list"
                  value={maintProviderName}
                  onChange={(e) => setMaintProviderName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-xs"
                  placeholder="Selecione ou digite a assistência técnica..."
                />
                <datalist id="providers-list">
                  {providers.map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                  <option value="Trimble Service Center" />
                  <option value="Laboratório Oeste GPS" />
                  <option value="Topcon Precision Repair" />
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Data de Envio *</label>
                <input
                  type="date"
                  required
                  value={maintSentDate}
                  onChange={(e) => setMaintSentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Descrição Detalhada do Defeito *</label>
                <textarea
                  required
                  rows={2}
                  value={maintIssueDescription}
                  onChange={(e) => setMaintIssueDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-xs"
                  placeholder="Descreva o problema observado no equipamento que motivou o envio para reparo..."
                />
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSendingToMaint(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                >
                  {loading ? 'Salvando...' : 'Confirmar Envio para Manutenção'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 2. Form Return from Maintenance */}
        {returningMaint && (
          <div className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-md animate-fade-in">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-md font-bold text-slate-900 flex items-center gap-1.5">
                <Check className="h-5 w-5 text-indigo-600" />
                Registrar Retorno de Manutenção Externa
              </h2>
              <button 
                onClick={() => setReturningMaint(null)} 
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl mb-4 text-xs grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <span className="text-slate-400 font-bold">Equipamento:</span>
                <p className="font-bold text-slate-800">{returningMaint.componentName}</p>
              </div>
              <div>
                <span className="text-slate-400 font-bold">Nº de Série:</span>
                <p className="font-mono font-medium text-slate-800">{returningMaint.componentSerial}</p>
              </div>
              <div>
                <span className="text-slate-400 font-bold">Enviado para:</span>
                <p className="font-bold text-slate-800">{returningMaint.providerName}</p>
              </div>
            </div>

            <form onSubmit={handleReturnFromMaintSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Resultado da Manutenção *</label>
                <select
                  required
                  value={maintReturnStatus}
                  onChange={(e) => setMaintReturnStatus(e.target.value as 'Concluído' | 'Sem Conserto')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white font-bold"
                >
                  <option value="Concluído">Consertado (Retorna ao Estoque Disponível)</option>
                  <option value="Sem Conserto">Sem Conserto (Descartar Equipamento)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Custo Total do Reparo (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={maintCost || ''}
                  onChange={(e) => setMaintCost(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                  placeholder="Ex: 1500.00"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Data de Retorno *</label>
                <input
                  type="date"
                  required
                  value={maintReturnDate}
                  onChange={(e) => setMaintReturnDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Peças Trocadas / Substituídas</label>
                <textarea
                  rows={2}
                  value={maintReplacedParts}
                  onChange={(e) => setMaintReplacedParts(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                  placeholder="Ex: Troca da placa-mãe, Substituição de conector RF..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Serviços Executados pela Empresa de Manutenção</label>
                <textarea
                  rows={2}
                  value={maintServicesPerformed}
                  onChange={(e) => setMaintServicesPerformed(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                  placeholder="Ex: Soldagem fria, Atualização de firmware e calibração de sinal..."
                />
              </div>

              <div className="md:col-span-3 flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReturningMaint(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                >
                  {loading ? 'Salvando...' : 'Salvar Entrada de Equipamento'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 3. Toggle List Tabs */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setMaintListTab('ativos')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                maintListTab === 'ativos' 
                  ? 'bg-amber-100 text-amber-800' 
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Wrench className="h-4 w-4" />
              Equipamentos em Manutenção ({activeMaintenances.length})
            </button>
            <button
              onClick={() => setMaintListTab('historico')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                maintListTab === 'historico' 
                  ? 'bg-slate-800 text-slate-100' 
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <History className="h-4 w-4" />
              Histórico de Manutenções ({pastMaintenances.length})
            </button>
          </div>
        </div>

        {/* 4. Display Lists */}
        {maintListTab === 'ativos' ? (
          activeMaintenances.length === 0 ? (
            <div className="bg-white p-12 text-center border border-slate-200 rounded-2xl text-slate-400 text-xs">
              Não há equipamentos em manutenção externa no momento.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-3 px-4">Equipamento</th>
                      <th className="py-3 px-4">S/N (Nº Série)</th>
                      <th className="py-3 px-4">Marca</th>
                      <th className="py-3 px-4">Assistência Externa</th>
                      <th className="py-3 px-4">Data de Envio</th>
                      <th className="py-3 px-4">Defeito Observado</th>
                      {isAdminOrTech && <th className="py-3 px-4 text-right">Ação</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {activeMaintenances.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{m.componentName}</td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-500">{m.componentSerial}</td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.componentBrand === 'Trimble' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-sky-50 text-sky-700 border-sky-100'}`}>
                            {m.componentBrand}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">{m.providerName}</td>
                        <td className="py-3 px-4 font-medium text-slate-500">
                          {new Date(m.sentDate).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={m.issueDescription}>
                          {m.issueDescription}
                        </td>
                        {isAdminOrTech && (
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setReturningMaint(m);
                                setMaintReturnDate(new Date().toISOString().split('T')[0]);
                                setError(null);
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 ml-auto"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Registrar Retorno
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          pastMaintenances.length === 0 ? (
            <div className="bg-white p-12 text-center border border-slate-200 rounded-2xl text-slate-400 text-xs">
              Nenhum histórico de manutenção registrado até o momento.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-3 px-4">Equipamento</th>
                      <th className="py-3 px-4">S/N</th>
                      <th className="py-3 px-4">Assistência Externa</th>
                      <th className="py-3 px-4">Período (Envio - Retorno)</th>
                      <th className="py-3 px-4">Peças / Serviços</th>
                      <th className="py-3 px-4">Custo</th>
                      <th className="py-3 px-4 text-right">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {pastMaintenances.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          <div>{m.componentName}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Defeito: {m.issueDescription}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">{m.componentSerial}</td>
                        <td className="py-3 px-4 font-medium text-slate-800">{m.providerName}</td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(m.sentDate).toLocaleDateString('pt-BR')} até {m.returnDate ? new Date(m.returnDate).toLocaleDateString('pt-BR') : 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs">
                          {m.replacedParts && <div><span className="font-bold">Peças:</span> {m.replacedParts}</div>}
                          {m.servicesPerformed && <div className="mt-0.5"><span className="font-bold">Serviços:</span> {m.servicesPerformed}</div>}
                          {!m.replacedParts && !m.servicesPerformed && <span className="text-slate-400 italic">Sem registros</span>}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {m.cost ? `R$ ${m.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            m.status === 'Concluído' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                              : 'bg-rose-50 text-rose-700 border-rose-100'
                          }`}>
                            {m.status === 'Concluído' ? 'Consertado' : 'Sem Conserto'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* Modal para cadastro de Nova Assistência Técnica */}
        {isAddingProvider && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" id="add-provider-modal">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
              <div className="bg-amber-50 border-b border-amber-100 px-6 py-4 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Wrench className="h-4.5 w-4.5 text-amber-600" />
                  Cadastrar Nova Assistência Técnica
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddingProvider(false)}
                  className="p-1 hover:bg-amber-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddProviderSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nome / Razão Social *</label>
                  <input
                    type="text"
                    required
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    placeholder="Ex: Laboratório Oeste GPS Ltda"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pessoa de Contato</label>
                  <input
                    type="text"
                    value={newProviderContact}
                    onChange={(e) => setNewProviderContact(e.target.value)}
                    placeholder="Ex: Engenheiro Carlos"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Telefone</label>
                    <input
                      type="text"
                      value={newProviderPhone}
                      onChange={(e) => setNewProviderPhone(e.target.value)}
                      placeholder="Ex: (45) 99988-7766"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
                    <input
                      type="email"
                      value={newProviderEmail}
                      onChange={(e) => setNewProviderEmail(e.target.value)}
                      placeholder="Ex: contato@oestegps.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Endereço Completo</label>
                  <input
                    type="text"
                    value={newProviderAddress}
                    onChange={(e) => setNewProviderAddress(e.target.value)}
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddingProvider(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                  >
                    {loading ? 'Salvando...' : 'Cadastrar Assistência'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" id="components-tab">
      
      {/* Header and Add Button */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Estoque de Hardware GPS</h1>
          <p className="text-slate-500 text-xs mt-1">
            {isAdminOrTech 
              ? 'Gerencie, adicione e altere detalhes de antenas, telas e controladoras, receptores.' 
              : 'Consulte a disponibilidade de equipamentos para instalações.'}
          </p>
        </div>

        {isAdminOrTech && !isAdding && !editingComp && (
          <div className="flex gap-2">
            <button
              onClick={() => { setShowMaintenanceView(true); resetForm(); }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
              id="open-maintenance-submodule"
            >
              <Wrench className="h-4 w-4" />
              Manutenção
            </button>
            <button
              onClick={() => { setIsAdding(true); resetForm(); }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
              id="open-add-component-form"
            >
              <Plus className="h-4 w-4" />
              Cadastrar Componente
            </button>
          </div>
        )}
      </div>

      {/* Forms Area */}
      {isAdminOrTech && isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-md animate-fade-in" id="add-component-form-block">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-md font-bold text-slate-900 flex items-center gap-1.5">
              <Cpu className="h-5 w-5 text-emerald-600" />
              Cadastrar Novo Equipamento
            </h2>
            <button 
              onClick={() => setIsAdding(false)} 
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && <p className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl text-xs mb-4">{error}</p>}

          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Número de Série (S/N) *</label>
              <input
                type="text"
                required
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: 563402432"
                id="input-comp-serial"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome/Modelo do Equipamento *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                placeholder="Ex: Trimble AG-372 / Monitor GFX-750"
                id="input-comp-name"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Marca/Fabricante *</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value as ComponentBrand)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                id="select-comp-brand"
              >
                <option value="Trimble">Trimble</option>
                <option value="Topcon">Topcon</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Componente *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                id="select-comp-type"
              >
                {componentTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Situação Inicial *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ComponentStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                id="select-comp-status"
              >
                <option value="Disponível">Disponível no Almoxarifado</option>
                <option value="Em Uso">Em Uso (Instalado)</option>
                <option value="Manutenção">Em Manutenção/Laboratório</option>
                <option value="Descartado">Descartado/Obsoleto</option>
              </select>
            </div>

            {status === 'Em Uso' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Instalado na Máquina (Prefixo)</label>
                <input
                  type="text"
                  value={currentMachine}
                  onChange={(e) => setCurrentMachine(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                  placeholder="Ex: T01 / C12"
                  id="input-comp-machine"
                />
              </div>
            )}

            <div className="md:col-span-3 flex justify-end gap-2 pt-2 border-t border-slate-100">
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
                id="add-comp-submit"
              >
                {loading ? 'Salvando...' : 'Cadastrar Equipamento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingComp && (
        <div className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-md animate-fade-in" id="edit-component-form-block">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-md font-bold text-slate-900 flex items-center gap-1.5">
              <Edit className="h-5 w-5 text-indigo-600" />
              Editar Informações do Equipamento
            </h2>
            <button 
              onClick={() => setEditingComp(null)} 
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && <p className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl text-xs mb-4">{error}</p>}

          <form onSubmit={handleUpdate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Número de Série (S/N)</label>
              <input
                type="text"
                disabled={!isAdminOrTech}
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-slate-50 disabled:opacity-75"
                placeholder="Ex: 563402432"
                id="edit-comp-serial"
              />
              {!isAdminOrTech && (
                <span className="text-[9px] text-slate-400 mt-0.5 block">S/N bloqueado para visualizadores.</span>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome/Modelo do Equipamento *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                placeholder="Ex: Trimble AG-372"
                id="edit-comp-name"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Marca/Fabricante</label>
              <select
                disabled={!isAdminOrTech}
                value={brand}
                onChange={(e) => setBrand(e.target.value as ComponentBrand)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white disabled:opacity-75"
                id="edit-comp-brand"
              >
                <option value="Trimble">Trimble</option>
                <option value="Topcon">Topcon</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Componente *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                id="edit-comp-type"
              >
                {componentTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Situação / Status *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ComponentStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                id="edit-comp-status"
              >
                <option value="Disponível">Disponível no Almoxarifado</option>
                <option value="Em Uso">Em Uso (Instalado)</option>
                <option value="Manutenção">Em Manutenção/Laboratório</option>
                <option value="Descartado">Descartado/Obsoleto</option>
              </select>
            </div>

            {status === 'Em Uso' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Instalado na Máquina (Prefixo)</label>
                <input
                  type="text"
                  value={currentMachine}
                  onChange={(e) => setCurrentMachine(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                  placeholder="Ex: T01 / C12"
                  id="edit-comp-machine"
                />
              </div>
            )}

            <div className="md:col-span-3 flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingComp(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                id="edit-comp-submit"
              >
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search and Filters panel */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          
          {/* Search text input */}
          <div className="flex-1 relative rounded-xl shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
              placeholder="Buscar por S/N, modelo ou prefixo de máquina..."
              id="search-components-input"
            />
          </div>

          {/* Brand select filter */}
          <div className="w-full md:w-44 flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap uppercase">Marca:</span>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="block w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none"
              id="filter-brand-select"
            >
              <option value="all">Todas as Marcas</option>
              <option value="Trimble">Trimble</option>
              <option value="Topcon">Topcon</option>
            </select>
          </div>

          {/* Status select filter */}
          <div className="w-full md:w-44 flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap uppercase">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="block w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none"
              id="filter-status-select"
            >
              <option value="all">Todos os Status</option>
              <option value="Disponível">Disponível</option>
              <option value="Em Uso">Em Uso</option>
              <option value="Manutenção">Manutenção</option>
              <option value="Descartado">Descartado</option>
            </select>
          </div>

        </div>
      </div>

      {/* Components Grid / Table */}
      {filteredComponents.length === 0 ? (
        <div className="bg-white p-12 text-center border border-slate-200 rounded-2xl text-slate-400 text-sm">
          Nenhum equipamento de piloto automático correspondente aos filtros foi encontrado.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="components-table-container">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-3 px-4">Equipamento</th>
                  <th className="py-3 px-4">Marca</th>
                  <th className="py-3 px-4">S/N (Nº Série)</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Máquina / Localização</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700" id="components-table-body">
                {filteredComponents.map((comp) => {
                  let statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                  if (comp.status === 'Disponível') statusBadge = 'bg-blue-50 text-blue-700 border-blue-100';
                  if (comp.status === 'Em Uso') statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                  if (comp.status === 'Manutenção') statusBadge = 'bg-amber-50 text-amber-700 border-amber-100';
                  if (comp.status === 'Descartado') statusBadge = 'bg-rose-50 text-rose-700 border-rose-100';

                  const brandBadge = comp.brand === 'Trimble' 
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-100' 
                    : 'bg-sky-50 text-sky-700 border-sky-100';

                  return (
                    <tr key={comp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {comp.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${brandBadge}`}>
                          {comp.brand}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-500">
                        {comp.serialNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-medium">
                        {comp.type}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusBadge}`}>
                          {comp.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {comp.status === 'Em Uso' ? (
                          (() => {
                            const foundMachine = machines.find(m => m.prefix.trim().toUpperCase() === (comp.currentMachine || '').trim().toUpperCase());
                            return (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md inline-block w-fit">
                                  {comp.currentMachine || 'N/A'}
                                </span>
                                {foundMachine && foundMachine.fleet && (
                                  <span className="text-[10px] text-slate-500 font-semibold mt-0.5 ml-0.5">
                                    {foundMachine.fleet}
                                  </span>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          <span className="text-slate-400 italic">Almoxarifado Central</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          {isAdminOrTech && (
                            <button
                              onClick={() => startEdit(comp)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors"
                              title="Editar equipamento"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          )}
                          
                          {isAdminOrTech && (
                            <button
                              onClick={() => handleDelete(comp.id)}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                              title="Excluir equipamento"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tech workflow guidance notice */}
      {(role === 'tecnico' || role === 'TECNICO_CAMPO') && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-xs text-amber-800">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Nota técnica para técnicos:</span>
            <p className="mt-1 leading-relaxed text-amber-700">
              Para instalar ou remover um componente de piloto automático de uma máquina, você deve utilizar a aba 
              <strong> "Movimentações / Serviços"</strong>. O lançamento oficial da atividade atualizará automaticamente 
              o status de uso e a localização do equipamento, mantendo o histórico de auditoria intacto.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
