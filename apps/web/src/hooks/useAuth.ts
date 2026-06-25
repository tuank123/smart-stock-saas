'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { StoredUser } from '@/lib/auth';

interface LoginPayload {
  email: string;
  password: string;
  tenantId: string;
}

interface LoginResponse {
  accessToken: string;
  user: StoredUser;
}

export function useAuth() {
  const router = useRouter();
  const { user, isAuthenticated, setAuth, clearAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const { data } = await api.post<{ data: LoginResponse }>('/auth/login', payload);
      return data.data;
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      toast.success('Giriş başarılı');
      if (data.user.role === 'SUBE_MUDURU') {
        router.push('/mudur/dashboard');
      } else {
        router.push('/dashboard');
      }
    },
    onError: () => {
      toast.error('E-posta veya şifre hatalı');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSettled: () => {
      clearAuth();
      router.push('/login');
    },
  });

  return {
    user,
    isAuthenticated,
    login: loginMutation.mutate,
    logout: logoutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  };
}
