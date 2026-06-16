'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, ShoppingCart, BarChart3, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    match: ['/dashboard'],
  },
  {
    href: '/branches',
    label: 'Şubeler & Stok',
    icon: Building2,
    match: ['/branches', '/stock', '/products'],
  },
  {
    href: '/orders',
    label: 'Siparişler',
    icon: ShoppingCart,
    match: ['/orders', '/transfers', '/suppliers'],
  },
  {
    href: '/reports',
    label: 'Raporlar',
    icon: BarChart3,
    match: ['/reports'],
  },
  {
    href: '/settings',
    label: 'Ayarlar',
    icon: Settings,
    match: ['/settings', '/users'],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="flex h-screen w-16 flex-col border-r bg-sidebar lg:w-56">
        {/* Logo */}
        <div className="flex h-14 items-center border-b px-3 lg:px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold shrink-0">
              SP
            </div>
            <span className="hidden font-semibold text-sidebar-foreground lg:block">StokPilot</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {navItems.map(({ href, label, icon: Icon, match }) => {
            const active = match.some((p) => pathname === p || pathname.startsWith(p + '/'));
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
                <TooltipContent side="right" className="lg:hidden">
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <Separator />
        <div className="h-4" />
      </aside>
    </TooltipProvider>
  );
}
