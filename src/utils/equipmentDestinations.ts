import type { AutopilotComponent, ComponentMaintenance, Location, Machine } from '../types';

export type DestinationKind = 'machine' | 'internal' | 'service' | 'loan' | 'unknown';
export type EquipmentGrouping = 'none' | 'location';

export interface EquipmentDestination {
  key: string;
  kind: DestinationKind;
  label: string;
  fleet?: string;
}

export const DESTINATION_LABELS: Record<DestinationKind, { category: string; field: string }> = {
  machine: { category: 'Máquina da frota', field: 'Máquina' },
  internal: { category: 'Almoxarifado', field: 'Almoxarifado' },
  service: { category: 'Assistência técnica', field: 'Assistência' },
  loan: { category: 'Empréstimo / comodato', field: 'Destino' },
  unknown: { category: 'Local não identificado', field: 'Destino' },
};

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const loanName = (value: string) => value.replace(/^(?:empréstimo|emprestimo|comodato)\s*:\s*/i, '').trim();
const isLoan = (value: string) => /^(?:emprestimo|comodato)\s*:/.test(normalize(value));

export function createEquipmentDestinationResolver(
  machines: Machine[],
  locations: Location[],
  maintenances: ComponentMaintenance[] = [],
) {
  const machineById = new Map(machines.map(machine => [machine.id, machine]));
  const locationById = new Map(locations.map(location => [location.id, location]));
  // Match legacy names only when unambiguous; canonical IDs always keep homonyms separate.
  const uniqueMatch = <T,>(items: T[]): T | undefined => items.length === 1 ? items[0] : undefined;
  const fromLocation = (location: Location): EquipmentDestination => {
    const kind = location.kind === 'INTERNAL' ? 'internal'
      : location.kind === 'EXTERNAL_SERVICE' ? 'service' : 'loan';
    return { key: `${kind}:location:${location.id}`, kind, label: location.name.trim() || 'Local não informado' };
  };
  const fromLegacy = (kind: DestinationKind, name: string): EquipmentDestination => {
    const location = uniqueMatch(locations.filter(item => {
      const sameKind = kind === 'internal' ? item.kind === 'INTERNAL'
        : kind === 'service' ? item.kind === 'EXTERNAL_SERVICE'
        : kind === 'loan' && item.kind === 'EXTERNAL_LOAN';
      return sameKind && normalize(kind === 'loan' ? loanName(item.name) : item.name) === normalize(name);
    }));
    return location ? fromLocation(location) : { key: `${kind}:legacy:${normalize(name)}`, kind, label: name };
  };
  const activeMaintenance = new Map<string, ComponentMaintenance>();
  for (const maintenance of maintenances) {
    if (maintenance.status !== 'Em Manutenção') continue;
    const previous = activeMaintenance.get(maintenance.componentId);
    if (!previous || maintenance.sentDate > previous.sentDate) activeMaintenance.set(maintenance.componentId, maintenance);
  }

  return (component: AutopilotComponent): EquipmentDestination => {
    const legacy = (component.currentMachine || '').trim();
    const location = locationById.get(component.currentLocationId);
    const unknown = (): EquipmentDestination => ({
      key: component.currentLocationId ? `unknown:location:${component.currentLocationId}`
        : component.status === 'Em Uso' && component.currentMachineId ? `unknown:machine:${component.currentMachineId}`
        : 'unknown:missing',
      kind: 'unknown', label: 'Local não informado',
    });

    if (component.placementVersion === 1) {
      if (component.currentLocationId && component.currentMachineId) return unknown();
      if (location && !component.currentMachineId) return fromLocation(location);
      const machine = machineById.get(component.currentMachineId);
      if (machine && component.status === 'Em Uso') return { key: `machine:${machine.id}`, kind: 'machine', label: machine.prefix, fleet: machine.fleet };
      return unknown();
    }

    if (component.status === 'Em Uso') {
      // Loans use currentMachine text and may retain stale machine/internal-location IDs.
      if (isLoan(legacy)) {
        const name = loanName(legacy);
        if (!name) return unknown();
        if (location?.kind === 'EXTERNAL_LOAN' && normalize(loanName(location.name)) === normalize(name)) return fromLocation(location);
        return fromLegacy('loan', name);
      }
      const machine = machineById.get(component.currentMachineId)
        || uniqueMatch(machines.filter(item => normalize(item.prefix) === normalize(legacy) && !!legacy));
      if (machine) return { key: `machine:${machine.id}`, kind: 'machine', label: machine.prefix, fleet: machine.fleet };
    }

    // Only ongoing repairs are evidence of the current destination, never repair history.
    if (component.status === 'Manutenção') {
      const maintenance = activeMaintenance.get(component.id);
      const repairLocation = locationById.get(maintenance?.locationId);
      if (repairLocation?.kind === 'EXTERNAL_SERVICE') return fromLocation(repairLocation);
      if (location?.kind === 'EXTERNAL_SERVICE') return fromLocation(location);
      if (maintenance?.providerName?.trim()) {
        const name = maintenance.providerName.trim();
        const destination = fromLegacy('service', name);
        return destination.key.startsWith('service:location:') || !maintenance.providerId ? destination
          : { key: `service:partner:${maintenance.providerId}`, kind: 'service', label: name };
      }
    }
    if (location) return fromLocation(location);

    if (legacy && !isLoan(legacy)) {
      const matchingLocation = uniqueMatch(locations.filter(item => normalize(item.name) === normalize(legacy)));
      if (matchingLocation) return fromLocation(matchingLocation);
      if (/^almoxarifado(?:\s|$)/.test(normalize(legacy))) return fromLegacy('internal', legacy);
      // Do not reuse a former machine's prefix as a destination outside Em Uso.
      if (!machines.some(item => normalize(item.prefix) === normalize(legacy))) {
        return { key: `unknown:legacy:${normalize(legacy)}`, kind: 'unknown', label: legacy };
      }
    }
    return unknown();
  };
}

export function groupEquipmentByDestination(
  components: AutopilotComponent[],
  grouping: EquipmentGrouping,
  resolve: (component: AutopilotComponent) => EquipmentDestination,
) {
  const groups = new Map<string, EquipmentDestination & { items: AutopilotComponent[] }>();
  if (grouping === 'none') return [];
  for (const component of components) {
    const destination = resolve(component);
    const group = groups.get(destination.key);
    if (group) group.items.push(component);
    else groups.set(destination.key, { ...destination, items: [component] });
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR', { numeric: true }) || a.key.localeCompare(b.key)
  );
}
