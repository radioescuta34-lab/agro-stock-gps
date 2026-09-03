import type { AutopilotComponent, ComponentLoan, ComponentMaintenance, Location, Machine, MovementLog, ServiceActionCode } from '../types';
import { createEquipmentDestinationResolver } from './equipmentDestinations';

export const SERVICE_ACTIONS: Record<ServiceActionCode, string> = {
  INSTALLATION: 'Instalação', REMOVAL: 'Remoção', MAINTENANCE: 'Manutenção', CALIBRATION: 'Calibração',
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
const legacyActions: Record<string, ServiceActionCode> = {
  instalacao: 'INSTALLATION', remocao: 'REMOVAL', manutencao: 'MAINTENANCE',
  'aguardando manutencao': 'MAINTENANCE', 'manutencao interna': 'MAINTENANCE', calibracao: 'CALIBRATION',
};
// An explicit technical code never changes when the display name is renamed.
// Unknown legacy names fail closed; do not guess by partial text matching.
export function resolveServiceAction(order: Pick<MovementLog, 'action' | 'serviceActionCode'>): ServiceActionCode | undefined {
  if (order.serviceActionCode) return Object.hasOwn(SERVICE_ACTIONS, order.serviceActionCode) ? order.serviceActionCode : undefined;
  return legacyActions[normalize(order.action || '')];
}
export const isOpenOrder = (order: MovementLog) => !['Concluída', 'Cancelada'].includes(order.status || 'Aberta');
export const orderItems = (order: MovementLog) => [...new Set([...(order.componentIds || []), order.componentId, order.primaryComponentId].filter((id): id is string => !!id))];

export interface AvailabilityContext {
  movements?: MovementLog[]; loans?: ComponentLoan[]; maintenances?: ComponentMaintenance[];
  machines?: Machine[]; locations?: Location[];
}
export const AVAILABILITY_STYLES = {
  available: 'border-blue-100 bg-blue-50 text-blue-700',
  inUse: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  pending: 'border-amber-100 bg-amber-50 text-amber-700',
  blocked: 'border-rose-100 bg-rose-50 text-rose-700',
  inactive: 'border-slate-200 bg-slate-100 text-slate-600',
};

export function createEquipmentAvailabilityResolver({ movements = [], loans = [], maintenances = [], machines = [], locations = [] }: AvailabilityContext) {
  const destination = createEquipmentDestinationResolver(machines, locations, maintenances);
  const orders = new Map<string, MovementLog[]>();
  for (const order of movements.filter(isOpenOrder)) for (const id of orderItems(order)) orders.set(id, [...(orders.get(id) || []), order]);
  return (component: AutopilotComponent, ignoredOrderId?: string) => {
    const pendingOrders = (orders.get(component.id) || []).filter(order => order.id !== ignoredOrderId);
    const activeLoans = loans.filter(loan => loan.status === 'Ativo' && loan.items.some(item => item.componentId === component.id));
    const activeRepairs = maintenances.filter(repair => repair.status === 'Em Manutenção' && repair.componentId === component.id);
    const current = destination(component);
    const linkedLocation = locations.find(item => current.key === `${current.kind}:location:${item.id}`);
    const usableDestination = current.kind !== 'unknown' && linkedLocation?.isActive !== false;
    const healthy = !component.maintenanceRequired && !['Manutenção', 'Descartado'].includes(component.status);
    const noOperations = !pendingOrders.length && !activeLoans.length && !activeRepairs.length;
    const active = component.active !== false;
    const internal = current.kind === 'internal' && usableDestination;
    const installed = current.kind === 'machine' && machines.some(machine => current.key === `machine:${machine.id}` && machine.active !== false) && component.status === 'Em Uso';
    const availableForUse = active && noOperations && healthy && internal && component.status === 'Disponível';
    const pendingMaintenance = pendingOrders.some(order => resolveServiceAction(order) === 'MAINTENANCE');
    let label: string = component.status;
    let filterValue: string = component.status;
    let tone: keyof typeof AVAILABILITY_STYLES = component.status === 'Disponível' ? 'available' : component.status === 'Em Uso' ? 'inUse' : 'pending';
    let reason = '';
    if (!active) { label = 'Inativo'; filterValue = 'Bloqueado'; tone = 'inactive'; reason = 'Equipamento inativado.'; }
    else if (pendingOrders.length + activeLoans.length + activeRepairs.length > 1) { label = 'Conferir pendências'; filterValue = 'Bloqueado'; tone = 'blocked'; reason = 'Existem operações simultâneas. Regularize os vínculos antes de movimentar.'; }
    else if (pendingOrders.length) {
      const order = pendingOrders[0];
      label = !resolveServiceAction(order) ? 'Tipo da O.S. a revisar' : pendingMaintenance ? (order.status === 'Em Atendimento' ? 'Em manutenção' : 'Aguardando manutenção') : 'Reservado para O.S.';
      filterValue = pendingMaintenance ? 'Manutenção' : !resolveServiceAction(order) ? 'Bloqueado' : 'Reservado'; tone = 'pending';
      reason = `O.S. #${String(order.osNumber ?? '—').padStart(4, '0')} · ${order.action} · ${order.status || 'Aberta'}`;
    } else if (activeRepairs.length || current.kind === 'service') { label = 'Em manutenção externa'; filterValue = 'Manutenção'; tone = 'pending'; reason = 'Registre o retorno da assistência antes de usar o equipamento.'; }
    else if (activeLoans.length || current.kind === 'loan') { label = 'Emprestado'; filterValue = 'Em Uso'; tone = 'pending'; reason = 'Registre a devolução do empréstimo antes de usar o equipamento.'; }
    else if (component.status === 'Descartado') { tone = 'inactive'; reason = 'Equipamento descartado.'; }
    else if (component.maintenanceRequired || component.status === 'Manutenção') { label = 'Manutenção pendente'; filterValue = 'Manutenção'; tone = 'pending'; reason = 'Conclua uma O.S. de manutenção ou registre o retorno da assistência. Cancelar uma O.S. não atesta o reparo.'; }
    else if (!availableForUse && !installed) { label = 'Cadastro a conferir'; filterValue = 'Bloqueado'; tone = 'blocked'; reason = 'Confira o status e a localização antes de movimentar.'; }
    return { label, filterValue, tone, reason, pendingOrders, availableForUse,
      canTransfer: active && noOperations && internal && !component.maintenanceRequired && !['Em Uso', 'Manutenção'].includes(component.status),
      canSendToMaintenance: active && noOperations && internal && ['Disponível', 'Manutenção'].includes(component.status),
      canCreateOrder: (code: ServiceActionCode) => active && noOperations && (code === 'INSTALLATION' ? availableForUse : code === 'MAINTENANCE' ? (internal || installed) && component.status !== 'Descartado' && (internal ? ['Disponível', 'Manutenção'].includes(component.status) : true) : installed && (code === 'REMOVAL' || healthy)),
    };
  };
}
