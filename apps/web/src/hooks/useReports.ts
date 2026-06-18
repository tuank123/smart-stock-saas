'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Report, ReportDetail } from '@/lib/types';

function fetchReports(type?: string): Promise<Report[]> {
  return api
    .get<Report[]>('/reports', type ? { params: { type } } : undefined)
    .then((r) => r.data);
}

function fetchReport(id: string): Promise<ReportDetail> {
  return api.get<ReportDetail>(`/reports/${id}`).then((r) => r.data);
}

export function useReports(type?: 'DAILY' | 'MONTHLY') {
  return useQuery<Report[]>({
    queryKey: ['reports', type ?? 'all'],
    queryFn: () => fetchReports(type),
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
