'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

export default function GorevliLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'KASIYER') {
      router.replace('/login');
    }
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated || user?.role !== 'KASIYER') {
    return null;
  }

  // NOTE: no bottom tab bar yet — the Şube Görevlisi nav is a follow-up task,
  // so we don't reserve bottom padding for a bar that doesn't exist.
  return (
    <div className="min-h-screen bg-background">
      <main className="p-4 pt-[calc(1rem+env(safe-area-inset-top))] lg:p-6 lg:pt-[calc(1.5rem+env(safe-area-inset-top))]">
        {children}
      </main>
    </div>
  );
}
