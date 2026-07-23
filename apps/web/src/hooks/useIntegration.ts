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
  agentId?: string | null;
  agentVersion?: string | null;
}

function fetchIntegration(branchId: string): Promise<BranchIntegrationDetail | null> {
  return api
    .get<BranchIntegrationDetail>(`/branches/${branchId}/integration`)
    .then((r) => r.data)
    .catch((): null => null); // 404 = henüz kurulmamış
}

// PATRON kendi tek şubesi için: branchId store'daki user'dan gelir.
// PENDING_INSTALL iken 5 sn'de bir yenilenir → Agent bağlanınca otomatik CONNECTED'e döner.
export function useBranchIntegration() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<BranchIntegrationDetail | null>({
    queryKey: ['branches', branchId, 'integration'],
    queryFn: () => fetchIntegration(branchId),
    enabled: !!branchId,
    staleTime: 1000 * 30,
    refetchInterval: (query) =>
      query.state.data?.connectionStatus === 'PENDING_INSTALL' ? 5000 : false,
  });
}

function integrationErrorMessage(err: unknown): string {
  let msg = 'Kurulum kodu oluşturulamadı';
  if (axios.isAxiosError(err)) {
    const m = err.response?.data?.message;
    if (typeof m === 'string') msg = m;
    else if (Array.isArray(m)) msg = m.join(', ');
  }
  return msg;
}

// Agent kurulum kodu üret (POST). BranchIntegration PENDING_INSTALL olarak hazırlanır.
export function useGenerateSetupCode() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { adapterType: string }) =>
      api
        .post<{ token: string }>(`/branches/${branchId}/integration/setup-code`, payload)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches', branchId, 'integration'] });
    },
    onError: (err: unknown) => toast.error(integrationErrorMessage(err)),
  });
}
