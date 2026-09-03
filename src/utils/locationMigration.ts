/** @deprecated Rotina legada desativada. Não chamar: pressupõe destinos sem conferência.
 * Use auditStorage/auditLocationRegistry e o fluxo administrativo com backup e justificativa.
 * Mantida apenas como referência histórica; não é importada pelo aplicativo.
 */
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type {
  AutopilotComponent,
  Location,
  LocationKind,
  Machine,
  MovementLog,
} from '../types';

const ALMOXARIFADO_CENTRAL_NAME = 'Almoxarifado Central';
const EMPRESTIMO_KIND: LocationKind = 'EXTERNAL_LOAN';
const COMODATO_PREFIX = 'Comodato: ';
const EMPRESTIMO_PREFIX = 'Empréstimo: ';

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_LOCATIONS: Pick<Location, 'name' | 'kind' | 'isActive'>[] = [
  { name: ALMOXARIFADO_CENTRAL_NAME, kind: 'INTERNAL', isActive: true },
  { name: 'Trimble Service Center', kind: 'EXTERNAL_SERVICE', isActive: true },
  { name: 'Laboratório Oeste GPS', kind: 'EXTERNAL_SERVICE', isActive: true },
  { name: 'Topcon Precision Repair', kind: 'EXTERNAL_SERVICE', isActive: true },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function parseLocationData(id: string, data: Record<string, unknown>): Location {
  return {
    id,
    name: (data.name as string) || '',
    kind: (data.kind as LocationKind) || 'INTERNAL',
    partnerId: (data.partnerId as string) || undefined,
    address: (data.address as string) || undefined,
    contactPerson: (data.contactPerson as string) || undefined,
    phone: (data.phone as string) || undefined,
    email: (data.email as string) || undefined,
    isActive: data.active !== false,
    notes: (data.notes as string) || undefined,
    updatedAt: data.updatedAt,
    updatedBy: (data.updatedBy as string) || '',
  };
}

// ─── Seed default locations ─────────────────────────────────────────────────

/**
 * Ensures at least the "Almoxarifado Central" location exists.
 * Idempotent: if locations already have an INTERNAL entry, no write occurs.
 */
export async function seedDefaultLocations(
  db: Firestore,
  isDemoMode: boolean,
  currentLocations: Location[],
  setLocations: (locs: Location[]) => void,
  saveDemoData?: (key: string, data: unknown[]) => void,
): Promise<Location[]> {
  if (isDemoMode) {
    return seedDefaultLocationsDemo(currentLocations, setLocations, saveDemoData);
  }
  return seedDefaultLocationsFirestore(db, currentLocations, setLocations);
}

async function seedDefaultLocationsDemo(
  currentLocations: Location[],
  setLocations: (locs: Location[]) => void,
  saveDemoData?: (key: string, data: unknown[]) => void,
): Promise<Location[]> {
  const ts = now();
  const updated = [...currentLocations];
  let changed = false;

  for (const def of DEFAULT_LOCATIONS) {
    const exists = updated.some(
      (l) =>
        l.kind === def.kind &&
        l.name.trim().toLocaleLowerCase('pt-BR') === def.name.trim().toLocaleLowerCase('pt-BR')
    );
    if (exists) continue;
    updated.push({
      id: makeId('loc'),
      name: def.name,
      kind: def.kind,
      isActive: def.isActive,
      updatedAt: ts,
      updatedBy: 'Sistema',
    });
    changed = true;
  }

  if (changed) {
    setLocations(updated);
    if (saveDemoData) saveDemoData('locations', updated);
  }
  return updated;
}

async function seedDefaultLocationsFirestore(
  db: Firestore,
  currentLocations: Location[],
  setLocations: (locs: Location[]) => void,
): Promise<Location[]> {
  // Load authoritative list from Firestore to avoid clobbering user data
  const snap = await getDocs(collection(db, 'locations'));
  const fromFs: Location[] = snap.docs.map((d) => parseLocationData(d.id, d.data() as Record<string, unknown>));
  const mergedMap = new Map<string, Location>();
  fromFs.forEach((l) => mergedMap.set(`${l.kind}|${l.name.trim().toLocaleLowerCase('pt-BR')}`, l));

  const batch = writeBatch(db);
  const created: Location[] = [];
  for (const def of DEFAULT_LOCATIONS) {
    const key = `${def.kind}|${def.name.trim().toLocaleLowerCase('pt-BR')}`;
    if (mergedMap.has(key)) continue;
    const id = makeId('loc');
    const ref = doc(db, 'locations', id);
    const loc: Location = {
      id,
      name: def.name,
      kind: def.kind,
      isActive: def.isActive,
      updatedAt: now(),
      updatedBy: 'Sistema',
    };
    batch.set(ref, loc);
    created.push(loc);
    mergedMap.set(key, loc);
  }
  if (created.length > 0) {
    await batch.commit();
  }

  const base = fromFs.length > 0 ? fromFs : currentLocations;
  const merged = [...base, ...created];
  setLocations(merged);
  return merged;
}

// ─── Backfill component locations ───────────────────────────────────────────

/**
 * Fills `currentLocationId` and `currentMachineId` on components that lack them.
 * Safe to run multiple times — only writes to components missing the field.
 */
export async function backfillComponentLocations(
  db: Firestore,
  components: AutopilotComponent[],
  machines: Machine[],
  locations: Location[],
  isDemoMode: boolean,
  setComponents: (updater: (prev: AutopilotComponent[]) => AutopilotComponent[]) => void,
  saveDemoData?: (key: string, data: unknown[]) => void,
): Promise<void> {
  if (locations.length === 0) return;

  const internalLoc = locations.find((l) => l.kind === 'INTERNAL');
  if (!internalLoc) return;

  const machineByPrefix = new Map<string, Machine>();
  for (const m of machines) {
    machineByPrefix.set(m.prefix.trim().toUpperCase(), m);
  }

  const needsBackfill = components.filter(
    (c) => !c.currentLocationId || (!c.currentMachineId && c.currentMachine),
  );
  if (needsBackfill.length === 0) return;

  if (isDemoMode) {
    backfillComponentLocationsDemo(components, locations, internalLoc, machineByPrefix, setComponents, saveDemoData);
    return;
  }

  await backfillComponentLocationsFirestore(db, components, locations, internalLoc, machineByPrefix);
}

function backfillComponentLocationsDemo(
  components: AutopilotComponent[],
  _locations: Location[],
  internalLoc: Location,
  machineByPrefix: Map<string, Machine>,
  setComponents: (updater: (prev: AutopilotComponent[]) => AutopilotComponent[]) => void,
  saveDemoData?: (key: string, data: unknown[]) => void,
) {
  let mutated = false;

  const updated = components.map((c) => {
    if (c.currentLocationId && (c.currentMachineId || !c.currentMachine)) return c;

    const patch: Partial<AutopilotComponent> = {};
    mutated = true;

    if (!c.currentLocationId) {
      patch.currentLocationId = resolveLocationForComponent(c, internalLoc);
    }
    if (!c.currentMachineId && c.currentMachine) {
      const machine = machineByPrefix.get(c.currentMachine.trim().toUpperCase());
      if (machine) patch.currentMachineId = machine.id;
    }

    return { ...c, ...patch, updatedAt: now(), updatedBy: 'Migração automática' };
  });

  if (mutated) {
    setComponents(() => updated);
    if (saveDemoData) saveDemoData('components', updated);
  }
}

async function backfillComponentLocationsFirestore(
  db: Firestore,
  components: AutopilotComponent[],
  _locations: Location[],
  internalLoc: Location,
  machineByPrefix: Map<string, Machine>,
) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const ts = now();

  for (const c of components) {
    if (c.currentLocationId && (c.currentMachineId || !c.currentMachine)) continue;

    const patch: Record<string, unknown> = { updatedAt: ts, updatedBy: 'Migração automática' };

    if (!c.currentLocationId) {
      patch.currentLocationId = resolveLocationForComponent(c, internalLoc);
    }
    if (!c.currentMachineId && c.currentMachine) {
      const machine = machineByPrefix.get(c.currentMachine.trim().toUpperCase());
      if (machine) patch.currentMachineId = machine.id;
    }

    if (Object.keys(patch).length > 1) {
      updates.push({ id: c.id, patch });
    }
  }

  if (updates.length === 0) return;

  // Execute in chunks of 500
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const batch = writeBatch(db);
    for (const { id, patch } of chunk) {
      batch.update(doc(db, 'components', id), patch);
    }
    await batch.commit();
  }
}

// ─── Backfill movement locations ────────────────────────────────────────────

/**
 * Fills `locationId` and `machineId` on movements that lack them.
 */
export async function backfillMovementLocations(
  db: Firestore,
  machines: Machine[],
  locations: Location[],
  movements: MovementLog[],
  isDemoMode: boolean,
  setMovements: (updater: (prev: MovementLog[]) => MovementLog[]) => void,
  saveDemoData?: (key: string, data: unknown[]) => void,
): Promise<void> {
  if (locations.length === 0) return;

  const internalLoc = locations.find((l) => l.kind === 'INTERNAL');
  if (!internalLoc) return;

  const machineByPrefix = new Map<string, Machine>();
  for (const m of machines) {
    machineByPrefix.set(m.prefix.trim().toUpperCase(), m);
  }

  const needsBackfill = movements.filter(
    (m) => !m.locationId || (!m.machineId && m.machinePrefix && m.machinePrefix !== 'Almoxarifado'),
  );
  if (needsBackfill.length === 0) return;

  if (isDemoMode) {
    backfillMovementLocationsDemo(movements, locations, internalLoc, machineByPrefix, setMovements, saveDemoData);
    return;
  }

  await backfillMovementLocationsFirestore(db, movements, locations, internalLoc, machineByPrefix);
}

function backfillMovementLocationsDemo(
  movements: MovementLog[],
  _locations: Location[],
  internalLoc: Location,
  machineByPrefix: Map<string, Machine>,
  setMovements: (updater: (prev: MovementLog[]) => MovementLog[]) => void,
  saveDemoData?: (key: string, data: unknown[]) => void,
) {
  let mutated = false;

  const updated = movements.map((m) => {
    if (m.locationId && (m.machineId || !m.machinePrefix || m.machinePrefix === 'Almoxarifado')) return m;

    const patch: Partial<MovementLog> = {};
    mutated = true;

    if (!m.locationId) {
      patch.locationId = resolveLocationForMovement(m, internalLoc);
    }
    if (!m.machineId && m.machinePrefix && m.machinePrefix !== 'Almoxarifado') {
      const machine = machineByPrefix.get(m.machinePrefix.trim().toUpperCase());
      if (machine) patch.machineId = machine.id;
    }

    return { ...m, ...patch, updatedAt: now(), updatedBy: 'Migração automática' };
  });

  if (mutated) {
    setMovements(() => updated);
    if (saveDemoData) saveDemoData('movements', updated);
  }
}

async function backfillMovementLocationsFirestore(
  db: Firestore,
  movements: MovementLog[],
  _locations: Location[],
  internalLoc: Location,
  machineByPrefix: Map<string, Machine>,
) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const ts = now();

  for (const m of movements) {
    if (m.locationId && (m.machineId || !m.machinePrefix || m.machinePrefix === 'Almoxarifado')) continue;

    const patch: Record<string, unknown> = { updatedAt: ts, updatedBy: 'Migração automática' };

    if (!m.locationId) {
      patch.locationId = resolveLocationForMovement(m, internalLoc);
    }
    if (!m.machineId && m.machinePrefix && m.machinePrefix !== 'Almoxarifado') {
      const machine = machineByPrefix.get(m.machinePrefix.trim().toUpperCase());
      if (machine) patch.machineId = machine.id;
    }

    if (Object.keys(patch).length > 1) {
      updates.push({ id: m.id, patch });
    }
  }

  if (updates.length === 0) return;

  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const batch = writeBatch(db);
    for (const { id, patch } of chunk) {
      batch.update(doc(db, 'movements', id), patch);
    }
    await batch.commit();
  }
}

// ─── Resolve helpers ────────────────────────────────────────────────────────

function resolveLocationForComponent(comp: AutopilotComponent, internalLoc: Location): string {
  return internalLoc.id;
}

function resolveLocationForMovement(_m: MovementLog, internalLoc: Location): string {
  return internalLoc.id;
}

// ─── Ensure a location exists (for dynamic creation) ────────────────────────

/**
 * Finds or creates a Location by kind+name. Used by loan/maintenance flows.
 * Returns the Location id.
 */
export async function ensureLocation(
  db: Firestore,
  isDemoMode: boolean,
  currentLocations: Location[],
  setLocations: (locs: Location[]) => void,
  saveDemoData: ((key: string, data: unknown[]) => void) | undefined,
  kind: LocationKind,
  name: string,
): Promise<Location> {
  const existing = currentLocations.find(
    (l) => l.kind === kind && l.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) return existing;

  const ts = now();
  const id = makeId('loc');
  const newLoc: Location = {
    id,
    name,
    kind,
    isActive: true,
    updatedAt: ts,
    updatedBy: 'Sistema',
  };

  const updated = [...currentLocations, newLoc];
  setLocations(updated);
  if (saveDemoData) saveDemoData('locations', updated);

  if (!isDemoMode) {
    await setDoc(doc(db, 'locations', id), newLoc);
  }

  return newLoc;
}

/**
 * Get the default internal location id. Returns undefined if no locations exist yet.
 */
export function getDefaultLocationId(locations: Location[]): string | undefined {
  const internal = locations.find((l) => l.kind === 'INTERNAL' && l.isActive);
  return internal?.id;
}

/**
 * Migration guard: returns true if migration has already run in this session.
 */
const MIGRATION_GUARD_KEY = 'agro_stock_gps_location_migration_run';

export function hasMigrationRun(): boolean {
  try {
    return localStorage.getItem(MIGRATION_GUARD_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markMigrationRun(): void {
  try {
    localStorage.setItem(MIGRATION_GUARD_KEY, 'true');
  } catch {
    // ignore
  }
}

export function markMigrationRunReset(): void {
  try {
    localStorage.removeItem(MIGRATION_GUARD_KEY);
  } catch {
    // ignore
  }
}
