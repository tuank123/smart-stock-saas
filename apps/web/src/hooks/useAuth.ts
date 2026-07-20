'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
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

// Turn an axios/network error into a message worth showing on screen.
function getLoginErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return `Sunucuya bağlanılamadı: ${error.message}`;
    }
    const message = error.response.data?.message;
    if (message === 'Invalid credentials') return 'E-posta veya şifre hatalı';
    if (message) return Array.isArray(message) ? message.join(', ') : String(message);
  }
  return 'Giriş yapılamadı. Lütfen tekrar deneyin.';
}

export function useAuth() {
  const router = useRouter();
  const { user, isAuthenticated, setAuth, clearAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      console.log('LOGIN ATTEMPT:', payload.email, process.env.NEXT_PUBLIC_API_URL);
      const res = await api.post<{ data: LoginResponse }>('/auth/login', payload);
      console.log('LOGIN RESPONSE:', res.data);
      // Backend envelope: { statusCode, message, data: { accessToken, user } }
      return res.data.data;
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      toast.success('Giriş başarılı');
      if (data.user.role === 'SUBE_MUDURU') {
        router.push('/mudur/dashboard');
      } else if (data.user.role === 'KASIYER') {
        router.push('/gorevli/dashboard');
      } else if (data.user.role === 'DEPO') {
        router.push('/depo/dashboard');
      } else {
        router.push('/dashboard');
      }
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
    loginError: loginMutation.error ? getLoginErrorMessage(loginMutation.error) : null,
  };
}
