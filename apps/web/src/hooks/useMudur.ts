'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { StockLevel, Order, Transfer, Branch } from '@/lib/types';

// ── API types ─────────────────────────────────────────────────────────────────

export interface BranchDetail {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  address: string | null;
  integrationStatus: string | null;
}

export interface StockMovement {
  id: string;
  productId: string;
  branchId: string;
  movementType: string;
  quantity: string | number;
  referenceId?: string | null;
  referenceType?: string | null;
  notes?: string | null;
  createdAt: string;
  product: { id: string; sku: string; name: string; unit: string };
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

function fetchBranchDetail(branchId: string): Promise<BranchDetail> {
  return api.get<BranchDetail>(`/branches/${branchId}`).then((r) => r.data);
}

function fetchCriticalStock(branchId: string): Promise<StockLevel[]> {
  return api
    .get<StockLevel[]>(`/stock/${branchId}`, { params: { critical: true } })
    .then((r) => r.data);
}

function fetchDraftOrders(branchId: string): Promise<Order[]> {
  return api.get<Order[]>(`/orders/draft/${branchId}`).then((r) => r.data);
}

function fetchTransfers(branchId: string): Promise<Transfer[]> {
  return api.get<Transfer[]>(`/transfers/${branchId}`).then((r) => r.data);
}

function fetchStockList(branchId: string): Promise<StockLevel[]> {
  return api.get<StockLevel[]>(`/stock/${branchId}`).then((r) => r.data);
}

function fetchStockDetail(branchId: string, productId: string): Promise<StockLevel> {
  return api.get<StockLevel>(`/stock/${branchId}/${productId}`).then((r) => r.data);
}

function fetchStockMovements(branchId: string): Promise<StockMovement[]> {
  return api.get<StockMovement[]>(`/stock/movements/${branchId}`).then((r) => r.data);
}

function fetchBranches(): Promise<Branch[]> {
  return api.get<Branch[]>('/branches').then((r) => r.data);
}

// ── Dashboard hooks ───────────────────────────────────────────────────────────

export function useBranchDetail() {
  const { user } = useAuthStore();
  return useQuery<BranchDetail>({
    queryKey: ['branch', user?.branchId],
    queryFn: () => fetchBranchDetail(user!.branchId!),
    staleTime: 1000 * 60 * 5,
    enabled: !!user?.branchId,
  });
}

export function useMudurDashboard() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';

  const branchQuery = useQuery<BranchDetail>({
    queryKey: ['branch', branchId],
    queryFn: () => fetchBranchDetail(branchId),
    staleTime: 1000 * 60 * 5,
    enabled: !!branchId,
  });

  const stockQuery = useQuery<StockLevel[]>({
    queryKey: ['stock', 'critical', branchId],
    queryFn: () => fetchCriticalStock(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });

  const ordersQuery = useQuery<Order[]>({
    queryKey: ['orders', 'draft', branchId],
    queryFn: () => fetchDraftOrders(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });

  const transfersQuery = useQuery<Transfer[]>({
    queryKey: ['transfers', branchId],
    queryFn: () => fetchTransfers(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });

  const isLoading =
    branchQuery.isPending ||
    stockQuery.isPending ||
    ordersQuery.isPending ||
    transfersQuery.isPending;

  const isError =
    branchQuery.isError ||
    stockQuery.isError ||
    ordersQuery.isError ||
    transfersQuery.isError;

  return {
    branch: branchQuery.data ?? null,
    criticalStockCount: stockQuery.data?.length ?? 0,
    draftOrderCount: ordersQuery.data?.length ?? 0,
    requestedTransferCount:
      transfersQuery.data?.filter((t: Transfer) => t.status === 'REQUESTED').length ?? 0,
    isLoading,
    isError,
  };
}

// ── Stock hooks ───────────────────────────────────────────────────────────────

export function useStockList() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<StockLevel[]>({
    queryKey: ['stock', branchId],
    queryFn: () => fetchStockList(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });
}

export function useStockDetail(productId: string) {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<StockLevel>({
    queryKey: ['stock', branchId, productId],
    queryFn: () => fetchStockDetail(branchId, productId),
    staleTime: 1000 * 30,
    enabled: !!branchId && !!productId,
  });
}

export function useStockMovements() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<StockMovement[]>({
    queryKey: ['stock', 'movements', branchId],
    queryFn: () => fetchStockMovements(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });
}

export function useUpdateThreshold() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      productId: string;
      data: { minThreshold?: number; maxThreshold?: number };
    }) =>
      api
        .patch(`/stock/${branchId}/${vars.productId}/threshold`, vars.data)
        .then((r) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['stock', branchId] });
      qc.invalidateQueries({ queryKey: ['stock', branchId, vars.productId] });
      toast.success('Eşik değerleri güncellendi');
    },
    onError: () => toast.error('Eşik güncellenemedi'),
  });
}

export function useWaste() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { productId: string; quantity: number; reason: string }) =>
      api.post(`/stock/${branchId}/waste`, dto).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock', branchId] });
      qc.invalidateQueries({ queryKey: ['stock', 'movements', branchId] });
      toast.success('Fire kaydedildi');
    },
    onError: () => toast.error('Fire kaydedilemedi'),
  });
}

export function useCreateTransfer() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      fromBranchId: string;
      toBranchId: string;
      productId: string;
      quantity: number;
      notes?: string;
    }) => api.post('/transfers', dto).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers', branchId] });
      toast.success('Transfer talebi oluşturuldu');
    },
    onError: () => toast.error('Transfer oluşturulamadı'),
  });
}

export function useBranches() {
  return useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: fetchBranches,
    staleTime: 1000 * 60 * 5,
  });
}
