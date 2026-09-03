import { createEquipmentAvailabilityResolver, AVAILABILITY_STYLES } from '../utils/equipmentAvailability';
import type { ComponentLoan } from '../types';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications } from './NotificationProvider';
import { 
  AutopilotComponent, 
  ComponentBrand, 
  ComponentStatus, 
  UserRole,
  ComponentMaintenance,
  Machine,
  MovementLog,
  Location,
  License
} from '../types';
import type { Partner, LocationEvent } from '../types';
import { StorageSelect, TransferDialog } from './StorageControls';
import EquipmentDetailModal from './EquipmentDetailModal';
import HelpGuideModal from './HelpGuideModal';
import {
  createEquipmentDestinationResolver,
  groupEquipmentByDestination,
  DESTINATION_LABELS,
  type DestinationKind,
  type EquipmentDestination,
  type EquipmentGrouping,
} from '../utils/equipmentDestinations';
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
  AlertTriangle,
  MoreVertical,
  SlidersHorizontal,
  MapPin,
  Tractor,
  Warehouse,
  Handshake,
  HelpCircle,
  Layers,
  FilterX
} from 'lucide-react';

const DESTINATION_ICONS = {
  machine: Tractor,
  internal: Warehouse,
  service: Wrench,
  loan: Handshake,
  unknown: MapPin,
} satisfies Record<DestinationKind, typeof MapPin>;

interface ComponentsTabProps {
  partners?: Partner[];
  defaultLocationId?: string;
  initialLocationFilter?: string;
  locationEvents?: LocationEvent[];
  onTransfer?: (ids: string[], locationId: string, notes: string) => Promise<void>;
  components: AutopilotComponent[];
  machines: Machine[];
  role: UserRole;
  initialStatusFilter?: ComponentStatus;
  initialBrandFilter?: string;
  focusComponentId?: string | null;
  onFocusConsumed?: () => void;
  componentTypes?: string[];
  serviceTypes?: string[];
  onAddComponent: (comp: Omit<AutopilotComponent, 'id' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
  onEditComponent: (id: string, updates: Partial<AutopilotComponent>) => Promise<void>;
  onDeleteComponent: (id: string) => Promise<void>;
  maintenances?: ComponentMaintenance[];
  onSendToMaintenance?: (maint: Omit<ComponentMaintenance, 'id' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
  onReturnFromMaintenance?: (maintId: string, returnData: {
    returnDate: string;
    returnLocationId: string;
    replacedParts: string;
    servicesPerformed: string;
    cost: number;
    status: 'Concluído' | 'Sem Conserto';
  }) => Promise<void>;
  // ── PR3 new (optional, backward compatible) ──
  loans?: ComponentLoan[];
  movements?: MovementLog[];
  locations?: Location[];
  licenses?: License[];
}

export default function ComponentsTab({
  partners = [], defaultLocationId = '', initialLocationFilter, locationEvents = [], onTransfer,
  components,
  machines = [],
  role,
  initialStatusFilter,
  initialBrandFilter,
  focusComponentId,
  onFocusConsumed,
  componentTypes: configuredComponentTypes = [],
  serviceTypes = [],
  onAddComponent,
  onEditComponent,
  onDeleteComponent,
  maintenances = [],
  onSendToMaintenance,
  onReturnFromMaintenance,
  loans = [], movements = [],
  locations = [],
  licenses = []
}: ComponentsTabProps) {
  const operational = useMemo(() => createEquipmentAvailabilityResolver({ movements, loans, maintenances, machines, locations }), [movements, loans, maintenances, machines, locations]);
  const isAdminOrTech = role === 'administrador' || role === 'tecnico' || role === 'ADMINISTRADOR' || role === 'TECNICO_CAMPO';
  const { showToast, confirmDialog } = useNotifications();

  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>(initialBrandFilter || 'all');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter || 'all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>(initialLocationFilter ? 'internal:location:' + initialLocationFilter : 'all');
  useEffect(() => { if (initialLocationFilter) { setLocationFilter('internal:location:' + initialLocationFilter); setStatusFilter('all'); setBrandFilter('all'); } }, [initialLocationFilter]);
  const [storageId, setStorageId] = useState(defaultLocationId);
  const [returnStorageId, setReturnStorageId] = useState(defaultLocationId);
  const [transferComp, setTransferComp] = useState<AutopilotComponent | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const assistancePartners = partners.filter(item => item.active && item.types.includes('Assistência técnica'));
  const [partnerId, setPartnerId] = useState('');
  const [groupBy, setGroupBy] = useState<EquipmentGrouping>('none');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [isAdding, setIsAdding] = useState(false);
  const [editingComp, setEditingComp] = useState<AutopilotComponent | null>(null);
  const [selectedComp, setSelectedComp] = useState<AutopilotComponent | null>(null);
  const [componentActionsOpen, setComponentActionsOpen] = useState(false);
  const componentActionsRef = useRef<HTMLDivElement>(null);

  const [helpOpen, setHelpOpen] = useState(false);

  const componentHelpSteps = [
    { title: 'Armazenamento e transferências', description: 'No cadastro, escolha um local ativo. Para mudar entre depósitos, abra o resumo → Localização → Transferir. Não altere o destino editando o cadastro. O local padrão é apenas uma sugestão.', icon: Warehouse, accent: 'bg-emerald-600 text-white' },
    {
      title: 'Filtrar e agrupar',
      description: 'Use os filtros (busca, marca, status e local) e selecione "Por localização" em "Agrupar" para organizar os equipamentos por destino.',
      icon: Filter,
      accent: 'bg-emerald-600 text-white'
    },
    {
      title: 'Agrupar por localização',
      description: 'O agrupamento mostra cada equipamento no contexto de onde ele está — no almoxarifado, em uma máquina, em assistência ou emprestado.',
      icon: Layers,
      accent: 'bg-slate-900 text-white'
    },
    {
      title: 'Enviar para manutenção',
      description: 'Escolha um parceiro do tipo Assistência técnica. O envio registra o destino e o histórico; no retorno, selecione o armazenamento de recebimento, mesmo quando não houver conserto.',
      icon: Wrench,
      accent: 'bg-amber-600 text-white'
    },
    {
      title: 'Parceiros como destino',
      description: 'Assistências vêm de Cadastros → Parceiros, sem criar cadastros duplicados. O vínculo é feito pelo identificador, não pelo nome digitado.',
      icon: MapPin,
      accent: 'bg-blue-600 text-white'
    },
    {
      title: 'Excluir = inativar',
      description: 'Excluir um equipamento o inativa (mantém histórico). A exclusão é bloqueada se houver O.S. ativa ou manutenção em andamento.',
      icon: ShieldAlert,
      accent: 'bg-rose-600 text-white'
    }
  ];

  // Focus a specific component (e.g. arriving from a maintenance notification): open its detail modal
  useEffect(() => {
    if (!focusComponentId) return;
    const target = components.find(c => c.id === focusComponentId) || null;
    setSelectedComp(target);
    onFocusConsumed?.();
  }, [focusComponentId, components, onFocusConsumed]);

  useEffect(() => {
    if (!componentActionsOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (componentActionsRef.current && !componentActionsRef.current.contains(event.target as Node)) {
        setComponentActionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setComponentActionsOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [componentActionsOpen]);

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
  const [maintComponentSearch, setMaintComponentSearch] = useState('');
  const [maintComponentPickerOpen, setMaintComponentPickerOpen] = useState(false);
  const [maintServiceType, setMaintServiceType] = useState('');
  const [maintIssueDescription, setMaintIssueDescription] = useState('');
  const [maintSentDate, setMaintSentDate] = useState(new Date().toISOString().split('T')[0]);

  const [returningMaint, setReturningMaint] = useState<ComponentMaintenance | null>(null);
  const [maintReturnDate, setMaintReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [maintReplacedParts, setMaintReplacedParts] = useState('');
  const [maintServicesPerformed, setMaintServicesPerformed] = useState('');
  const [maintCost, setMaintCost] = useState<number>(0);
  const [maintReturnStatus, setMaintReturnStatus] = useState<'Concluído' | 'Sem Conserto'>('Concluído');
  const [maintListTab, setMaintListTab] = useState<'ativos' | 'historico'>('ativos');

  useEffect(() => {
    if (!isAdding && !editingComp && !selectedComp && !isSendingToMaint && !returningMaint) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isAdding, editingComp, selectedComp, isSendingToMaint, returningMaint]);

  const handleSendToMaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintComponentId || !partnerId || !maintIssueDescription) {
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
          providerId: partnerId,
          providerName: assistancePartners.find(item => item.id === partnerId)?.legalName || '',
          serviceType: maintServiceType || undefined,
          issueDescription: maintIssueDescription,
          status: 'Em Manutenção'
        });
      }
      setIsSendingToMaint(false);
      setMaintComponentId('');
      setMaintComponentSearch('');
      setMaintComponentPickerOpen(false);
      setPartnerId('');

      setMaintServiceType('');
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
          returnLocationId: returnStorageId,
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
    setStorageId(defaultLocationId);
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
        currentMachine: '',
        currentLocationId: storageId
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
        status: editingComp.status,
        currentMachine: editingComp.currentMachine || ''
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
    setSelectedComp(null);
    setComponentActionsOpen(false);
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
    if (!isAdminOrTech) return false;
    const confirmed = await confirmDialog({
      title: 'Excluir Componente',
      message: 'Tem certeza de que deseja excluir este equipamento do cadastro? Ele será inativado e mantido no histórico.',
      confirmLabel: 'Sim, Excluir',
      cancelLabel: 'Cancelar',
      danger: true
    });
    if (confirmed) {
      try {
        await onDeleteComponent(id);
        return true;
      } catch (err: any) {
        showToast('error', err.message || 'Erro ao excluir componente.');
      }
    }
    return false;
  };

  const resolveDestination = useMemo(
    () => createEquipmentDestinationResolver(machines, locations, maintenances),
    [machines, locations, maintenances],
  );
  const destinations: Map<string, EquipmentDestination> = useMemo(
    () => new Map<string, EquipmentDestination>(components.map(component => [component.id, resolveDestination(component)])),
    [components, resolveDestination],
  );

  // Filtered listing
  const filteredComponents = components.filter(c => {
    const matchesSearch = c.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.currentMachine && c.currentMachine.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          destinations.get(c.id)!.label.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBrand = brandFilter === 'all' ? true : c.brand === brandFilter;
    const matchesStatus = statusFilter === 'all' ? true : operational(c).filterValue === statusFilter;
    const matchesType = typeFilter === 'all' ? true : c.type === typeFilter;
    const matchesLocation = locationFilter === 'all' ? true : destinations.get(c.id)!.key === locationFilter;

    return matchesSearch && matchesBrand && matchesStatus && matchesType && matchesLocation;
  });

  // Stable destination identities avoid merging distinct records with the same name.
  const locationOptions = Array.from(new Map<string, EquipmentDestination>([...Array.from(destinations.values()), ...locations.filter(item => item.kind === 'INTERNAL').map(item => ({ key: `internal:location:${item.id}`, kind: 'internal' as const, label: item.name }))].map(destination =>
    [destination.key, destination]
  )).values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR', { numeric: true }) || a.key.localeCompare(b.key)
  );


  // Group filtered components when groupBy is active
  const groupedComponents = groupEquipmentByDestination(filteredComponents, groupBy, c => destinations.get(c.id)!);

  const componentTypes = configuredComponentTypes.length > 0 ? configuredComponentTypes : [
    'Antena/Receptor',
    'Monitor/Display',
    'Controladora',
    'Motor de Passo',
    'Cabo/Chicote',
    'Sensor de Ângulo',
    'Outro'
  ];

  useEffect(() => { if (returningMaint) setReturnStorageId(defaultLocationId); }, [returningMaint?.id]);

  if (showMaintenanceView) {
    const activeMaintenances = maintenances.filter(m => m.status === 'Em Manutenção');
    const pastMaintenances = maintenances.filter(m => m.status !== 'Em Manutenção');
    const availableMaintenanceComponents = components.filter(c => operational(c).canSendToMaintenance);
    const maintenanceComponentMatches = availableMaintenanceComponents.filter(component => {
      const query = maintComponentSearch.trim().toLocaleLowerCase('pt-BR');
      if (!query || component.id === maintComponentId) return true;
      return [component.name, component.serialNumber, component.brand, component.type]
        .some(value => value.toLocaleLowerCase('pt-BR').includes(query));
    });

    return (
      <div className="space-y-4 animate-fade-in" id="maintenance-module">
        <button onClick={() => setHelpOpen(true)} className="float-right flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500" aria-label="Ajuda sobre manutenção externa"><HelpCircle size={18} /></button>
        <HelpGuideModal open={helpOpen} onClose={() => setHelpOpen(false)} title="Manutenção externa" steps={componentHelpSteps.filter(step => ['Enviar para manutenção', 'Parceiros como destino', 'Armazenamento e transferências'].includes(step.title))} />
        {/* Header */}
        <button
          onClick={() => { setShowMaintenanceView(false); setIsSendingToMaint(false); setReturningMaint(null); setError(null); }}
          className="flex min-h-9 w-fit items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar aos equipamentos
        </button>

        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Wrench className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900">Manutenção externa</h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                Acompanhe equipamentos enviados para assistência e registre o retorno após o reparo.
              </p>
            </div>
          </div>

          {isAdminOrTech && !isSendingToMaint && !returningMaint && (
            <button
              onClick={() => { setIsSendingToMaint(true); setError(null); }}
              className="flex min-h-10 shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-amber-700"
              id="send-to-maintenance-btn"
            >
              <Plus className="h-4 w-4" />
              Enviar equipamento
            </button>
          )}
        </div>

        {error && (
          <p className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl text-xs">
            {error}
          </p>
        )}

        {/* 1. Form Send to Maintenance */}
        {isSendingToMaint && createPortal(
          <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
            <button
              type="button"
              aria-label="Fechar envio para manutenção"
              className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
              onClick={() => !loading && setIsSendingToMaint(false)}
            />
            <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <Wrench className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900 sm:text-lg">Enviar equipamento</h2>
                    <p className="mt-0.5 text-xs text-slate-500">Registre o envio para uma assistência técnica externa.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !loading && setIsSendingToMaint(false)}
                  disabled={loading}
                  aria-label="Fechar formulário"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:py-5">
                <form onSubmit={handleSendToMaintSubmit} className="space-y-6">
              <section>
                <div className="mb-3">
                  <h3 className="text-xs font-bold text-slate-800">Encaminhamento</h3>
                  <p className="mt-0.5 text-[10px] text-slate-500">Defina o equipamento e a assistência responsável.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div
                className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setMaintComponentPickerOpen(false);
                  }
                }}
              >
                <label className="block text-xs font-bold text-slate-700 mb-1">Selecionar Equipamento Danificado *</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={maintComponentSearch}
                    onFocus={() => setMaintComponentPickerOpen(true)}
                    onClick={() => setMaintComponentPickerOpen(true)}
                    onChange={(event) => {
                      setMaintComponentSearch(event.target.value);
                      setMaintComponentId('');
                      setMaintComponentPickerOpen(true);
                    }}
                    role="combobox"
                    aria-expanded={maintComponentPickerOpen}
                    aria-controls="maintenance-component-options"
                    aria-autocomplete="list"
                    className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-9 text-xs text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    placeholder="Digite o nome, S/N ou marca"
                  />
                  {maintComponentSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setMaintComponentSearch('');
                        setMaintComponentId('');
                        setMaintComponentPickerOpen(true);
                      }}
                      aria-label="Limpar equipamento selecionado"
                      className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {maintComponentPickerOpen && (
                  <div
                    id="maintenance-component-options"
                    role="listbox"
                    className="absolute z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                  >
                    {maintenanceComponentMatches.length === 0 ? (
                      <p className="px-3 py-5 text-center text-xs text-slate-400">Nenhum equipamento encontrado.</p>
                    ) : maintenanceComponentMatches.map(component => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={maintComponentId === component.id}
                        key={component.id}
                        onClick={() => {
                          setMaintComponentId(component.id);
                          setMaintComponentSearch(`${component.name} · S/N ${component.serialNumber}`);
                          setMaintComponentPickerOpen(false);
                        }}
                        className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${maintComponentId === component.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-slate-800">{component.name}</span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">S/N {component.serialNumber}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{component.brand}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700" htmlFor="assistance-search">Assistência técnica *</label>
                <input id="assistance-search" value={providerSearch} onChange={event => setProviderSearch(event.target.value)} placeholder="Buscar parceiro por nome ou documento" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
                <select aria-label="Parceiro assistência técnica" required value={partnerId} onChange={event => setPartnerId(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">
                  <option value="">Selecione o parceiro</option>
                  {assistancePartners.filter(item => item.id === partnerId || (item.legalName + ' ' + (item.tradingName || '') + ' ' + item.document).toLocaleLowerCase().includes(providerSearch.toLocaleLowerCase())).map(item => <option key={item.id} value={item.id}>{item.tradingName || item.legalName} · {item.document}</option>)}
                </select>
                <p className="text-xs text-slate-500">Gerencie as assistências em Cadastros → Parceiros. O destino é vinculado ao parceiro selecionado.</p>
              </div>
                </div>
              </section>

              <section className="border-t border-slate-100 pt-5">
                <div className="mb-3">
                  <h3 className="text-xs font-bold text-slate-800">Detalhes do problema</h3>
                  <p className="mt-0.5 text-[10px] text-slate-500">Registre quando o equipamento foi enviado e o defeito observado.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start">
              <div className="sm:max-w-[180px]">
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
                  rows={5}
                  value={maintIssueDescription}
                  onChange={(e) => setMaintIssueDescription(e.target.value)}
                  className="min-h-28 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-xs leading-relaxed text-slate-900 focus:border-amber-500 focus:ring-amber-500"
                  placeholder="Descreva os sintomas, quando o problema começou e o que já foi verificado..."
                />
                 <p className="mt-1 text-[10px] text-slate-400">Inclua detalhes que ajudem a assistência a reproduzir o defeito.</p>
              </div>
                </div>

                <div className="mt-4 sm:max-w-xs">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de serviço</label>
                  <select
                    value={maintServiceType}
                    onChange={(e) => setMaintServiceType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-xs bg-white"
                  >
                    <option value="">Não especificado</option>
                    {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <p className="mt-1 text-[10px] text-slate-400">Tipos gerenciados em Configurações &gt; Cadastro &gt; Tipos de Serviço.</p>
                </div>
              </section>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
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
            </div>
          </div>,
          document.body
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
              <div className="md:col-span-3"><StorageSelect locations={locations} value={returnStorageId} onChange={setReturnStorageId} defaultId={defaultLocationId} /></div>
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-2 border-b border-slate-200 px-3 sm:px-4">
            <button
              onClick={() => setMaintListTab('ativos')}
              className={`flex min-h-12 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-bold transition-colors ${
                maintListTab === 'ativos' 
                  ? 'border-amber-500 text-amber-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Wrench className="h-4 w-4" />
              <span>Em manutenção</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${maintListTab === 'ativos' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{activeMaintenances.length}</span>
            </button>
            <button
              onClick={() => setMaintListTab('historico')}
              className={`flex min-h-12 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-bold transition-colors ${
                maintListTab === 'historico' 
                  ? 'border-slate-700 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <History className="h-4 w-4" />
              <span>Histórico</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${maintListTab === 'historico' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{pastMaintenances.length}</span>
            </button>
          </div>

        {/* 4. Display Lists */}
        <div className="p-3 sm:p-4">
        {maintListTab === 'ativos' ? (
          activeMaintenances.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-amber-200 bg-amber-50/30 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm ring-1 ring-amber-100">
                <Wrench className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-bold text-slate-800">Nenhum equipamento em manutenção</h3>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">Os equipamentos enviados para assistência aparecerão aqui.</p>
              {isAdminOrTech && (
                <button
                  type="button"
                  onClick={() => { setIsSendingToMaint(true); setError(null); }}
                  className="mt-4 flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Enviar equipamento
                </button>
              )}
            </div>
          ) : (
            <>
            {/* Mobile Cards */}
            <div className="md:hidden grid grid-cols-1 gap-4" id="active-maintenances-mobile-cards">
              {activeMaintenances.map((m) => (
                <div key={m.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.componentBrand === 'Trimble' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-sky-50 text-sky-700 border-sky-100'}`}>
                        {m.componentBrand}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-100">
                        Em Manutenção
                      </span>
                    </div>
                    {isAdminOrTech && (
                      <button
                        onClick={() => {
                          setReturningMaint(m);
                          setMaintReturnDate(new Date().toISOString().split('T')[0]);
                          setError(null);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 shrink-0"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Registrar Retorno
                      </button>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{m.componentName}</h3>
                    <p className="text-[10px] text-slate-500 font-mono font-medium mt-0.5">S/N: {m.componentSerial}</p>
                  </div>

                  <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3">
                    <p className="text-slate-600">
                      <span className="text-slate-400 font-medium">Assistência:</span> {m.providerName}
                    </p>
                    {m.serviceType && (
                      <p className="text-slate-600">
                        <span className="text-slate-400 font-medium">Tipo de serviço:</span> {m.serviceType}
                      </p>
                    )}
                    <p className="text-slate-600">
                      <span className="text-slate-400 font-medium">Enviado em:</span>{' '}
                      {new Date(m.sentDate).toLocaleDateString('pt-BR')}
                    </p>
                    <p className="text-slate-600">
                      <span className="text-slate-400 font-medium">Defeito:</span> {m.issueDescription}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-3" aria-label="Etapas da manutenção">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white"><Check className="h-3 w-3" /></span>
                    <span className="h-px flex-1 bg-amber-300" />
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-amber-500 bg-white"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /></span>
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-bold text-slate-400">3</span>
                  </div>
                  <div className="grid grid-cols-3 text-[9px] font-semibold text-slate-400">
                    <span>Enviado</span><span className="text-center text-amber-700">Na assistência</span><span className="text-right">Retorno</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
            </>
          )
        ) : (
          pastMaintenances.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                <History className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-bold text-slate-800">Histórico ainda vazio</h3>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">Manutenções finalizadas aparecerão aqui com serviços, peças e custos.</p>
            </div>
          ) : (
            <>
            {/* Mobile Cards */}
            <div className="md:hidden grid grid-cols-1 gap-4" id="past-maintenances-mobile-cards">
              {pastMaintenances.map((m) => (
                <div key={m.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      m.status === 'Concluído' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                        : 'bg-rose-50 text-rose-700 border-rose-100'
                    }`}>
                      {m.status === 'Concluído' ? 'Consertado' : 'Sem Conserto'}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                      {new Date(m.sentDate).toLocaleDateString('pt-BR')} até {m.returnDate ? new Date(m.returnDate).toLocaleDateString('pt-BR') : 'N/A'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{m.componentName}</h3>
                    <p className="text-[10px] text-slate-500 font-mono font-medium mt-0.5">S/N: {m.componentSerial}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Defeito: {m.issueDescription}</p>
                  </div>

                  <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3">
                    <p className="text-slate-600">
                      <span className="text-slate-400 font-medium">Assistência:</span> {m.providerName}
                    </p>
                    {m.replacedParts && (
                      <p className="text-slate-600"><span className="text-slate-400 font-medium">Peças:</span> {m.replacedParts}</p>
                    )}
                    {m.servicesPerformed && (
                      <p className="text-slate-600"><span className="text-slate-400 font-medium">Serviços:</span> {m.servicesPerformed}</p>
                    )}
                    <p className="font-bold text-slate-900">
                      Custo: {m.cost ? `R$ ${m.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
            </>
          )
        )}
        </div>
        </div>

      </div>
    );
  }

  return (
    <div className="space-y-6" id="components-tab">

      {/* Active preset filter chip (arrived from dashboard card) */}
      {(initialStatusFilter || initialBrandFilter) && (
        <div className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 animate-fade-in">
          <div className="flex items-center gap-2 text-xs text-indigo-800 font-semibold">
            <Filter className="h-4 w-4 text-indigo-600 shrink-0" />
            Filtro ativo:
            {initialStatusFilter && (
              <span className="bg-white px-2 py-0.5 rounded-lg border border-indigo-100">
                Status: {initialStatusFilter}
              </span>
            )}
            {initialBrandFilter && (
              <span className="bg-white px-2 py-0.5 rounded-lg border border-indigo-100">
                Marca: {initialBrandFilter}
              </span>
            )}
            <span className="text-indigo-600 font-bold">({filteredComponents.length} equipamento{filteredComponents.length === 1 ? '' : 's'})</span>
          </div>
          <button
            onClick={() => { setStatusFilter('all'); setBrandFilter('all'); }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-xl text-[10px] font-bold hover:bg-indigo-100 transition-all cursor-pointer"
            title="Limpar filtro e mostrar todos os componentes"
          >
            <X className="h-3.5 w-3.5" />
            Limpar filtro
          </button>
        </div>
      )}

      {/* Header and Add Button */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Equipamentos GPS</h1>
          <p className="text-slate-500 text-xs mt-1">
            {isAdminOrTech 
              ? 'Cadastre e acompanhe antenas, receptores, telas e controladoras da empresa.'
              : 'Consulte os equipamentos GPS cadastrados e suas situações atuais.'}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap md:justify-start">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="Ajuda sobre equipamentos GPS"
            title="Como usar esta tela"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
          {isAdminOrTech && !isAdding && !editingComp && (
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => { setShowMaintenanceView(true); resetForm(); }}
                className="flex min-h-10 items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-amber-700 sm:px-4"
                id="open-maintenance-submodule"
              >
                <Wrench className="h-4 w-4" />
                Manutenção
              </button>
              <button
                onClick={() => { setIsAdding(true); resetForm(); }}
                aria-label="Cadastrar novo equipamento"
                className="flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:px-4"
                id="open-add-component-form"
              >
                <Plus className="h-4 w-4" />
                Novo
              </button>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => {
                setMobileSearchOpen(open => !open);
                setMobileFiltersOpen(false);
              }}
              aria-label={mobileSearchOpen ? 'Fechar busca' : 'Buscar equipamentos'}
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
              onClick={() => {
                setMobileFiltersOpen(open => !open);
                setMobileSearchOpen(false);
              }}
              aria-label={mobileFiltersOpen ? 'Fechar filtros' : 'Filtrar equipamentos'}
              aria-expanded={mobileFiltersOpen}
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                mobileFiltersOpen || brandFilter !== 'all' || statusFilter !== 'all'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 text-slate-500'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {(brandFilter !== 'all' || statusFilter !== 'all') && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600" />
              )}
            </button>
          </div>
        </div>

        {mobileSearchOpen && (
          <div className="relative md:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              autoFocus
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-10 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Buscar por S/N, modelo ou máquina"
              aria-label="Buscar equipamentos"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Limpar busca"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {mobileFiltersOpen && (
          <div className="grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-2 md:hidden">
            <select
              value={brandFilter}
              onChange={(event) => setBrandFilter(event.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Filtrar por marca"
            >
              <option value="all">Todas as marcas</option>
              <option value="Trimble">Trimble</option>
              <option value="Topcon">Topcon</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Filtrar por status"
            >
              <option value="all">Todos os status</option>
              <option value="Disponível">Disponível</option>
              <option value="Em Uso">Em Uso</option>
              <option value="Manutenção">Manutenção pendente / em andamento</option>
              <option value="Reservado">Reservado para O.S.</option>
              <option value="Bloqueado">Pendências de cadastro</option>
              <option value="Descartado">Descartado</option>
            </select>
          </div>
        )}
      </div>

      {transferComp && onTransfer && <TransferDialog components={[transferComp]} locations={locations} defaultId={defaultLocationId} onClose={() => setTransferComp(null)} onTransfer={onTransfer} />}
      {selectedComp && (
        <EquipmentDetailModal
          locationEvents={locationEvents}
          onTransfer={onTransfer ? comp => { setSelectedComp(null); setTransferComp(comp); } : undefined}
          component={components.find(item => item.id === selectedComp.id) || selectedComp}
          machines={machines}
          locations={locations}
          movements={movements}
          loans={loans}
          maintenances={maintenances}
          licenses={licenses}
          isAdminOrTech={isAdminOrTech}
          onEdit={(comp) => {
            setComponentActionsOpen(false);
            startEdit(comp);
          }}
          onDelete={handleDelete}
          onClose={() => {
            setComponentActionsOpen(false);
            setSelectedComp(null);
          }}
        />
      )}

      {/* Forms Area */}
      {isAdminOrTech && isAdding && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" id="add-component-form-block">
          <button
            type="button"
            aria-label="Fechar cadastro de equipamento"
            className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
            onClick={() => !loading && setIsAdding(false)}
          />
          <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Cpu className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">Cadastrar equipamento GPS</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Adicione um novo equipamento ao cadastro da empresa.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !loading && setIsAdding(false)}
                disabled={loading}
                aria-label="Fechar cadastro"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:py-5">
              {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">{error}</p>}

              <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            <div className="sm:col-span-2"><StorageSelect locations={locations} value={storageId} onChange={setStorageId} defaultId={defaultLocationId} label="Armazenamento inicial" /><p className="mt-2 text-xs text-slate-500">O equipamento será cadastrado como disponível. Instalações são registradas por O.S.</p></div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-2 sm:col-span-2">
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
          </div>
        </div>
      , document.body)}

      {editingComp && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" id="edit-component-form-block">
          <button
            type="button"
            aria-label="Fechar edição do equipamento"
            className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
            onClick={() => !loading && setEditingComp(null)}
          />
          <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Edit className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-slate-900 sm:text-lg">Editar equipamento · {editingComp.serialNumber}</h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500">Atualize os dados cadastrais e a situação do equipamento.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !loading && setEditingComp(null)}
                disabled={loading}
                aria-label="Fechar edição"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:py-5">
              {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">{error}</p>}

              <form onSubmit={handleUpdate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            <div className="rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2"><strong>{editingComp.status}</strong><p>{resolveDestination(editingComp).label}</p><p className="mt-2 text-xs text-slate-500">Use transferência, O.S., empréstimo ou manutenção para alterar o destino.</p></div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-2 sm:col-span-2">
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
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                id="edit-comp-submit"
              >
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
              </form>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Search and Filters panel */}
      <div className="hidden space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:block">
        <div className="flex flex-col md:flex-row gap-3">
          
          {/* Search text input */}
          <div className={`${mobileSearchOpen ? 'block' : 'hidden'} relative flex-1 rounded-xl shadow-sm md:block`}>
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
          <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} w-full items-center gap-2 md:flex md:w-44`}>
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
          <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} w-full items-center gap-2 md:flex md:w-44`}>
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
              <option value="Manutenção">Manutenção pendente / em andamento</option>
              <option value="Reservado">Reservado para O.S.</option>
              <option value="Bloqueado">Pendências de cadastro</option>
              <option value="Descartado">Descartado</option>
            </select>
          </div>

          {/* Location select filter */}
          {locationOptions.length > 0 && (
            <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} w-full items-center gap-2 md:flex md:w-52`}>
              <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap uppercase">Local:</span>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="block w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none"
                id="filter-location-select"
              >
                <option value="all">Todos os Locais</option>
                {locationOptions.map((destination) => (
                  <option key={destination.key} value={destination.key}>
                    {destination.label} · {DESTINATION_LABELS[destination.kind].category}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Grouping toggle */}
          <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} w-full items-center gap-2 md:flex md:w-auto`}>
            <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap uppercase">Agrupar:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as EquipmentGrouping)}
              className="block w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none"
              id="group-components-select"
            >
              <option value="none">Sem agrupamento</option>
              <option value="location">Por localização</option>
            </select>
          </div>

        </div>
      </div>

      {/* Components Grid / Table (grouped view when grouping is active) */}
      {groupBy !== 'none' ? (
        <div className="space-y-4" id="components-grouped-view">
          {groupedComponents.map((group) => {
            const DestinationIcon = DESTINATION_ICONS[group.kind];
            return (
            <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 bg-slate-50 border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600">
                    <DestinationIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-slate-900">
                      {group.label}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] text-slate-500 font-medium">
                      <span>{DESTINATION_LABELS[group.kind].category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{group.items.length} equipamento{group.items.length === 1 ? '' : 's'}</span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((comp) => {
                  const destination = destinations.get(comp.id)!;
                  let statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                  if (comp.status === 'Disponível') statusBadge = 'bg-blue-50 text-blue-700 border-blue-100';
                  if (comp.status === 'Em Uso') statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                  if (comp.status === 'Manutenção') statusBadge = 'bg-amber-50 text-amber-700 border-amber-100';
                  if (comp.status === 'Descartado') statusBadge = 'bg-rose-50 text-rose-700 border-rose-100';
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => setSelectedComp(comp)}
                      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${AVAILABILITY_STYLES[operational(comp).tone]}`}>{operational(comp).label}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-100">{comp.brand}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 leading-tight">{comp.name}</p>
                      <p className="font-mono text-[10px] text-slate-500">S/N: {comp.serialNumber}</p>
                      <p className="break-words text-[11px] text-slate-600">
                        <span className="text-slate-400 font-medium">{DESTINATION_LABELS[destination.kind].field}:</span>{' '}
                        {destination.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}
          {filteredComponents.length === 0 && (
            <div className="bg-white p-12 text-center border border-slate-200 rounded-2xl text-slate-400 text-sm">
              Nenhum equipamento de piloto automático correspondente aos filtros foi encontrado.
            </div>
          )}
        </div>
      ) : filteredComponents.length === 0 ? (
        <div className="bg-white p-12 text-center border border-slate-200 rounded-2xl text-slate-400 text-sm">
          Nenhum equipamento de piloto automático correspondente aos filtros foi encontrado.
        </div>
      ) : (
        <>
        {/* Mobile Cards */}
        <div className="md:hidden grid grid-cols-1 gap-4" id="components-mobile-cards">
          {filteredComponents.map((comp) => {
            let statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
            if (comp.status === 'Disponível') statusBadge = 'bg-blue-50 text-blue-700 border-blue-100';
            if (comp.status === 'Em Uso') statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';
            if (comp.status === 'Manutenção') statusBadge = 'bg-amber-50 text-amber-700 border-amber-100';
            if (comp.status === 'Descartado') statusBadge = 'bg-rose-50 text-rose-700 border-rose-100';

            const brandBadge = comp.brand === 'Trimble' 
              ? 'bg-indigo-50 text-indigo-700 border-indigo-100' 
              : 'bg-sky-50 text-sky-700 border-sky-100';

            const destination = destinations.get(comp.id)!;

            return (
              <div 
                key={comp.id} 
                role="button"
                tabIndex={0}
                aria-label={`Abrir resumo do equipamento ${comp.name}`}
                onClick={() => setSelectedComp(comp)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedComp(comp);
                  }
                }}
                className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <div className="flex flex-wrap gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${brandBadge}`}>
                    {comp.brand}
                  </span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${AVAILABILITY_STYLES[operational(comp).tone]}`}>
                    {operational(comp).label}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900">{comp.name}</h3>
                  <p className="text-[10px] text-slate-500 font-mono font-medium mt-0.5">
                    S/N: {comp.serialNumber}
                  </p>
                </div>

                <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3">
                  <p className="text-slate-600">
                    <span className="text-slate-400 font-medium">Tipo:</span> {comp.type}
                  </p>
                  <p className="text-slate-600">
                    <span className="text-slate-400 font-medium">{DESTINATION_LABELS[destination.kind].field}:</span>{' '}
                    {destination.kind === 'machine' ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md inline-block w-fit">
                          {destination.label}
                        </span>
                        {destination.fleet && (
                          <span className="text-[10px] text-slate-500 font-semibold">
                            {destination.fleet}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="break-words">{destination.label}</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="components-table-container">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700" id="components-table-body">
                {filteredComponents.map((comp) => {
                  const destination = destinations.get(comp.id)!;
                  let statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                  if (comp.status === 'Disponível') statusBadge = 'bg-blue-50 text-blue-700 border-blue-100';
                  if (comp.status === 'Em Uso') statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                  if (comp.status === 'Manutenção') statusBadge = 'bg-amber-50 text-amber-700 border-amber-100';
                  if (comp.status === 'Descartado') statusBadge = 'bg-rose-50 text-rose-700 border-rose-100';

                  const brandBadge = comp.brand === 'Trimble' 
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-100' 
                    : 'bg-sky-50 text-sky-700 border-sky-100';

                  return (
                    <tr
                      key={comp.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Abrir resumo do equipamento ${comp.name}`}
                      onClick={() => setSelectedComp(comp)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedComp(comp);
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-slate-50/50 focus:outline-none focus-visible:bg-emerald-50/50"
                    >
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
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${AVAILABILITY_STYLES[operational(comp).tone]}`}>
                          {operational(comp).label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-slate-500">{DESTINATION_LABELS[destination.kind].field}</span>
                          <span className={destination.kind === 'machine'
                            ? 'font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md inline-block w-fit'
                            : 'text-slate-600'}>{destination.label}</span>
                          {destination.fleet && <span className="text-[10px] text-slate-500 font-semibold">{destination.fleet}</span>}
                        </div>
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

      <HelpGuideModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Como usar Equipamentos GPS"
        steps={componentHelpSteps}
      />

    </div>
  );
}
