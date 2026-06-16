'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  ShoppingCart,
  BarChart3,
  Settings,
  ChevronDown,
  Warehouse,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ── Nav definitions ───────────────────────────────────────────────────────────

interface SubItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: string[];
  children?: SubItem[];
}

const navItems: NavItem[] = [
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
    children: [
      { href: '/branches', label: 'Şubeler', icon: Building2 },
      { href: '/stock', label: 'Stok', icon: Warehouse },
      { href: '/products', label: 'Ürünler', icon: Package },
    ],
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

// ── Sidebar component ─────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();

  const isGroupActive = (item: NavItem) =>
    item.match.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // Track which group is expanded (by href)
  const [expanded, setExpanded] = useState<string | null>(null);

  // Auto-expand the active group on mount / route change
  useEffect(() => {
    const activeItem = navItems.find(
      (item) => item.children && isGroupActive(item),
    );
    if (activeItem) setExpanded(activeItem.href);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {navItems.map((item) => {
            const { href, label, icon: Icon, match, children } = item;
            const active = isGroupActive(item);
            const isOpen = expanded === href;

            if (!children) {
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
            }

            // Item with children — toggle accordion
            return (
              <div key={href}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setExpanded(isOpen ? null : href)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        active && 'text-sidebar-accent-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="hidden flex-1 text-left lg:block">{label}</span>
                      <ChevronDown
                        className={cn(
                          'hidden h-3.5 w-3.5 shrink-0 transition-transform lg:block',
                          isOpen && 'rotate-180',
                        )}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="lg:hidden">
                    {label}
                  </TooltipContent>
                </Tooltip>

                {/* Sub-items — visible on lg when expanded */}
                {isOpen && (
                  <div className="hidden lg:block mt-0.5 ml-4 space-y-0.5 border-l pl-3">
                    {children.map(({ href: subHref, label: subLabel, icon: SubIcon }) => {
                      const subActive =
                        pathname === subHref || pathname.startsWith(subHref + '/');
                      return (
                        <Link
                          key={subHref}
                          href={subHref}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                            'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                            subActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                          )}
                        >
                          <SubIcon className="h-3.5 w-3.5 shrink-0" />
                          {subLabel}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Mobile: collapsed sub-items as individual icon tooltips below parent */}
                {isOpen && (
                  <div className="flex flex-col gap-0.5 mt-0.5 lg:hidden">
                    {children.map(({ href: subHref, label: subLabel, icon: SubIcon }) => {
                      const subActive =
                        pathname === subHref || pathname.startsWith(subHref + '/');
                      return (
                        <Tooltip key={subHref}>
                          <TooltipTrigger asChild>
                            <Link
                              href={subHref}
                              className={cn(
                                'flex items-center justify-center rounded-md p-2 transition-colors',
                                'text-sidebar-foreground hover:bg-sidebar-accent',
                                subActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
                              )}
                            >
                              <SubIcon className="h-3.5 w-3.5" />
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right">{subLabel}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <Separator />
        <div className="h-4" />
      </aside>
    </TooltipProvider>
  );
}
