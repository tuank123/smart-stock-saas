'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

// GET /branches/:branchId/integration dönüşü (raw — auth/tenants dışı controller).
export interface BranchIntegrationDetail {
  id: string;
  branchId: string;
  adapterType: string;
  webserviceUrl: string | null;
  pollingIntervalSec: number | null;
  connectionStatus: string | null;
  agentVersion?: string | null;
}

export interface SaveIntegrationPayload {
  adapterType: string;
  apiKey: string;
  webserviceUrl?: string;
  pollingIntervalSec?: number;
}

function fetchIntegration(branchId: string): Promise<BranchIntegrationDetail | null> {
  return api
    .get<BranchIntegrationDetail>(`/branches/${branchId}/integration`)
    .then((r) => r.data)
    .catch((): null => null); // 404 = henüz kurulmamış
}

// PATRON kendi tek şubesi için: branchId store'daki user'dan gelir.
export function useBranchIntegration() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<BranchIntegrationDetail | null>({
    queryKey: ['branches', branchId, 'integration'],
    queryFn: () => fetchIntegration(branchId),
    enabled: !!branchId,
    staleTime: 1000 * 30,
  });
}

function integrationErrorMessage(err: unknown): string {
  let msg = 'Entegrasyon kaydedilemedi';
  if (axios.isAxiosError(err)) {
    const m = err.response?.data?.message;
    if (typeof m === 'string') msg = m;
    else if (Array.isArray(m)) msg = m.join(', ');
  }
  return msg;
}

// Yeni kayıt (POST). Kayıt zaten varsa backend 409 döner → PATCH kullanılmalı.
export function useSaveBranchIntegration() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveIntegrationPayload) =>
      api.post(`/branches/${branchId}/integration`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches', branchId, 'integration'] });
      toast.success('Entegrasyon kaydedildi');
    },
    onError: (err: unknown) => toast.error(integrationErrorMessage(err)),
  });
}

// Kısmi güncelleme (PATCH) — mevcut kayıt için.
export function useUpdateBranchIntegration() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<SaveIntegrationPayload>) =>
      api.patch(`/branches/${branchId}/integration`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches', branchId, 'integration'] });
      toast.success('Entegrasyon güncellendi');
    },
    onError: (err: unknown) => toast.error(integrationErrorMessage(err)),
  });
}
