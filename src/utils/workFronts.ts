import type { Machine, WorkFront } from '../types';

/**
 * Keeps the rollout backwards compatible: before the first front is configured,
 * weekly collection behaves exactly as it did before. Once fronts exist, only an
 * active machine explicitly linked to an enabled front participates.
 */
export function participatesInWeeklyCollection(machine: Machine, workFronts: WorkFront[]): boolean {
  if (machine.active === false) return false;
  if (workFronts.length === 0) return true;

  const front = workFronts.find(item => item.id === machine.workFrontId);
  return Boolean(front?.active && front.collectsFieldData);
}

export function workFrontLabel(machine: Pick<Machine, 'workFrontName' | 'fleet'>): string {
  return machine.workFrontName?.trim() || machine.fleet?.trim() || 'Sem frente vinculada';
}
