import type { UserRole } from '../types';

export const SUPER_ROLE = 'SUPER_USUARIO' as const;

const SUPER_ROLE_ALIASES = ['SUPER_USUARIO', 'superusuario', 'super_usuario', 'super'];
const ADMIN_ROLE_ALIASES = ['ADMINISTRADOR', 'administrador'];
const TECHNICIAN_ROLE_ALIASES = ['TECNICO_CAMPO', 'tecnico'];

export function isSuperRole(role?: string | null): boolean {
  return !!role && SUPER_ROLE_ALIASES.includes(role);
}

export function isAdministratorRole(role?: string | null): boolean {
  return !!role && ADMIN_ROLE_ALIASES.includes(role);
}

export function isAdminRole(role?: string | null): boolean {
  return isSuperRole(role) || isAdministratorRole(role);
}

export function isTechnicianRole(role?: string | null): boolean {
  return !!role && TECHNICIAN_ROLE_ALIASES.includes(role);
}

export function normalizeRole(role?: string | null): UserRole {
  if (isSuperRole(role)) return SUPER_ROLE;
  if (role === 'administrador') return 'ADMINISTRADOR';
  if (role === 'tecnico') return 'TECNICO_CAMPO';
  if (role === 'ADMINISTRADOR' || role === 'TECNICO_CAMPO') return role;
  return 'TECNICO_CAMPO';
}

export function roleLabel(role?: string | null): string {
  if (isSuperRole(role)) return 'Super Usuário (DEV)';
  if (isAdminRole(role)) return 'Administrador';
  return 'Técnico de Campo';
}
