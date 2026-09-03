import assert from 'node:assert/strict';
import test from 'node:test';
import { planStorageCommand, auditStorage, auditLocationRegistry, storageCommandKey, type StorageState, type StorageCommand } from './storageModel';
import type { AutopilotComponent, ComponentLoan, ComponentMaintenance, MovementLog } from '../types';

const actor = { id: 'admin', name: 'Administrador', role: 'ADMINISTRADOR' };
const now = '2026-09-02T12:00:00.000Z';
const component = (id = 'c1', data: Partial<AutopilotComponent> = {}): AutopilotComponent => ({ id, name: 'Antena', serialNumber: id, brand: 'Trimble', type: 'Antena', status: 'Disponível', currentLocationId: 'l1', placementVersion: 1, updatedAt: now, updatedBy: actor.name, ...data });
const state = (): StorageState => ({
  components: [component(), component('c2')],
  locations: [{ id: 'l1', name: 'Depósito Norte', kind: 'INTERNAL', isActive: true, updatedAt: now, updatedBy: 'Admin' }, { id: 'l2', name: 'Oficina', kind: 'INTERNAL', isActive: true, updatedAt: now, updatedBy: 'Admin' }],
  machines: [{ id: 'm1', prefix: '80719', type: 'Colhedora', model: 'CH', brand: 'Case', updatedAt: now }],
  partners: [{ id: 'p1', legalName: 'Parceiro', personType: 'PJ', document: '', phone: '', email: '', active: true, types: ['Assistência técnica', 'Recebedor de empréstimo'], createdAt: now, updatedAt: now, updatedBy: 'Admin' }],
  loans: [], maintenances: [], movements: [], settings: { defaultLocationId: 'l1', revision: 0 },
});
function run(s: StorageState, command: StorageCommand) { return planStorageCommand(s, command, actor, 'op1', now); }
function apply(s: StorageState, result: ReturnType<typeof run>) {
  const next = structuredClone(s);
  for (const change of result.changes) { (next as any)[change.collection] = (next as any)[change.collection].filter((item: any) => item.id !== change.id); if (change.data) (next as any)[change.collection].push(change.data); }
  next.settings = result.settings; return next;
}
const order = (patch: Partial<MovementLog> = {}): MovementLog => ({ id: 'os1', componentId: 'c1', componentIds: ['c1'], componentName: 'Antena', componentSerial: 'c1', action: 'Instalação', machineId: 'm1', machinePrefix: '80719', date: now, technicianId: 'admin', technicianName: 'Admin', notes: '', createdAt: now, status: 'Aberta', ...patch });
const loan = (): ComponentLoan => ({ id: 'loan1', thirdPartyId: 'p1', thirdPartyName: 'Parceiro', thirdPartyDocument: '', thirdPartyCompany: '', items: ['c1','c2'].map(id => ({ componentId: id, componentName: 'Antena', componentSerial: id, componentBrand: 'Trimble', componentType: 'Antena' })), loanDate: now, status: 'Ativo', contractNumber: 'CO1', createdAt: now, updatedAt: now, updatedBy: 'Admin' });
const maintenance = (): ComponentMaintenance => ({ id: 'maint1', componentId: 'c1', componentName: 'Antena', componentSerial: 'c1', componentBrand: 'Trimble', componentType: 'Antena', providerId: 'p1', providerName: 'Parceiro', sentDate: now, issueDescription: 'Falha', status: 'Em Manutenção', updatedAt: now, updatedBy: 'Admin' });

test('cadastro exige local ativo; não presume o padrão', () => {
  assert.throws(() => run(state(), { type: 'component', editing: false, component: component('new', { currentLocationId: '' }) }), /local.*ativo/);
  const result = run(state(), { type: 'component', editing: false, component: component('new', { currentMachineId: 'stale' }) });
  assert.equal(result.changes[0].data.currentMachineId, undefined); assert.equal(result.events[0].from.label, 'Cadastro inicial');
});
test('transferência preserva status e registra origem, destino e autor sem criar O.S.', () => {
  const s = state(); const before = JSON.stringify(s);
  const result = run(s, { type: 'transfer', componentIds: ['c1','c2'], locationId: 'l2', notes: 'Conferido' });
  assert.equal(JSON.stringify(s), before); assert.equal(result.events.length, 2);
  assert.equal(result.events[0].from.locationId, 'l1'); assert.equal(result.events[0].to.locationId, 'l2'); assert.equal(result.events[0].actorId, 'admin');
  assert.ok(result.changes.every(item => item.collection === 'components' && item.data.status === 'Disponível'));
});
test('falha em qualquer item não altera o estado de entrada', () => {
  const s = state(); s.components[1].status = 'Em Uso'; const before = JSON.stringify(s);
  assert.throws(() => run(s, { type: 'transfer', componentIds: ['c1','c2'], locationId: 'l2', notes: '' })); assert.equal(JSON.stringify(s), before);
});
test('transferência bloqueia destinos iguais, inativos e seleção duplicada', () => {
  const s = state(); s.locations[1].isActive = false;
  for (const locationId of ['l1','l2','missing']) assert.throws(() => run(s, { type: 'transfer', componentIds: ['c1'], locationId, notes: '' }));
  assert.throws(() => run(state(), { type: 'transfer', componentIds: ['c1','c1'], locationId: 'l2', notes: '' }));
});
test('conflitos de O.S. consideram todos os equipamentos do lote', () => {
  const s = state(); s.movements = [order({ componentIds: ['c1','c2'] })];
  assert.throws(() => run(s, { type: 'transfer', componentIds: ['c2'], locationId: 'l2', notes: '' }), /O.S. pendente/);
});
test('inativação bloqueada por ocupação, padrão e O.S. de destino', () => {
  const s = state(); assert.throws(() => run(s, { type: 'saveLocation', location: { ...s.locations[0], isActive: false } }), /padrão/);
  s.settings.defaultLocationId = 'l2'; assert.throws(() => run(s, { type: 'saveLocation', location: { ...s.locations[0], isActive: false } }), /equipamentos/);
  s.components = []; s.movements = [order({ locationId: 'l1' })]; assert.throws(() => run(s, { type: 'saveLocation', location: { ...s.locations[0], isActive: false } }), /O.S./);
});
test('técnico não cadastra local nem muda padrão', () => {
  const s = state(); for (const command of [{ type: 'default', locationId: 'l2' }, { type: 'saveLocation', location: s.locations[0] }] as StorageCommand[]) assert.throws(() => planStorageCommand(s, command, { ...actor, role: 'TECNICO_CAMPO' }, 'op1', now), /administrador/);
});
test('abrir e iniciar O.S. não movimenta; conclusão instala e limpa localização anterior', () => {
  let s = state(); const opened = run(s, { type: 'order', editing: false, order: order() }); assert.equal(opened.events.length, 0); s = apply(s, opened);
  const started = run(s, { type: 'transition', id: 'os1', status: 'Em Atendimento', action: 'Iniciado' }); assert.equal(started.changes.length, 1); s = apply(s, started);
  const completed = run(s, { type: 'transition', id: 'os1', status: 'Concluída', action: 'Concluído' }); const comp = completed.changes.find(item => item.collection === 'components')!.data;
  assert.equal(comp.currentMachineId, 'm1'); assert.equal(comp.currentLocationId, undefined); assert.equal(comp.status, 'Em Uso');
  s = apply(s, completed); assert.throws(() => run(s, { type: 'transition', id: 'os1', status: 'Concluída', action: 'Duplicado' }), /mudou/);
});
test('remoção exige destino e libera máquina somente ao concluir', () => {
  const s = state(); s.components[0] = component('c1', { currentLocationId: undefined, currentMachineId: 'm1', status: 'Em Uso' });
  assert.throws(() => run(s, { type: 'order', editing: false, order: order({ action: 'Remoção' }) }));
  s.movements = [order({ action: 'Remoção', status: 'Em Atendimento', locationId: 'l2' })];
  const result = run(s, { type: 'transition', id: 'os1', status: 'Concluída', action: 'Removido' });
  const comp = result.changes.find(item => item.collection === 'components')!.data; assert.equal(comp.currentMachineId, undefined); assert.equal(comp.currentLocationId, 'l2');
});
test('calibração e manutenção interna não inventam mudança física', () => {
  for (const action of ['Calibração', 'Manutenção'] as const) {
    const s = state(); s.components[0] = component('c1', { currentLocationId: undefined, currentMachineId: 'm1', status: 'Em Uso' }); s.movements = [order({ action, status: 'Em Atendimento' })];
    const result = run(s, { type: 'transition', id: 'os1', status: 'Concluída', action: 'Concluído' }); assert.equal(result.events.length, 0); assert.equal(result.changes.length, 1);
  }
});
test('empréstimo usa parceiro por ID e devolução parcial move somente itens recebidos', () => {
  let s = state(); s = apply(s, run(s, { type: 'loan', loan: loan() }));
  assert.equal(s.components[0].currentLocationId, 'external_loan_p1');
  s = apply(s, run(s, { type: 'returnLoan', id: 'loan1', componentIds: ['c1'], locationId: 'l2' }));
  assert.equal(s.loans[0].items.length, 1); assert.equal(s.loans[0].returnedItems?.length, 1); assert.equal(s.loans[0].status, 'Ativo');
  assert.equal(s.components.find(item => item.id === 'c1')?.currentLocationId, 'l2'); assert.equal(s.components.find(item => item.id === 'c2')?.currentLocationId, 'external_loan_p1');
  assert.throws(() => run(s, { type: 'returnLoan', id: 'loan1', componentIds: ['c1'], locationId: 'l2' }));
  s = apply(s, run(s, { type: 'returnLoan', id: 'loan1', locationId: 'l1' })); assert.equal(s.loans[0].status, 'Devolvido'); assert.equal(s.loans[0].returnedItems?.length, 2);
});
test('assistência exige parceiro ativo e retorno sem conserto também recebe local', () => {
  let s = state(); s.partners[0].active = false; assert.throws(() => run(s, { type: 'maintenance', maintenance: maintenance() }), /parceiro ativo/);
  s = state(); s = apply(s, run(s, { type: 'maintenance', maintenance: maintenance() })); assert.equal(s.components.find(item => item.id === 'c1')?.currentLocationId, 'external_service_p1');
  const data = { returnDate: now, replacedParts: '', servicesPerformed: 'Sem reparo', cost: 0, status: 'Sem Conserto' as const };
  assert.throws(() => run(s, { type: 'returnMaintenance', id: 'maint1', data }), /local.*ativo/);
  s = apply(s, run(s, { type: 'returnMaintenance', id: 'maint1', data: { ...data, returnLocationId: 'l2' } }));
  const comp = s.components.find(item => item.id === 'c1')!; assert.equal(comp.status, 'Descartado'); assert.equal(comp.currentLocationId, 'l2'); assert.equal(comp.currentMachineId, undefined);
});
test('nomes iguais de parceiros não unem destinos; duplicatas canônicas exigem conferência', () => {
  const s = state(); s.partners.push({ ...s.partners[0], id: 'p2' });
  const one = run(s, { type: 'maintenance', maintenance: maintenance() });
  const two = run(s, { type: 'maintenance', maintenance: { ...maintenance(), providerId: 'p2' } });
  assert.notEqual(one.events[0].to.locationId, two.events[0].to.locationId);
  s.locations.push({ id: 'dup1', name: 'A', kind: 'EXTERNAL_SERVICE', isActive: true, partnerId: 'p1', updatedAt: now, updatedBy: 'Admin' }, { id: 'dup2', name: 'B', kind: 'EXTERNAL_SERVICE', isActive: true, partnerId: 'p1', updatedAt: now, updatedBy: 'Admin' });
  assert.throws(() => run(s, { type: 'maintenance', maintenance: maintenance() }), /duplicados/);
});
test('edição cadastral não altera destino; auditoria não modifica registros legados', () => {
  const s = state(); assert.throws(() => run(s, { type: 'component', editing: true, component: { ...s.components[0], currentMachineId: 'm1' } }), /fluxos/);
  s.components[0].placementVersion = undefined; s.components[0].currentLocationId = 'missing'; const before = JSON.stringify(s);
  assert.ok(auditStorage(s)[0].issues.includes('Local não encontrado')); assert.equal(JSON.stringify(s), before);
});

test('conferência individual preserva status e corrige vínculos contraditórios', () => {
  const s = state(); s.components[0] = component('c1', { placementVersion: undefined, currentMachineId: 'stale', currentLocationId: 'missing' });
  const result = run(s, { type: 'review', componentIds: ['c1'], locationId: 'l1', notes: 'Conferência física após backup' });
  assert.equal(result.changes[0].data.currentMachineId, undefined); assert.equal(result.changes[0].data.placementVersion, 1); assert.equal(result.events[0].action, 'Local conferido');
  s.components[0] = component('c1', { status: 'Em Uso', placementVersion: undefined });
  const installed = run(s, { type: 'review', componentIds: ['c1'], locationId: '', machineId: 'm1', notes: 'Instalação conferida' });
  assert.equal(installed.changes[0].data.currentLocationId, undefined); assert.equal(installed.changes[0].data.status, 'Em Uso');
});
test('conferência não simula uma devolução nem aceita justificativa vazia', () => {
  const s = apply(state(), run(state(), { type: 'loan', loan: loan() }));
  assert.throws(() => run(s, { type: 'review', componentIds: ['c1'], locationId: 'l1', notes: 'Retirar sem devolver' }), /empréstimo/);
  assert.throws(() => run(state(), { type: 'review', componentIds: ['c1'], locationId: 'l2', notes: '' }), /justificativa/);
});
test('versão concorrente impede sobrescrever dados novos', () => {
  const s = state(); const stale = { ...s.components[0] }; s.components[0].updatedAt = '2026-09-02T12:01:00.000Z';
  assert.throws(() => run(s, { type: 'component', editing: true, component: { ...stale, name: 'Outra antena' } }), /outra pessoa/);
  const oldLocation = { ...s.locations[0] }; s.locations[0].updatedAt = '2026-09-02T12:01:00.000Z';
  assert.throws(() => run(s, { type: 'saveLocation', location: { ...oldLocation, name: 'Novo nome' } }), /outra pessoa/);
});
test('identidade de reenvio ignora IDs e datas geradas, sem confundir dados diferentes', () => {
  const one: StorageCommand = { type: 'loan', loan: loan() };
  const retry: StorageCommand = { type: 'loan', loan: { ...loan(), id: 'different', createdAt: 'later', updatedAt: 'later', contractNumber: 'CO2' } };
  assert.equal(storageCommandKey(one), storageCommandKey(retry));
  assert.notEqual(storageCommandKey(one), storageCommandKey({ type: 'loan', loan: { ...loan(), thirdPartyId: 'other' } }));
});
test('auditoria aponta homônimos e destinos externos sem vínculo, sem fundir IDs', () => {
  const s = state(); s.locations.push({ ...s.locations[0], id: 'l3' }, { ...s.locations[0], id: 'legacy', kind: 'EXTERNAL_SERVICE' });
  const result = auditLocationRegistry(s); assert.equal(result.length, 3); assert.equal(s.locations.length, 4);
});
test('sem origem identificada não é possível instalar ou emprestar por suposição', () => {
  const s = state(); s.components[0].currentLocationId = '';
  assert.throws(() => run(s, { type: 'order', editing: false, order: order() }), /armazenamento/);
  assert.throws(() => run(s, { type: 'loan', loan: loan() }), /armazenamento/);
});
