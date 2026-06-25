'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Scan,
  Users,
  Tag,
  Settings,
  LogOut,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/auth.store';
import { useAuth } from '@/hooks/useAuth';
import { useBranchDetail } from '@/hooks/useMudur';

// ── Nav items ─────────────────────────────────────────────────────────────────

const navItems = [
  { href: '/mudur/dashboard',         label: 'Dashboard',          icon: LayoutDashboard },
  { href: '/mudur/stok',              label: 'Stok',               icon: Package },
  { href: '/mudur/siparisler',        label: 'Siparişler',         icon: ShoppingCart },
  { href: '/mudur/tedarikciler',      label: 'Tedarikçiler',       icon: Truck },
  { href: '/mudur/ocr',               label: 'Fatura Tarama',      icon: Scan },
  { href: '/mudur/personel',          label: 'Personel',           icon: Users },
  { href: '/mudur/fiyat-guncelleme',  label: 'Fiyat Güncelleme',  icon: Tag },
  { href: '/settings',                label: 'Ayarlar',            icon: Settings },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function MudurSidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { logout, isLoggingOut } = useAuth();
  const branchQuery = useBranchDetail();

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'SM';

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="flex h-screen w-16 flex-col border-r bg-sidebar lg:w-60">

        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center border-b px-3 lg:px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              SP
            </div>
            <span className="hidden font-semibold text-sidebar-foreground lg:block">StokPilot</span>
          </div>
        </div>

        {/* User info header (lg only) */}
        <div className="hidden lg:block shrink-0 border-b px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-sidebar-foreground">{user?.email}</p>
                <Badge
                  variant="outline"
                  className="mt-0.5 text-[10px] px-1.5 py-0 text-blue-700 border-blue-300 bg-blue-50"
                >
                  ŞUBE MÜDÜRÜ
                </Badge>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              onClick={() => logout()}
              disabled={isLoggingOut}
              title="Çıkış yap"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Mobile logout icon */}
        <div className="lg:hidden flex shrink-0 items-center justify-center border-b py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => logout()}
                disabled={isLoggingOut}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Çıkış yap</TooltipContent>
          </Tooltip>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Tooltip key={href}>
                <TooltipTrigger asChild>
                  <Link
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden lg:block">{label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="lg:hidden">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Branch name footer */}
        <Separator />
        <div className="hidden lg:flex shrink-0 items-center gap-1.5 px-4 py-3 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          {branchQuery.isPending ? (
            <Skeleton className="h-3 w-28" />
          ) : (
            <span className="truncate">{branchQuery.data?.name ?? '—'}</span>
          )}
        </div>
        <div className="lg:hidden h-3" />
      </aside>
    </TooltipProvider>
  );
}
