import assert from 'node:assert/strict';
import test from 'node:test';
import type { AutopilotComponent, ComponentMaintenance, Location, Machine } from '../types';
import { createEquipmentDestinationResolver, groupEquipmentByDestination } from './equipmentDestinations.ts';

const machine: Machine = { id: 'm1', prefix: '80719', type: 'Colhedora', model: 'CH 8800', brand: 'Case', fleet: 'Frente 10', updatedAt: '' };
const location = (id: string, name: string, kind: Location['kind']): Location => ({ id, name, kind, isActive: true, updatedAt: '', updatedBy: '' });
const warehouse = location('w1', 'Almoxarifado Norte', 'INTERNAL');
const service = location('s1', 'Oficina GPS', 'EXTERNAL_SERVICE');
const loan = location('l1', 'Parceiro A', 'EXTERNAL_LOAN');
const component = (id: string, patch: Partial<AutopilotComponent> = {}): AutopilotComponent => ({
  id, name: 'Antena', serialNumber: id, type: 'Antena/Receptor', brand: 'Trimble', status: 'Disponível', updatedAt: '', updatedBy: '', ...patch,
});
const repair = (patch: Partial<ComponentMaintenance> = {}): ComponentMaintenance => ({
  id: 'r1', componentId: 'repair', componentSerial: 'repair', componentName: 'Antena', componentBrand: 'Trimble',
  componentType: 'Antena', sentDate: '2026-09-01', providerName: 'Oficina GPS', issueDescription: 'Falha', status: 'Em Manutenção',
  updatedAt: '', updatedBy: '', ...patch,
});
const resolve = createEquipmentDestinationResolver([machine], [warehouse, service, loan]);

test('máquina em uso prevalece sobre almoxarifado legado e usa ID ou prefixo', () => {
  const byId = resolve(component('a', { status: 'Em Uso', currentMachineId: 'm1', currentLocationId: 'w1' }));
  const byPrefix = resolve(component('b', { status: 'Em Uso', currentMachine: ' 80719 ', currentMachineId: 'missing' }));
  assert.equal(byId.kind, 'machine');
  assert.equal(byId.label, '80719');
  assert.equal(byId.fleet, 'Frente 10');
  assert.equal(byId.key, byPrefix.key);
});

test('almoxarifados mantêm nome cadastrado e não são inferidos de campos vazios', () => {
  assert.equal(resolve(component('a', { currentLocationId: 'w1' })).label, 'Almoxarifado Norte');
  assert.equal(resolve(component('b')).kind, 'unknown');
  assert.equal(resolve(component('b')).label, 'Local não informado');
});

test('máquina antiga não classifica manutenção ou equipamento disponível como frota', () => {
  for (const status of ['Manutenção', 'Disponível', 'Descartado'] as const) {
    const destination = resolve(component('a', { status, currentMachineId: 'm1', currentMachine: '80719' }));
    assert.equal(destination.kind, 'unknown');
  }
  assert.equal(resolve(component('a', { status: 'Manutenção', currentMachineId: 'm1', currentLocationId: 's1' })).kind, 'service');
});

test('empréstimo e comodato legados prevalecem sobre vínculos antigos', () => {
  for (const prefix of ['Empréstimo:', 'emprestimo:', 'Comodato:']) {
    const destination = resolve(component('a', { status: 'Em Uso', currentMachineId: 'm1', currentLocationId: 'w1', currentMachine: `${prefix} Parceiro A` }));
    assert.equal(destination.kind, 'loan');
    assert.equal(destination.key, 'loan:location:l1');
  }
  assert.equal(resolve(component('b', { status: 'Em Uso', currentLocationId: 'l1' })).kind, 'loan');
});

test('fallback legado normaliza espaços e acentos sem misturar categorias', () => {
  const a = resolve(component('a', { status: 'Em Uso', currentMachine: 'Comodato: José Silva' }));
  const b = resolve(component('b', { status: 'Em Uso', currentMachine: 'Empréstimo: JOSE   SILVA' }));
  const c = resolve(component('c', { currentMachine: 'José Silva' }));
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, c.key);
  assert.equal(resolve(component('d', { currentMachine: ' Almoxarifado Norte ' })).key, 'internal:location:w1');
});

test('IDs não encontrados têm fallback seguro e não viram almoxarifado', () => {
  const a = resolve(component('a', { currentLocationId: 'missing1' }));
  const b = resolve(component('b', { currentLocationId: 'missing2' }));
  assert.equal(a.kind, 'unknown');
  assert.notEqual(a.key, b.key);
  assert.equal(resolve(component('c', { status: 'Em Uso', currentMachineId: 'missing' })).kind, 'unknown');
});

test('locais homônimos mantêm grupos e filtros distintos por ID', () => {
  const resolveNames = createEquipmentDestinationResolver([], [warehouse, { ...warehouse, id: 'w2' }]);
  const items = [component('a', { currentLocationId: 'w1' }), component('b', { currentLocationId: 'w2' })];
  const groups = groupEquipmentByDestination(items, 'location', resolveNames);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, groups[1].label);
  const filtered = items.filter(item => resolveNames(item).key === groups[0].key);
  assert.equal(filtered.length, 1);
});

test('reparo ativo usa destino cadastrado ou parceiro, ignorando histórico concluído', () => {
  const resolveRepair = createEquipmentDestinationResolver([machine], [warehouse, service], [repair({ locationId: 's1' })]);
  assert.equal(resolveRepair(component('repair', { status: 'Manutenção', currentLocationId: 'w1' })).key, 'service:location:s1');
  const resolvePartner = createEquipmentDestinationResolver([], [], [repair({ providerId: 'p1', providerName: 'Parceiro B' })]);
  assert.equal(resolvePartner(component('repair', { status: 'Manutenção' })).key, 'service:partner:p1');
  const resolveHistory = createEquipmentDestinationResolver([], [], [repair({ status: 'Concluído' })]);
  assert.equal(resolveHistory(component('repair', { status: 'Manutenção' })).kind, 'unknown');
});

test('agrupamento único preserva todos os itens exatamente uma vez e separa cada destino real', () => {
  const items = [
    component('m', { status: 'Em Uso', currentMachineId: 'm1' }),
    component('w', { currentLocationId: 'w1' }),
    component('s', { status: 'Manutenção', currentLocationId: 's1' }),
    component('l', { status: 'Em Uso', currentMachine: 'Empréstimo: Parceiro A' }),
    component('u'),
  ];
  const localGroups = groupEquipmentByDestination(items, 'location', resolve);
  assert.equal(localGroups.length, 5);
  assert.deepEqual(localGroups.map(group => group.kind).sort(), ['internal', 'loan', 'machine', 'service', 'unknown']);
  assert.equal(localGroups.find(group => group.kind === 'internal')!.label, 'Almoxarifado Norte');
  assert.equal(localGroups.find(group => group.kind === 'service')!.label, 'Oficina GPS');
  assert.deepEqual(localGroups.flatMap(group => group.items.map(item => item.id)).sort(), items.map(item => item.id).sort());
  assert.deepEqual(groupEquipmentByDestination(items, 'none', resolve), []);
  assert.deepEqual(groupEquipmentByDestination([], 'location', resolve), []);
});
