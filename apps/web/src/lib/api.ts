import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { authStorage } from './auth';

// NEXT_PUBLIC_API_URL always wins. Otherwise: production builds (including the
// Capacitor mobile shell, which is a static `next build` export) hit the
// hosted API; local `next dev` hits the local API.
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://api.stokpilot.com/api/v1'
    : 'http://localhost:3000/api/v1');

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

      try {
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        const newToken = data?.data?.accessToken;
        if (newToken) {
          authStorage.setToken(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch {
        authStorage.clear();
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
