'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { MudurSidebar } from '@/components/layout/MudurSidebar';

export default function MudurLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'SUBE_MUDURU') {
      router.replace('/login');
    }
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated || user?.role !== 'SUBE_MUDURU') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:p-6 lg:pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <MudurSidebar />
    </div>
  );
}
