'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalTenants: number;
  statusBreakdown: Record<string, number>; // ACTIVE / SUSPENDED / DELETED
  planBreakdown: Record<string, number>; // STARTER / PROFESSIONAL / ENTERPRISE
  newLast7Days: number;
  totalUsers: number;
  closedLast7Days: number;
  estimatedMonthlyRevenue: number;
  failedSyncJobs: number;
}

export interface AdminTenantListItem {
  id: string;
  companyName: string;
  taxNumber: string;
  planId: string;
  status: string;
  createdAt: string;
  userCount: number;
  branchCount: number;
}

export interface AdminTenantsResponse {
  items: AdminTenantListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminTenantUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminTenantBranch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
}

export interface AdminTenantDetail {
  id: string;
  companyName: string;
  taxNumber: string;
  planId: string;
  status: string;
  settings: unknown;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  users: AdminTenantUser[];
  branches: AdminTenantBranch[];
}

export interface AdminTenantsParams {
  search?: string;
  status?: string;
  planId?: string;
  page?: number;
  includeTest?: boolean;
}

// ── Hook'lar ──────────────────────────────────────────────────────────────────

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<AdminStats>('/admin/stats').then((r) => r.data),
  });
}

export function useAdminTenants(params: AdminTenantsParams) {
  return useQuery<AdminTenantsResponse>({
    queryKey: ['admin', 'tenants', params],
    queryFn: () =>
      api
        .get<AdminTenantsResponse>('/admin/tenants', {
          params: {
            ...(params.search ? { search: params.search } : {}),
            ...(params.status ? { status: params.status } : {}),
            ...(params.planId ? { planId: params.planId } : {}),
            ...(params.page ? { page: params.page } : {}),
            ...(params.includeTest ? { includeTest: true } : {}),
          },
        })
        .then((r) => r.data),
  });
}

export function useAdminTenantDetail(tenantId: string) {
  return useQuery<AdminTenantDetail>({
    queryKey: ['admin', 'tenants', tenantId],
    queryFn: () =>
      api.get<AdminTenantDetail>(`/admin/tenants/${tenantId}`).then((r) => r.data),
    enabled: !!tenantId,
  });
}

export function useUpdateTenantStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      api
        .patch(`/admin/tenants/${vars.id}/status`, { status: vars.status })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('İşletme durumu güncellendi');
    },
    onError: () => toast.error('Durum güncellenemedi'),
  });
}

// ── Hata kayıtları (ErrorLog) ─────────────────────────────────────────────────

export interface AdminErrorLog {
  id: string;
  source: string;
  severity: string; // CRITICAL | ERROR | WARNING (DB'de serbest string, enum zorlanmıyor)
  message: string;
  stackTrace: string | null;
  tenantId: string | null;
  branchId: string | null;
  context: unknown;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AdminErrorsResponse {
  items: AdminErrorLog[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminErrorsParams {
  source?: string;
  severity?: string;
  resolved?: string; // 'true' | 'false' | undefined
  page?: number;
}

export function useUnresolvedErrorCount() {
  return useQuery<{ count: number }>({
    queryKey: ['admin', 'errors', 'unresolved-count'],
    queryFn: () =>
      api.get<{ count: number }>('/admin/errors/unresolved-count').then((r) => r.data),
    refetchInterval: 12000,
  });
}

export function useAdminErrors(params: AdminErrorsParams) {
  return useQuery<AdminErrorsResponse>({
    queryKey: ['admin', 'errors', params],
    queryFn: () =>
      api
        .get<AdminErrorsResponse>('/admin/errors', {
          params: {
            ...(params.source ? { source: params.source } : {}),
            ...(params.severity ? { severity: params.severity } : {}),
            ...(params.resolved ? { resolved: params.resolved } : {}),
            ...(params.page ? { page: params.page } : {}),
          },
        })
        .then((r) => r.data),
    refetchInterval: 12000,
  });
}

export function useResolveError() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch(`/admin/errors/${id}/resolve`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'errors'] });
      toast.success('Hata çözüldü olarak işaretlendi');
    },
    onError: () => toast.error('İşaretleme başarısız'),
  });
}
