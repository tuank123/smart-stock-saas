'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { StockLevel, Order, Transfer } from '@/lib/types';

// ── API types ─────────────────────────────────────────────────────────────────

export interface BranchDetail {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  address: string | null;
  integrationStatus: string | null;
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

// ── Hooks ─────────────────────────────────────────────────────────────────────

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
