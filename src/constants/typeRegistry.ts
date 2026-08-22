import { RegisteredType, RegisteredTypeCategory } from '../types';

// Fallback lists used when the registry has no entry for a category.
export const DEFAULT_TYPE_NAMES: Record<RegisteredTypeCategory, string[]> = {
  partner: ['Assistência técnica', 'Prestador de serviço', 'Recebedor de empréstimo'],
  equipment_component: ['Antena/Receptor', 'Monitor/Display', 'Controladora', 'Motor de Passo', 'Cabo/Chicote', 'Sensor de Ângulo', 'Outro'],
  equipment_machine: ['Trator', 'Colhedora', 'Pulverizador', 'Outro'],
  service: ['Instalação', 'Remoção', 'Manutenção', 'Calibração'],
};

export const REGISTERED_TYPE_CATEGORIES: { key: RegisteredTypeCategory; label: string; description: string }[] = [
  { key: 'partner', label: 'Tipos de Parceiro', description: 'Classificação dos parceiros cadastrados' },
  { key: 'equipment_component', label: 'Equipamentos GPS', description: 'Tipos de componentes GPS' },
  { key: 'equipment_machine', label: 'Máquinas / Frota', description: 'Tipos de máquinas da frota' },
  { key: 'service', label: 'Tipos de Serviço', description: 'Ações de O.S. e serviços de manutenção' },
];

export const CORE_SERVICE_ACTIONS = ['Instalação', 'Remoção', 'Manutenção', 'Calibração'];

// Types wired into business logic (filters, O.S. workflow) and therefore protected
// from rename/delete even when no record references them yet.
export const PROTECTED_TYPE_NAMES: Partial<Record<RegisteredTypeCategory, string[]>> = {
  partner: ['Assistência técnica', 'Prestador de serviço', 'Recebedor de empréstimo'],
  service: CORE_SERVICE_ACTIONS,
};

const now = new Date().toISOString();

export const DEFAULT_REGISTERED_TYPES: RegisteredType[] = Object.entries(DEFAULT_TYPE_NAMES).flatMap(
  ([category, names]) =>
    names.map((name, i) => ({
      id: `default_${category}_${i}`,
      category: category as RegisteredTypeCategory,
      name,
      active: true,
      updatedAt: now,
      updatedBy: 'Sistema',
    }))
);
