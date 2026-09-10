'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PaginatedResponse, Report, ReportDetail } from '@/lib/types';

export interface ReportListParams {
  type?: string;
  page?: number;
  pageSize?: number;
}

function fetchReports(params: ReportListParams = {}): Promise<PaginatedResponse<Report>> {
  return api
    .get<PaginatedResponse<Report>>('/reports', {
      params: {
        ...(params.type ? { type: params.type } : {}),
        ...(params.page ? { page: params.page } : {}),
        ...(params.pageSize ? { pageSize: params.pageSize } : {}),
      },
    })
    .then((r) => r.data);
}

function fetchReport(id: string): Promise<ReportDetail> {
  return api.get<ReportDetail>(`/reports/${id}`).then((r) => r.data);
}

export function useReports(
  params: ReportListParams = {},
): UseQueryResult<PaginatedResponse<Report>> {
  return useQuery<PaginatedResponse<Report>>({
    queryKey: ['reports', params.type ?? 'all', params.page, params.pageSize],
    queryFn: () => fetchReports(params),
    staleTime: 1000 * 60,
  });
}

export function useReport(id: string) {
  return useQuery<ReportDetail>({
    queryKey: ['report', id],
    queryFn: () => fetchReport(id),
    staleTime: 1000 * 60 * 5,
    enabled: !!id,
  });
}
