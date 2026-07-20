'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth.store';
import { useAuth } from '@/hooks/useAuth';
import { FullPageSpinner } from '@/components/shared/LoadingSpinner';

export default function GorevliLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated } = useAuthStore();
  const { logout, isLoggingOut } = useAuth();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated || user?.role !== 'KASIYER') {
      router.replace('/login');
    }
  }, [hasHydrated, isAuthenticated, user, router]);

  // Persist henüz rehydrate olmadıysa karar verme — yükleniyor göster.
  if (!hasHydrated) {
    return <FullPageSpinner />;
  }

  if (!isAuthenticated || user?.role !== 'KASIYER') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sabit üst bar — tüm /gorevli/* sayfalarında görünür */}
      <header className="flex min-h-14 items-center justify-between border-b bg-background px-4 pt-[env(safe-area-inset-top)] lg:px-6">
        <h1 className="text-base font-semibold text-foreground">Şube Görevlisi</h1>
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
