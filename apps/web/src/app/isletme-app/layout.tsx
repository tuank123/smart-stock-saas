'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth.store';
import { useAuth } from '@/hooks/useAuth';
import { FullPageSpinner } from '@/components/shared/LoadingSpinner';

// Tek Şubeli (STARTER) PATRON'un MOBİL (native) istasyon deneyimi.
export default function IsletmeAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated } = useAuthStore();
  const { logout, isLoggingOut } = useAuth();

  const allowed =
    isAuthenticated && user?.role === 'PATRON' && user?.planId === 'STARTER';

  useEffect(() => {
    if (!hasHydrated) return;
    if (!allowed) router.replace('/login');
  }, [hasHydrated, allowed, router]);

  // Persist henüz rehydrate olmadıysa karar verme — yükleniyor göster.
  if (!hasHydrated) {
    return <FullPageSpinner />;
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sabit üst bar — tüm /isletme-app/* sayfalarında görünür */}
      <header className="flex min-h-14 items-center justify-between border-b bg-background px-4 pt-[env(safe-area-inset-top)] lg:px-6">
        <h1 className="text-base font-semibold text-foreground">İşletmem</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => logout()}
          disabled={isLoggingOut}
          title="Çıkış yap"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <main className="p-4 lg:p-6">{children}</main>
    </div>
  );
}
