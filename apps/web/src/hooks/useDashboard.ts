'use client';

import { useQuery, useQueries, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Branch,
  BranchIntegration,
  BranchDashboardRow,
  Order,
  Report,
  StockLevel,
} from '@/lib/types';

function fetchBranches(): Promise<Branch[]> {
  return api.get<Branch[]>('/branches').then((r) => r.data);
}

function fetchCriticalStock(branchId: string): Promise<StockLevel[]> {
  return api
    .get<StockLevel[]>(`/stock/${branchId}`, { params: { critical: true } })
    .then((r) => r.data);
}

function fetchDraftOrders(branchId: string): Promise<Order[]> {
  return api.get<Order[]>(`/orders/draft/${branchId}`).then((r) => r.data);
}

function fetchIntegration(branchId: string): Promise<BranchIntegration | null> {
  return api
    .get<BranchIntegration>(`/branches/${branchId}/integration`)
    .then((r) => r.data)
    .catch((): null => null); // 404 = no integration configured
}

function fetchUnreadReports(): Promise<Report[]> {
  return api
    .get<Report[]>('/reports', { params: { unreadOnly: true } })
    .then((r) => r.data);
}

function sumLengths(queries: UseQueryResult<unknown[]>[]): number {
  return queries.reduce((sum, q) => sum + (q.data?.length ?? 0), 0);
}

export function useDashboard() {
  const branchesQuery = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: fetchBranches,
    staleTime: 1000 * 60,
  });

  const branches: Branch[] = branchesQuery.data ?? [];
  const branchIds: string[] = branches.map((b: Branch) => b.id);

  const stockQueries = useQueries({
    queries: branchIds.map((id: string) => ({
      queryKey: ['stock', 'critical', id],
      queryFn: () => fetchCriticalStock(id),
      enabled: branchesQuery.isSuccess,
      staleTime: 1000 * 30,
    })),
  }) as UseQueryResult<StockLevel[]>[];

  const orderQueries = useQueries({
    queries: branchIds.map((id: string) => ({
      queryKey: ['orders', 'draft', id],
      queryFn: () => fetchDraftOrders(id),
      enabled: branchesQuery.isSuccess,
      staleTime: 1000 * 30,
    })),
  }) as UseQueryResult<Order[]>[];

  const integrationQueries = useQueries({
    queries: branchIds.map((id: string) => ({
      queryKey: ['branches', id, 'integration'],
      queryFn: () => fetchIntegration(id),
      enabled: branchesQuery.isSuccess,
      staleTime: 1000 * 60 * 5,
    })),
  }) as UseQueryResult<BranchIntegration | null>[];

  const reportsQuery = useQuery<Report[]>({
    queryKey: ['reports', 'unread'],
    queryFn: fetchUnreadReports,
    staleTime: 1000 * 60,
  });

  // Aggregate stats
  const totalBranches = branches.length;

  const integratedBranches = integrationQueries.filter((q) => q.data != null).length;

  const totalCriticalStock = sumLengths(stockQueries as UseQueryResult<unknown[]>[]);
  const totalDraftOrders = sumLengths(orderQueries as UseQueryResult<unknown[]>[]);

  const unreadReports: Report[] = reportsQuery.data ?? [];

  const branchRows: BranchDashboardRow[] = branches.map(
    (b: Branch, i: number): BranchDashboardRow => ({
      ...b,
      criticalStockCount: stockQueries[i]?.data?.length ?? 0,
      draftOrderCount: orderQueries[i]?.data?.length ?? 0,
      integration: integrationQueries[i]?.data ?? null,
    }),
  );

  const perBranchLoading =
    branches.length > 0 &&
    (stockQueries.some((q) => q.isPending) ||
      orderQueries.some((q) => q.isPending) ||
      integrationQueries.some((q) => q.isPending));

  const isLoading =
    branchesQuery.isPending || reportsQuery.isPending || perBranchLoading;

  const isError = branchesQuery.isError || reportsQuery.isError;

  return {
    totalBranches,
    integratedBranches,
    totalCriticalStock,
    totalDraftOrders,
    unreadReports,
    branchRows,
    isLoading,
    isError,
  };
}
