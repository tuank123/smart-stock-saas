'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Building2, AlertTriangle, MessageSquare, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { FullPageSpinner } from '@/components/shared/LoadingSpinner';
import { useUnresolvedErrorCount, useUnreadFeedbackCount } from '@/hooks/useAdmin';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: '/admin/dashboard', label: 'Genel Bakış', icon: LayoutDashboard },
  { href: '/admin/tenants', label: 'İşletmeler', icon: Building2 },
  { href: '/admin/errors', label: 'Hatalar & Uyarılar', icon: AlertTriangle },
  { href: '/admin/feedback', label: 'Geri Bildirimler', icon: MessageSquare },
];

// Yalnız SUPER_ADMIN erişebilir; diğer roller /login'e yönlendirilir
// (isletme/layout.tsx ile aynı guard deseni).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, hasHydrated } = useAuthStore();

  const allowed = isAuthenticated && user?.role === 'SUPER_ADMIN';

  const { data: errorCount } = useUnresolvedErrorCount();
  const unresolved = errorCount?.count ?? 0;
  const { data: feedbackCount } = useUnreadFeedbackCount();
  const unreadFeedback = feedbackCount?.count ?? 0;

  // href → o rota için gösterilecek rozet sayısı (0/undefined ise rozet yok).
  const badgeCountFor = (href: string): number => {
    if (href === '/admin/errors') return unresolved;
    if (href === '/admin/feedback') return unreadFeedback;
    return 0;
  };

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (!allowed) router.replace('/login');
  }, [hasHydrated, isAuthenticated, allowed, router]);

  if (!hasHydrated) {
    return <FullPageSpinner />;
  }
  if (!allowed) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="flex h-screen w-16 flex-col border-r bg-sidebar lg:w-56">
        <div className="flex h-14 items-center border-b px-3 lg:px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              SP
            </div>
            <span className="hidden font-semibold text-sidebar-foreground lg:block">
              Yönetim
            </span>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            const badgeCount = badgeCountFor(href);
            const showBadge = badgeCount > 0;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                )}
              >
                <span className="relative shrink-0">
                  <Icon className="h-4 w-4" />
                  {/* Daraltılmış menüde (yalnız ikon) rozet ikonun üstünde */}
                  {showBadge && (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground lg:hidden">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </span>
                <span className="hidden lg:block">{label}</span>
                {/* Genişletilmiş menüde rozet etiketin sağında */}
                {showBadge && (
                  <span className="ml-auto hidden h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground lg:flex">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
    </div>
  );
}
