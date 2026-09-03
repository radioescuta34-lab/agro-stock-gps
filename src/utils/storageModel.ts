import type { AutopilotComponent, ComponentLoan, ComponentMaintenance, Location, LocationEvent, Machine, MovementLog, MovementStatus, Partner, StorageSettings } from '../types';
import { createEquipmentDestinationResolver } from './equipmentDestinations';
import { createEquipmentAvailabilityResolver, isOpenOrder, orderItems, resolveServiceAction } from './equipmentAvailability';
export { isOpenOrder, orderItems } from './equipmentAvailability';

export interface StorageState {
  components: AutopilotComponent[]; locations: Location[]; machines: Machine[];
  partners: Partner[]; movements: MovementLog[]; loans: ComponentLoan[]; maintenances: ComponentMaintenance[];
  settings: StorageSettings;
}
export type StorageCollection = 'components' | 'locations' | 'movements' | 'loans' | 'maintenances';
export interface StorageChange { collection: StorageCollection; id: string; data: any | null }
export type StorageCommand =
  | { type: 'saveLocation'; location: Location }
  | { type: 'default'; locationId: string }
  | { type: 'transfer' | 'review'; componentIds: string[]; locationId: string; notes: string; machineId?: string }
  | { type: 'component'; component: AutopilotComponent; editing: boolean }
  | { type: 'order'; order: MovementLog; editing: boolean }
  | { type: 'deleteOrder'; id: string }
  | { type: 'transition'; id: string; status: MovementStatus; action: string; detail?: string; locationId?: string }
  | { type: 'loan'; loan: ComponentLoan }
  | { type: 'returnLoan'; id: string; componentIds?: string[]; locationId: string }
  | { type: 'maintenance'; maintenance: ComponentMaintenance }
  | { type: 'returnMaintenance'; id: string; data: Pick<ComponentMaintenance, 'returnDate' | 'returnLocationId' | 'replacedParts' | 'servicesPerformed' | 'cost' | 'status'> };

export function storageCommandKey(command: StorageCommand) {
  const property = command.type === 'component' && !command.editing ? 'component' : command.type === 'order' && !command.editing ? 'order' : command.type === 'loan' ? 'loan' : command.type === 'maintenance' ? 'maintenance' : '';
  if (!property) return JSON.stringify(command);
  const payload = { ...(command as any)[property] };
  for (const key of ['id', 'createdAt', 'updatedAt', 'updatedBy', 'osNumber', 'contractNumber', 'history']) delete payload[key];
  return JSON.stringify({ ...command, [property]: payload });
}
export const isStorageAdmin = (role: string) => ['ADMINISTRADOR', 'administrador'].includes(role);
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const version = (value: any) => value?.toMillis ? value.toMillis() : value ? new Date(value).getTime() : 0;
function assertFresh(previous: { updatedAt?: any } | undefined, incoming: { updatedAt?: any }) {
  if (previous) requireValue(version(previous.updatedAt) === version(incoming.updatedAt), 'Este cadastro foi alterado por outra pessoa. Reabra o resumo antes de salvar.');
}

export function planStorageCommand(state: StorageState, command: StorageCommand, actor: { id: string; name: string; role: string }, operationId: string, now: string) {
  requireValue(isStorageAdmin(actor.role) || ['TECNICO_CAMPO', 'tecnico'].includes(actor.role), 'Sem permissão para movimentar equipamentos.');
  const changes: StorageChange[] = [];
  const events: LocationEvent[] = [];
  const settings = { ...state.settings, revision: (state.settings.revision || 0) + 1, updatedAt: now, updatedBy: actor.name };
  const resolve = createEquipmentDestinationResolver(state.machines, state.locations, state.maintenances);
  const availability = createEquipmentAvailabilityResolver(state);
  const save = (collection: StorageCollection, data: any) => changes.push({ collection, id: data.id, data: { ...data, updatedAt: now, updatedBy: actor.name } });
  const internal = (id: string) => {
    const location = state.locations.find(item => item.id === id && item.kind === 'INTERNAL' && item.isActive);
    requireValue(location, 'Selecione um local de armazenamento ativo.');
    return location;
  };
  const getComponent = (id: string) => {
    const component = state.components.find(item => item.id === id);
    requireValue(component && component.active !== false, 'Equipamento não encontrado ou inativado. Atualize a lista.');
    return component;
  };
  const available = (component: AutopilotComponent, ignoredOrder?: string, ignoredLoan?: string, ignoredMaintenance?: string) => {
    requireValue(!state.movements.some(item => item.id !== ignoredOrder && isOpenOrder(item) && orderItems(item).includes(component.id)), `${component.name}: existe uma O.S. pendente.`);
    requireValue(!state.loans.some(item => item.id !== ignoredLoan && item.status === 'Ativo' && item.items.some(part => part.componentId === component.id)), `${component.name}: conclua a devolução do empréstimo.`);
    requireValue(!state.maintenances.some(item => item.id !== ignoredMaintenance && item.status === 'Em Manutenção' && item.componentId === component.id), `${component.name}: registre o retorno da assistência.`);
  };
  const snapshot = (component: AutopilotComponent) => ({ locationId: component.currentLocationId || '', machineId: component.currentMachineId || '', label: resolve(component).label });
  const place = (component: AutopilotComponent, destination: { location?: Location; machine?: Machine }, status: AutopilotComponent['status'], action: string, referenceId = '', notes = '') => {
    const next = { ...component, status, placementVersion: 1, currentMachine: destination.machine?.prefix || (destination.location?.kind === 'EXTERNAL_LOAN' ? `Empréstimo: ${destination.location.name}` : '') };
    delete next.currentLocationId;
    delete next.currentMachineId;
    if (destination.location) next.currentLocationId = destination.location.id;
    if (destination.machine) next.currentMachineId = destination.machine.id;
    save('components', next);
    events.push({ id: `${operationId}_${component.id}`, operationId, componentId: component.id, componentName: component.name, componentSerial: component.serialNumber,
      from: command.type === 'component' && !command.editing ? { locationId: '', machineId: '', label: 'Cadastro inicial' } : snapshot(component),
      to: { locationId: destination.location?.id || '', machineId: destination.machine?.id || '', label: destination.location?.name || destination.machine?.prefix || 'Local não informado' },
      action, referenceId, notes, actorId: actor.id, actorName: actor.name, createdAt: now });
  };
  const partnerLocation = (partnerId: string, kind: 'EXTERNAL_SERVICE' | 'EXTERNAL_LOAN') => {
    const partner = state.partners.find(item => item.id === partnerId && item.active);
    const type = kind === 'EXTERNAL_SERVICE' ? 'Assistência técnica' : 'Recebedor de empréstimo';
    requireValue(partner?.types.includes(type), `Selecione um parceiro ativo do tipo ${type}.`);
    const matches = state.locations.filter(item => item.kind === kind && item.partnerId === partnerId);
    requireValue(matches.length <= 1, 'Há destinos duplicados para este parceiro. Solicite conferência ao administrador.');
    requireValue(!matches[0] || matches[0].isActive, 'O destino deste parceiro está inativo.');
    const location: Location = { ...(matches[0] || {}), id: matches[0]?.id || `${kind.toLowerCase()}_${partnerId}`, name: partner.tradingName || partner.legalName, kind, partnerId, isActive: true, updatedAt: now, updatedBy: actor.name };
    save('locations', location);
    return location;
  };
  const validateOrder = (order: MovementLog) => {
    const code = resolveServiceAction(order);
    requireValue(code, 'Tipo de serviço não reconhecido. Edite a O.S. e escolha um tipo técnico válido antes de continuar.');
    const ids = orderItems(order);
    requireValue(!order.componentIds || new Set(order.componentIds).size === order.componentIds.length, 'Não repita equipamentos na O.S.');
    requireValue(ids.length > 0 && ids.length <= 50, 'Selecione de 1 a 50 equipamentos sem repetição.');
    if (code === 'INSTALLATION') requireValue(state.machines.some(item => item.id === order.machineId && item.active !== false), 'Selecione uma máquina ativa.');
    if (code === 'REMOVAL') internal(order.locationId || '');
    for (const id of ids) {
      const component = getComponent(id);
      available(component, order.id);
      requireValue(availability(component, order.id).canCreateOrder(code), `${component.name}: não está disponível para este serviço. Confira as pendências e o armazenamento de origem.`);
    }
  };
  const markRepairRequired = (order: MovementLog) => {
    if (resolveServiceAction(order) === 'MAINTENANCE') for (const id of orderItems(order)) save('components', { ...getComponent(id), maintenanceRequired: true });
  };

  switch (command.type) {
    case 'saveLocation': {
      requireValue(isStorageAdmin(actor.role), 'Somente administradores gerenciam locais.');
      const location = { ...command.location, name: command.location.name.trim(), code: (command.location.code || '').trim() };
      requireValue(location.kind === 'INTERNAL' && location.name.length > 0 && location.name.length <= 120, 'Informe um nome de até 120 caracteres.');
      requireValue(!state.locations.some(item => item.id !== location.id && item.kind === 'INTERNAL' && (normalized(item.name) === normalized(location.name) || (location.code && normalized(item.code || '') === normalized(location.code)))), 'Já existe um local com esse nome ou código.');
      const previous = state.locations.find(item => item.id === location.id);
      assertFresh(previous, location);
      requireValue(!previous || previous.kind === 'INTERNAL', 'Destinos externos são gerenciados pelo cadastro de Parceiros.');
      if (!location.isActive) {
        requireValue(settings.defaultLocationId !== location.id, 'Defina outro local padrão antes de inativar este.');
        requireValue(!state.components.some(item => item.currentLocationId === location.id), 'O local ainda tem equipamentos. Transfira ou regularize os vínculos antes de inativar.');
        requireValue(!state.movements.some(item => isOpenOrder(item) && item.locationId === location.id), 'Existe uma O.S. pendente com este destino.');
      }
      save('locations', location);
      break;
    }
    case 'default': requireValue(isStorageAdmin(actor.role), 'Somente administradores definem o padrão.'); internal(command.locationId); settings.defaultLocationId = command.locationId; break;
    case 'review': {
      requireValue(isStorageAdmin(actor.role), 'Somente administradores confirmam locais legados.');
      requireValue(command.notes.trim(), 'Informe a justificativa da conferência.');
      requireValue(command.componentIds.length === 1, 'Confira um equipamento por vez.');
      const component = getComponent(command.componentIds[0]);
      const location = state.locations.find(item => item.id === command.locationId && item.isActive);
      const machine = state.machines.find(item => item.id === command.machineId && item.active !== false);
      requireValue(Boolean(location) !== Boolean(machine), 'Selecione um único destino válido para conferência.');
      const relatedLoan = state.loans.find(item => item.status === 'Ativo' && item.items.some(part => part.componentId === component.id));
      const relatedMaintenance = state.maintenances.find(item => item.status === 'Em Manutenção' && item.componentId === component.id);
      if (machine) {
        available(component); requireValue(component.status === 'Em Uso', 'Máquina só pode ser destino de um equipamento em uso.');
      } else if (location?.kind === 'EXTERNAL_LOAN') {
        requireValue(component.status === 'Em Uso' && relatedLoan && location.partnerId === relatedLoan.thirdPartyId, 'O destino deve corresponder ao parceiro do empréstimo ativo.');
        available(component, undefined, relatedLoan.id);
      } else if (location?.kind === 'EXTERNAL_SERVICE') {
        requireValue(component.status === 'Manutenção' && relatedMaintenance && location.partnerId === relatedMaintenance.providerId, 'O destino deve corresponder ao parceiro da manutenção ativa.');
        available(component, undefined, undefined, relatedMaintenance.id);
      } else {
        available(component); requireValue(component.status !== 'Em Uso', 'Para retirar de uma máquina ou parceiro, use remoção ou devolução.');
      }
      place(component, { location, machine }, component.status, 'Local conferido', '', command.notes);
      break;
    }
    case 'transfer': {
      const destination = internal(command.locationId);
      requireValue(command.componentIds.length > 0 && command.componentIds.length <= 50 && new Set(command.componentIds).size === command.componentIds.length, 'Selecione de 1 a 50 equipamentos.');
      for (const id of command.componentIds) {
        const component = getComponent(id); available(component);
        requireValue(!component.maintenanceRequired, `${component.name}: manutenção pendente. Use o fluxo de reparo.`);
        requireValue(component.status !== 'Em Uso' && component.status !== 'Manutenção', `${component.name}: utilize o fluxo de remoção ou retorno.`);
        const current = resolve(component);
        requireValue(current.kind === 'internal', `${component.name}: localização pendente de conferência.`);
        requireValue(component.currentLocationId !== destination.id, 'Selecione um destino diferente da origem.');
        place(component, { location: destination }, component.status, 'Transferência interna', '', command.notes);
      }
      break;
    }
    case 'component': {
      const data = command.component;
      const previous = state.components.find(item => item.id === data.id);
      requireValue(!command.editing || previous, 'Equipamento não encontrado.');
      requireValue(!state.components.some(item => item.id !== data.id && normalized(item.serialNumber) === normalized(data.serialNumber)), 'Já existe um equipamento com este número de série.');
      if (command.editing) {
        assertFresh(previous, data);
        requireValue(Boolean(previous.maintenanceRequired) === Boolean(data.maintenanceRequired), 'A pendência de manutenção só pode ser liberada pela conclusão do reparo.');
        requireValue(previous.status === data.status && (previous.currentMachine || '') === (data.currentMachine || '') && (previous.currentMachineId || '') === (data.currentMachineId || '') && (previous.currentLocationId || '') === (data.currentLocationId || ''), 'Altere o destino pelos fluxos de transferência, O.S., manutenção ou empréstimo.');
        save('components', { ...previous, ...data });
      } else {
        requireValue(!data.maintenanceRequired, 'Registre a necessidade de reparo por uma O.S. de manutenção.');
        requireValue(data.status === 'Disponível' || data.status === 'Descartado', 'Cadastre em armazenamento e use uma O.S. para instalar ou enviar para manutenção.');
        place(data, { location: internal(data.currentLocationId || '') }, data.status, 'Cadastro inicial');
      }
      break;
    }
    case 'order': {
      const previous = state.movements.find(item => item.id === command.order.id);
      if (command.editing) assertFresh(previous, command.order);
      requireValue(!command.editing || previous && ['Aberta', 'Agendada'].includes(previous.status || 'Aberta'), 'A O.S. não permite edição.');
      const order = { ...previous, ...command.order, status: previous?.status || command.order.status || 'Aberta' };
      requireValue(command.editing || order.status === 'Aberta', 'Uma nova O.S. deve iniciar aberta.');
      validateOrder(order);
      if (previous) markRepairRequired(previous);
      markRepairRequired(order);
      save('movements', { ...order, serviceActionCode: resolveServiceAction(order)! }); break;
    }
    case 'deleteOrder': {
      requireValue(isStorageAdmin(actor.role), 'Somente administradores excluem O.S.');
      const order = state.movements.find(item => item.id === command.id);
      requireValue(order && ['Aberta', 'Agendada'].includes(order.status || 'Aberta'), 'Use cancelamento para preservar uma O.S. iniciada.');
      requireValue(resolveServiceAction(order), 'Classifique o tipo de serviço antes de excluir a O.S.');
      markRepairRequired(order);
      changes.push({ collection: 'movements', id: order.id, data: null }); break;
    }
    case 'transition': {
      const storedOrder = state.movements.find(item => item.id === command.id);
      const order = storedOrder && { ...storedOrder, ...(command.locationId ? { locationId: command.locationId } : {}) };
      requireValue(order, 'O.S. não encontrada.');
      const transitions: Record<MovementStatus, MovementStatus[]> = { Aberta: ['Agendada', 'Em Atendimento', 'Cancelada'], Agendada: ['Aberta', 'Em Atendimento', 'Cancelada'], 'Em Atendimento': ['Agendada', 'Concluída', 'Cancelada'], Concluída: [], Cancelada: [] };
      requireValue(transitions[order.status || 'Aberta']?.includes(command.status), 'A situação da O.S. mudou. Atualize a lista.');
      const code = resolveServiceAction(order);
      requireValue(code, 'Tipo de serviço não reconhecido. Classifique a O.S. antes de continuar.');
      if (command.status !== 'Cancelada') validateOrder(order);
      if (command.status === 'Concluída') {
        for (const id of orderItems(order)) {
          const component = getComponent(id);
          if (code === 'CALIBRATION') continue;
          if (code === 'MAINTENANCE') { save('components', { ...component, maintenanceRequired: false, status: component.status === 'Manutenção' ? 'Disponível' : component.status }); continue; }
          if (code === 'INSTALLATION') place(component, { machine: state.machines.find(item => item.id === order.machineId)! }, 'Em Uso', 'Instalação por O.S.', order.id);
          else if (code === 'REMOVAL') place(component, { location: internal(order.locationId || '') }, 'Disponível', `${order.action} por O.S.`, order.id);
        }
      } else markRepairRequired(order);
      save('movements', { ...order, serviceActionCode: code, status: command.status, ...(command.status === 'Concluída' ? { completedAt: now } : {}), ...(command.status === 'Cancelada' ? { cancelledAt: now } : {}), history: [...(order.history || []), { timestamp: now, actorName: actor.name, action: command.action, ...(command.detail ? { detail: command.detail } : {}) }] }); break;
    }
    case 'loan': {
      const loan = command.loan; const destination = partnerLocation(loan.thirdPartyId, 'EXTERNAL_LOAN');
      requireValue(loan.items.length > 0 && loan.items.length <= 50 && new Set(loan.items.map(item => item.componentId)).size === loan.items.length, 'Selecione de 1 a 50 equipamentos sem repetição.');
      for (const item of loan.items) { const component = getComponent(item.componentId); available(component); requireValue(availability(component).availableForUse, `${component.name}: precisa estar disponível em um armazenamento identificado.`); place(component, { location: destination }, 'Em Uso', 'Empréstimo', loan.id); }
      save('loans', { ...loan, status: 'Ativo', locationId: destination.id }); break;
    }
    case 'returnLoan': {
      const loan = state.loans.find(item => item.id === command.id); requireValue(loan?.status === 'Ativo', 'Empréstimo já devolvido ou não encontrado.');
      const destination = internal(command.locationId); const ids = command.componentIds || loan.items.map(item => item.componentId);
      requireValue(ids.length > 0 && ids.length <= 50 && new Set(ids).size === ids.length && ids.every(id => loan.items.some(item => item.componentId === id)), 'A seleção de devolução mudou. Atualize o empréstimo.');
      for (const id of ids) { const component = getComponent(id); available(component, undefined, loan.id); place(component, { location: destination }, 'Disponível', 'Devolução de empréstimo', loan.id); }
      const remaining = loan.items.filter(item => !ids.includes(item.componentId));
      save('loans', { ...loan, items: remaining, returnedItems: [...(loan.returnedItems || []), ...loan.items.filter(item => ids.includes(item.componentId))], status: remaining.length ? 'Ativo' : 'Devolvido', returnLocationId: destination.id, ...(remaining.length ? {} : { actualReturnDate: now.slice(0, 10) }) }); break;
    }
    case 'maintenance': {
      const maintenance = command.maintenance; const component = getComponent(maintenance.componentId); available(component);
      requireValue(availability(component).canSendToMaintenance, 'Remova o equipamento da máquina por O.S. antes de enviar à assistência.');
      requireValue(resolve(component).kind === 'internal', 'Confira o armazenamento de origem antes de enviar à assistência.');
      const destination = partnerLocation(maintenance.providerId || '', 'EXTERNAL_SERVICE');
      place(component, { location: destination }, 'Manutenção', 'Envio à assistência', maintenance.id);
      save('maintenances', { ...maintenance, status: 'Em Manutenção', locationId: destination.id, providerName: destination.name }); break;
    }
    case 'returnMaintenance': {
      const maintenance = state.maintenances.find(item => item.id === command.id); requireValue(maintenance?.status === 'Em Manutenção', 'Manutenção já finalizada ou não encontrada.');
      const component = getComponent(maintenance.componentId); available(component, undefined, undefined, maintenance.id);
      requireValue(['Concluído', 'Sem Conserto'].includes(command.data.status), 'Informe a situação do retorno.');
      place({ ...component, maintenanceRequired: false }, { location: internal(command.data.returnLocationId || '') }, command.data.status === 'Sem Conserto' ? 'Descartado' : 'Disponível', 'Retorno da assistência', maintenance.id);
      save('maintenances', { ...maintenance, ...command.data }); break;
    }
  }
  return { changes, events, settings };
}

export function auditStorage(state: StorageState) {
  return state.components.flatMap(component => {
    const issues: string[] = [];
    if (!component.currentLocationId && !component.currentMachineId) issues.push('Destino sem vínculo');
    if (component.currentLocationId && component.currentMachineId) issues.push('Máquina e local preenchidos simultaneamente');
    if (component.currentLocationId && !state.locations.some(item => item.id === component.currentLocationId)) issues.push('Local não encontrado');
    if (component.currentMachineId && !state.machines.some(item => item.id === component.currentMachineId)) issues.push('Máquina não encontrada');
    const location = state.locations.find(item => item.id === component.currentLocationId);
    if (location && !location.isActive) issues.push('Destino inativo');
    if (location?.partnerId && !state.partners.some(item => item.id === location.partnerId)) issues.push('Parceiro do destino não encontrado');
    if (component.currentMachineId && component.status !== 'Em Uso') issues.push('Vínculo de máquina incompatível com status');
    if (location && location.kind !== 'INTERNAL' && !location.partnerId) issues.push('Destino externo sem parceiro vinculado');
    if (component.placementVersion !== 1) issues.push('Cadastro legado: conferir destino');
    return issues.length ? [{ component, issues }] : [];
  });
}

export function auditLocationRegistry(state: StorageState) {
  return state.locations.flatMap(location => {
    const issues: string[] = [];
    if (state.locations.some(other => other.id !== location.id && other.kind === location.kind && normalized(other.name) === normalized(location.name))) issues.push('Nome repetido: conferir, sem unir IDs automaticamente');
    if (location.kind !== 'INTERNAL' && !location.partnerId) issues.push('Destino externo sem parceiro');
    if (location.partnerId && state.locations.some(other => other.id !== location.id && other.kind === location.kind && other.partnerId === location.partnerId)) issues.push('Múltiplos destinos para o mesmo parceiro');
    return issues.length ? [{ location, issues }] : [];
  });
}
