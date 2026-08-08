'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { authStorage, type StoredUser } from '@/lib/auth';
import { isNative } from '@/lib/platform';
import { dashboardFor } from '@/lib/routing';

interface LoginPayload {
  email: string;
  password: string;
}

interface LoginResponse {
  accessToken: string;
  // Only present for native clients (X-Client-Platform: native).
  refreshToken?: string;
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
      // Native: persist the body refresh token (web keeps using the cookie).
      if (isNative() && data.refreshToken) {
        authStorage.setRefreshToken(data.refreshToken);
      }
      toast.success('Giriş başarılı');
      // Rol + plan + platform (native) bazlı merkezi yönlendirme.
      router.push(dashboardFor(data.user.role, data.user.planId));
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

// ── Şifre sıfırlama / e-posta doğrulama ─────────────────────────────────────

// Backend bu akışlarda düz { message } döndürür (envelope yok).
interface MessageResponse {
  message: string;
}

/**
 * POST /auth/forgot-password — e-posta kayıtlı olsun ya da olmasın backend hep
 * aynı mesajı döner, o yüzden burada da başarı/başarısızlık ayrımı yapılmaz.
 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (payload: { email: string }) => {
      const res = await api.post<MessageResponse>('/auth/forgot-password', payload);
      return res.data;
    },
  });
}

/** POST /auth/reset-password — e-postadaki token ile yeni şifre belirler. */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (payload: { token: string; newPassword: string }) => {
      const res = await api.post<MessageResponse>('/auth/reset-password', payload);
      return res.data;
    },
  });
}

/** POST /auth/verify-email — e-postadaki token ile adresi doğrular. */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (payload: { token: string }) => {
      const res = await api.post<MessageResponse>('/auth/verify-email', payload);
      return res.data;
    },
  });
}

/**
 * POST /auth/resend-verification — JWT gerektirir; api client Authorization
 * header'ını zaten ekliyor. Başarıda 'me' sorgusu tazelenir.
 */
export function useResendVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.post<MessageResponse>('/auth/resend-verification');
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message ?? 'Doğrulama e-postası gönderildi');
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error)),
  });
}

/** Bu akışların hata mesajlarını okunur hale getirir. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Sunucuya bağlanılamadı';
    const message = error.response.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return String(message);
  }
  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
}

// ── İşletme (tenant) kaydı ──────────────────────────────────────────────────

interface SignupPayload {
  companyName: string;
  taxNumber: string;
  businessType: 'TEK_SUBE' | 'COK_SUBE';
  branchName: string;
  fullName: string;
  email: string;
  password: string;
}

export function useTenantSignup() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  return useMutation({
    mutationFn: async (payload: SignupPayload) => {
      // Envelope: { statusCode, message, data: { accessToken, refreshToken?, user } }
      const res = await api.post<{ data: LoginResponse }>('/tenants/signup', payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      // Login akışıyla aynı: store'a yaz, native ise refresh token'ı sakla.
      setAuth(data.user, data.accessToken);
      if (isNative() && data.refreshToken) {
        authStorage.setRefreshToken(data.refreshToken);
      }
      toast.success('İşletme kaydı başarılı');
      // role her zaman PATRON; hedef seçilen plana (planId) ve platforma göre.
      router.push(dashboardFor(data.user.role, data.user.planId));
    },
  });
}
