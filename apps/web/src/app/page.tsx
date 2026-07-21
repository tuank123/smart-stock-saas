'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth.store';
import { FullPageSpinner } from '@/components/shared/LoadingSpinner';
import { dashboardFor } from '@/lib/routing';

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 saat

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated, loginTimestamp, clearAuth } = useAuthStore();

  // Oturum hâlâ geçerli mi? (girişli + zaman damgası var + 8 saat dolmamış)
  const sessionValid =
    isAuthenticated &&
    loginTimestamp != null &&
    Date.now() - loginTimestamp < SESSION_MAX_AGE_MS;

  useEffect(() => {
    if (!hasHydrated) return;
    if (sessionValid) {
      router.replace(dashboardFor(user?.role, user?.planId));
    } else if (isAuthenticated) {
      // Oturum süresi dolmuş — temiz state için çıkış yap, landing göster.
      clearAuth();
    }
  }, [hasHydrated, sessionValid, isAuthenticated, user, router, clearAuth]);

  // Rehydrate bitene kadar VEYA geçerli oturum varken (yönlendirme sürerken)
  // landing'i gösterme — "Giriş Yap" butonunun bir an görünüp kaybolmasını önler.
  if (!hasHydrated || sessionValid) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold">
          SP
        </div>
        <h1 className="text-3xl font-bold tracking-tight">StokPilot</h1>
        <p className="mt-2 text-muted-foreground">
          Multi-tenant envanter yönetim sistemi
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild>
            <Link href="/login">Giriş Yap</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
