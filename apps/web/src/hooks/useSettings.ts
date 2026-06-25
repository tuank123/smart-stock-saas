'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

export interface MeResponse {
  user: {
    id: string;
    email: string;
    role: string;
    branchId: string | null;
    createdAt: string;
  };
  tenant: {
    id: string;
    companyName: string;
    taxNumber: string;
    status: string;
    planId: string;
    settings: unknown;
  };
}

function fetchMe(): Promise<MeResponse> {
  return api.get<MeResponse>('/auth/me').then((r) => r.data);
}

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 1000 * 60 * 5,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (dto: { currentPassword: string; newPassword: string }) =>
      api.patch('/auth/change-password', dto).then((r) => r.data),
    onSuccess: () => toast.success('Şifre güncellendi'),
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error?.response?.data?.message ?? 'Şifre güncellenemedi'),
  });
}
