import { createEquipmentAvailabilityResolver, resolveServiceAction, SERVICE_ACTIONS, orderItems } from '../utils/equipmentAvailability';
import { isAdminRole } from '../utils/roles';
import type { MaintenanceReturn } from '../utils/storageModel';
import type { ComponentLoan, ComponentMaintenance, Partner } from '../types';
import { StorageSelect } from './StorageControls';
import type { Location } from '../types';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  AutopilotComponent, 
  CompanyProfile,
  Machine, 
  MovementAction, 
  MovementLog, 
  MovementStatus,
  MovementHistoryEntry,
  UserRole,
  FieldDataCollection
} from '../types';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  X, 
  Kanban,
  MoreVertical,
  Play,
  Check,
  Ban,
  Clock,
  SlidersHorizontal,
  Edit,
  Trash2,
  ChevronDown,
  Download,
  HelpCircle,
  Layers,
  Wrench,
  History,
  ShieldCheck,
  Satellite,
  ArrowUpFromLine,
  Crosshair,
  ArrowLeft,
  ArrowRight,
  Warehouse,
  Send,
  ClipboardCheck,
  MapPin,
  CalendarDays,
  Package,
  MessageSquarePlus,
  User,
  StickyNote
} from 'lucide-react';
import FieldDataKanban from './FieldDataKanban';
import HelpGuideModal from './HelpGuideModal';
import { useNotifications } from './NotificationProvider';
import { generateOsPdf } from '../utils/osPdf';

interface MovementsTabProps {
  loans?: ComponentLoan[];
  maintenances?: ComponentMaintenance[];
  partners?: Partner[];
  locations?: Location[];
  defaultLocationId?: string;
  movements: MovementLog[];
  components: AutopilotComponent[];
  machines: Machine[];
  fieldDataCollections?: FieldDataCollection[];
  role: UserRole;
  currentUserId: string;
  currentUserName: string;
  extraServiceActions?: string[];
  companyProfile?: CompanyProfile | null;
  onAddMovement: (log: Omit<MovementLog, 'id' | 'technicianId' | 'technicianName' | 'createdAt'>) => Promise<void>;
  onUpdateMovement?: (movement: MovementLog, updates: Partial<MovementLog>) => Promise<void>;
  onAddNote?: (id: string, note: string) => Promise<void>;
  onDeleteMovement?: (movement: MovementLog) => Promise<void>;
  onCompleteCollection?: (machine: Machine, targetWeekId: string) => Promise<void>;
  onEnsureWeekRecords?: (machines: Machine[], targetWeekId: string) => Promise<void>;
  onTransitionOSStatus?: (movement: MovementLog, nextStatus: MovementStatus, actionLabel: string, detail?: string, locationId?: string, returnData?: MaintenanceReturn, scheduledDate?: string) => Promise<void>;
  initialSubTab?: 'os' | 'kanban';
  initialKanbanStatus?: 'Pendente' | 'Concluído';
  initialPrefill?: { action: MovementAction; componentId?: string } | null;
  onPrefillConsumed?: () => void;
  focusMovementId?: string | null;
  onMovementFocusConsumed?: () => void;
}

const STATUS_META: Record<MovementStatus, { label: string; dot: string; badge: string }> = {
  'Aberta': { label: 'Aberta', dot: 'bg-amber-500', badge: 'text-amber-700 bg-amber-50 border-amber-200' },
  'Agendada': { label: 'Agendada', dot: 'bg-sky-500', badge: 'text-sky-700 bg-sky-50 border-sky-200' },
  'Em Atendimento': { label: 'Em atendimento', dot: 'bg-blue-500', badge: 'text-blue-700 bg-blue-50 border-blue-200' },
  'Em Manutenção Interna': { label: 'Em manutenção interna', dot: 'bg-violet-500', badge: 'text-violet-700 bg-violet-50 border-violet-200' },
  'Em Assistência Externa': { label: 'Em assistência externa', dot: 'bg-orange-500', badge: 'text-orange-700 bg-orange-50 border-orange-200' },
  'Aguardando Conferência': { label: 'Aguardando conferência', dot: 'bg-indigo-500', badge: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  'Concluída': { label: 'Concluída', dot: 'bg-emerald-500', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  'Sem Conserto': { label: 'Sem conserto', dot: 'bg-rose-500', badge: 'text-rose-700 bg-rose-50 border-rose-200' },
  'Cancelada': { label: 'Cancelada', dot: 'bg-slate-400', badge: 'text-slate-500 bg-slate-50 border-slate-200' }
};

const ACTION_LABELS: Record<MovementAction, string> = {
  'Instalação': 'Instalação',
  'Remoção': 'Remoção',
  'Manutenção': 'Manutenção',
  'Calibração': 'Calibração'
};

type FormStepKey =
  | 'tipo'
  | 'equipamentos'
  | 'maquina'
  | 'destino'
  | 'execucao'
  | 'assistencia'
  | 'detalhes'
  | 'revisao';

interface FormStep {
  key: FormStepKey;
  label: string;
}

const ACTION_CARDS: { value: MovementAction; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'Instalação', label: 'Instalação', description: 'Colocar um GPS da estoque em uma máquina do campo', icon: Satellite },
  { value: 'Remoção', label: 'Remoção', description: 'Retirar o GPS de uma máquina de volta ao almoxarifado', icon: ArrowUpFromLine },
  { value: 'Manutenção', label: 'Manutenção', description: 'Enviar o equipamento para conserto interno ou assistência', icon: Wrench },
  { value: 'Calibração', label: 'Calibração', description: 'Ajuste de offset e calibrações periódicas', icon: Crosshair }
];

const ACTION_TONES: Record<MovementAction, { active: string; icon: string; check: string }> = {
  'Instalação': { active: 'border-emerald-500 bg-emerald-50/70', icon: 'bg-emerald-100 text-emerald-600', check: 'text-emerald-600' },
  'Remoção': { active: 'border-rose-500 bg-rose-50/70', icon: 'bg-rose-100 text-rose-600', check: 'text-rose-600' },
  'Manutenção': { active: 'border-amber-500 bg-amber-50/70', icon: 'bg-amber-100 text-amber-600', check: 'text-amber-600' },
  'Calibração': { active: 'border-sky-500 bg-sky-50/70', icon: 'bg-sky-100 text-sky-600', check: 'text-sky-600' }
};

const EXEC_TONES: Record<'INTERNAL' | 'EXTERNAL', { active: string; icon: string; check: string }> = {
  INTERNAL: { active: 'border-violet-500 bg-violet-50/70', icon: 'bg-violet-100 text-violet-600', check: 'text-violet-600' },
  EXTERNAL: { active: 'border-orange-500 bg-orange-50/70', icon: 'bg-orange-100 text-orange-600', check: 'text-orange-600' }
};

const getFormSteps = (act: MovementAction, exec: 'INTERNAL' | 'EXTERNAL'): FormStep[] => {
  const steps: FormStep[] = [
    { key: 'tipo', label: 'Tipo' },
    { key: 'equipamentos', label: 'Equipamentos' }
  ];
  if (act === 'Instalação') steps.push({ key: 'maquina', label: 'Máquina' });
  if (act === 'Remoção') steps.push({ key: 'destino', label: 'Destino' });
  if (act === 'Manutenção') {
    steps.push({ key: 'execucao', label: 'Execução' });
    if (exec === 'EXTERNAL') steps.push({ key: 'assistencia', label: 'Assistência' });
  }
  steps.push({ key: 'detalhes', label: 'Detalhes' });
  steps.push({ key: 'revisao', label: 'Revisão' });
  return steps;
};

const STEP_GUIDANCE: Record<FormStepKey, string> = {
  tipo: 'Comece escolhendo o tipo de serviço desta ordem.',
  equipamentos: 'Selecione um ou mais equipamentos GPS envolvidos na operação.',
  maquina: 'Escolha a máquina do campo que irá receber o GPS.',
  destino: 'Informe o almoxarifado onde o equipamento removido será depositado.',
  execucao: 'Defina como a manutenção será executada.',
  assistencia: 'Preencha os dados do envio para a assistência técnica.',
  detalhes: 'Registre a data/hora da operação e observações úteis.',
  revisao: 'Confira tudo antes de criar a ordem de serviço.'
};

function StepHeading({ icon: Icon, title, guidance }: { icon: React.ComponentType<{ className?: string }>; title: string; guidance: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        <p className="mt-0.5 text-xs text-slate-500">{guidance}</p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, stepIndex, multiline, onEdit }: { label: string; value: string; stepIndex: number; multiline?: boolean; onEdit: (idx: number) => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`mt-0.5 text-xs font-medium text-slate-800 ${multiline ? 'whitespace-pre-line' : 'break-words'}`}>{value}</p>
      </div>
      {stepIndex >= 0 && (
        <button
          type="button"
          onClick={() => onEdit(stepIndex)}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-emerald-600 transition-colors hover:bg-emerald-50"
        >
          Editar
        </button>
      )}
    </div>
  );
}

export default function MovementsTab({
  locations = [], defaultLocationId = '', loans = [], maintenances = [], partners = [],
  movements,
  components,
  machines,
  fieldDataCollections = [],
  role,
  currentUserId,
  currentUserName,
  extraServiceActions = [],
  companyProfile,
  onAddMovement,
  onUpdateMovement,
  onAddNote,
  onDeleteMovement,
  onCompleteCollection,
  onEnsureWeekRecords,
  onTransitionOSStatus,
  initialSubTab,
  initialKanbanStatus,
  initialPrefill,
  onPrefillConsumed,
  focusMovementId,
  onMovementFocusConsumed
}: MovementsTabProps) {
  const { showToast, confirmDialog } = useNotifications();
  const isAdmin = isAdminRole(role);
  const [subTab, setSubTab] = useState<'os' | 'kanban'>(initialSubTab || 'os');

  // OS list filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MovementStatus>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [technicianFilter, setTechnicianFilter] = useState<string>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // OS form / details / menu state
  const [isAdding, setIsAdding] = useState(false);
  const [editingMove, setEditingMove] = useState<MovementLog | null>(null);
  const [receivingLocationId, setReceivingLocationId] = useState(defaultLocationId);
  const [returnResult, setReturnResult] = useState<'Concluído' | 'Sem Conserto'>('Concluído');
  const [returnCost, setReturnCost] = useState('');
  const [returnParts, setReturnParts] = useState('');
  const [returnServices, setReturnServices] = useState('');
  const [orderLocationId, setOrderLocationId] = useState(defaultLocationId);
  const [selectedMove, setSelectedMove] = useState<MovementLog | null>(null);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  useEffect(() => {
    if (!focusMovementId) return;
    const target = movements.find(move => move.id === focusMovementId);
    if (target) {
      setSubTab('os');
      setSelectedMove(target);
    }
    onMovementFocusConsumed?.();
  }, [focusMovementId, movements, onMovementFocusConsumed]);
  useEffect(() => { setReceivingLocationId(selectedMove?.locationId || defaultLocationId); setReturnResult('Concluído'); setReturnCost(''); setReturnParts(''); setReturnServices(''); }, [selectedMove?.id]);
  useEffect(() => { setOrderLocationId(editingMove?.locationId || defaultLocationId); }, [editingMove?.id, isAdding]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadOption, setDownloadOption] = useState<'os' | 'os-historico'>('os');
  const [noteInput, setNoteInput] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleMove, setRescheduleMove] = useState<MovementLog | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const detailMenuRef = useRef<HTMLDivElement>(null);
  const equipmentListRef = useRef<HTMLDivElement>(null);
  const equipmentSearchRef = useRef<HTMLInputElement>(null);

  // Form states
  const [componentId, setComponentId] = useState('');
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([]);
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [activeEquipmentIndex, setActiveEquipmentIndex] = useState(-1);
  const [machineId, setMachineId] = useState('');
  const [machinePrefix, setMachinePrefix] = useState('');
  const [action, setAction] = useState<MovementAction>('Instalação');
  const [executionType, setExecutionType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [providerId, setProviderId] = useState('');
  const [sentDate, setSentDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [dateStr, setDateStr] = useState(new Date().toISOString().substring(0, 16));
  const [formStep, setFormStep] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [helpOpen, setHelpOpen] = useState(false);

  const osHelpSteps = [
    { title: 'Destino e recebimento', description: 'Abrir, agendar e iniciar não mudam o local físico. A instalação concluída vincula à máquina; a remoção exige um armazenamento ativo. Confira o recebimento no resumo antes de concluir. Calibração e manutenção interna preservam o local; assistência externa tem fluxo próprio.', icon: ShieldCheck, accent: 'bg-emerald-600 text-white' },
    {
      title: 'O.S. multi-equipamento',
      description: 'Uma única ordem de serviço pode envolver vários equipamentos GPS ao mesmo tempo — por exemplo, instalar antena e monitor no mesmo trator.',
      icon: Layers,
      accent: 'bg-emerald-600 text-white',
      content: (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600 shadow-sm">
          Marque a caixa de cada equipamento desejado. O <strong className="text-slate-800">primeiro marcado</strong> vira o <strong className="text-emerald-700">Principal</strong> e define o número e os dados de referência da O.S.
        </div>
      )
    },
    {
      title: 'Equipamentos elegíveis',
      description: 'A lista mostra apenas o que faz sentido para a operação escolhida. Itens inativados não aparecem.',
      icon: ClipboardList,
      accent: 'bg-slate-900 text-white',
      content: (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
          <div className="flex items-center justify-between"><span>Instalação</span><span className="font-bold text-slate-800">Apenas Disponíveis</span></div>
          <div className="flex items-center justify-between"><span>Remoção / Calibração</span><span className="font-bold text-slate-800">Apenas Em Uso</span></div>
          <div className="flex items-center justify-between"><span>Manutenção</span><span className="font-bold text-slate-800">Ativos em geral</span></div>
        </div>
      )
    },
    {
      title: 'Validação por equipamento',
      description: 'Antes de criar, o sistema confirma que nenhum dos equipamentos possui outra O.S. ativa e aponta exatamente qual conflita.',
      icon: ShieldCheck,
      accent: 'bg-blue-600 text-white'
    },
    {
      title: 'Conclusão atualiza todos',
      description: 'Ao concluir a O.S., todos os equipamentos vinculados mudam de estado juntos (em produção, em uma única transação).',
      icon: Wrench,
      accent: 'bg-violet-600 text-white'
    },
    {
      title: 'Edição pré-carregada',
      description: 'Ao editar uma O.S. aberta/agendada, a seleção vem preenchida com os equipamentos já vinculados. O.S. em atendimento, concluídas ou canceladas não podem ser editadas.',
      icon: History,
      accent: 'bg-amber-600 text-white'
    }
  ];

  // Close OS menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMenu = menuRef.current && menuRef.current.contains(target);
      const inTrigger = (e.target as HTMLElement).closest?.('[data-os-menu-trigger]');
      if (!inMenu && !inTrigger) {
        setMenuOpenId(null);
        setMenuAnchor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpenId(null);
        setMenuAnchor(null);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!selectedMove) {
      setDetailMenuOpen(false);
      return;
    }

    const closeDetailMenu = (event: MouseEvent) => {
      if (detailMenuRef.current && !detailMenuRef.current.contains(event.target as Node)) {
        setDetailMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailMenuOpen(false);
    };

    document.addEventListener('mousedown', closeDetailMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeDetailMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedMove]);

  useEffect(() => {
    setHistoryExpanded(false);
  }, [selectedMove?.id]);

  useEffect(() => {
    if (!isAdding && !editingMove && !selectedMove) return;
    const scrollY = window.scrollY;
    const previousStyles = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = previousStyles.position;
      document.body.style.top = previousStyles.top;
      document.body.style.width = previousStyles.width;
      document.body.style.overflow = previousStyles.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isAdding, editingMove, selectedMove]);

  // Derived: passos do fluxo guiado (adaptam-se ao tipo/execução escolhidos)
  const formSteps = getFormSteps(action, executionType);
  const safeStep = Math.min(formStep, formSteps.length - 1);
  const currentStep = formSteps[safeStep];
  const isReviewStep = currentStep.key === 'revisao';
  const si = (key: FormStepKey) => formSteps.findIndex(step => step.key === key);

  const validateStep = (idx: number): string | null => {
    const key = formSteps[idx]?.key;
    if (key === 'equipamentos' && selectedComponentIds.length === 0) {
      return 'Selecione ao menos um equipamento GPS.';
    }
    if (key === 'maquina' && !machinePrefix) {
      return 'Para instalação, você precisa especificar uma máquina destino.';
    }
    if (key === 'assistencia') {
      if (!providerId) return 'Selecione a assistência técnica.';
      if (!sentDate) return 'Informe a data de envio.';
      if (!issueDescription.trim()) return 'Descreva o defeito do equipamento.';
    }
    return null;
  };

  const handleNext = () => {
    const validationError = validateStep(safeStep);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setFormStep(safeStep + 1);
  };

  const handleBack = () => {
    setError(null);
    setFormStep(Math.max(0, safeStep - 1));
  };

  // Reset form
  const resetForm = () => {
    setComponentId('');
    setSelectedComponentIds([]);
    setEquipmentFilter('');
    setActiveEquipmentIndex(-1);
    setMachineId('');
    setMachinePrefix('');
    setAction('Instalação');
    setExecutionType('INTERNAL');
    setProviderId('');
    setSentDate(new Date().toISOString().split('T')[0]);
    setExpectedReturnDate('');
    setIssueDescription('');
    setNotes('');
    setDateStr(new Date().toISOString().substring(0, 16));
    setFormStep(0);
    setError(null);
  };

  useEffect(() => {
    if (!initialPrefill) return;
    setSelectedMove(null);
    setEditingMove(null);
    resetForm();
    setAction(initialPrefill.action);
    if (initialPrefill.componentId) {
      setComponentId(initialPrefill.componentId);
      setSelectedComponentIds([initialPrefill.componentId]);
    }
    setSubTab('os');
    setIsAdding(true);
    onPrefillConsumed?.();
  }, [initialPrefill]);

  const closeForm = (force = false) => {
    if (loading && !force) return;
    setIsAdding(false);
    setEditingMove(null);
    resetForm();  };

  // Escape fecha o modal da O.S. (quando nenhum suboverlay está aberto)
  useEffect(() => {
    if (!isAdding && !editingMove) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || helpOpen) return;
      if (loading) return;
      setIsAdding(false);
      setEditingMove(null);
      resetForm();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isAdding, editingMove, helpOpen, loading]);

  const startEdit = (movement: MovementLog) => {
    setSelectedMove(null);
    setEditingMove(movement);
    setIsAdding(false);
    setEquipmentFilter('');
    setActiveEquipmentIndex(-1);
    const ids = movement.componentIds && movement.componentIds.length > 0
      ? movement.componentIds
      : [movement.componentId];
    setComponentId(ids[0] || movement.componentId);
    setSelectedComponentIds(ids);
    setMachineId(movement.machineId || machines.find(machine => machine.prefix === movement.machinePrefix)?.id || '');
    setMachinePrefix(movement.machinePrefix === 'Almoxarifado' ? '' : movement.machinePrefix);
    const nextAction = (SERVICE_ACTIONS[resolveServiceAction(movement)!] || movement.action) as MovementAction;
    const nextExecution = movement.executionType || 'INTERNAL';
    setAction(nextAction);
    setExecutionType(nextExecution);
    setProviderId(movement.providerId || '');
    setSentDate(movement.sentDate || new Date().toISOString().split('T')[0]);
    setExpectedReturnDate(movement.expectedReturnDate || '');
    setIssueDescription(movement.issueDescription || '');
    setNotes(movement.notes || '');
    const date = movement.date?.toDate ? movement.date.toDate() : new Date(movement.date);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().substring(0, 16);
    setDateStr(localDate);
    setFormStep(getFormSteps(nextAction, nextExecution).length - 1);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedComponentIds.length === 0) {
      setError('Selecione ao menos um equipamento GPS.');
      return;
    }

    const primaryComp = components.find(c => c.id === componentId)
      || components.find(c => c.id === selectedComponentIds[0]);
    if (!primaryComp) {
      setError('Equipamento inválido.');
      return;
    }

    if (action === 'Instalação' && !machinePrefix) {
      setError('Para instalação, você precisa especificar uma máquina destino.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const linkedMachine = machines.find(machine => machine.id === machineId)
        || machines.find(machine => machine.prefix === machinePrefix);

      const isMaintenance = action === 'Manutenção';
      const isExternal = isMaintenance && executionType === 'EXTERNAL';
      const movementData = {
        componentId: primaryComp.id,
        componentSerial: primaryComp.serialNumber,
        componentName: primaryComp.name,
        machineId: linkedMachine?.id || '',
        machinePrefix: linkedMachine?.prefix || machinePrefix || 'Almoxarifado',
        action,
        serviceActionCode: resolveServiceAction({ action }),
        locationId: action === 'Remoção' ? orderLocationId : (isExternal ? orderLocationId : ''),
        date: new Date(dateStr).toISOString(),
        notes: notes.trim(),
        componentIds: selectedComponentIds,
        primaryComponentId: primaryComp.id,
        executionType: isMaintenance ? executionType : undefined,
        providerId: isExternal ? providerId : undefined,
        providerName: isExternal ? (partners.find(p => p.id === providerId)?.tradingName || partners.find(p => p.id === providerId)?.legalName || '') : undefined,
        sentDate: isExternal ? sentDate : undefined,
        expectedReturnDate: isExternal ? expectedReturnDate || undefined : undefined,
        issueDescription: isExternal ? issueDescription : undefined
      };

      if (editingMove) {
        if (!onUpdateMovement) throw new Error('A edição de O.S. não está disponível.');
        await onUpdateMovement(editingMove, movementData);
        showToast('success', `O.S. #${String(editingMove.osNumber || '').padStart(4, '0')} atualizada.`);
        closeForm(true);
        return;
      }

      await onAddMovement(movementData);

      showToast('success', 'Ordem de serviço criada com sucesso.');
      closeForm(true);

    } catch (err: any) {
      setError(err.message || 'Erro ao lançar ordem de serviço.');
    } finally {
      setLoading(false);
    }
  };

  const toggleComponentSelection = (id: string) => {
    setSelectedComponentIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      setComponentId(next[0] || '');
      const picked = components.find(c => c.id === id);
      if (picked && picked.currentMachine) {
        setMachinePrefix(picked.currentMachine);
        setMachineId(machines.find(machine => machine.prefix === picked.currentMachine)?.id || '');
      }
      return next;
    });
  };

  const sortedMovements = [...movements].sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
    const dateB = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
    return dateB - dateA;
  });

  const technicians = Array.from(new Set(movements.map(m => m.technicianName))).sort();
  const activeFilterCount = [statusFilter, actionFilter, technicianFilter].filter(value => value !== 'all').length;

  const filteredMovements = sortedMovements.filter(m => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q ||
      String(m.osNumber || '').includes(q) ||
      m.componentName.toLowerCase().includes(q) ||
      m.componentSerial.toLowerCase().includes(q) ||
      m.machinePrefix.toLowerCase().includes(q) ||
      m.technicianName.toLowerCase().includes(q) ||
      m.action.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || (m.status || 'Aberta') === statusFilter;
    const matchesAction = actionFilter === 'all' || m.action === actionFilter;
    const matchesTech = technicianFilter === 'all' || m.technicianName === technicianFilter;
    return matchesSearch && matchesStatus && matchesAction && matchesTech;
  });

  // Status quick counts (for filter shortcuts)
  const countByStatus = (s: MovementStatus) => movements.filter(m => (m.status || 'Aberta') === s).length;
  const quickCounts = [
    { key: 'all' as const, label: 'Todas', count: movements.length },
    { key: 'Aberta' as MovementStatus, label: 'Abertas', count: countByStatus('Aberta') },
    { key: 'Em Atendimento' as MovementStatus, label: 'Em atendimento', count: countByStatus('Em Atendimento') },
    { key: 'Concluída' as MovementStatus, label: 'Concluídas', count: countByStatus('Concluída') }
  ];

  const operational = createEquipmentAvailabilityResolver({ movements, loans, maintenances, machines, locations });

  // Passo 2 (equipamentos): disponibilidade + filtro global por S/N, marca, tipo e nome
  const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const step2ActionCode = action === 'Instalação' ? 'INSTALLATION' : action === 'Remoção' ? 'REMOVAL' : action === 'Calibração' ? 'CALIBRATION' : 'MAINTENANCE';
  const step2AllOptions = components
    .filter(c => c.active !== false)
    .map(c => ({ component: c, availability: operational(c, editingMove?.id) }));
  const equipmentSearchTerm = normalizeText(equipmentFilter.trim());
  const step2Options = step2AllOptions.filter(({ component: c }) => {
    if (!equipmentSearchTerm) return true;
    return normalizeText(`${c.serialNumber} ${c.brand} ${c.type} ${c.name}`).includes(equipmentSearchTerm);
  });

  const handleEquipmentListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = step2Options.length;
    if (count === 0) return;
    const current = activeEquipmentIndex >= 0 && activeEquipmentIndex < count ? activeEquipmentIndex : -1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveEquipmentIndex(current < 0 || current === count - 1 ? 0 : current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveEquipmentIndex(current <= 0 ? count - 1 : current - 1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveEquipmentIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveEquipmentIndex(count - 1);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (current < 0) {
          setActiveEquipmentIndex(0);
          break;
        }
        const option = step2Options[current];
        if (option && option.availability.canCreateOrder(step2ActionCode)) {
          toggleComponentSelection(option.component.id);
        }
        break;
      }
    }
  };

  useEffect(() => {
    if (activeEquipmentIndex < 0) return;
    const activeRow = equipmentListRef.current?.querySelector('[data-equipment-active="true"]') as HTMLElement | null;
    activeRow?.scrollIntoView({ block: 'nearest' });
  }, [activeEquipmentIndex]);

  const formatDate = (d: any) => {
    if (!d) return '-';
    const date = d?.toDate ? d.toDate() : new Date(d);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const formatDateTime = (d: any) => {
    if (!d) return '-';
    const date = d?.toDate ? d.toDate() : new Date(d);
    if (isNaN(date.getTime())) return '-';
    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getStatusMeta = (move: MovementLog) => STATUS_META[(move.status || 'Aberta')];
  const isExternalReturnPending = (move: MovementLog) => resolveServiceAction(move) === 'MAINTENANCE' && move.executionType === 'EXTERNAL' && (move.status || 'Aberta') === 'Em Assistência Externa';
  const isMaintenanceAwaitingConference = (move: MovementLog) => resolveServiceAction(move) === 'MAINTENANCE' && (move.status || 'Aberta') === 'Aguardando Conferência';

  const runTransition = async (move: MovementLog, nextStatus: MovementStatus, actionLabel: string, detail?: string, scheduledDate?: string) => {
    if (!onTransitionOSStatus) return false;
    if (nextStatus === 'Concluída' && resolveServiceAction(move) === 'REMOVAL' && (selectedMove?.id !== move.id || !receivingLocationId)) {
      setSelectedMove(move); showToast('info', 'Confira o local de recebimento no resumo antes de concluir.'); return false;
    }
    const externalReturn = isExternalReturnPending(move) && nextStatus === 'Aguardando Conferência';
    if (externalReturn && (selectedMove?.id !== move.id || !receivingLocationId)) {
      setSelectedMove(move); showToast('info', 'Informe o local de recebimento e o resultado do retorno no resumo antes de registrar.'); return false;
    }
    setConfirmingAction(move.id + nextStatus);
    setMenuOpenId(null);
    setMenuAnchor(null);
    try {
      const returnData: MaintenanceReturn | undefined = externalReturn ? {
        returnLocationId: receivingLocationId,
        status: returnResult,
        returnDate: new Date().toISOString().slice(0, 10),
        cost: returnCost ? Number(returnCost) : undefined,
        replacedParts: returnParts.trim() || undefined,
        servicesPerformed: returnServices.trim() || undefined
      } : undefined;
      const returnDetail = externalReturn
        ? `${returnResult === 'Concluído' ? 'Consertado' : 'Sem conserto'} · Recebido em ${locations.find(item => item.id === receivingLocationId)?.name || 'armazenamento'}${returnCost ? ` · Custo R$ ${Number(returnCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}${returnParts.trim() ? ` · Peças: ${returnParts.trim()}` : ''}`
        : detail;
      const locationId = nextStatus === 'Concluída' && resolveServiceAction(move) === 'REMOVAL'
        ? receivingLocationId || move.locationId
        : nextStatus === 'Sem Conserto' && resolveServiceAction(move) === 'MAINTENANCE'
          ? receivingLocationId || undefined
          : undefined;
      await onTransitionOSStatus(move, nextStatus, externalReturn ? 'Retorno da assistência registrado' : actionLabel, returnDetail, locationId, returnData, scheduledDate);
      showToast('success', `O.S. #${String(move.osNumber || '').padStart(4, '0')} atualizada para ${STATUS_META[nextStatus].label}.`);
      return true;
    } catch (err: any) {
      console.error('Falha na transição de O.S.:', err);
      showToast('error', err?.message || 'Não foi possível atualizar o status da O.S.');
      return false;
    } finally {
      setConfirmingAction(null);
    }
  };

  const canEditMovement = (move: MovementLog) => ['Aberta', 'Agendada'].includes(move.status || 'Aberta') && Boolean(onUpdateMovement);
  const canDeleteMovement = (move: MovementLog) => isAdmin && ['Aberta', 'Agendada'].includes(move.status || 'Aberta') && Boolean(onDeleteMovement);

  const requestDeleteMovement = async (move: MovementLog) => {
    if (!onDeleteMovement) return;
    const confirmed = await confirmDialog({
      title: `Excluir O.S. #${String(move.osNumber || '').padStart(4, '0')}?`,
      message: 'Esta ação remove definitivamente a ordem ainda não executada. Para ordens que já começaram, utilize Cancelar O.S. para preservar o histórico.',
      confirmLabel: 'Excluir O.S.',
      cancelLabel: 'Manter O.S.',
      danger: true
    });
    if (!confirmed) return;

    setConfirmingAction(move.id + 'delete');
    try {
      await onDeleteMovement(move);
      setSelectedMove(null);
      setMenuOpenId(null);
      setMenuAnchor(null);
      showToast('success', 'Ordem de serviço excluída.');
    } catch (err: any) {
      showToast('error', err?.message || 'Não foi possível excluir a O.S.');
    } finally {
      setConfirmingAction(null);
    }
  };

  const requestCancelMovement = async (move: MovementLog) => {
    const confirmed = await confirmDialog({
      title: `Cancelar O.S. #${String(move.osNumber || '').padStart(4, '0')}?`,
      message: 'A ordem permanecerá no histórico como cancelada e não alterará a situação do equipamento.',
      confirmLabel: 'Cancelar O.S.',
      cancelLabel: 'Voltar',
      danger: true
    });
    if (!confirmed) return;
    const succeeded = await runTransition(move, 'Cancelada', 'O.S. cancelada');
    if (succeeded) setSelectedMove(null);
  };

  const requestAddNote = async (move: MovementLog, note: string) => {
    if (!onAddNote) return false;
    const trimmed = note.trim();
    if (!trimmed) return false;
    try {
      await onAddNote(move.id, trimmed);
      showToast('success', 'Observação adicionada com sucesso.');
      return true;
    } catch (err: any) {
      showToast('error', err?.message || 'Não foi possível adicionar a observação.');
      return false;
    }
  };

  const requestStatusTransition = async (move: MovementLog, nextStatus: MovementStatus, actionLabel: string, scheduledDate?: string) => {
    if (nextStatus === 'Concluída') {
      const confirmed = await confirmDialog({
        title: `Concluir O.S. #${String(move.osNumber || '').padStart(4, '0')}?`,
        message: 'A conclusão será registrada no histórico e atualizará automaticamente a situação e a localização do equipamento.',
        confirmLabel: 'Concluir O.S.',
        cancelLabel: 'Voltar'
      });
      if (!confirmed) return false;
    }
    return runTransition(move, nextStatus, actionLabel, scheduledDate ? `Reagendado para ${formatDateTime(new Date(scheduledDate).toISOString())}` : undefined, scheduledDate);
  };

  const availableTransitions = (move: MovementLog): { status: MovementStatus; label: string }[] => {
    const s = move.status || 'Aberta';
    const isMaintenance = resolveServiceAction(move) === 'MAINTENANCE';
    const isExternal = isMaintenance && move.executionType === 'EXTERNAL';
    switch (s) {
      case 'Aberta':
        return [
          { status: 'Agendada', label: 'Agendar atendimento' },
          { status: 'Em Atendimento', label: 'Iniciar atendimento' },
          { status: 'Cancelada', label: 'Cancelar O.S.' }
        ];
      case 'Agendada':
        return [
          { status: 'Aberta', label: 'Voltar para aberta' },
          { status: 'Em Atendimento', label: 'Iniciar atendimento' },
          { status: 'Cancelada', label: 'Cancelar O.S.' }
        ];
      case 'Em Atendimento':
        if (isMaintenance && isExternal) {
          return [
            { status: 'Em Assistência Externa', label: 'Enviar à assistência' },
            { status: 'Cancelada', label: 'Cancelar O.S.' }
          ];
        }
        if (isMaintenance) {
          return [
            { status: 'Em Manutenção Interna', label: 'Iniciar reparo interno' },
            { status: 'Agendada', label: 'Reagendar atendimento' },
            { status: 'Cancelada', label: 'Cancelar O.S.' }
          ];
        }
        return [
          { status: 'Agendada', label: 'Reagendar atendimento' },
          { status: 'Concluída', label: 'Concluir O.S.' },
          { status: 'Cancelada', label: 'Cancelar O.S.' }
        ];
      case 'Em Manutenção Interna':
        return [
          { status: 'Aguardando Conferência', label: 'Reparo concluído' },
          { status: 'Cancelada', label: 'Cancelar O.S.' }
        ];
      case 'Em Assistência Externa':
        return [
          { status: 'Aguardando Conferência', label: 'Registrar retorno da assistência' },
          { status: 'Cancelada', label: 'Cancelar O.S.' }
        ];
      case 'Aguardando Conferência':
        return [
          { status: 'Concluída', label: 'Concluir O.S.' },
          { status: 'Sem Conserto', label: 'Sem conserto (descartar)' },
          { status: 'Cancelada', label: 'Cancelar O.S.' }
        ];
      default:
        return [];
    }
  };

  const renderStatusBadge = (move: MovementLog) => {
    const meta = getStatusMeta(move);
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${meta.badge}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    );
  };

  const toggleOSMenu = (moveId: string, button: HTMLButtonElement) => {
    if (menuOpenId === moveId) {
      setMenuOpenId(null);
      setMenuAnchor(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = 192;
    const move = movements.find(item => item.id === moveId);
    const menuItems = move ? availableTransitions(move).length + (canEditMovement(move) ? 1 : 0) + (canDeleteMovement(move) ? 1 : 0) : 0;
    const estimatedMenuHeight = 8 + menuItems * 36;
    const left = Math.min(rect.left, window.innerWidth - menuWidth - 8);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= estimatedMenuHeight
      ? rect.bottom + 4
      : Math.max(8, rect.top - estimatedMenuHeight - 4);
    setMenuAnchor({ top, left });
    setMenuOpenId(moveId);
  };

  return (
    <div className="space-y-5" id="movements-tab">

      {/* Page header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Serviços de Campo</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Gerencie ordens de serviço, manutenções e recolhimentos.
            </p>
          </div>
        </div>

        {/* Sub-tabs (navigation) */}
        <div className="mt-4 grid grid-cols-2 border-b border-slate-200 sm:flex sm:items-center sm:gap-5" id="movements-sub-tabs">
          <button
            onClick={() => setSubTab('os')}
            className={`-mb-px flex min-w-0 cursor-pointer items-center justify-center gap-2 border-b-2 px-1 pb-2.5 text-[13px] font-bold transition-colors sm:shrink-0 sm:justify-start sm:px-0 sm:text-sm ${subTab === 'os' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <ClipboardList className="h-4 w-4" />
            Ordens de serviço
          </button>
          <button
            onClick={() => setSubTab('kanban')}
            className={`-mb-px flex min-w-0 cursor-pointer items-center justify-center gap-2 border-b-2 px-1 pb-2.5 text-[13px] font-bold transition-colors sm:shrink-0 sm:justify-start sm:px-0 sm:text-sm ${subTab === 'kanban' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Kanban className="h-4 w-4" />
            <span className="sm:hidden">Recolhimento</span>
            <span className="hidden sm:inline">Recolhimento semanal</span>
          </button>
        </div>
      </div>

      {subTab === 'kanban' ? (
        <FieldDataKanban
          machines={machines}
          fieldDataCollections={fieldDataCollections}
          role={role}
          currentUserName={currentUserName}
          initialStatusFilter={initialKanbanStatus}
          onCompleteCollection={onCompleteCollection || (async () => {})}
          onEnsureWeekRecords={onEnsureWeekRecords}
        />
      ) : (
        <>
        {/* Sub-area header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">Ordens de serviço</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              Acompanhe instalações, manutenções e recolhimentos.
            </p>
          </div>
          {!isAdding && !editingMove && (
            <div className="flex shrink-0 items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                aria-label="Ajuda sobre ordens de serviço"
                title="Como usar esta tela"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
              <button
                onClick={() => { setIsAdding(true); resetForm(); }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:px-4"
                id="open-add-movement-form"
              >
                <Plus className="h-4 w-4" />
                <span className="sm:hidden">Nova ordem</span>
                <span className="hidden sm:inline">Nova ordem de serviço</span>
              </button>
            </div>
          )}
        </div>

        {/* Quick status counts */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          {quickCounts.map(qc => (
            <button
              key={qc.key}
              onClick={() => setStatusFilter(qc.key as any)}
              className={`w-full cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors sm:w-auto ${statusFilter === qc.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {qc.label} <span className="opacity-70">{qc.count}</span>
            </button>
          ))}
        </div>

        {/* Filters + table in one functional container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="os-list-container">

          {/* Filters bar */}
          <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:p-4 lg:flex-row">
            <div className="flex gap-2 lg:flex-1">
              <div className="relative min-w-0 flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Buscar ordem de serviço..."
                  aria-label="Buscar por O.S., equipamento, série, veículo ou técnico"
                  id="search-movements-input"
                />
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(open => !open)}
                aria-expanded={mobileFiltersOpen}
                aria-controls="mobile-os-filters"
                className={`relative flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors lg:hidden ${
                  mobileFiltersOpen || activeFilterCount > 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            <div
              id="mobile-os-filters"
              className={`${mobileFiltersOpen ? 'grid' : 'hidden'} grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 lg:flex lg:bg-transparent lg:p-0`}
            >
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="min-h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 lg:bg-slate-50"
                id="filter-movement-status-select"
              >
                <option value="all">Status: Todos</option>
                <option value="Aberta">Aberta</option>
                <option value="Agendada">Agendada</option>
                <option value="Em Atendimento">Em atendimento</option>
                <option value="Em Manutenção Interna">Em manutenção interna</option>
                <option value="Em Assistência Externa">Em assistência externa</option>
                <option value="Aguardando Conferência">Aguardando conferência</option>
                <option value="Concluída">Concluída</option>
                <option value="Sem Conserto">Sem conserto</option>
                <option value="Cancelada">Cancelada</option>
              </select>

              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="min-h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 lg:bg-slate-50"
                id="filter-movement-action-select"
              >
                <option value="all">Tipo: Todos</option>
                <option value="Instalação">Instalação</option>
                <option value="Remoção">Remoção</option>
                <option value="Manutenção">Manutenção</option>
                <option value="Calibração">Calibração</option>
              </select>

              <select
                value={technicianFilter}
                onChange={(e) => setTechnicianFilter(e.target.value)}
                className="col-span-2 min-h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 lg:col-span-1 lg:bg-slate-50"
                id="filter-movement-technician-select"
              >
                <option value="all">Técnico: Todos</option>
                {technicians.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setActionFilter('all');
                    setTechnicianFilter('all');
                  }}
                  className="col-span-2 min-h-9 rounded-lg text-xs font-semibold text-slate-500 transition-colors hover:bg-white hover:text-slate-700 lg:hidden"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            {!mobileFiltersOpen && activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 lg:hidden" aria-label="Filtros ativos">
                {statusFilter !== 'all' && (
                  <button type="button" onClick={() => setStatusFilter('all')} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600">
                    {STATUS_META[statusFilter].label} <X className="h-3 w-3" />
                  </button>
                )}
                {actionFilter !== 'all' && (
                  <button type="button" onClick={() => setActionFilter('all')} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600">
                    {actionFilter} <X className="h-3 w-3" />
                  </button>
                )}
                {technicianFilter !== 'all' && (
                  <button type="button" onClick={() => setTechnicianFilter('all')} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600">
                    {technicianFilter} <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Create / edit OS form */}
          {(isAdding || editingMove) && createPortal(
            <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" id="add-movement-form-block">
              <button
                type="button"
                aria-label="Fechar formulário de nova ordem"
                className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
                onClick={() => closeForm()}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={editingMove ? `Editar O.S. #${String(editingMove.osNumber || '').padStart(4, '0')}` : 'Nova ordem de serviço'}
                className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl"
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <ClipboardList className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 sm:text-lg">
                        {editingMove ? `Editar O.S. #${String(editingMove.osNumber || '').padStart(4, '0')}` : 'Nova ordem de serviço'}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {editingMove ? 'Ajuste os dados antes do início do atendimento.' : 'Informe os dados necessários para abrir o atendimento.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => closeForm()}
                    disabled={loading}
                    aria-label="Fechar formulário"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:py-5">
                  {success && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-600">{success}</p>}

                  {/* Stepper guiado: mostra a sequência de criação da O.S. */}
                  <div className="mb-4">
                    <div className="flex items-center gap-1 overflow-x-auto pb-1">
                      {formSteps.map((step, idx) => {
                        const isDone = idx < safeStep;
                        const isCurrent = idx === safeStep;
                        const isFuture = idx > safeStep;
                        return (
                          <React.Fragment key={step.key}>
                            {idx > 0 && (
                              <span className={`h-0.5 w-4 shrink-0 rounded-full ${idx <= safeStep ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                            )}
                            <button
                              type="button"
                              onClick={() => { if (!isFuture && !loading) { setError(null); setFormStep(idx); } }}
                              disabled={isFuture}
                              aria-current={isCurrent ? 'step' : undefined}
                              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border py-1 pl-1 pr-2.5 text-[11px] font-bold transition-colors ${
                                isCurrent
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                  : isDone
                                    ? 'border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50'
                                    : 'border-slate-200 bg-white text-slate-400'
                              } ${isFuture ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                                isDone ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                              }`}>
                                {isDone ? <Check className="h-3 w-3" /> : idx + 1}
                              </span>
                              <span>{step.label}</span>
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Passo {safeStep + 1} de {formSteps.length} · {STEP_GUIDANCE[currentStep.key]}
                    </p>
                  </div>

                  <form
                    id="new-os-form"
                    onSubmit={handleSubmit}
                    className="space-y-4"
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }}
                  >
                    {currentStep.key === 'tipo' && (
                      <div>
                        <StepHeading icon={Layers} title="Qual é o tipo do serviço?" guidance={STEP_GUIDANCE.tipo} />
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {ACTION_CARDS.map((card) => {
                            const selected = action === card.value;
                            const tone = ACTION_TONES[card.value];
                            const Icon = card.icon;
                            return (
                              <button
                                key={card.value}
                                type="button"
                                onClick={() => {
                                  setAction(card.value);
                                  setComponentId('');
                                  setSelectedComponentIds([]);
                                  setEquipmentFilter('');
                                  setActiveEquipmentIndex(-1);
                                  setMachineId('');
                                  setMachinePrefix('');
                                  setError(null);
                                }}
                                aria-pressed={selected}
                                className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all ${selected ? tone.active : 'border-slate-200 bg-white hover:border-slate-300'}`}
                              >
                                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
                                  <Icon className="h-5 w-5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-bold text-slate-900">{card.label}</span>
                                  <span className="mt-0.5 block text-xs leading-snug text-slate-500">{card.description}</span>
                                </span>
                                {selected && <Check className={`h-5 w-5 shrink-0 ${tone.check}`} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {currentStep.key === 'equipamentos' && (
                      <div>
                        <StepHeading icon={Package} title="Quais equipamentos participam?" guidance={STEP_GUIDANCE.equipamentos} />
                        <label htmlFor="equipment-step-search" className="mt-3 block text-xs font-bold text-slate-700 mb-1">
                          Equipamentos GPS * {action === 'Instalação' && '(Apenas Disponíveis)'}
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                            <Search className="h-4 w-4" />
                          </div>
                          <input
                            id="equipment-step-search"
                            ref={equipmentSearchRef}
                            type="search"
                            value={equipmentFilter}
                            onChange={(e) => {
                              setEquipmentFilter(e.target.value);
                              setActiveEquipmentIndex(e.target.value.trim() ? 0 : -1);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown' && step2Options.length > 0) {
                                e.preventDefault();
                                setActiveEquipmentIndex(prev => (prev < 0 ? 0 : prev));
                                equipmentListRef.current?.focus();
                              }
                            }}
                            className="block min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder="Buscar por S/N, marca, tipo ou nome..."
                            aria-label="Buscar equipamentos por número de série, marca, tipo ou nome"
                            autoFocus
                          />
                          {equipmentFilter && (
                            <button
                              type="button"
                              onClick={() => {
                                setEquipmentFilter('');
                                setActiveEquipmentIndex(-1);
                                equipmentSearchRef.current?.focus();
                              }}
                              aria-label="Limpar busca de equipamentos"
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition-colors hover:text-slate-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        {equipmentFilter.trim() && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            {step2Options.length} de {step2AllOptions.length} equipamentos
                          </p>
                        )}
                        <div
                          ref={equipmentListRef}
                          role="listbox"
                          aria-label="Lista de equipamentos GPS"
                          aria-multiselectable="true"
                          tabIndex={0}
                          onKeyDown={handleEquipmentListKeyDown}
                          className="mt-2 max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                          {step2Options.length === 0 ? (
                            <p className="px-3 py-5 text-center text-xs text-slate-400">
                              {equipmentFilter.trim() && step2AllOptions.length > 0
                                ? `Nenhum equipamento encontrado para "${equipmentFilter.trim()}".`
                                : 'Nenhum equipamento disponível para esta operação.'}
                            </p>
                          ) : step2Options.map(({ component: c, availability }, index) => {
                            const checked = selectedComponentIds.includes(c.id);
                            const primary = c.id === componentId;
                            const blocked = !availability.canCreateOrder(step2ActionCode);
                            const isActive = index === activeEquipmentIndex;
                            return (
                              <div
                                key={c.id}
                                role="option"
                                aria-selected={checked}
                                aria-disabled={blocked || undefined}
                                data-equipment-active={isActive ? 'true' : undefined}
                                onClick={() => {
                                  if (blocked) return;
                                  setActiveEquipmentIndex(index);
                                  toggleComponentSelection(c.id);
                                }}
                                className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 bg-white'} ${isActive ? 'ring-2 ring-emerald-500' : ''} ${blocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-slate-300'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={blocked}
                                  readOnly
                                  tabIndex={-1}
                                  className="pointer-events-none h-4 w-4 rounded border-slate-300 text-emerald-600"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold text-slate-800">{c.brand} {c.name}</span>
                                  <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">
                                    S/N: {c.serialNumber} · {c.type} · {c.status === 'Em Uso' && c.currentMachine ? c.currentMachine : c.status}
                                  </span>
                                  {blocked && availability.blockReason && (
                                    <span className="mt-0.5 block text-[10px] font-medium text-rose-600">{availability.blockReason}</span>
                                  )}
                                </span>
                                {primary && (
                                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">Principal</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {selectedComponentIds.length > 1 && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            {selectedComponentIds.length} equipamentos selecionados. O primeiro selecionado (marcado como "Principal") define os dados principais da O.S.
                          </p>
                        )}
                      </div>
                    )}

                    {currentStep.key === 'maquina' && (
                      <div>
                        <StepHeading icon={MapPin} title="Qual máquina vai receber o GPS?" guidance={STEP_GUIDANCE.maquina} />
                        <label className="mt-3 block text-xs font-bold text-slate-700 mb-1">Máquina do Campo *</label>
                        <select
                          required
                          value={machinePrefix}
                          onChange={(e) => {
                            const nextPrefix = e.target.value;
                            setMachinePrefix(nextPrefix);
                            setMachineId(machines.find(machine => machine.prefix === nextPrefix)?.id || '');
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                          id="select-movement-machine"
                        >
                          <option value="">-- Selecione a Máquina --</option>
                          {machines.filter(m => m.active !== false).map(m => (
                            <option key={m.id} value={m.prefix}>
                              {m.prefix} - {m.brand} {m.model} ({m.type}){m.fleet ? ` [Frota: ${m.fleet}]` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {currentStep.key === 'destino' && (
                      <div>
                        <StepHeading icon={MapPin} title="Onde o equipamento será depositado?" guidance={STEP_GUIDANCE.destino} />
                        <div className="mt-3">
                          <StorageSelect locations={locations} value={orderLocationId} onChange={setOrderLocationId} defaultId={defaultLocationId} />
                        </div>
                      </div>
                    )}

                    {currentStep.key === 'execucao' && (
                      <div>
                        <StepHeading icon={Wrench} title="Como a manutenção será feita?" guidance={STEP_GUIDANCE.execucao} />
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {([['INTERNAL', 'Manutenção interna', 'Feita pela equipe no campo ou no almoxarifado', Warehouse], ['EXTERNAL', 'Assistência externa', 'Enviada a uma assistência técnica parceira', Send]] as const).map(([value, label, desc, Icon]) => {
                            const selected = executionType === value;
                            const tone = EXEC_TONES[value];
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => { setExecutionType(value); setError(null); }}
                                aria-pressed={selected}
                                className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all ${selected ? tone.active : 'border-slate-200 bg-white hover:border-slate-300'}`}
                              >
                                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
                                  <Icon className="h-5 w-5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-bold text-slate-900">{label}</span>
                                  <span className="mt-0.5 block text-xs leading-snug text-slate-500">{desc}</span>
                                </span>
                                {selected && <Check className={`h-5 w-5 shrink-0 ${tone.check}`} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {currentStep.key === 'assistencia' && (
                      <div className="space-y-4">
                        <StepHeading icon={Send} title="Dados do envio à assistência" guidance={STEP_GUIDANCE.assistencia} />
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Assistência técnica *</label>
                          <select
                            required
                            value={providerId}
                            onChange={(e) => setProviderId(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                            id="select-provider"
                          >
                            <option value="">Selecione o parceiro</option>
                            {partners.filter(p => p.active && p.types?.includes('Assistência técnica')).map(p => (
                              <option key={p.id} value={p.id}>{p.tradingName || p.legalName} · {p.document}</option>
                            ))}
                          </select>
                          <p className="mt-1 text-[10px] text-slate-400">Gerencie as assistências em Cadastros → Parceiros.</p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Data de envio *</label>
                            <input
                              type="date"
                              required
                              value={sentDate}
                              onChange={(e) => setSentDate(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                              id="input-sent-date"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Previsão de retorno</label>
                            <input
                              type="date"
                              value={expectedReturnDate}
                              onChange={(e) => setExpectedReturnDate(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                              id="input-expected-return"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Descrição do defeito *</label>
                          <textarea
                            required
                            rows={3}
                            value={issueDescription}
                            onChange={(e) => setIssueDescription(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                            placeholder="Descreva os sintomas, quando o problema começou e o que já foi verificado..."
                            id="textarea-issue-description"
                          />
                        </div>
                      </div>
                    )}

                    {currentStep.key === 'detalhes' && (
                      <div className="space-y-4">
                        <StepHeading icon={CalendarDays} title="Detalhes da operação" guidance={STEP_GUIDANCE.detalhes} />
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Data/Hora da Operação *</label>
                          <input
                            type="datetime-local"
                            required
                            value={dateStr}
                            onChange={(e) => setDateStr(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs bg-white"
                            id="input-movement-date"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Observações / Diagnóstico</label>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                            placeholder="Ex: Realizada calibração de sinal RTX. Antena acoplada no teto do trator prefixo T01."
                            id="textarea-movement-notes"
                          />
                        </div>
                      </div>
                    )}

                    {currentStep.key === 'revisao' && (
                      <div>
                        <StepHeading icon={ClipboardCheck} title={editingMove ? 'Revisão da edição' : 'Revisão da nova O.S.'} guidance={STEP_GUIDANCE.revisao} />
                        <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          <ReviewRow label="Tipo de serviço" value={ACTION_LABELS[action]} stepIndex={si('tipo')} onEdit={setFormStep} />
                          <ReviewRow
                            label="Equipamentos"
                            multiline
                            value={selectedComponentIds.map(id => { const c = components.find(x => x.id === id); return c ? `${c.brand} ${c.name} · S/N ${c.serialNumber}` : id; }).join('\n') || '—'}
                            stepIndex={si('equipamentos')}
                            onEdit={setFormStep}
                          />
                          {action === 'Instalação' && (
                            <ReviewRow label="Máquina destino" value={machinePrefix || '—'} stepIndex={si('maquina')} onEdit={setFormStep} />
                          )}
                          {action === 'Remoção' && (
                            <ReviewRow label="Destino (almoxarifado)" value={(locations.find(l => l.id === orderLocationId)?.name) || '—'} stepIndex={si('destino')} onEdit={setFormStep} />
                          )}
                          {action === 'Manutenção' && (
                            <ReviewRow label="Execução" value={executionType === 'EXTERNAL' ? 'Assistência externa' : 'Manutenção interna'} stepIndex={si('execucao')} onEdit={setFormStep} />
                          )}
                          {action === 'Manutenção' && executionType === 'EXTERNAL' && (
                            <>
                              <ReviewRow label="Assistência" value={partners.find(p => p.id === providerId)?.tradingName || partners.find(p => p.id === providerId)?.legalName || '—'} stepIndex={si('assistencia')} onEdit={setFormStep} />
                              <ReviewRow label="Envio / Previsão" value={`${sentDate || '—'} → ${expectedReturnDate || 'sem previsão'}`} stepIndex={si('assistencia')} onEdit={setFormStep} />
                              <ReviewRow label="Defeito" multiline value={issueDescription || '—'} stepIndex={si('assistencia')} onEdit={setFormStep} />
                            </>
                          )}
                          <ReviewRow label="Data/Hora" value={dateStr.replace('T', ' ')} stepIndex={si('detalhes')} onEdit={setFormStep} />
                          <ReviewRow label="Observações" multiline value={notes.trim() || '—'} stepIndex={si('detalhes')} onEdit={setFormStep} />
                        </div>
                        <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-700">
                          {action === 'Manutenção' && executionType === 'EXTERNAL'
                            ? 'Ao criar, a O.S. abrirá uma manutenção vinculada em cada equipamento e o status inicial será "Em assistência externa".'
                            : action === 'Manutenção'
                              ? 'Ao criar, a O.S. registrará a manutenção interna dos equipamentos selecionados.'
                              : `Ao criar, a O.S. será registrada como "${ACTION_LABELS[action]}" e ficará disponível na lista.`}
                        </p>
                      </div>
                    )}
                  </form>
                </div>

                <div className="ios-safe-action-bar flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-4 pt-3">
                  {error && <p className="w-full rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-600">{error}</p>}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => closeForm()}
                    className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  {safeStep > 0 && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleBack}
                      className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Voltar
                    </button>
                  )}
                  {!isReviewStep && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleNext}
                      className="ml-auto flex min-h-10 items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Avançar
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                  {isReviewStep && (
                    <button
                      type="submit"
                      form="new-os-form"
                      disabled={loading}
                      className="ml-auto min-h-10 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70"
                      id="submit-movement-btn"
                    >
                      {loading ? (editingMove ? 'Salvando...' : 'Criando...') : (editingMove ? 'Salvar alterações' : 'Criar O.S.')}
                    </button>
                  )}
                </div>
              </div>
            </div>
            , document.body
          )}

          {/* Desktop table */}
          {filteredMovements.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400 sm:p-12">
              Nenhuma ordem de serviço corresponde aos filtros.
            </div>
          ) : (
            <>
            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden" id="movements-mobile-list">
              {filteredMovements.map((move) => (
                <article
                  key={move.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMove(move)}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setSelectedMove(move);
                    }
                  }}
                  className="cursor-pointer px-4 py-3.5 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                  aria-label={`Abrir detalhes da O.S. ${String(move.osNumber || '').padStart(4, '0')}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 text-left">
                      <span className="text-xs font-bold text-slate-900">
                        #{String(move.osNumber || '').padStart(4, '0')}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400">{formatDate(move.date)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {renderStatusBadge(move)}
                      {(canEditMovement(move) || availableTransitions(move).length > 0 || canDeleteMovement(move)) && (
                        <button
                          type="button"
                          data-os-menu-trigger
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleOSMenu(move.id, event.currentTarget);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          aria-label={`Ações da O.S. ${String(move.osNumber || '').padStart(4, '0')}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 block w-full text-left">
                    <span className="block text-[11px] font-semibold text-slate-600">{ACTION_LABELS[move.action] ?? move.action}</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-800">{move.componentName}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-400">S/N {move.componentSerial}</span>
                    <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
                      <span className="font-medium text-slate-700">
                        {move.machinePrefix === 'Almoxarifado' ? 'Almoxarifado' : `Veículo ${move.machinePrefix}`}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">•</span>
                      <span>{move.technicianName}</span>
                    </span>
                  </div>
                </article>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block" id="movements-table-container">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-3 px-4">O.S.</th>
                    <th className="py-3 px-4">Abertura</th>
                    <th className="py-3 px-4">Serviço</th>
                    <th className="py-3 px-4">Equipamento</th>
                    <th className="py-3 px-4">Veículo</th>
                    <th className="py-3 px-4">Técnico</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700" id="movements-table-body">
                  {filteredMovements.map((move) => {
                    const meta = getStatusMeta(move);
                    return (
                      <tr
                        key={move.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedMove(move)}
                        onKeyDown={(event) => {
                          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            setSelectedMove(move);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-emerald-50/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                        aria-label={`Abrir detalhes da O.S. ${String(move.osNumber || '').padStart(4, '0')}`}
                      >
                        <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                          #{String(move.osNumber || '').padStart(4, '0')}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-500 whitespace-nowrap">
                          {formatDate(move.date)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                          {ACTION_LABELS[move.action] ?? move.action}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800">{move.componentName}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">S/N {move.componentSerial}</span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {move.machinePrefix === 'Almoxarifado' ? (
                            <span className="text-slate-400 italic">Almoxarifado</span>
                          ) : (
                            <span className="font-bold text-slate-800">{move.machinePrefix}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-800 whitespace-nowrap">
                          {move.technicianName}
                        </td>
                        <td className="py-3 px-4">
                          {renderStatusBadge(move)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {(canEditMovement(move) || availableTransitions(move).length > 0 || canDeleteMovement(move)) && <div className="relative inline-block">
                            <button
                              data-os-menu-trigger
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleOSMenu(move.id, event.currentTarget);
                              }}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                              aria-label="Ações da ordem"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {/* OS Detail modal */}
        {selectedMove && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]" onClick={() => setSelectedMove(null)} />
            <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ACTION_TONES[selectedMove.action]?.icon || 'bg-slate-100 text-slate-500'}`}>
                    {selectedMove.action === 'Manutenção' && <Wrench className="h-5 w-5" />}
                    {selectedMove.action === 'Instalação' && <Satellite className="h-5 w-5" />}
                    {selectedMove.action === 'Remoção' && <ArrowUpFromLine className="h-5 w-5" />}
                    {selectedMove.action === 'Calibração' && <Crosshair className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 sm:text-lg">
                        O.S. #{String(selectedMove.osNumber || '').padStart(4, '0')}
                      </h3>
                      {renderStatusBadge(selectedMove)}
                    </div>
                    <p className="text-slate-500 text-xs mt-1">
                      {ACTION_LABELS[selectedMove.action] ?? selectedMove.action} · {selectedMove.machinePrefix === 'Almoxarifado' ? 'Almoxarifado' : `Veículo ${selectedMove.machinePrefix}`}
                    </p>
                  </div>
                </div>
                <div ref={detailMenuRef} className="relative flex shrink-0 items-center gap-1">
                  {canEditMovement(selectedMove) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDetailMenuOpen(false);
                        startEdit(selectedMove);
                      }}
                      aria-label="Editar ordem de serviço"
                      title="Editar O.S."
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-emerald-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  )}
                  {(canDeleteMovement(selectedMove) || availableTransitions(selectedMove).some(t => t.status === 'Cancelada')) && (
                    <>
                      <button
                        type="button"
                        onClick={() => setDetailMenuOpen(open => !open)}
                        aria-label="Mais ações da ordem de serviço"
                        aria-expanded={detailMenuOpen}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </button>
                      {detailMenuOpen && (
                        <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                          {availableTransitions(selectedMove).some(t => t.status === 'Cancelada') && (
                            <button
                              type="button"
                              disabled={confirmingAction === selectedMove.id + 'Cancelada'}
                              onClick={() => {
                                setDetailMenuOpen(false);
                                requestCancelMovement(selectedMove);
                              }}
                              className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                            >
                              <Ban className="h-4 w-4" />
                              {confirmingAction === selectedMove.id + 'Cancelada' ? 'Cancelando...' : 'Cancelar O.S.'}
                            </button>
                          )}
                          {canDeleteMovement(selectedMove) && (
                            <button
                              type="button"
                              disabled={confirmingAction === selectedMove.id + 'delete'}
                              onClick={() => {
                                setDetailMenuOpen(false);
                                requestDeleteMovement(selectedMove);
                              }}
                              className="flex min-h-10 w-full items-center gap-2 rounded-lg border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" /> Excluir O.S.
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDetailMenuOpen(false);
                      setSelectedMove(null);
                    }}
                    aria-label="Fechar detalhes da ordem"
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:py-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-slate-400" />
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Equipamento</p>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{selectedMove.componentName}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">S/N {selectedMove.componentSerial}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Responsável</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{selectedMove.technicianName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Abertura: {formatDateTime(selectedMove.date)}</p>
                </div>

                {selectedMove.scheduledDate && (selectedMove.status || 'Aberta') === 'Agendada' && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarDays className="h-4 w-4 text-sky-500" />
                      <p className="text-[10px] uppercase font-bold text-sky-600 tracking-wider">Reagendado para</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{formatDateTime(selectedMove.scheduledDate)}</p>
                  </div>
                )}

                {resolveServiceAction(selectedMove) === 'REMOVAL' && !['Concluída', 'Cancelada'].includes(selectedMove.status || 'Aberta') && <StorageSelect locations={locations} value={receivingLocationId} onChange={setReceivingLocationId} defaultId={defaultLocationId} />}
                {isExternalReturnPending(selectedMove) && (
                  <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3" id="external-return-block">
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-orange-600">Retorno da assistência</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-slate-500">Registre o recebimento, o resultado e o laudo do reparo. A conclusão da O.S. é o passo seguinte.</p>
                    </div>
                    <StorageSelect locations={locations} value={receivingLocationId} onChange={setReceivingLocationId} defaultId={defaultLocationId} />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="return-result">Resultado do retorno *</label>
                        <select
                          id="return-result"
                          value={returnResult}
                          onChange={e => setReturnResult(e.target.value as 'Concluído' | 'Sem Conserto')}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-orange-500 focus:ring-orange-500"
                        >
                          <option value="Concluído">Consertado (retorna ao estoque)</option>
                          <option value="Sem Conserto">Sem conserto (descartar)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="return-cost">Custo do reparo (R$)</label>
                        <input
                          id="return-cost"
                          type="number"
                          min="0"
                          step="0.01"
                          value={returnCost}
                          onChange={e => setReturnCost(e.target.value)}
                          placeholder="Ex: 1500.00"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-orange-500 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="return-parts">Peças trocadas</label>
                        <input
                          id="return-parts"
                          type="text"
                          value={returnParts}
                          onChange={e => setReturnParts(e.target.value)}
                          placeholder="Ex: placa-mãe, conector RF"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-orange-500 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="return-services">Serviços executados</label>
                        <input
                          id="return-services"
                          type="text"
                          value={returnServices}
                          onChange={e => setReturnServices(e.target.value)}
                          placeholder="Ex: soldagem, atualização de firmware"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-orange-500 focus:ring-orange-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
                {isMaintenanceAwaitingConference(selectedMove) && (
                  <StorageSelect
                    locations={locations}
                    value={receivingLocationId}
                    onChange={setReceivingLocationId}
                    defaultId={defaultLocationId}
                    label="Armazenamento de destino (usado ao descartar como sem conserto)"
                  />
                )}
                {selectedMove.notes && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ClipboardList className="h-4 w-4 text-slate-400" />
                      <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Observações técnicas</p>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{selectedMove.notes}</p>
                  </div>
                )}

                <div>
                  <button
                    type="button"
                    onClick={() => setHistoryExpanded(open => !open)}
                    aria-expanded={historyExpanded}
                    className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg py-1 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-medium text-slate-400 tracking-wider group-hover:text-slate-500">Histórico da O.S.</span>
                      {(selectedMove.history || []).length > 0 && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                          {selectedMove.history?.length}
                        </span>
                      )}
                    </span>
                    <ChevronDown className={`h-3 w-3 shrink-0 text-slate-300 transition-transform duration-200 group-hover:text-slate-400 ${historyExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {historyExpanded && (
                    <ol className="mt-2 space-y-2">
                      {(selectedMove.history || []).map((h, i) => (
                        <li key={i} className="flex gap-2.5">
                          <div className="flex flex-col items-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 mt-1.5" />
                            {i < (selectedMove.history?.length || 0) - 1 && <span className="w-px flex-1 bg-slate-100 mt-1" />}
                          </div>
                          <div className="pb-0.5 min-w-0">
                            <p className="text-xs font-medium text-slate-600">{h.action}</p>
                            {h.detail && <p className="text-[11px] leading-snug text-slate-400 mt-0.5">{h.detail}</p>}
                            <p className="text-[10px] text-slate-300 mt-0.5">
                              {formatDateTime(h.timestamp)} · {h.actorName}
                            </p>
                          </div>
                        </li>
                      ))}
                      {(selectedMove.history || []).length === 0 && (
                        <p className="text-[10px] text-slate-300">Sem histórico registrado.</p>
                      )}
                    </ol>
                  )}
                </div>

                {selectedMove.status !== 'Cancelada' && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <StickyNote className="h-4 w-4 text-blue-500" />
                      <p className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">Observações Adicionais</p>
                    </div>
                    {selectedMove.additionalNotes ? (
                      <div className="space-y-2 mb-3">
                        {selectedMove.additionalNotes.split('\n---\n').map((note, i) => (
                          <div key={i} className="rounded-lg bg-white/70 border border-blue-100 p-3">
                            <p className="text-xs text-slate-700 leading-relaxed">{note}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 mb-3 italic">Nenhuma observação adicional registrada</p>
                    )}
                    <div className="space-y-2">
                      <textarea
                        value={noteInput}
                        onChange={e => setNoteInput(e.target.value)}
                        placeholder="Adicione detalhes sobre o serviço realizado..."
                        rows={2}
                        maxLength={1000}
                        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500 resize-none"
                      />
                      <button
                        type="button"
                        disabled={addingNote || !noteInput.trim()}
                        onClick={async () => {
                          setAddingNote(true);
                          const success = await requestAddNote(selectedMove, noteInput);
                          if (success) {
                            setNoteInput('');
                            setSelectedMove(null);
                          }
                          setAddingNote(false);
                        }}
                        className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {addingNote ? 'Adicionando...' : 'Adicionar observação'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="ios-safe-action-bar grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white px-4 pt-3 sm:flex sm:justify-end">
                {availableTransitions(selectedMove).filter(t => t.status !== 'Cancelada').map(t => (
                    <button
                      key={t.status}
                      disabled={confirmingAction === selectedMove.id + t.status}
                      onClick={async () => {
                        if (t.status === 'Agendada' && t.label === 'Reagendar atendimento') {
                          setRescheduleMove(selectedMove);
                          setRescheduleDate(selectedMove.scheduledDate || '');
                          setRescheduleDialogOpen(true);
                          return;
                        }
                        const labelMap: Record<MovementStatus, string> = {
                          'Agendada': 'Atendimento agendado',
                          'Em Atendimento': 'Atendimento iniciado',
                          'Em Manutenção Interna': 'Reparo interno iniciado',
                          'Em Assistência Externa': 'Enviado à assistência',
                          'Aguardando Conferência': 'Aguardando conferência',
                          'Concluída': 'O.S. concluída',
                          'Sem Conserto': 'Sem conserto',
                          'Cancelada': 'O.S. cancelada',
                          'Aberta': 'O.S. reaberta'
                        };
                        const succeeded = await requestStatusTransition(selectedMove, t.status, labelMap[t.status]);
                        if (succeeded) setSelectedMove(null);
                      }}
                      className={`min-h-10 cursor-pointer rounded-xl px-3 py-2 text-xs font-bold transition-colors sm:px-4 ${
                        t.status === 'Agendada'
                            ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      } ${availableTransitions(selectedMove).filter(item => item.status !== 'Cancelada').length === 1 ? 'col-span-2 sm:col-auto' : ''} disabled:cursor-wait disabled:opacity-60`}
                    >
                      {t.label}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => {
                    setDetailMenuOpen(false);
                    setDownloadOption('os');
                    setShowDownloadModal(true);
                  }}
                  aria-label="Baixar ordem de serviço em PDF"
                  title="Baixar O.S."
                  className="col-span-2 flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-emerald-600 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:col-span-1"
                >
                  <Download className="h-4 w-4" />
                  Baixar O.S.
                </button>
              </div>
             </div>
           </div>
         )}

        {/* Reschedule dialog */}
        {rescheduleDialogOpen && rescheduleMove && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]" onClick={() => setRescheduleDialogOpen(false)} />
            <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
              <div className="mb-4">
                <h4 className="text-sm font-bold text-slate-900">Reagendar atendimento</h4>
                <p className="mt-0.5 text-xs text-slate-500">Informe a data e hora do reagendamento</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="reschedule-date">Data/Hora *</label>
                  <input
                    id="reschedule-date"
                    type="datetime-local"
                    required
                    value={rescheduleDate}
                    onChange={e => setRescheduleDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRescheduleDialogOpen(false)}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!rescheduleDate || confirmingAction === rescheduleMove.id + 'Agendada'}
                    onClick={async () => {
                      if (!rescheduleDate) return;
                      const succeeded = await requestStatusTransition(
                        rescheduleMove,
                        'Agendada',
                        'Atendimento reagendado',
                        rescheduleDate
                      );
                      if (succeeded) {
                        setRescheduleDialogOpen(false);
                        setRescheduleMove(null);
                        setSelectedMove(null);
                      }
                    }}
                    className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OS PDF download options modal */}
        {selectedMove && showDownloadModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]" onClick={() => setShowDownloadModal(false)} />
            <div className="relative w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Baixar O.S.</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Escolha o formato do PDF</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDownloadModal(false)}
                  aria-label="Fechar seleção de impressão"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div role="radiogroup" aria-label="Formato de impressão da O.S." className="space-y-2">
                {[
                  { value: 'os' as const, label: 'O.S.', hint: 'Documento enxuto, sem histórico' },
                  { value: 'os-historico' as const, label: 'O.S. com Histórico', hint: 'Inclui todos os eventos da O.S.' }
                ].map(option => {
                  const selected = downloadOption === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDownloadOption(option.value)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        selected ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${selected ? 'border-emerald-600' : 'border-slate-300'}`}>
                        {selected && <span className="h-2 w-2 rounded-full bg-emerald-600" />}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-xs font-bold ${selected ? 'text-emerald-800' : 'text-slate-700'}`}>{option.label}</span>
                        <span className="block text-[11px] text-slate-400">{option.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowDownloadModal(false);
                  generateOsPdf(selectedMove, companyProfile, downloadOption === 'os-historico');
                }}
                className="mt-4 flex min-h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <Download className="h-4 w-4" />
                Gerar PDF
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* OS actions dropdown (portal so it's not clipped by overflow container) */}
      {menuAnchor && menuOpenId && createPortal(
        (() => {
          const move = movements.find(m => m.id === menuOpenId);
          if (!move) return null;
          return (
            <div
              ref={menuRef}
              className="fixed z-50 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1"
              style={{ top: menuAnchor.top, left: menuAnchor.left }}
            >
              {canEditMovement(move) && (
                <button
                  onClick={() => {
                    setMenuOpenId(null);
                    setMenuAnchor(null);
                    startEdit(move);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Edit className="h-3.5 w-3.5" /> Editar O.S.
                </button>
              )}
              {availableTransitions(move).filter(t => t.status !== 'Cancelada').map(t => (
                <button
                  key={t.status}
                  disabled={confirmingAction === move.id + t.status}
                  onClick={() => {
                    if (t.status === 'Agendada' && t.label === 'Reagendar atendimento') {
                      setMenuOpenId(null);
                      setMenuAnchor(null);
                      setRescheduleMove(move);
                      setRescheduleDate(move.scheduledDate || '');
                      setRescheduleDialogOpen(true);
                      return;
                    }
                    const labelMap: Record<MovementStatus, string> = {
                      'Agendada': 'Atendimento agendado',
                      'Em Atendimento': 'Atendimento iniciado',
                      'Em Manutenção Interna': 'Reparo interno iniciado',
                      'Em Assistência Externa': 'Enviado à assistência',
                      'Aguardando Conferência': 'Aguardando conferência',
                      'Concluída': 'O.S. concluída',
                      'Sem Conserto': 'Sem conserto',
                      'Cancelada': 'O.S. cancelada',
                      'Aberta': 'O.S. reaberta'
                    };
                    requestStatusTransition(move, t.status, labelMap[t.status]);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {t.status === 'Em Atendimento' ? <Play className="h-3.5 w-3.5" /> :
                   t.status === 'Concluída' ? <Check className="h-3.5 w-3.5" /> :
                   <Clock className="h-3.5 w-3.5" />}
                  {confirmingAction === move.id + t.status ? 'Processando...' : t.label}
                </button>
              ))}
              {availableTransitions(move).some(t => t.status === 'Cancelada') && (
                <button
                  disabled={confirmingAction === move.id + 'Cancelada'}
                  onClick={() => {
                    setMenuOpenId(null);
                    setMenuAnchor(null);
                    requestCancelMovement(move);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <Ban className="h-3.5 w-3.5" /> Cancelar O.S.
                </button>
              )}
              {canDeleteMovement(move) && (
                <button
                  disabled={confirmingAction === move.id + 'delete'}
                  onClick={() => {
                    setMenuOpenId(null);
                    setMenuAnchor(null);
                    requestDeleteMovement(move);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg border-t border-slate-100 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir O.S.
                </button>
              )}
            </div>
          );
        })(),
        document.body
      )}

    <HelpGuideModal
      open={helpOpen}
      onClose={() => setHelpOpen(false)}
      title="Como usar as ordens de serviço"
      steps={osHelpSteps}
    />

    </div>
  );
}
