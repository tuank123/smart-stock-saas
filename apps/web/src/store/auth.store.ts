import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authStorage, type StoredUser } from '@/lib/auth';

interface AuthState {
  user: StoredUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;

  setAuth: (user: StoredUser, accessToken: string) => void;
  clearAuth: () => void;
  updateToken: (accessToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken) => {
        authStorage.setToken(accessToken);
        authStorage.setUser(user);
        set({ user, accessToken, isAuthenticated: true });
      },

      clearAuth: () => {
        authStorage.clear();
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      updateToken: (accessToken) => {
        authStorage.setToken(accessToken);
        set({ accessToken });
      },
    }),
    {
      name: 'stokpilot-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
