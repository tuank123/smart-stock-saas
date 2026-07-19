import type { UserRole } from './types';

// Single source of truth for Turkish role labels shown in the UI.
// (The backend enum values stay as-is; only the display strings live here.)
export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Süper Admin',
  PATRON: 'Patron',
  SUBE_MUDURU: 'Şube Müdürü',
  KASIYER: 'Şube Görevlisi',
  DEPO: 'Depo Görevlisi',
};

// Safe lookup: unknown/null roles fall back to a sensible label.
export function roleLabel(role?: UserRole | string | null): string {
  if (!role) return 'Rol atanmadı';
  return ROLE_LABELS[role as UserRole] ?? role;
}
