import { create } from 'zustand';

// Geçici Kasa oturumu — BİLEREK persist edilmiyor (localStorage yok). Route/sayfa
// değişiminde bellekte hayatta kalır; uygulama tamamen kapanınca sıfırlanır.
interface CashierSessionState {
  sessionId: string | null;
  unlocked: boolean;
  setSession: (id: string) => void;
  clear: () => void;
}

export const useCashierSessionStore = create<CashierSessionState>((set) => ({
  sessionId: null,
  unlocked: false,
  setSession: (id) => set({ sessionId: id, unlocked: true }),
  clear: () => set({ sessionId: null, unlocked: false }),
}));
