'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { isNative } from '@/lib/platform';
import { StarterSidebar } from '@/components/layout/StarterSidebar';
import { Header } from '@/components/layout/Header';
import { FullPageSpinner } from '@/components/shared/LoadingSpinner';

// Tek Şubeli (STARTER) PATRON'un WEB deneyimi. Native ise burası değil, mobil
// istasyon (/isletme-app) kullanılır → isNative() ise dışarı yönlendir.
export default function IsletmeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated } = useAuthStore();

  const allowed =
    isAuthenticated &&
    user?.role === 'PATRON' &&
    user?.planId === 'STARTER' &&
    !isNative();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    // Yanlış rol/plan veya native — merkezi yönlendirmeye (kök /) bırak.
    if (!allowed) router.replace('/');
  }, [hasHydrated, isAuthenticated, allowed, router]);

  if (!hasHydrated) {
    return <FullPageSpinner />;
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <StarterSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
