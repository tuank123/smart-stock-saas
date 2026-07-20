'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { MudurSidebar } from '@/components/layout/MudurSidebar';
import { FullPageSpinner } from '@/components/shared/LoadingSpinner';

export default function MudurLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated } = useAuthStore();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated || user?.role !== 'SUBE_MUDURU') {
      router.replace('/login');
    }
  }, [hasHydrated, isAuthenticated, user, router]);

  // Persist henüz rehydrate olmadıysa karar verme — yükleniyor göster.
  if (!hasHydrated) {
    return <FullPageSpinner />;
  }

  if (!isAuthenticated || user?.role !== 'SUBE_MUDURU') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(4rem+env(safe-area-inset-bottom))] lg:p-6 lg:pt-[calc(1.5rem+env(safe-area-inset-top))] lg:pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <MudurSidebar />
    </div>
  );
}
