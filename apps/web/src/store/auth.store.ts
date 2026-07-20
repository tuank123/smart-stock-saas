import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authStorage, type StoredUser } from '@/lib/auth';

interface AuthState {
  user: StoredUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  // True once persist has finished rehydrating from localStorage. Guards must
  // wait for this before deciding whether the user is logged in — otherwise the
  // initial `false` values bounce a logged-in user to /login on a hard reload.
  hasHydrated: boolean;

  setAuth: (user: StoredUser, accessToken: string) => void;
  clearAuth: () => void;
  updateToken: (accessToken: string) => void;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      hasHydrated: false,

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

      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'stokpilot-auth',
      // hasHydrated is intentionally NOT persisted — it must start false on
      // every load and only flip true once rehydration completes.
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
