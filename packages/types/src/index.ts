// Shared TypeScript types for StokPilot
export type UserRole = 'SUPER_ADMIN' | 'PATRON' | 'SUBE_MUDURU' | 'KASIYER' | 'DEPO';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
export type OrderStatus = 'DRAFT' | 'APPROVED' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
export type TransferStatus = 'REQUESTED' | 'APPROVED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
