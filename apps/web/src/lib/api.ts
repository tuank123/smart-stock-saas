import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { authStorage } from './auth';
import { isNative } from './platform';
import { useAuthStore } from '@/store/auth.store';

// NEXT_PUBLIC_API_URL always wins. Otherwise: production builds (including the
// Capacitor mobile shell, which is a static `next build` export) hit the
// hosted API. In development, a browser on localhost hits the local API
// directly, but a simulator/device (Capacitor live-reload) has its own
// "localhost" that isn't the Mac — so it needs the Mac's LAN IP instead.
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://api.stokpilot.com/api/v1'
    : typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api/v1'
      : 'http://192.168.1.165:3000/api/v1');

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach access token to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Tell the backend this is the Capacitor native client so it returns the
  // refresh token in the body (cross-origin cookie isn't reliable on native).
  if (isNative()) {
    config.headers['X-Client-Platform'] = 'native';
  }
  return config;
});

// On 401, try refresh then retry once; on failure clear auth and redirect
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const native = isNative();

      try {
        let data: { data?: { accessToken?: string; refreshToken?: string } } | undefined;

        if (native) {
          // Native: no cookie — send the stored refresh token in the body.
          const storedRefresh = authStorage.getRefreshToken();
          if (!storedRefresh) throw new Error('No stored refresh token');
          ({ data } = await axios.post(`${BASE_URL}/auth/refresh`, {
            refreshToken: storedRefresh,
          }));
        } else {
          // Web: unchanged cookie flow.
          ({ data } = await axios.post(
            `${BASE_URL}/auth/refresh`,
            {},
            { withCredentials: true },
          ));
        }

        const newToken = data?.data?.accessToken;
        if (newToken) {
          authStorage.setToken(newToken);
          // Native rotation: persist the new refresh token if returned.
          if (native && data?.data?.refreshToken) {
            authStorage.setRefreshToken(data.data.refreshToken);
          }
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }

        // No access token returned. On native this is a hard failure; on web
        // keep the existing silent fall-through (reject below, no redirect).
        if (native) throw new Error('Refresh returned no access token');
      } catch {
        // Clear BOTH client stores so a stale persisted session can't survive.
        authStorage.clear();
        useAuthStore.getState().clearAuth();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  },
);

// Typed helper to unwrap { data: T } response envelope
export function unwrap<T>(response: { data: { data: T } }): T {
  return response.data.data;
}
